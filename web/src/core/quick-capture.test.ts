import { describe, expect, it } from "vitest";
import { captureContent, captureFileName, INBOX_FOLDER } from "./quick-capture";

describe("captureFileName", () => {
  it("uses a sortable local timestamp with .md suffix", () => {
    const at = new Date(2026, 9, 30, 9, 5, 3);
    expect(captureFileName(at)).toBe("2026-10-30-090503.md");
  });
});

describe("captureContent", () => {
  it("wraps the text in frontmatter and trims whitespace", () => {
    const at = new Date("2026-10-30T01:02:03.000Z");
    const content = captureContent("  一段想法  \n", at);
    expect(content).toBe(
      "---\ncreated: 2026-10-30T01:02:03.000Z\nsource: quick-capture\n\n一段想法\n",
    );
    expect(content).toContain("source: quick-capture");
  });

  it("exposes the inbox folder for the UI and file path", () => {
    expect(INBOX_FOLDER).toBe("收集箱");
  });
});
