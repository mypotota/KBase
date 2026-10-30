import { log } from "./log";
export type RemoteFile = {
  path: string;
  revision: number;
  hash: string | null;
  deleted: boolean;
  size?: number;
  created_at: string;
  device_id: string;
};
export type RemoteVersion = RemoteFile & { contentBase64: string | null };
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function serviceUrl(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("服务器地址不能含凭据、查询参数或片段");
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error("服务器必须使用 HTTPS，本机开发地址除外");
  return url.toString().replace(/\/$/, "");
}
export class Api {
  constructor(
    public base: string,
    private token?: string,
  ) {
    this.base = serviceUrl(base);
  }
  async request<T>(route: string, method = "GET", body?: unknown): Promise<T> {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(this.base + route, {
        method,
        headers: {
          ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      log("ERROR", "network", "网络请求失败", {
        code: error instanceof Error ? error.name : "NETWORK_ERROR",
        durationMs: Math.round(performance.now() - started),
      });
      throw new Error("无法连接同步服务，请检查地址、网络和服务状态");
    }
    const payload = await response.json();
    const requestId = response.headers.get("X-Request-Id") ?? undefined;
    if (!response.ok) {
      log(
        response.status === 409 ? "WARN" : "ERROR",
        "sync",
        "同步请求未成功",
        {
          requestId,
          status: response.status,
          code: payload.error?.code ?? "HTTP_ERROR",
        },
      );
      throw new ApiError(
        response.status,
        payload.error?.code ?? "HTTP_ERROR",
        payload.error?.message ?? "请求失败",
        requestId,
      );
    }
    log("INFO", "network", "服务请求完成", {
      requestId,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    return payload as T;
  }
  async login(password: string, deviceName: string) {
    const result = await this.request<{
      token: string;
      device: { id: string; name: string };
    }>("/v1/session", "POST", { password, deviceName });
    return new Api(this.base, result.token);
  }
  libraries() {
    return this.request<{ id: string; name: string }[]>("/v1/libraries");
  }
  createLibrary(name: string) {
    return this.request<{ id: string; name: string }>("/v1/libraries", "POST", {
      name,
    });
  }
  manifest(id: string) {
    return this.request<{ files: RemoteFile[] }>(
      `/v1/libraries/${encodeURIComponent(id)}/manifest`,
    );
  }
  version(id: string, path: string, revision?: number) {
    return this.request<RemoteVersion>(
      `/v1/libraries/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}${revision ? "&revision=" + revision : ""}`,
    );
  }
  put(
    id: string,
    input: {
      path: string;
      baseRevision: number | null;
      operationId: string;
      contentBase64?: string;
      deleted?: boolean;
    },
  ) {
    return this.request<RemoteFile>(
      `/v1/libraries/${encodeURIComponent(id)}/file`,
      "PUT",
      input,
    );
  }
  history(id: string, path: string) {
    return this.request<RemoteFile[]>(
      `/v1/libraries/${encodeURIComponent(id)}/history?path=${encodeURIComponent(path)}`,
    );
  }
  devices() {
    return this.request<{ id: string; name: string; created_at: string }[]>(
      "/v1/devices",
    );
  }
  revoke(id: string) {
    return this.request(`/v1/devices/${encodeURIComponent(id)}`, "DELETE");
  }
}
export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function unbase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
