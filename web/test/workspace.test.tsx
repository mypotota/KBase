// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { digest, utf8, decode, FileChangedError } from "../src/core/fs";
import { useWorkspace } from "../src/core/use-workspace";
const fake = vi.hoisted(() => ({ disk: null as any }));
vi.mock("../src/core/fs", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  knownRoots: async () => [],
  selectRoot: async () => fake.disk,
}));
vi.stubGlobal("crypto", webcrypto);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
class ControlledDisk {
  root = { id: crypto.randomUUID(), name: "test", path: "test", native: false };
  files = new Map([["P/n.md", utf8.encode("original")]]);
  gate: Promise<void> | null = null;
  entered: (() => void) | null = null;
  async permission() {}
  async list() {
    return [
      { path: "P", kind: "directory" },
      ...[...this.files]
        .filter(([path]) => !path.startsWith("."))
        .map(([path, b]) => ({ path, kind: "file", size: b.length })),
    ];
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
    if (path === "P/n.md" && this.gate) {
      const gate = this.gate;
      this.gate = null;
      this.entered?.();
      await gate;
    }
    if (expected !== undefined && (await this.hash(path)) !== expected)
      throw new FileChangedError(path);
    this.files.set(path, bytes.slice());
  }
}
async function fixture(
  run: (
    w: () => ReturnType<typeof useWorkspace>,
    disk: ControlledDisk,
  ) => Promise<void>,
) {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    disk = new ControlledDisk();
  fake.disk = disk;
  let current: ReturnType<typeof useWorkspace>;
  function Harness() {
    current = useWorkspace();
    return null;
  }
  await act(async () => {
    root.render(<Harness />);
  });
  try {
    await act(async () => {
      await current!.choose();
    });
    await act(async () => {
      await current!.openProject(current!.projects[0]);
    });
    await run(() => current!, disk);
  } finally {
    await act(async () => root.unmount());
    element.remove();
  }
}
it("flushes an undo made while an older write is in flight before allowing navigation or close", () =>
  fixture(async (w, disk) => {
    let release!: () => void, entered!: () => void;
    disk.gate = new Promise((r) => (release = r));
    const started = new Promise<void>((r) => (entered = r));
    disk.entered = entered;
    let first!: Promise<void>;
    await act(async () => {
      w().updateText("version A");
      first = w().saveNow();
      await started;
    });
    await act(async () => {
      w().updateText("original");
    });
    expect(w().dirty).toBe(false);
    await act(async () => {
      const final = w().saveNow();
      release();
      await Promise.all([first, final]);
    });
    expect(decode(await disk.read("P/n.md"))).toBe("original");
    expect(w().dirty).toBe(false);
  }));
it("preserves a dirty document when an Agent deletes its file, and recreates it only after explicit choice", () =>
  fixture(async (w, disk) => {
    await act(async () => {
      w().updateText("unsaved draft");
    });
    disk.files.delete("P/n.md");
    await act(async () => {
      await w()
        .saveNow()
        .catch(() => {});
    });
    expect(w().external?.remote).toBeNull();
    expect(disk.files.has("P/n.md")).toBe(false);
    await act(async () => {
      await w().resolveExternal("local");
    });
    expect(decode(await disk.read("P/n.md"))).toBe("unsaved draft");
    expect(w().external).toBeNull();
    expect(w().dirty).toBe(false);
    disk.files.delete("P/n.md");
    await act(async () => {
      await w().checkExternal();
    });
    expect(w().notePath).toBeNull();
    await act(async () => {
      await w().back();
    });
  }));
it("refreshes a second external change in the conflict UI instead of trapping the user on a stale version", () =>
  fixture(async (w, disk) => {
    await act(async () => {
      w().updateText("local");
    });
    disk.files.set("P/n.md", utf8.encode("external 1"));
    await act(async () => {
      await w()
        .saveNow()
        .catch(() => {});
    });
    expect(w().external?.remote?.text).toBe("external 1");
    disk.files.set("P/n.md", utf8.encode("external 2"));
    await act(async () => {
      await expect(w().resolveExternal("local")).rejects.toThrow(
        "磁盘版本再次更新",
      );
    });
    expect(w().external?.remote?.text).toBe("external 2");
    await act(async () => {
      await w().resolveExternal("merge", "merged safely");
    });
    expect(decode(await disk.read("P/n.md"))).toBe("merged safely");
  }));
