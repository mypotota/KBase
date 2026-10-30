import { Api, ApiError, base64, unbase64, type RemoteFile } from "./api";
import { Disk, digest, utf8, filename } from "./fs";
import { getRecord, setRecord } from "./db";
import { trash } from "./library";
import { log } from "./log";
export type Binding = { server: string; remoteId: string; auto: boolean };
export type Base = { revision: number; hash: string | null };
export type Conflict = {
  id: string;
  path: string;
  localPath?: string;
  localHash: string | null;
  remoteRevision: number;
  remoteHash: string | null;
  backup: string;
  createdAt: string;
};
export type SyncState = {
  files: Record<string, Base>;
  conflicts: Conflict[];
  lastSync?: string;
};
export type Action = "same" | "upload" | "download" | "conflict" | "none";
export function decide(
  local: string | null,
  remote: RemoteFile | undefined,
  base: Base | undefined,
): Action {
  const remoteHash = remote?.hash ?? null;
  if (local === remoteHash) return remote ? "same" : "none";
  if (!base) {
    if (local === null) return "download";
    if (!remote) return "upload";
    return "conflict";
  }
  const localChanged = local !== base.hash,
    remoteChanged = (remote?.revision ?? null) !== base.revision;
  if (!localChanged) return "download";
  if (!remoteChanged) return "upload";
  return "conflict";
}
export function bindingKey(disk: Disk, project: string) {
  return "binding:" + disk.root.id + ":" + project;
}
export async function getBinding(disk: Disk, project: string) {
  return getRecord<Binding>(bindingKey(disk, project));
}
export async function setBinding(
  disk: Disk,
  project: string,
  binding: Binding,
) {
  await setRecord(bindingKey(disk, project), binding);
}
function key(disk: Disk, project: string, binding: Binding) {
  return (
    "sync:" +
    disk.root.id +
    ":" +
    project +
    ":" +
    binding.server +
    ":" +
    binding.remoteId
  );
}
export async function stateFor(
  disk: Disk,
  project: string,
  binding: Binding,
): Promise<SyncState> {
  return (
    (await getRecord<SyncState>(key(disk, project, binding))) ?? {
      files: {},
      conflicts: [],
    }
  );
}
const running = new Set<string>();
export async function synchronize(
  disk: Disk,
  project: string,
  api: Api,
  binding: Binding,
) {
  const stateKey = key(disk, project, binding);
  if (running.has(stateKey)) throw new Error("该项目正在同步");
  running.add(stateKey);
  const taskId = crypto.randomUUID(),
    started = performance.now();
  try {
    const state = await stateFor(disk, project, binding),
      remote = new Map(
        (await api.manifest(binding.remoteId)).files.map((f) => [f.path, f]),
      ),
      entries = await disk.list(project),
      prefix = project ? project + "/" : "",
      local = new Map<string, string>(),
      localPaths = new Map<string, string>();
    for (const entry of entries) {
      if (entry.kind !== "file" || (!project && entry.path.includes("/")))
        continue;
      if ((entry.size ?? 0) > 20 * 1024 * 1024)
        throw new Error("文件超过同步上限 20 MB：" + entry.path);
      const canonical = entry.path.slice(prefix.length).normalize("NFC");
      if (local.has(canonical))
        throw new Error("存在 Unicode 规范化后重名的文件，请先重命名");
      local.set(canonical, await digest(await disk.read(entry.path)));
      localPaths.set(canonical, entry.path);
    }
    const cases = new Map<string, string>();
    for (const path of new Set([...local.keys(), ...remote.keys()])) {
      for (const part of path.split("/")) filename(part);
      const lower = path.toLocaleLowerCase("en-US");
      if (cases.has(lower) && cases.get(lower) !== path)
        throw new Error(
          "存在仅大小写不同的文件名，无法安全跨平台同步：" + path,
        );
      cases.set(lower, path);
    }
    let uploaded = 0,
      downloaded = 0;
    for (const path of new Set([
      ...local.keys(),
      ...remote.keys(),
      ...Object.keys(state.files),
    ])) {
      const localHash = local.get(path) ?? null,
        file = remote.get(path),
        base = state.files[path],
        action = decide(localHash, file, base),
        absolute = localPaths.get(path) ?? prefix + path;
      if (action === "same") {
        state.files[path] = { revision: file!.revision, hash: file!.hash };
        state.conflicts = state.conflicts.filter((c) => c.path !== path);
        continue;
      }
      if (action === "none") continue;
      try {
        if (action === "upload") {
          const bytes = localHash === null ? null : await disk.read(absolute);
          if (bytes && (await digest(bytes)) !== localHash)
            throw new Error("文件在扫描后变化，请重试同步");
          const result = await api.put(binding.remoteId, {
            path,
            baseRevision: base?.revision ?? null,
            operationId: crypto.randomUUID(),
            ...(bytes ? { contentBase64: base64(bytes) } : { deleted: true }),
          });
          state.files[path] = { revision: result.revision, hash: result.hash };
          state.conflicts = state.conflicts.filter((c) => c.path !== path);
          uploaded++;
        } else if (action === "download") {
          if (!file) throw new Error("远端版本记录缺失，请勿清除同步数据库");
          if (file.deleted) {
            if (localHash !== null) await trash(disk, absolute, localHash);
          } else {
            const version = await api.version(
                binding.remoteId,
                path,
                file.revision,
              ),
              bytes = unbase64(version.contentBase64!);
            if ((await digest(bytes)) !== file.hash)
              throw new Error("远端文件校验失败");
            if (localHash !== null) {
              const old = await disk.read(absolute);
              if ((await digest(old)) !== localHash)
                throw new Error("本地文件在下载期间变化，请重试");
              await disk.write(
                ".kbase/history/" +
                  localHash +
                  (path.toLowerCase().endsWith(".md") ? ".md" : ".bin"),
                old,
              );
            }
            await disk.write(absolute, bytes, localHash);
          }
          state.files[path] = { revision: file.revision, hash: file.hash };
          state.conflicts = state.conflicts.filter((c) => c.path !== path);
          downloaded++;
        } else {
          if (!file) throw new Error("远端版本记录缺失");
          const previous = state.conflicts.find(
            (c) =>
              c.path === path &&
              c.localHash === localHash &&
              c.remoteRevision === file.revision,
          );
          if (previous) continue;
          const id = crypto.randomUUID(),
            backup = ".kbase/conflicts/" + id;
          if (localHash !== null) {
            const bytes = await disk.read(absolute);
            if ((await digest(bytes)) !== localHash)
              throw new Error("本地内容已变化，请重试");
            await disk.write(backup + "/local.bin", bytes, null);
          }
          if (!file.deleted) {
            const version = await api.version(
                binding.remoteId,
                path,
                file.revision,
              ),
              bytes = unbase64(version.contentBase64!);
            if ((await digest(bytes)) !== file.hash)
              throw new Error("远端内容校验失败");
            await disk.write(backup + "/remote.bin", bytes, null);
          }
          const conflict = {
            id,
            path,
            localPath: absolute,
            localHash,
            remoteRevision: file.revision,
            remoteHash: file.hash,
            backup,
            createdAt: new Date().toISOString(),
          };
          await disk.write(
            backup + "/metadata.json",
            utf8.encode(JSON.stringify(conflict)),
            null,
          );
          state.conflicts = [
            ...state.conflicts.filter((c) => c.path !== path),
            conflict,
          ];
          log("WARN", "sync", "版本冲突，双方内容已备份", {
            path,
            taskId,
            code: "VERSION_CONFLICT",
          });
        }
        await setRecord(stateKey, state);
      } catch (error) {
        await setRecord(stateKey, state);
        if (error instanceof ApiError && error.code === "VERSION_CONFLICT")
          throw new Error("远端在同步期间变化，请重新同步以检查冲突");
        throw error;
      }
    }
    state.lastSync = new Date().toISOString();
    await setRecord(stateKey, state);
    log("INFO", "sync", "项目同步完成", {
      taskId,
      count: uploaded + downloaded,
      durationMs: Math.round(performance.now() - started),
    });
    return { state, uploaded, downloaded };
  } catch (error) {
    log("ERROR", "sync", "项目同步未完成", {
      taskId,
      code:
        error instanceof ApiError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UNKNOWN",
    });
    throw error;
  } finally {
    running.delete(stateKey);
  }
}
export async function resolveConflict(
  disk: Disk,
  project: string,
  api: Api,
  binding: Binding,
  conflict: Conflict,
  choice: "local" | "remote" | "merge",
  merged?: string,
) {
  if (choice === "merge" && !conflict.path.toLowerCase().endsWith(".md"))
    throw new Error("非 Markdown 附件只能保留其中一个原始版本");
  const absolute =
    conflict.localPath ?? [project, conflict.path].filter(Boolean).join("/");
  if ((await disk.hash(absolute)) !== conflict.localHash)
    throw new Error("本地文件已变化，请重新同步后对比");
  const latest = await api.version(binding.remoteId, conflict.path);
  if (latest.revision !== conflict.remoteRevision)
    throw new Error("远端版本已变化，请重新同步");
  let result: RemoteFile = latest;
  if (choice === "remote") {
    if (latest.deleted) {
      if (conflict.localHash !== null)
        await trash(disk, absolute, conflict.localHash);
    } else
      await disk.write(
        absolute,
        unbase64(latest.contentBase64!),
        conflict.localHash,
      );
  } else {
    const bytes =
      choice === "merge"
        ? utf8.encode(merged ?? "")
        : conflict.localHash === null
          ? null
          : await disk.read(absolute);
    result = await api.put(binding.remoteId, {
      path: conflict.path,
      baseRevision: latest.revision,
      operationId: crypto.randomUUID(),
      ...(bytes ? { contentBase64: base64(bytes) } : { deleted: true }),
    });
    if (choice === "merge")
      await disk.write(absolute, bytes!, conflict.localHash);
  }
  const state = await stateFor(disk, project, binding);
  state.files[conflict.path] = { revision: result.revision, hash: result.hash };
  state.conflicts = state.conflicts.filter((c) => c.id !== conflict.id);
  await setRecord(key(disk, project, binding), state);
  log("INFO", "sync", "版本冲突已解决，备份保留", { path: conflict.path });
  return state;
}

export async function migrateProjectBinding(
  disk: Disk,
  from: string,
  to: string,
) {
  const binding = await getBinding(disk, from);
  if (!binding) return;
  const state = await stateFor(disk, from, binding);
  await setBinding(disk, to, binding);
  await setRecord(key(disk, to, binding), state);
  await setRecord(bindingKey(disk, from), null);
}
export async function disconnectProject(disk: Disk, project: string) {
  await setRecord(bindingKey(disk, project), null);
}
