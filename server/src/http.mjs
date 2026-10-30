import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { ApiError } from "./store.mjs";
export function createApi(
  store,
  { log = () => {}, allowedOrigins = [], bodyLimit = 29 * 1024 * 1024 } = {},
) {
  const attempts = new Map();
  const server = createServer(async (req, res) => {
    const requestId = randomUUID(),
      started = Date.now(),
      url = new URL(req.url, "http://localhost"),
      origin = req.headers.origin;
    let device;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const send = (status, value) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    try {
      if (origin) {
        if (!allowedOrigins.includes(origin))
          throw new ApiError(403, "ORIGIN_DENIED", "未允许的客户端来源");
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization,Content-Type",
        );
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,DELETE,OPTIONS",
        );
      }
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      const body = async () => {
        let size = 0,
          chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > bodyLimit)
            throw new ApiError(413, "BODY_TOO_LARGE", "请求体过大");
          chunks.push(chunk);
        }
        try {
          return JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new ApiError(400, "INVALID_JSON", "JSON 格式无效");
        }
      };
      if (url.pathname === "/health" && req.method === "GET") {
        send(200, { status: "ok", version: 1 });
        return;
      }
      if (url.pathname === "/v1/session" && req.method === "POST") {
        const ip = req.socket.remoteAddress,
          now = Date.now(),
          recent = (attempts.get(ip) || []).filter((t) => now - t < 60000);
        if (attempts.size > 10000) {
          for (const [k, v] of attempts)
            if (!v.some((t) => now - t < 60000)) attempts.delete(k);
        }
        if (recent.length >= 5)
          throw new ApiError(
            429,
            "RATE_LIMITED",
            "尝试过于频繁，请一分钟后重试",
          );
        recent.push(now);
        attempts.set(ip, recent);
        const input = await body();
        if (typeof input.password !== "string" || input.password.length > 1024)
          throw new ApiError(400, "INVALID_PASSWORD", "密码格式无效");
        send(200, store.login(input.password, input.deviceName));
        return;
      }
      device = store.authenticate(
        req.headers.authorization?.replace(/^Bearer /, ""),
      );
      if (url.pathname === "/v1/devices" && req.method === "GET") {
        send(200, store.devices());
        return;
      }
      const deviceMatch = url.pathname.match(/^\/v1\/devices\/([^/]+)$/);
      if (deviceMatch && req.method === "DELETE") {
        store.revoke(deviceMatch[1]);
        send(200, { revoked: true });
        return;
      }
      if (url.pathname === "/v1/libraries") {
        if (req.method === "GET") {
          send(200, store.libraries());
          return;
        }
        if (req.method === "POST") {
          send(201, store.createLibrary((await body()).name));
          return;
        }
      }
      const m = url.pathname.match(
        /^\/v1\/libraries\/([a-f0-9-]+)\/(manifest|file|history)$/,
      );
      if (m) {
        const [, id, resource] = m;
        if (resource === "manifest" && req.method === "GET") {
          send(200, { files: store.manifest(id) });
          return;
        }
        if (resource === "file" && req.method === "GET") {
          const raw = url.searchParams.get("revision"),
            revision = raw === null ? undefined : Number(raw);
          if (
            revision !== undefined &&
            (!Number.isSafeInteger(revision) || revision <= 0)
          )
            throw new ApiError(400, "INVALID_REVISION", "版本无效");
          send(200, store.version(id, url.searchParams.get("path"), revision));
          return;
        }
        if (resource === "file" && req.method === "PUT") {
          send(200, store.put(id, device, await body()));
          return;
        }
        if (resource === "history" && req.method === "GET") {
          send(200, store.history(id, url.searchParams.get("path")));
          return;
        }
      }
      throw new ApiError(404, "NOT_FOUND", "接口不存在");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      send(status, {
        error: {
          code: error.code || "INTERNAL_ERROR",
          message: status === 500 ? "服务内部错误" : error.message,
          requestId,
          ...(error instanceof ApiError && error.details ? error.details : {}),
        },
      });
      log("error", "request.failed", {
        requestId,
        code: error.code || "INTERNAL_ERROR",
        status,
      });
    } finally {
      log("info", "request.completed", {
        requestId,
        method: req.method,
        route: url.pathname.replace(/[a-f0-9]{8}-[a-f0-9-]+/g, ":id"),
        status: res.statusCode,
        durationMs: Date.now() - started,
        deviceId: device?.id,
      });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  return server;
}
