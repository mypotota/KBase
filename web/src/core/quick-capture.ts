// 快速收集箱的落盘规则：所有文件进入知识库根目录的收集箱文件夹，
// 文件名用本地时间戳保证唯一且按时间自然排序。纯函数，便于单测。
export const INBOX_FOLDER = "收集箱";

const pad = (value: number) => String(value).padStart(2, "0");

export function captureFileName(at = new Date()): string {
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}.md`
  );
}

export function captureContent(text: string, at = new Date()): string {
  return `---
created: ${at.toISOString()}
source: quick-capture
---

${text.trim()}
`;
}
