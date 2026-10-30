import { Disk, utf8 } from "./fs";
export function resolveRelative(note: string, source: string) {
  const base = note.split("/").slice(0, -1);
  for (const part of decodeURIComponent(source.split(/[?#]/)[0]).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!base.length) throw new Error("图片路径超出知识库");
      base.pop();
    } else base.push(part);
  }
  return base.join("/");
}
export function relativeLink(from: string, to: string) {
  const a = from.split("/").slice(0, -1),
    b = to.split("/");
  while (a.length && b.length && a[0] === b[0]) {
    a.shift();
    b.shift();
  }
  return [...a.map(() => ".."), ...b]
    .map((x) => (x === ".." ? x : encodeURIComponent(x)))
    .join("/");
}
export async function saveImage(
  disk: Disk,
  project: string,
  note: string,
  file: File,
) {
  if (
    !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)
  )
    throw new Error("支持 PNG、JPEG、GIF 和 WebP 图片");
  if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20 MB");
  const suffix = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  }[file.type]!;
  const path = [project, "attachments", crypto.randomUUID() + "." + suffix]
    .filter(Boolean)
    .join("/");
  await disk.write(path, new Uint8Array(await file.arrayBuffer()), null);
  return relativeLink(note, path);
}
export async function imageUrl(disk: Disk, note: string, source: string) {
  if (/^https:\/\//i.test(source)) return source;
  if (/^[a-z]+:/i.test(source) || source.startsWith("/"))
    throw new Error("不支持此图片地址");
  const path = resolveRelative(note, source),
    bytes = await disk.read(path),
    extension = path.split(".").at(-1)?.toLowerCase(),
    mime = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    }[extension ?? ""];
  if (!mime) throw new Error("不支持此图片格式");
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
}
