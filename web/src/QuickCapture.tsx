import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Clipboard, Inbox, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { knownRoots, reopenRoot, utf8 } from "./core/fs";
import { log } from "./core/log";
import {
  captureContent,
  captureFileName,
  INBOX_FOLDER,
} from "./core/quick-capture";

// 快速收集箱小窗：由系统全局快捷键唤起（桌面端），正文直接写入知识库根
// 目录的收集箱文件夹；浏览器里通过 ?quick-capture 打开以便自动化测试。
export default function QuickCapture() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const latest = useRef({ text, busy });
  latest.current = { text, busy };
  useEffect(() => {
    area.current?.focus();
  }, []);
  async function pasteClipboard() {
    try {
      const value = isTauri()
        ? await invoke<string>("plugin:clipboard-manager|read_text")
        : await navigator.clipboard.readText();
      if (!value) return;
      setText((current) =>
        current.trim() ? current.trimEnd() + "\n" + value : value,
      );
      area.current?.focus();
    } catch {
      toast.error("无法读取剪贴板内容");
    }
  }
  function close() {
    if (isTauri()) void getCurrentWindow().hide();
    else setText("");
  }
  async function save() {
    const content = latest.current.text.trim();
    if (!content || latest.current.busy) return;
    setBusy(true);
    try {
      const root = (await knownRoots())[0];
      if (!root) {
        setHint("请先在主窗口打开知识库文件夹，再使用快速收集箱。");
        return;
      }
      const disk = await reopenRoot(root);
      const path = `${INBOX_FOLDER}/${captureFileName()}`;
      // 写入会自动创建父文件夹；expectedHash=null 表示按新文件落盘。
      await disk.write(path, utf8.encode(captureContent(content)), null);
      log("INFO", "files", "快速收集已写入", { path });
      setText("");
      toast.success(`已存入 ${path}`);
      if (isTauri()) await getCurrentWindow().hide();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header
        className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3 text-sidebar-foreground"
        data-tauri-drag-region="deep"
      >
        <Inbox className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">快速收集箱</span>
        <span className="hidden text-[11px] text-muted-foreground sm:block">
          ⌘⏎ 存入 · Esc 关闭
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="关闭快速收集箱"
          onClick={close}
        >
          <X />
        </Button>
      </header>
      <Textarea
        ref={area}
        aria-label="收集内容"
        placeholder="记一段想法、链接或待办…（⌘⏎ 存入收集箱）"
        className="min-h-0 flex-1 resize-none rounded-none border-0 px-4 py-3 text-sm shadow-none focus-visible:ring-0"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHint(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      />
      <footer className="flex h-11 shrink-0 items-center gap-2 border-t px-3">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void pasteClipboard()}
        >
          <Clipboard />
          插入剪贴板
        </Button>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${hint ? "text-destructive" : "text-muted-foreground"}`}
        >
          {hint ?? `保存到知识库的 ${INBOX_FOLDER}/ 文件夹，稍后再整理`}
        </span>
        <Button
          size="sm"
          disabled={busy || !text.trim()}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Inbox />}
          存入收集箱
        </Button>
      </footer>
    </div>
  );
}
