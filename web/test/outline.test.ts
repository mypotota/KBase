import { describe, it, expect } from "vitest";
import { outlineOf } from "../src/lib/outline";

type FakeNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
  textContent: string;
};

function source(nodes: { node: FakeNode; pos: number }[]) {
  return {
    state: {
      doc: {
        descendants(visit: (node: FakeNode, pos: number) => boolean) {
          for (const item of nodes) visit(item.node, item.pos);
        },
      },
    },
  };
}

describe("outlineOf", () => {
  it("collects headings with their level and position", () => {
    const entries = outlineOf(
      source([
        {
          node: { type: { name: "heading" }, attrs: { level: 1 }, textContent: "总览" },
          pos: 0,
        },
        {
          node: { type: { name: "paragraph" }, textContent: "正文" },
          pos: 4,
        },
        {
          node: { type: { name: "heading" }, attrs: { level: 3 }, textContent: "细节" },
          pos: 10,
        },
      ]),
    );
    expect(entries).toEqual([
      { level: 1, text: "总览", pos: 0 },
      { level: 3, text: "细节", pos: 10 },
    ]);
  });

  it("defaults a heading without an explicit level to level 1", () => {
    const entries = outlineOf(
      source([
        { node: { type: { name: "heading" }, textContent: "标题" }, pos: 2 },
      ]),
    );
    expect(entries[0].level).toBe(1);
  });

  it("returns nothing without an editor", () => {
    expect(outlineOf(null)).toEqual([]);
  });
});
