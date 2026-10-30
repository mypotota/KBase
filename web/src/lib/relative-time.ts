// Compact relative timestamp for the file tree: "刚刚", "3 分钟前", "昨天",
// "3 天前", "M月D日". Falls back to an absolute date for older files.
export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return "";
  const diff = now - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day && new Date(timestamp).getDate() === new Date(now).getDate())
    return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return "昨天";
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
