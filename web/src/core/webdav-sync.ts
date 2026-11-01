import { getRecord, setRecord } from "./db";
import { digest, type Disk } from "./fs";
import { trash } from "./library";
import { log } from "./log";
import {
  davDelete,
  davGet,
  davListAll,
  davMkcolDeep,
  davPut,
  type WebdavAccount,
} from "./webdav";

// 坚果云 WebDAV 同步：以"上次同步一致的版本"（基线：内容 SHA-256 + 远端
// ETag）为参照做三方对比——本地变了就上传，远端变了就下载，两边都变了
// 且内容不同则把远端版本备份到 .kbase/conflicts 供手动合并，绝不静默覆盖。
// 凭据与基线只存本机 IndexedDB，不进代码、不上传、不写日志。

export type WebdavBinding = {
  dir: string; // 远端项目目录，如 "KBase/01-笔记"
  lastSync: string | null;
};
export type WebdavBaseline = Record<
  string,
  { hash: string; etag: string | null }
>;
export type WebdavSyncResult = {
  uploaded: number;
  downloaded: number;
  removedRemote: number;
  removedLocal: number;
  conflicts: string[];
  uploadedBytes: number;
  downloadedBytes: number;
  at: string;
};

// 同步行为设置：定时/触发节奏与范围，直接决定流量消耗。
export type WebdavSettings = {
  autoSync: boolean; // 定时自动同步
  intervalMin: number; // 间隔（分钟），autoSync 开启时生效
  syncOnSave: boolean; // 文档保存后延迟同步（防抖 30 秒）
  attachments: boolean; // 同步 .md 之外的附件（图片等，流量大头）
};
export const defaultWebdavSettings = (): WebdavSettings => ({
  autoSync: false,
  intervalMin: 15,
  syncOnSave: false,
  attachments: true,
});
const SETTINGS_KEY = "webdav-settings";
export async function loadWebdavSettings(): Promise<WebdavSettings> {
  const stored = await getRecord<Partial<WebdavSettings>>(SETTINGS_KEY);
  return { ...defaultWebdavSettings(), ...stored };
}
export async function saveWebdavSettings(settings: WebdavSettings) {
  await setRecord(SETTINGS_KEY, settings);
}
// 上次自动同步的时间戳（手动同步不影响节流）。
const LAST_AUTO_KEY = "webdav-last-auto";
export async function loadLastAutoSync(): Promise<number | null> {
  const value = await getRecord<number>(LAST_AUTO_KEY);
  return typeof value === "number" ? value : null;
}

const bindingKey = (rootId: string, projectPath: string) =>
  `webdav-bind:${rootId}:${projectPath}`;
const baselineKey = (rootId: string, projectPath: string) =>
  `webdav-base:${rootId}:${projectPath}`;
const BINDING_LIST_KEY = (rootId: string) => `webdav-projects:${rootId}`;
const ACCOUNT_KEY = "webdav-account";
const MAX_BYTES = 50 * 1024 * 1024;

// 已绑定坚果云的项目列表（自动同步按它遍历）。
export async function listWebdavProjects(rootId: string): Promise<string[]> {
  const list = await getRecord<string[]>(BINDING_LIST_KEY(rootId));
  return Array.isArray(list) ? list : [];
}
async function rememberWebdavProject(rootId: string, projectPath: string) {
  const list = await listWebdavProjects(rootId);
  if (!list.includes(projectPath))
    await setRecord(BINDING_LIST_KEY(rootId), [...list, projectPath]);
}

// 并发锁：定时同步与手动同步可能同时触发，串行执行避免基线错乱。
let syncRunning = false;
export function webdavSyncBusy(): boolean {
  return syncRunning;
}

export async function loadWebdavAccount(): Promise<WebdavAccount | null> {
  const account = await getRecord<WebdavAccount>(ACCOUNT_KEY);
  return account ?? null;
}
export async function saveWebdavAccount(account: WebdavAccount) {
  await setRecord(ACCOUNT_KEY, account);
}
export async function clearWebdavAccount() {
  await setRecord(ACCOUNT_KEY, null);
}
export async function loadWebdavBinding(
  rootId: string,
  projectPath: string,
): Promise<WebdavBinding | null> {
  const binding = await getRecord<WebdavBinding>(bindingKey(rootId, projectPath));
  return binding ?? null;
}
async function clearWebdavBinding(rootId: string, projectPath: string) {
  await setRecord(bindingKey(rootId, projectPath), null);
  await setRecord(baselineKey(rootId, projectPath), null);
  // 同步从自动同步的项目列表中移除
  const list = await listWebdavProjects(rootId);
  if (list.includes(projectPath))
    await setRecord(
      BINDING_LIST_KEY(rootId),
      list.filter((p) => p !== projectPath),
    );
}

