import { DatabaseSync } from "node:sqlite";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function safePath(path) {
  if (
    typeof path !== "string" ||
    path.length > 1024 ||
    path.includes("\\") ||
    /[\u0000-\u001f]/.test(path) ||
    path
      .split("/")
      .some((p) => !p || p === "." || p === ".." || p.startsWith(".")) ||
    path.startsWith("/")
  )
    throw new ApiError(400, "INVALID_PATH", "文件路径无效");
  return path.normalize("NFC");
}
export class Store {
  constructor(filename, password) {
    if (!password || password.length < 12)
      throw new Error(
        "KBASE_ADMIN_PASSWORD must contain at least 12 characters",
      );
    this.passwordSalt = randomBytes(16);
    this.passwordHash = scryptSync(password, this.passwordSalt, 32);
    this.db = new DatabaseSync(filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,name TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS libraries(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS versions(revision INTEGER PRIMARY KEY AUTOINCREMENT,library_id TEXT NOT NULL REFERENCES libraries(id),path TEXT NOT NULL,hash TEXT,content BLOB,deleted INTEGER NOT NULL,device_id TEXT NOT NULL REFERENCES devices(id),created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS versions_lookup ON versions(library_id,path,revision);
   CREATE TABLE IF NOT EXISTS files(library_id TEXT NOT NULL REFERENCES libraries(id),path TEXT NOT NULL,revision INTEGER NOT NULL REFERENCES versions(revision),PRIMARY KEY(library_id,path));
   CREATE TABLE IF NOT EXISTS operations(device_id TEXT NOT NULL,operation_id TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(device_id,operation_id));`);
  }
  login(password, name) {
    const attempt = scryptSync(String(password ?? ""), this.passwordSalt, 32);
    if (!timingSafeEqual(attempt, this.passwordHash))
      throw new ApiError(401, "INVALID_CREDENTIALS", "密码不正确");
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      throw new ApiError(400, "INVALID_DEVICE", "设备名称无效");
    const token = randomBytes(32).toString("base64url"),
      id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO devices(id,name,token_hash,created_at) VALUES(?,?,?,?)",
      )
      .run(
        id,
        name.trim(),
        createHash("sha256").update(token).digest("hex"),
        new Date().toISOString(),
      );
    return { token, device: { id, name: name.trim() } };
  }
  authenticate(token) {
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "需要登录");
    const row = this.db
      .prepare("SELECT id,name FROM devices WHERE token_hash=? AND revoked=0")
      .get(createHash("sha256").update(token).digest("hex"));
    if (!row) throw new ApiError(401, "UNAUTHENTICATED", "登录已失效");
    return row;
  }
  devices() {
    return this.db
      .prepare(
        "SELECT id,name,created_at FROM devices WHERE revoked=0 ORDER BY created_at",
      )
      .all();
  }
  revoke(id) {
    this.db.prepare("UPDATE devices SET revoked=1 WHERE id=?").run(id);
  }
  createLibrary(name) {
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      throw new ApiError(400, "INVALID_NAME", "名称无效");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO libraries VALUES(?,?,?)")
      .run(id, name.trim(), new Date().toISOString());
    return { id, name: name.trim() };
  }
  libraries() {
    return this.db
      .prepare("SELECT id,name,created_at FROM libraries ORDER BY created_at")
      .all();
  }
  requireLibrary(id) {
    if (!this.db.prepare("SELECT id FROM libraries WHERE id=?").get(id))
      throw new ApiError(404, "NOT_FOUND", "项目不存在");
  }
  manifest(id) {
    this.requireLibrary(id);
    return this.db
      .prepare(
        "SELECT v.path,v.revision,v.hash,v.deleted,length(v.content) AS size,v.created_at,v.device_id FROM files f JOIN versions v ON f.revision=v.revision WHERE f.library_id=? ORDER BY v.path",
      )
      .all(id)
      .map((r) => ({ ...r, deleted: !!r.deleted }));
  }
  version(id, path, revision) {
    this.requireLibrary(id);
    path = safePath(path);
    const row = revision
      ? this.db
          .prepare(
            "SELECT * FROM versions WHERE library_id=? AND path=? AND revision=?",
          )
          .get(id, path, revision)
      : this.db
          .prepare(
            "SELECT v.* FROM files f JOIN versions v ON f.revision=v.revision WHERE f.library_id=? AND f.path=?",
          )
          .get(id, path);
    if (!row) throw new ApiError(404, "NOT_FOUND", "文件版本不存在");
    return {
      path: row.path,
      revision: row.revision,
      hash: row.hash,
      deleted: !!row.deleted,
      contentBase64: row.content
        ? Buffer.from(row.content).toString("base64")
        : null,
      created_at: row.created_at,
      device_id: row.device_id,
    };
  }
  history(id, path) {
    this.requireLibrary(id);
    path = safePath(path);
    return this.db
      .prepare(
        "SELECT revision,hash,deleted,created_at,device_id,length(content) AS size FROM versions WHERE library_id=? AND path=? ORDER BY revision DESC LIMIT 100",
      )
      .all(id, path);
  }
  put(id, device, input) {
    this.requireLibrary(id);
    const path = safePath(input.path);
    if (
      !Number.isSafeInteger(input.baseRevision) &&
      input.baseRevision !== null
    )
      throw new ApiError(400, "INVALID_REVISION", "必须提供基线版本");
    if (
      typeof input.operationId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(input.operationId)
    )
      throw new ApiError(400, "INVALID_OPERATION", "任务编号无效");
    if (input.deleted !== undefined && typeof input.deleted !== "boolean")
      throw new ApiError(400, "INVALID_DELETE", "删除标记无效");
    const deleted = !!input.deleted;
    let content = null;
    if (!deleted) {
      if (
        typeof input.contentBase64 !== "string" ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          input.contentBase64,
        )
      )
        throw new ApiError(400, "INVALID_CONTENT", "文件内容编码无效");
      content = Buffer.from(input.contentBase64, "base64");
      if (content.length > 20 * 1024 * 1024)
        throw new ApiError(413, "FILE_TOO_LARGE", "单文件上限为 20 MB");
    }
    const hash = deleted
        ? null
        : createHash("sha256").update(content).digest("hex"),
      fingerprint = createHash("sha256")
        .update(JSON.stringify([id, path, input.baseRevision, hash, deleted]))
        .digest("hex");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare(
          "SELECT fingerprint,response FROM operations WHERE device_id=? AND operation_id=?",
        )
        .get(device.id, input.operationId);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new ApiError(
            409,
            "OPERATION_REUSED",
            "任务编号已被其他操作使用",
          );
        this.db.exec("COMMIT");
        return JSON.parse(previous.response);
      }
      const current = this.db
        .prepare("SELECT revision FROM files WHERE library_id=? AND path=?")
        .get(id, path);
      if ((current?.revision ?? null) !== input.baseRevision)
        throw new ApiError(409, "VERSION_CONFLICT", "远端文件已更改", {
          current: current ? this.version(id, path) : null,
        });
      const now = new Date().toISOString(),
        result = this.db
          .prepare(
            "INSERT INTO versions(library_id,path,hash,content,deleted,device_id,created_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(id, path, hash, content, deleted ? 1 : 0, device.id, now),
        revision = Number(result.lastInsertRowid);
      this.db
        .prepare(
          "INSERT INTO files VALUES(?,?,?) ON CONFLICT(library_id,path) DO UPDATE SET revision=excluded.revision",
        )
        .run(id, path, revision);
      const response = {
        path,
        revision,
        hash,
        deleted,
        created_at: now,
        device_id: device.id,
      };
      this.db
        .prepare("INSERT INTO operations VALUES(?,?,?,?)")
        .run(
          device.id,
          input.operationId,
          fingerprint,
          JSON.stringify(response),
        );
      this.db.exec("COMMIT");
      return response;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
