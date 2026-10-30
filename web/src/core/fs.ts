import { invoke, isTauri } from "@tauri-apps/api/core";
import { getRecord, setRecord } from "./db";
import { log } from "./log";

declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
    requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  }
  interface Window {
    showDirectoryPicker?: (options: {
      mode: "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}
export type Root = { id: string; name: string; path: string; native: boolean };
export type Entry = {
  path: string;
  kind: "file" | "directory";
  size?: number;
  modified?: number;
};
export class FileChangedError extends Error {
  constructor(public path: string) {
    super("文件已被其他程序修改，请先检查版本。");
    this.name = "FileChangedError";
  }
}
export function relativePath(path: string) {
  if (
    !path ||
    path.length > 1024 ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    path.startsWith("/")
  )
    throw new Error("文件路径无效");
  return path.normalize("NFC");
}
export function filename(name: string) {
  const value = name.trim().normalize("NFC");
  if (
    !value ||
    value.startsWith(".") ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(value) ||
    /[. ]$/.test(value) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) ||
    value.length > 120
  )
    throw new Error("名称包含无效字符或超过 120 个字符");
  return value;
}
export async function digest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export const utf8 = new TextEncoder(),
  decode = (bytes: Uint8Array) =>
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
export function missing(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "NotFoundError") ||
    String(error).includes("NOT_FOUND:")
  );
}
export class Disk {
  private writes: Promise<void> = Promise.resolve();
  constructor(
    public root: Root,
    private handle?: FileSystemDirectoryHandle,
  ) {}
  async permission() {
    if (this.root.native) return;
    const handle = this.handle!;
    if (
      (await handle.queryPermission({ mode: "readwrite" })) !== "granted" &&
      (await handle.requestPermission({ mode: "readwrite" })) !== "granted"
    )
      throw new Error("需要文件夹读写授权");
  }
  private async parent(path: string, create = false) {
    relativePath(path);
    const parts = path.split("/");
    const name = parts.pop()!;
    let dir = this.handle!;
    for (const part of parts)
      dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name };
  }
  async list(path = ""): Promise<Entry[]> {
    if (path) relativePath(path);
    if (this.root.native)
      return invoke("list_entries", { rootId: this.root.id, path });
    let directory = this.handle!;
    if (path)
      for (const part of path.split("/"))
        directory = await directory.getDirectoryHandle(part);
    const result: Entry[] = [];
    for await (const [name, handle] of directory.entries()) {
      if (name.startsWith(".")) continue;
      const child = path ? path + "/" + name : name;
      if (handle.kind === "directory") {
        result.push({ path: child, kind: "directory" });
        result.push(...(await this.list(child)));
      } else {
        const file = await (handle as FileSystemFileHandle).getFile();
        result.push({
          path: child,
          kind: "file",
          size: file.size,
          modified: file.lastModified,
        });
      }
    }
    return result;
  }
  async read(path: string): Promise<Uint8Array> {
    relativePath(path);
    if (this.root.native)
      return new Uint8Array(
        await invoke<number[]>("read_file", { rootId: this.root.id, path }),
      );
    const { dir, name } = await this.parent(path);
    return new Uint8Array(
      await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer(),
    );
  }
  async exists(path: string) {
    try {
      await this.read(path);
      return true;
    } catch (e) {
      if (missing(e)) return false;
      throw e;
    }
  }
  async hash(path: string) {
    try {
      return await digest(await this.read(path));
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }
  async write(path: string, bytes: Uint8Array, expectedHash?: string | null) {
    const next = this.writes
      .catch(() => {})
      .then(() => this.writeOnce(path, bytes, expectedHash));
    this.writes = next;
    return next;
  }
  private async writeOnce(
    path: string,
    bytes: Uint8Array,
    expectedHash?: string | null,
  ) {
    relativePath(path);
    if (this.root.native) {
      await invoke("write_file", {
        rootId: this.root.id,
        path,
        bytes: Array.from(bytes),
        expectedHash: expectedHash ?? null,
        checkExpected: expectedHash !== undefined,
      });
      return;
    }
    if (expectedHash !== undefined && (await this.hash(path)) !== expectedHash)
      throw new FileChangedError(path);
    const { dir, name } = await this.parent(path, true);
    const file = await dir.getFileHandle(name, { create: true }),
      stream = await file.createWritable();
    try {
      await stream.write(new Uint8Array(bytes));
      if (expectedHash !== undefined) {
        const baseline =
          expectedHash === null ? await digest(new Uint8Array()) : expectedHash;
        if ((await this.hash(path)) !== baseline)
          throw new FileChangedError(path);
      }
      await stream.close();
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
  }
  async mkdir(path: string) {
    relativePath(path);
    if (this.root.native) {
      await invoke("create_directory", { rootId: this.root.id, path });
      return;
    }
    const { dir, name } = await this.parent(path, true);
    try {
      await dir.getDirectoryHandle(name);
      throw new Error("文件夹已存在");
    } catch (e) {
      if (!missing(e)) throw e;
    }
    await dir.getDirectoryHandle(name, { create: true });
  }
  async remove(path: string) {
    relativePath(path);
    if (this.root.native) {
      await invoke("remove_file", { rootId: this.root.id, path });
      return;
    }
    const { dir, name } = await this.parent(path);
    await dir.removeEntry(name);
  }
  async moveDirectory(from: string, to: string) {
    relativePath(from);
    relativePath(to);
    if (!this.root.native)
      throw new Error("项目文件夹的移动、重命名与回收，请在桌面应用中操作");
    await invoke("move_directory", { rootId: this.root.id, from, to });
  }
  async move(from: string, to: string, expectedHash: string) {
    const bytes = await this.read(from);
    if ((await digest(bytes)) !== expectedHash)
      throw new FileChangedError(from);
    await this.write(to, bytes, null);
    try {
      if ((await this.hash(from)) !== expectedHash)
        throw new FileChangedError(from);
      await this.remove(from);
    } catch (e) {
      log("WARN", "files", "移动未完成，已保留两份文件", {
        path: from,
        code: "MOVE_PARTIAL",
      });
      throw e;
    }
  }
}
export async function knownRoots(): Promise<Root[]> {
  return isTauri()
    ? invoke("known_roots")
    : ((await getRecord<Root[]>("roots")) ?? []);
}
export async function selectRoot(createName?: string): Promise<Disk | null> {
  if (createName) filename(createName);
  if (isTauri()) {
    const root = await invoke<Root | null>("choose_root", {
      createName: createName ?? null,
    });
    return root ? new Disk(root) : null;
  }
  if (!window.showDirectoryPicker)
    throw new Error(
      "此浏览器不支持选择本地文件夹。请使用桌面应用或 Chromium 浏览器。",
    );
  let parent;
  try {
    parent = await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
  let handle = parent;
  if (createName) {
    try {
      await parent.getDirectoryHandle(createName);
      throw new Error("目标文件夹已存在，请改用“打开已有文件夹”");
    } catch (e) {
      if (!missing(e)) throw e;
    }
    handle = await parent.getDirectoryHandle(createName, { create: true });
  }
  const roots = await knownRoots();
  let existing: Root | undefined;
  for (const root of roots) {
    const old = await getRecord<FileSystemDirectoryHandle>("handle:" + root.id);
    if (old && (await old.isSameEntry(handle))) {
      existing = root;
      break;
    }
  }
  const root = existing ?? {
    id: crypto.randomUUID(),
    name: handle.name,
    path: handle.name,
    native: false,
  };
  await setRecord("handle:" + root.id, handle);
  if (!existing) await setRecord("roots", [...roots, root]);
  log("INFO", "files", "知识库文件夹已选择");
  return new Disk(root, handle);
}
export async function reopenRoot(root: Root) {
  const disk = root.native
    ? new Disk(root)
    : new Disk(
        root,
        await getRecord<FileSystemDirectoryHandle>("handle:" + root.id),
      );
  await disk.permission();
  return disk;
}