export async function syncWebdav(
  disk: Disk,
  projectPath: string,
  account: WebdavAccount,
  options: {
    attachments?: boolean;
    onProgress?: (message: string) => void;
  } = {},
): Promise<WebdavSyncResult> {
  // 并发锁：定时同步与手动同步可能同时触发，串行执行避免基线错乱。
  if (syncRunning) throw new Error("上一次同步还在进行，请稍后再试");
  syncRunning = true;
  try {
    return await runSync(disk, projectPath, account, options);
  } finally {
    syncRunning = false;
  }
}

async function runSync(
  disk: Disk,
  projectPath: string,
  account: WebdavAccount,
  options: { attachments?: boolean; onProgress?: (message: string) => void },
): Promise<WebdavSyncResult> {
  const onProgress = options.onProgress;
  const attachments = options.attachments ?? true;
  const isMd = (rel: string) => rel.toLowerCase().endsWith(".md");

  const binding = await loadWebdavBinding(disk.root.id, projectPath);
  const dir = binding?.dir ?? `KBase/${projectPath}`;
  onProgress?.("连接坚果云…");
  await davMkcolDeep(account, dir);

  // 附件同步关闭时，本地与远端都只看 Markdown，附件条目不参与任何决策。
  const remote = (await davListAll(account, dir)) ?? [];
  const remoteMap = new Map(
    remote.filter((e) => attachments || isMd(e.path)).map((e) => [e.path, e]),
  );
  const entries = (await disk.list(projectPath)).filter(
    (e) =>
      e.kind === "file" &&
      !e.path.split("/").some((p) => p.startsWith(".")) &&
      (attachments || isMd(e.path)),
  );

  const baseline =
    (await getRecord<WebdavBaseline>(baselineKey(disk.root.id, projectPath))) ??
    {};
  const result: WebdavSyncResult = {
    uploaded: 0,
    downloaded: 0,
    removedRemote: 0,
    removedLocal: 0,
    conflicts: [],
    uploadedBytes: 0,
    downloadedBytes: 0,
    at: new Date().toISOString(),
  };
  const next: WebdavBaseline = {};
  const conflictStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const paths = new Set<string>([
    ...entries.map((e) => e.path.slice(projectPath ? projectPath.length + 1 : 0)),
    ...remoteMap.keys(),
  ]);

  async function localHashOf(absPath: string): Promise<string | null> {
    try {
      return await disk.hash(absPath);
    } catch {
      return null; // 本地已消失（同步中被删）
    }
  }
  // 上传本地版本并记基线（所有上传分支共用）。
  async function putLocal(rel: string, absPath: string, hash: string) {
    const bytes = await disk.read(absPath);
    const put = await davPut(account, `${dir}/${rel}`, bytes);
    next[rel] = { hash, etag: put.etag };
    result.uploaded++;
    result.uploadedBytes += bytes.length;
    return put;
  }

  let done = 0;
  for (const rel of paths) {
    done++;
    onProgress?.(`同步 ${done}/${paths.size} · ${rel}`);
    const base = baseline[rel] ?? null;
    if (!attachments && !isMd(rel)) {
      // 附件被排除：基线原样透传，决策完全跳过。
      if (base) next[rel] = base;
      continue;
    }
    const absPath = projectPath ? `${projectPath}/${rel}` : rel;
    const remoteEntry = remoteMap.get(rel) ?? null;
    const localHash = await localHashOf(absPath);
    const hasLocal = localHash !== null;

    let remoteBytes: Uint8Array | null = null;
    async function remoteHashOf(): Promise<string | null> {
      if (!remoteEntry) return null;
      if (remoteBytes === null) {
        try {
          remoteBytes = await davGet(account, `${dir}/${rel}`);
          result.downloadedBytes += remoteBytes.length;
        } catch {
          return null;
        }
      }
      return digest(remoteBytes);
    }

    // —— 决策 ——
    if (hasLocal && !remoteEntry && !base) {
      await putLocal(rel, absPath, localHash!);
    } else if (!hasLocal && remoteEntry && !base) {
      // 远端新文件 → 下载
      const bytes = await davGet(account, `${dir}/${rel}`);
      result.downloadedBytes += bytes.length;
      if (bytes.length > MAX_BYTES) continue;
      await disk.write(absPath, bytes, null);
      next[rel] = { hash: await digest(bytes), etag: remoteEntry.etag };
      result.downloaded++;
    } else if (hasLocal && remoteEntry && !base) {
      // 双方都有但从未同步过：内容一致才记基线，否则冲突
      const remoteHash = await remoteHashOf();
      if (remoteHash === localHash) {
        next[rel] = { hash: localHash, etag: remoteEntry.etag };
      } else {
        if (remoteBytes)
          await disk.write(
            `.kbase/conflicts/webdav-${conflictStamp}/${rel}`,
            remoteBytes,
            null,
          );
        result.conflicts.push(rel);
        // 本地保持权威，把本地推上去作为当前远端
        if (localHash !== null) await putLocal(rel, absPath, localHash);
      }
    } else if (hasLocal && remoteEntry && base) {
      const localChanged = localHash !== base.hash;
      const remoteIsChanged = remoteEntry.etag !== base.etag;
      if (!localChanged && !remoteIsChanged) {
        next[rel] = { hash: localHash, etag: remoteEntry.etag };
      } else if (localChanged && !remoteIsChanged) {
        await putLocal(rel, absPath, localHash);
      } else if (!localChanged && remoteIsChanged) {
        const bytes = await davGet(account, `${dir}/${rel}`);
        result.downloadedBytes += bytes.length;
        if (bytes.length <= MAX_BYTES) {
          // 覆盖已存在的文件必须带期望哈希（基线版本），否则 disk.write
          // 会按"新文件"语义校验并抛 FileChangedError；同时这也保证
          // 磁盘在同步读取期间被外部改动时安全失败。
          await disk.write(absPath, bytes, base.hash);
          next[rel] = { hash: await digest(bytes), etag: remoteEntry.etag };
          result.downloaded++;
        }
      } else {
        const remoteHash = await remoteHashOf();
        if (remoteHash === localHash) {
          next[rel] = { hash: localHash, etag: remoteEntry.etag };
        } else {
          if (remoteBytes)
            await disk.write(
              `.kbase/conflicts/webdav-${conflictStamp}/${rel}`,
              remoteBytes,
              null,
            );
          result.conflicts.push(rel);
          if (localHash !== null) await putLocal(rel, absPath, localHash);
        }
      }
    } else if (hasLocal && !remoteEntry && base) {
      // 远端已删除
      if (localHash === base.hash) {
        // 进回收站而不是直接删除：远端的删除可能是误操作，保证可恢复。
        try {
          await trash(disk, absPath, localHash);
        } catch {
          await disk.remove(absPath);
        }
        result.removedLocal++;
        log("INFO", "sync", "远端已删除，本地移入回收站", { path: absPath });
      } else {
        // 本地有改动 → 保留并重新上传
        await putLocal(rel, absPath, localHash);
      }
    } else if (!hasLocal && remoteEntry && base) {
      // 本地已删除
      if (remoteEntry.etag === base.etag) {
        await davDelete(account, `${dir}/${rel}`);
        result.removedRemote++;
        log("INFO", "sync", "本地已删除，远端同步移除", { path: rel });
      } else {
        // 远端版本被修改过 → 备份远端版本，不恢复本地
        const bytes = await davGet(account, `${dir}/${rel}`);
        result.downloadedBytes += bytes.length;
        await disk.write(
          `.kbase/conflicts/webdav-${conflictStamp}/${rel}`,
          bytes,
          null,
        );
        result.conflicts.push(rel);
        await davDelete(account, `${dir}/${rel}`);
      }
    }
  }

  await setRecord(baselineKey(disk.root.id, projectPath), next);
  await setRecord(bindingKey(disk.root.id, projectPath), {
    dir,
    lastSync: result.at,
  } satisfies WebdavBinding);
  await rememberWebdavProject(disk.root.id, projectPath);
  log("INFO", "sync", "坚果云同步完成", {
    uploaded: result.uploaded,
    count: result.downloaded + result.removedRemote + result.removedLocal,
    bytes: result.uploadedBytes + result.downloadedBytes,
    status: result.conflicts.length ? "conflicts" : "ok",
  });
  return result;
}

