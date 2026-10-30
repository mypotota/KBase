import { parse } from "yaml";

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | FrontmatterValue[];

export type FrontmatterField = { key: string; value: FrontmatterValue };

// The frontmatter block keeps its original bytes on disk; this only reads it
// for display.
export function parseFrontmatter(front: string): {
  fields: FrontmatterField[];
  error: string | null;
} {
  const body = front
    .replace(/^---[ \t]*\r?\n/, "")
    .replace(/\r?\n---[ \t]*(\r?\n|$)/, "");
  if (!body.trim()) return { fields: [], error: null };
  try {
    const data = parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { fields: [], error: null };
    return {
      fields: Object.entries(data as Record<string, FrontmatterValue>).map(
        ([key, value]) => ({ key, value }),
      ),
      error: null,
    };
  } catch (cause) {
    return {
      fields: [],
      error: cause instanceof Error ? cause.message : "元数据格式无法解析",
    };
  }
}

// Plain text for values that are not simple scalars.
export function frontmatterText(value: FrontmatterValue): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map((item) => frontmatterText(item)).join("、");
  return String(value);
}
