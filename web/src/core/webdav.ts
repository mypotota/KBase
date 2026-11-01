import { isTauri } from "@tauri-apps/api/core";

// 坚果云等标准 WebDAV 服务的最小客户端。桌面端通过 Tauri 的 HTTP 插件
// 发请求（Rust reqwest，不受 CORS 限制——坚果云不返回跨域头），浏览器
// 端退回原生 fetch（同域或服务器允许跨域时可用）。
export type WebdavAccount = {
  server: string;
  user: string;
  appPassword: string;
};

export class DavError extends Error {
  constructor(
    public status: number,
    public method: string,
    public path: string,
  ) {
    super(`WebDAV ${method} ${path} 失败（HTTP ${status}）`);
    this.name = "DavError";
  }
}

const NOT_FOUND = 404;

function joinUrl(server: string, path: string) {
  const base = server.replace(/\/+$/, "");
  const rest = path.replace(/^\/+/, "");
  return `${base}/${rest.split("/").map(encodeURIComponent).join("/")}`;
}

function authHeader(account: WebdavAccount) {
  return "Basic " + btoa(`${account.user}:${account.appPassword}`);
}

export async function davRequest(
  account: WebdavAccount,
  method: string,
  path: string,
  init?: { body?: string | Uint8Array; depth?: string; contentType?: string },
): Promise<Response> {
  const headers: Record<string, string> = {
    Authorization: authHeader(account),
  };
  if (init?.depth) headers.Depth = init.depth;
  if (init?.contentType) headers["Content-Type"] = init.contentType;
  const url = joinUrl(account.server, path);
  // Uint8Array 在部分 TS lib 版本里不满足 BodyInit，统一按 BodyInit 传递
  const body = init?.body as BodyInit | undefined;
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(url, { method, headers, body });
  }
  return window.fetch(url, { method, headers, body });
}

export type DavEntry = {
  // 相对于请求目录的路径（不含目录自身，不带前导斜杠）
  path: string;
  isDir: boolean;
  etag: string | null;
  modified: string | null;
};

const PROPFIND_BODY =
  '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>';

// 列出目录的直接子项（Depth: 1）。目录不存在时返回 null（区别于空目录）。
export async function davList(
  account: WebdavAccount,
  dir: string,
): Promise<DavEntry[] | null> {
  const res = await davRequest(account, "PROPFIND", dir + "/", {
    body: PROPFIND_BODY,
    depth: "1",
    contentType: "application/xml",
  });
  if (res.status === NOT_FOUND) return null;
  if (!res.ok) throw new DavError(res.status, "PROPFIND", dir);
  const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
  // 服务器返回的 href 是 URL pathname（含 DAV 根路径，如 /dav/），以本次
  // 请求自身的 pathname 为基准对齐前缀，才能正确得到目录内的相对路径。
  let requestPath: string;
  try {
    requestPath = decodeURIComponent(new URL(joinUrl(account.server, dir + "/")).pathname);
  } catch {
    requestPath = "/" + dir.replace(/^\/+|\/+$/g, "") + "/";
  }
  const entries: DavEntry[] = [];
  const rows = xml.getElementsByTagNameNS("DAV:", "response");
  for (const row of rows) {
    const href = row.getElementsByTagNameNS("DAV:", "href")[0]?.textContent ?? "";
    let decoded = href;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      /* 保持原样 */
    }
    const clean = decoded.replace(/\/+$/, "");
    if (!clean.startsWith(requestPath)) continue; // 自身条目或其他前缀
    const rel = clean.slice(requestPath.length);
    if (!rel || rel.includes("/")) continue; // 仅直接子项
    const isDir = row.getElementsByTagNameNS("DAV:", "collection").length > 0;
    entries.push({
      path: rel,
      isDir,
      etag: row.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent ?? null,
      modified:
        row.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent ??
        null,
    });
  }
  return entries;
}

// 递归列出目录下所有文件（跳过子目录本身），深度有上限防失控。
// 列子目录始终用完整远端路径（dir + 已累积的相对前缀），否则以空串
// 拼接会产生带前导斜杠的相对路径，服务器会返回空列表。
export async function davListAll(
  account: WebdavAccount,
  dir: string,
): Promise<DavEntry[] | null> {
  const top = await davList(account, dir);
  if (top === null) return null;
  const out: DavEntry[] = [];
  async function walk(
    absDir: string,
    relBase: string,
    entries: DavEntry[],
    depth: number,
  ) {
    for (const entry of entries) {
      const absPath = `${absDir}/${entry.path}`;
      const relPath = relBase ? `${relBase}/${entry.path}` : entry.path;
      if (entry.isDir) {
        if (depth >= 6) continue;
        const child = await davList(account, absPath);
        if (child) await walk(absPath, relPath, child, depth + 1);
      } else {
        out.push({ ...entry, path: relPath });
      }
    }
  }
  await walk(dir, "", top, 1);
  return out;
}

export async function davGet(
  account: WebdavAccount,
  path: string,
): Promise<Uint8Array> {
  const res = await davRequest(account, "GET", path);
  if (res.status === NOT_FOUND) throw new DavError(res.status, "GET", path);
  if (!res.ok) throw new DavError(res.status, "GET", path);
  return new Uint8Array(await res.arrayBuffer());
}

export async function davPut(
  account: WebdavAccount,
  path: string,
  bytes: Uint8Array,
): Promise<{ etag: string | null }> {
  const res = await davRequest(account, "PUT", path, {
    body: bytes,
    contentType: "application/octet-stream",
  });
  if (!res.ok) throw new DavError(res.status, "PUT", path);
  return { etag: res.headers.get("ETag") ?? res.headers.get("Etag") };
}

// 405 表示目录已存在（坚果云用 405，部分服务用 301），都视为成功。
export async function davMkcol(account: WebdavAccount, path: string) {
  const res = await davRequest(account, "MKCOL", path);
  if (!res.ok && res.status !== 405 && res.status !== 301)
    throw new DavError(res.status, "MKCOL", path);
}

export async function davDelete(account: WebdavAccount, path: string) {
  const res = await davRequest(account, "DELETE", path);
  if (!res.ok && res.status !== NOT_FOUND)
    throw new DavError(res.status, "DELETE", path);
}

// 连接测试：对根目录做 Depth:0 的 PROPFIND。
export async function davTest(account: WebdavAccount): Promise<void> {
  const res = await davRequest(account, "PROPFIND", "", {
    body: PROPFIND_BODY,
    depth: "0",
    contentType: "application/xml",
  });
  if (!res.ok && res.status !== 207)
    throw new DavError(res.status, "PROPFIND", "/");
}

// 逐级创建远端目录（"a/b/c"），已存在的层级直接跳过。
export async function davMkcolDeep(account: WebdavAccount, dir: string) {
  const parts = dir.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    await davMkcol(account, current);
  }
}
