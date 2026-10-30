import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { Store } from "../../server/src/store.mjs";
import { createApi } from "../../server/src/http.mjs";
import { Disk, digest, FileChangedError, utf8, decode } from "../src/core/fs";
import { Api } from "../src/core/api";
import {
  synchronize,
  resolveConflict,
  stateFor,
  decide,
  type Binding,
} from "../src/core/sync";
import { readNote, writeNote, trash, restore } from "../src/core/library";
class MemoryDisk {
  root = { id: crypto.randomUUID(), name: "test", path: "test", native: false };
  files = new Map<string, Uint8Array>();
  async list(project: string) {
    return [...this.files]
      .filter(
        ([path]) =>
          path.startsWith(project ? project + "/" : "") &&
          !path.split("/").some((p) => p.startsWith(".")),
      )
      .map(([path, bytes]) => ({
        path,
        kind: "file" as const,
        size: bytes.length,
      }));
  }
  async read(path: string) {
    const bytes = this.files.get(path);
    if (!bytes) throw new DOMException("missing", "NotFoundError");
    return bytes.slice();
  }
  async hash(path: string) {
    return this.files.has(path) ? digest(this.files.get(path)!) : null;
  }
  async write(path: string, bytes: Uint8Array, expected?: string | null) {
    if (expected !== undefined && (await this.hash(path)) !== expected)
      throw new FileChangedError(path);
    this.files.set(path, bytes.slice());
  }
  async remove(path: string) {
    this.files.delete(path);
  }
}
async function fixture(
  fn: (
    a: MemoryDisk,
    b: MemoryDisk,
    apiA: Api,
    apiB: Api,
    binding: Binding,
  ) => Promise<void>,
) {
  const store = new Store(":memory:", "test-only-password-123"),
    server = createApi(store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const apiA = await new Api(base).login("test-only-password-123", "A"),
      apiB = await new Api(base).login("test-only-password-123", "B"),
      remote = await apiA.createLibrary("project");
    await fn(new MemoryDisk(), new MemoryDisk(), apiA, apiB, {
      server: base,
      remoteId: remote.id,
      auto: false,
    });
  } finally {
    await new Promise<void>((r) => server.close(r));
    store.close();
  }
}
const disk = (value: MemoryDisk) => value as unknown as Disk;
it("syncs actual Markdown bytes and binary attachments, preserves offline conflicts, merges, deletes and restores", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    const original = "# 标题\n\n- [ ] 待办\n\n```ts\nconst value = 42\n```\n";
    a.files.set("P/笔记.md", utf8.encode(original));
    a.files.set(
      "P/attachments/image.png",
      new Uint8Array([137, 80, 78, 71, 0, 255]),
    );
    await synchronize(disk(a), "P", apiA, binding);
    await synchronize(disk(b), "P", apiB, binding);
    expect(decode(await b.read("P/笔记.md"))).toBe(original);
    expect(await b.read("P/attachments/image.png")).toEqual(
      await a.read("P/attachments/image.png"),
    );
    a.files.set("P/笔记.md", utf8.encode("# A 离线修改"));
    b.files.set("P/笔记.md", utf8.encode("# B 离线修改"));
    await synchronize(disk(a), "P", apiA, binding);
    const result = await synchronize(disk(b), "P", apiB, binding);
    expect(result.state.conflicts).toHaveLength(1);
    expect(decode(await b.read("P/笔记.md"))).toBe("# B 离线修改");
    const conflict = result.state.conflicts[0];
    expect(decode(await b.read(conflict.backup + "/local.bin"))).toBe(
      "# B 离线修改",
    );
    expect(decode(await b.read(conflict.backup + "/remote.bin"))).toBe(
      "# A 离线修改",
    );
    await resolveConflict(
      disk(b),
      "P",
      apiB,
      binding,
      conflict,
      "merge",
      "# A 与 B 合并",
    );
    await synchronize(disk(a), "P", apiA, binding);
    expect(decode(await a.read("P/笔记.md"))).toBe("# A 与 B 合并");
    await trash(disk(b), "P/笔记.md");
    await synchronize(disk(b), "P", apiB, binding);
    await synchronize(disk(a), "P", apiA, binding);
    expect(a.files.has("P/笔记.md")).toBe(false);
    const backup = [...a.files.keys()].find(
      (p) => p.startsWith(".kbase/trash/") && p.endsWith("笔记.md"),
    );
    expect(backup).toBeTruthy();
    const { getRecord } = await import("../src/core/db");
    const items = await getRecord<any[]>("trash:" + a.root.id);
    await restore(disk(a), items![0]);
    await synchronize(disk(a), "P", apiA, binding);
    await synchronize(disk(b), "P", apiB, binding);
    expect(decode(await b.read("P/笔记.md"))).toBe("# A 与 B 合并");
  }));
