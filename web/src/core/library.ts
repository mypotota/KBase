import {
  Disk,
  decode,
  digest,
  filename,
  missing,
  utf8,
  FileChangedError,
} from "./fs";
import { getRecord, setRecord } from "./db";
import { log } from "./log";
export type Note = {
  path: string;
  title: string;
  folder: string;
  modified: number;
};
export type Project = {
  path: string;
  name: string;
  notes: Note[];
  virtual: boolean;
};
export type Snapshot = { text: string; hash: string };
export async function scan(disk: Disk): Promise<Project[]> {
  const entries = await disk.list();
  const projects = new Map<string, Project>();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    if (entry.kind === "directory" && parts.length === 1)
      projects.set(entry.path, {
        path: entry.path,
        name: entry.path,
        notes: [],
        virtual: false,
      });
  }
  for (const entry of entries) {
    if (entry.kind !== "file" || !entry.path.toLowerCase().endsWith(".md"))
      continue;
    const parts = entry.path.split("/"),
      projectPath = parts.length === 1 ? "" : parts[0];
    let project = projects.get(projectPath);
    if (!project) {
      project = {
        path: projectPath,
        name: projectPath || "未归档",
        notes: [],
        virtual: !projectPath,
      };
      projects.set(projectPath, project);
    }
    project.notes.push({
      path: entry.path,
      title: parts.at(-1)!.replace(/\.md$/i, ""),
      folder: parts.slice(projectPath ? 1 : 0, -1).join("/"),
      modified: entry.modified ?? 0,
    });
  }
  for (const project of projects.values())
    project.notes.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  log("INFO", "files", "目录扫描完成", { count: entries.length });
  return [...projects.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN"),
  );
}
export async function createProject(disk: Disk, name: string) {
  const path = filename(name);
  await disk.mkdir(path);
  log("INFO", "files", "项目已创建", { path });
  return path;
}
export async function createNote(
  disk: Disk,
  projectPath: string,
  name: string,
  folder = "",
) {
  const leaf = filename(name.replace(/\.md$/i, "")) + ".md";
  const path = [
    projectPath,
    ...folder.split("/").filter(Boolean).map(filename),
    leaf,
  ]
    .filter(Boolean)
    .join("/");
  await disk.write(path, utf8.encode(""), null);
  log("INFO", "files", "Markdown 文档已创建", { path });
  return path;
}
export async function readNote(disk: Disk, path: string): Promise<Snapshot> {
  const bytes = await disk.read(path);
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error("文档超过 5 MB，请使用外部编辑器打开");
  return { text: decode(bytes), hash: await digest(bytes) };
}
export async function writeNote(
  disk: Disk,
  path: string,
  text: string,
  expectedHash: string,
): Promise<Snapshot> {
  const bytes = utf8.encode(text),
    hash = await digest(bytes);
  if (hash === expectedHash) return { text, hash };
  const previous = await disk.read(path);
  if ((await digest(previous)) !== expectedHash)
    throw new FileChangedError(path);
  await disk.write(".kbase/history/" + expectedHash + ".md", previous);
  await disk.write(path, bytes, expectedHash);
  log("INFO", "files", "Markdown 文档已保存", { path, bytes: bytes.length });
  return { text, hash };
}
export async function renameNote(
  disk: Disk,
  path: string,
  name: string,
  hash: string,
) {
  const parts = path.split("/");
  parts[parts.length - 1] = filename(name.replace(/\.md$/i, "")) + ".md";
  const target = parts.join("/");
  if (target !== path) await disk.move(path, target, hash);
  return target;
}
export type TrashItem = {
  kind?: "file" | "directory";
  id: string;
  path: string;
  backup: string;
  deletedAt: string;
  hash: string;
};
export async function trash(disk: Disk, path: string, expectedHash?: string) {
  const bytes = await disk.read(path),
    hash = await digest(bytes);
  if (expectedHash !== undefined && expectedHash !== hash)
    throw new Error("文件在删除前已被外部修改，请重新打开");
  const id = crypto.randomUUID(),
    item = {
      id,
      path,
      backup: ".kbase/trash/" + id + "/" + path,
      deletedAt: new Date().toISOString(),
      hash,
    };
  await disk.write(item.backup, bytes, null);
  await disk.write(
    ".kbase/trash/" + id + "/metadata.json",
    utf8.encode(JSON.stringify(item)),
    null,
  );
  const list = (await getRecord<TrashItem[]>("trash:" + disk.root.id)) ?? [];
  await setRecord("trash:" + disk.root.id, [item, ...list]);
  if ((await disk.hash(path)) !== hash)
    throw new Error("文件在删除前已变化，原文与备份均已保留");
  await disk.remove(path);
  log("INFO", "files", "文件已移入回收站", { path });
  return item;
}
export async function restore(disk: Disk, item: TrashItem) {
  if (item.kind === "directory")
    await disk.moveDirectory(item.backup, item.path);
  else await disk.write(item.path, await disk.read(item.backup), null);
  const list = (await getRecord<TrashItem[]>("trash:" + disk.root.id)) ?? [];
  await setRecord(
    "trash:" + disk.root.id,
    list.filter((x) => x.id !== item.id),
  );
  log("INFO", "files", "文件已恢复", { path: item.path });
}
export async function localDraft(disk: Disk, path: string, text: string) {
  await setRecord("draft:" + disk.root.id + ":" + path, {
    text,
    at: new Date().toISOString(),
  });
}
export async function draft(disk: Disk, path: string) {
  return getRecord<{ text: string; at: string }>(
    "draft:" + disk.root.id + ":" + path,
  );
}
export async function clearDraft(disk: Disk, path: string) {
  await setRecord("draft:" + disk.root.id + ":" + path, null);
}
export function isNotFound(error: unknown) {
  return missing(error);
}

export async function trashProject(disk: Disk, path: string) {
  if (!path) throw new Error("未归档文档不是一个项目文件夹");
  const id = crypto.randomUUID(),
    item: TrashItem = {
      kind: "directory",
      id,
      path,
      backup: ".kbase/trash/" + id + "/" + path,
      deletedAt: new Date().toISOString(),
      hash: "",
    };
  await disk.write(
    ".kbase/trash/" + id + "/metadata.json",
    utf8.encode(JSON.stringify(item)),
    null,
  );
  await disk.moveDirectory(path, item.backup);
  const items = (await getRecord<TrashItem[]>("trash:" + disk.root.id)) ?? [];
  await setRecord("trash:" + disk.root.id, [item, ...items]);
  log("INFO", "files", "项目文件夹已移入回收站", { path });
  return item;
}
