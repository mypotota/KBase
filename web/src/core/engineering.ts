export type EngineeringBrief = Partial<Record<"目标" | "当前阶段" | "下一步" | "关键资料", string>>;
export function parseEngineeringBrief(text: string): EngineeringBrief {
  const result: EngineeringBrief = {};
  let section: keyof EngineeringBrief | undefined;
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (!fenced && /^#{1,6}\s/.test(line)) {
      const heading = line.replace(/^#+\s+/, "").trim();
      section = ["目标", "当前阶段", "下一步", "关键资料"].includes(heading) ? heading as keyof EngineeringBrief : undefined;
      continue;
    }
    if (section) result[section] = ((result[section] || "") + line + "\n");
  }
  for (const key of Object.keys(result) as (keyof EngineeringBrief)[]) result[key] = result[key]?.trim();
  return result;
}
export function briefTemplate(name: string) {
  return `# ${name.replace(/[\r\n]/g, " ")}\n\n## 目标\n\n填写工程要解决的问题与交付成果。\n\n## 当前阶段\n\n准备中\n\n## 下一步\n\n明确第一项工作与完成条件。\n\n## 关键资料\n\n添加需求、方案和验收记录的相对路径。\n`;
}