export async function disconnectWebdav(
  rootId: string,
  projectPath: string,
): Promise<void> {
  await clearWebdavBinding(rootId, projectPath);
}

// 定时自动同步：遍历所有已绑定项目，逐个同步（单个失败不阻断其余）。
export async function autoSyncAllWebdav(
  disk: Disk,
  account: WebdavAccount,
  settings: WebdavSettings,
  onProgress?: (message: string) => void,
): Promise<{ projects: number; results: WebdavSyncResult[]; errors: string[] }> {
  const projects = await listWebdavProjects(disk.root.id);
  const results: WebdavSyncResult[] = [];
  const errors: string[] = [];
  for (const projectPath of projects) {
    try {
      results.push(
        await syncWebdav(disk, projectPath, account, {
          attachments: settings.attachments,
          onProgress,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${projectPath}: ${message}`);
      log("WARN", "sync", "自动同步项目失败", {
        path: projectPath,
        code: message.slice(0, 80),
      });
    }
  }
  if (projects.length) await setRecord(LAST_AUTO_KEY, Date.now());
  return { projects: projects.length, results, errors };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// 列出坚果云 KBase/ 根目录下的项目（顶层子目录名）。远端还没有知识库
// 目录时返回 null，由 UI 提示"云端为空"。
export async function listRemoteWebdavProjects(
  account: WebdavAccount,
): Promise<string[] | null> {
  const { davList } = await import("./webdav");
  const top = await davList(account, "KBase");
  if (top === null) return null;
  return top.filter((e) => e.isDir).map((e) => e.path);
}

// 初始化恢复：把坚果云 KBase/ 下的全部项目下载到一个空的本地知识库，
// 并按项目写好同步基线——恢复完成后，增量同步从基线无缝继续。
export async function restoreFromWebdav(
  disk: Disk,
  account: WebdavAccount,
  onProgress?: (message: string) => void,
): Promise<{ projects: string[]; files: number; bytes: number }> {
  onProgress?.("连接坚果云…");
  const remote = await davListAll(account, "KBase");
  if (remote === null)
    throw new Error("坚果云上还没有同步过知识库（KBase 目录不存在）");
  const files = remote.filter((e) => !e.isDir);
  const byProject = new Map<string, typeof files>();
  for (const entry of files) {
    const project = entry.path.split("/")[0];
    if (!project) continue;
    const list = byProject.get(project) ?? [];
    list.push(entry);
    byProject.set(project, list);
  }

  const result = { projects: [...byProject.keys()], files: 0, bytes: 0 };
  let done = 0;
  for (const [project, list] of byProject) {
    const baseline: WebdavBaseline = {};
    for (const entry of list) {
      done++;
      onProgress?.(`恢复 ${done}/${files.length} · ${entry.path}`);
      const rel = entry.path.slice(project.length + 1);
      const bytes = await davGet(account, `KBase/${entry.path}`);
      if (bytes.length > MAX_BYTES) continue;
      const absPath = project ? `${project}/${rel}` : rel;
      await disk.write(absPath, bytes, null); // 恢复目标为空库，按新文件写入
      baseline[rel] = { hash: await digest(bytes), etag: entry.etag };
      result.files++;
      result.bytes += bytes.length;
    }
    await setRecord(baselineKey(disk.root.id, project), baseline);
    await setRecord(bindingKey(disk.root.id, project), {
      dir: `KBase/${project}`,
      lastSync: null,
    } satisfies WebdavBinding);
    await rememberWebdavProject(disk.root.id, project);
  }
  log("INFO", "sync", "已从坚果云恢复知识库", {
    count: result.files,
    bytes: result.bytes,
  });
  return result;
}

// 首次把整个项目推到坚果云（等价于一次以空远端为基线的同步）。
export async function initialWebdavPush(
  disk: Disk,
  projectPath: string,
  account: WebdavAccount,
): Promise<WebdavSyncResult> {
  await clearWebdavBinding(disk.root.id, projectPath);
  return syncWebdav(disk, projectPath, account);
}