it("rejects saving over Agent changes and retains exact Markdown history", async () => {
  const a = new MemoryDisk(),
    path = "Project/note.md",
    source = "---\ntitle: YAML\n---\n\n正文[^1]\n\n[^1]: 注释\n";
  a.files.set(path, utf8.encode(source));
  const snapshot = await readNote(disk(a), path);
  expect(snapshot.text).toBe(source);
  await writeNote(disk(a), path, source + "new\n", snapshot.hash);
  expect(decode(await a.read(".kbase/history/" + snapshot.hash + ".md"))).toBe(
    source,
  );
  a.files.set(path, utf8.encode("Agent changed"));
  await expect(
    writeNote(disk(a), path, "overwrite", snapshot.hash),
  ).rejects.toBeInstanceOf(FileChangedError);
  expect(decode(await a.read(path))).toBe("Agent changed");
});
it("does not overwrite a file changed again while conflict UI is open", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    a.files.set("P/n.md", utf8.encode("base"));
    await synchronize(disk(a), "P", apiA, binding);
    await synchronize(disk(b), "P", apiB, binding);
    a.files.set("P/n.md", utf8.encode("A"));
    b.files.set("P/n.md", utf8.encode("B"));
    await synchronize(disk(a), "P", apiA, binding);
    const { state } = await synchronize(disk(b), "P", apiB, binding);
    b.files.set("P/n.md", utf8.encode("Agent"));
    await expect(
      resolveConflict(
        disk(b),
        "P",
        apiB,
        binding,
        state.conflicts[0],
        "remote",
      ),
    ).rejects.toThrow("本地文件已变化");
    expect(decode(await b.read("P/n.md"))).toBe("Agent");
  }));
it("does not sync other projects or application metadata", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    a.files.set("P/local.md", utf8.encode("yes"));
    a.files.set("Private/no.md", utf8.encode("never"));
    a.files.set("P/.kbase/secrets.json", utf8.encode("never"));
    await synchronize(disk(a), "P", apiA, binding);
    expect(
      (await apiA.manifest(binding.remoteId)).files.map((f) => f.path),
    ).toEqual(["local.md"]);
  }));
it("chooses download for remote creation, conflict for simultaneous creation, and upload for local edits", () => {
  const remote = {
    path: "x",
    revision: 2,
    hash: "remote",
    deleted: false,
    created_at: "",
    device_id: "",
  };
  expect(decide(null, remote, undefined)).toBe("download");
  expect(decide("local", remote, undefined)).toBe("conflict");
  expect(decide("local", remote, { revision: 2, hash: "remote" })).toBe(
    "upload",
  );
  expect(decide("local", remote, { revision: 1, hash: "old" })).toBe(
    "conflict",
  );
});
it("rejects case-colliding filenames before writing any remote version", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    a.files.set("P/Note.md", utf8.encode("A"));
    a.files.set("P/note.md", utf8.encode("B"));
    await expect(synchronize(disk(a), "P", apiA, binding)).rejects.toThrow(
      "大小写",
    );
    expect((await apiA.manifest(binding.remoteId)).files).toHaveLength(0);
  }));
it("normalizes remote Unicode paths without duplicating local decomposed filenames", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    a.files.set("P/cafe\u0301.md", utf8.encode("accent"));
    await synchronize(disk(a), "P", apiA, binding);
    await synchronize(disk(a), "P", apiA, binding);
    const files = (await apiA.manifest(binding.remoteId)).files;
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("café.md");
    await synchronize(disk(b), "P", apiB, binding);
    expect(decode(await b.read("P/café.md"))).toBe("accent");
  }));
it("does not offer text-merge semantics for binary attachments even if bytes decode as UTF-8", () =>
  fixture(async (a, b, apiA, apiB, binding) => {
    a.files.set("P/file.pdf", utf8.encode("binary A"));
    await synchronize(disk(a), "P", apiA, binding);
    await synchronize(disk(b), "P", apiB, binding);
    a.files.set("P/file.pdf", utf8.encode("changed A"));
    b.files.set("P/file.pdf", utf8.encode("changed B"));
    await synchronize(disk(a), "P", apiA, binding);
    const { state } = await synchronize(disk(b), "P", apiB, binding);
    await expect(
      resolveConflict(
        disk(b),
        "P",
        apiB,
        binding,
        state.conflicts[0],
        "merge",
        "corrupt text",
      ),
    ).rejects.toThrow("非 Markdown");
    expect(decode(await b.read("P/file.pdf"))).toBe("changed B");
  }));
