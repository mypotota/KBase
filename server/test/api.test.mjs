import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.mjs";
import { createApi } from "../src/http.mjs";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "kbase-test-")),
    store = new Store(join(dir, "test.sqlite"), "test-only-password-123"),
    server = createApi(store, { allowedOrigins: ["http://localhost:4174"] });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = async (path, options = {}) => {
    const r = await fetch(base + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    return {
      status: r.status,
      body: r.status === 204 ? null : await r.json(),
      requestId: r.headers.get("x-request-id"),
    };
  };
  try {
    await fn({ store, request });
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
test("auth, versions, conflict protection, idempotency, history and device revocation", () =>
  fixture(async ({ request }) => {
    assert.equal((await request("/v1/libraries")).status, 401);
    const login = await request("/v1/session", {
      method: "POST",
      body: JSON.stringify({
        password: "test-only-password-123",
        deviceName: "desktop",
      }),
    });
    assert.equal(login.status, 200);
    const headers = { Authorization: "Bearer " + login.body.token };
    const req = (p, o = {}) =>
      request(p, { ...o, headers: { ...headers, ...o.headers } });
    const library = (
      await req("/v1/libraries", {
        method: "POST",
        body: JSON.stringify({ name: "我的项目" }),
      })
    ).body;
    const input = {
      path: "notes/中文.md",
      baseRevision: null,
      operationId: randomUUID(),
      contentBase64: Buffer.from("# 你好\n").toString("base64"),
    };
    const first = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    assert.equal(first.status, 200);
    const retry = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    assert.equal(retry.body.revision, first.body.revision);
    const reused = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify({
        ...input,
        deleted: true,
        contentBase64: undefined,
      }),
    });
    assert.equal(reused.status, 409);
    const stale = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify({ ...input, operationId: randomUUID() }),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.current.revision, first.body.revision);
    const second = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify({
        ...input,
        baseRevision: first.body.revision,
        operationId: randomUUID(),
        contentBase64: Buffer.from("updated").toString("base64"),
      }),
    });
    assert.equal(second.status, 200);
    const old = await req(
      `/v1/libraries/${library.id}/file?path=${encodeURIComponent(input.path)}&revision=${first.body.revision}`,
    );
    assert.equal(
      Buffer.from(old.body.contentBase64, "base64").toString(),
      "# 你好\n",
    );
    const deleted = await req("/v1/libraries/" + library.id + "/file", {
      method: "PUT",
      body: JSON.stringify({
        path: input.path,
        baseRevision: second.body.revision,
        operationId: randomUUID(),
        deleted: true,
      }),
    });
    assert.equal(deleted.body.deleted, true);
    const manifest = await req("/v1/libraries/" + library.id + "/manifest");
    assert.equal(manifest.body.files[0].deleted, true);
    assert.equal(
      (
        await req(
          `/v1/libraries/${library.id}/history?path=${encodeURIComponent(input.path)}`,
        )
      ).body.length,
      3,
    );
    assert.ok(first.requestId);
    await req("/v1/devices/" + login.body.device.id, { method: "DELETE" });
    assert.equal((await req("/v1/libraries")).status, 401);
  }));
test("reject traversal, hidden metadata, invalid content and unapproved origins", () =>
  fixture(async ({ store, request }) => {
    const { token, device } = store.login("test-only-password-123", "test"),
      library = store.createLibrary("project");
    for (const path of [
      "../outside.md",
      "a/../../x",
      "/absolute.md",
      "a\\x.md",
      ".kbase/token",
      "a//b.md",
      "a/./b.md",
    ])
      assert.throws(
        () =>
          store.put(library.id, device, {
            path,
            baseRevision: null,
            operationId: randomUUID(),
            contentBase64: "",
          }),
        (e) => e.code === "INVALID_PATH",
      );
    assert.throws(
      () =>
        store.put(library.id, device, {
          path: "a.md",
          baseRevision: null,
          operationId: randomUUID(),
          contentBase64: "not-base64",
        }),
      (e) => e.code === "INVALID_CONTENT",
    );
    const denied = await request("/v1/libraries", {
      headers: {
        Origin: "https://evil.example",
        Authorization: "Bearer " + token,
      },
    });
    assert.equal(denied.status, 403);
    const allowed = await request("/v1/libraries", {
      headers: {
        Origin: "http://localhost:4174",
        Authorization: "Bearer " + token,
      },
    });
    assert.equal(allowed.status, 200);
  }));
test("data persists when the store is reopened", () => {
  const dir = mkdtempSync(join(tmpdir(), "kbase-persist-")),
    file = join(dir, "sync.sqlite");
  let store = new Store(file, "test-only-password-123");
  const auth = store.login("test-only-password-123", "device"),
    library = store.createLibrary("project"),
    version = store.put(library.id, auth.device, {
      path: "file.md",
      baseRevision: null,
      operationId: randomUUID(),
      contentBase64: Buffer.from("disk persistence").toString("base64"),
    });
  store.close();
  store = new Store(file, "test-only-password-123");
  assert.equal(store.authenticate(auth.token).id, auth.device.id);
  assert.equal(store.version(library.id, "file.md").revision, version.revision);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
