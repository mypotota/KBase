import { describe, it, expect } from "vitest";
import { frontmatterText, parseFrontmatter } from "../src/lib/frontmatter";

describe("parseFrontmatter", () => {
  it("parses the YAML block into fields", () => {
    const { fields, error } = parseFrontmatter(
      "---\ntags: [Android, 车机]\nsummary: 一段说明\ncreated: 2026-10-27\n---\n",
    );
    expect(error).toBeNull();
    expect(fields).toEqual([
      { key: "tags", value: ["Android", "车机"] },
      { key: "summary", value: "一段说明" },
      { key: "created", value: "2026-10-27" },
    ]);
  });

  it("keeps scalar types", () => {
    const { fields } = parseFrontmatter(
      "---\ndraft: true\norder: 3\nempty:\n---\n",
    );
    expect(fields[0].value).toBe(true);
    expect(fields[1].value).toBe(3);
    expect(fields[2].value).toBeNull();
  });

  it("reports invalid YAML instead of throwing", () => {
    const { fields, error } = parseFrontmatter("---\n: : :\n  bad\n---\n");
    expect(fields).toEqual([]);
    expect(error).toBeTruthy();
  });

  it("handles an empty block", () => {
    expect(parseFrontmatter("---\n---\n")).toEqual({ fields: [], error: null });
    expect(parseFrontmatter("")).toEqual({ fields: [], error: null });
  });
});

describe("frontmatterText", () => {
  it("renders values for display", () => {
    expect(frontmatterText("文本")).toBe("文本");
    expect(frontmatterText(null)).toBe("—");
    expect(frontmatterText(["a", "b"])).toBe("a、b");
    expect(frontmatterText(42)).toBe("42");
  });
});
