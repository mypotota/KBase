import { describe, it, expect } from "vitest";
import { relativeTime } from "../src/lib/relative-time";

describe("relativeTime", () => {
  const now = new Date("2026-10-30T12:00:00").getTime();
  const at = (iso: string) => new Date(iso).getTime();

  it("describes recent moments in Chinese", () => {
    expect(relativeTime(now - 30_000, now)).toBe("刚刚");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe("昨天");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 天前");
  });

  it("falls back to a date for older files", () => {
    expect(relativeTime(at("2026-10-01T09:30:00"), now)).toBe("10月1日");
    expect(relativeTime(at("2025-03-04T09:30:00"), now)).toBe("2025/3/4");
  });

  it("returns an empty string without a timestamp", () => {
    expect(relativeTime(0, now)).toBe("");
  });
});
