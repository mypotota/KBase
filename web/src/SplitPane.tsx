import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { imageUrl, saveImage } from "./core/attachments";
import { log } from "./core/log";
import { readNote, writeNote, type Note, type Project } from "./core/library";
import type { Disk } from "./core/fs";
import MarkdownEditor from "./MarkdownEditor";
import TabStrip, { type PaneId, type PaneQuad } from "./TabStrip";
import { cn } from "@/lib/utils";

type Props = {
  disk: Disk;
  projects: Project[];
  tabs: string[];
  active: string | null;
  paneId: PaneId;
  onSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onSplit?: (path: string, quad: PaneQuad) => void;
  onTabDrop?: (
    path: string,
    fromPane: PaneId | null,
    hoverIndex: number | null,
    before: boolean,
  ) => void;
  initialScroll?: number;
};

// 同一文件的并发读取会触发 Chromium File System Access 的挂起问题
// （StrictMode 双跑即复现），这里按 root+path 去重，共享同一次读取。
const inflightReads = new Map<string, Promise<{ text: string; hash: string }>>();
function readNoteOnce(disk: Disk, path: string) {
  const key = disk.root.id + ":" + path;
  let pending = inflightReads.get(key);
  if (!pending) {
    pending = readNote(disk, path).finally(() => inflightReads.delete(key));
    inflightReads.set(key, pending);
  }
  return pending;
}

// 分屏编辑区：与主编辑区完全同构——有自己的标签页、阅读/编辑切换和
// 保存链路（writeNote 哈希校验 + 历史备份）；标签关空后由父级收起。
export default function SplitPane({
  disk,
  projects,
  tabs,
  active,
  paneId,
  onSelect,
  onCloseTab,
  onSplit,
  onTabDrop,
  initialScroll = 0,
}: Props) {
  const [snapshot, setSnapshot] = useState<{ text: string; hash: string } | null>(
    null,
  );
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const activeDoc = useRef({ active, snapshot, text, dirty });
  activeDoc.current = { active, snapshot, text, dirty };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const cancelledRef = useRef(false);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  function update(value: string) {
    const current = activeDoc.current;
    if (!current.snapshot || !current.active) return;
    const nextDirty = value !== current.snapshot.text;
    setText(value);
    setDirty(nextDirty);
    activeDoc.current = { ...current, text: value, dirty: nextDirty };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  }
  async function save() {
    const current = activeDoc.current;
    if (!current.active || !current.snapshot || !current.dirty) return;
    if (timer.current) clearTimeout(timer.current);
    setSaving(true);
    try {
      const next = await writeNote(
        disk,
        current.active,
        current.text,
        current.snapshot.hash,
      );
      if (activeDoc.current.active === current.active) {
        const stillDirty = activeDoc.current.text !== next.text;
        activeDoc.current = {
          ...activeDoc.current,
          snapshot: next,
          dirty: stillDirty,
        };
        setSnapshot(next);
        setDirty(stillDirty);
      }
    } catch (e) {
      toast.error(
        "分屏文档保存失败：" + (e instanceof Error ? e.message : String(e)),
      );
      // 磁盘版本优先：本地未保存的修改保留在输入框里，可复制后再处理。
      try {
        const fresh = await readNote(disk, current.active);
        if (activeDoc.current.active === current.active) {
          activeDoc.current = {
            active: current.active,
            snapshot: fresh,
            text: fresh.text,
            dirty: false,
          };
          setSnapshot(fresh);
          setText(fresh.text);
          setDirty(false);
        }
      } catch {
        /* 保留本地内容 */
      }
    } finally {
      setSaving(false);
    }
  }
  // 切换/关闭标签前把当前编辑落盘，避免丢字。
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const current = activeDoc.current;
      if (current.active && current.snapshot && current.dirty)
        void writeNote(disk, current.active, current.text, current.snapshot.hash)
          .then(() => log("INFO", "files", "分屏切换前已保存", { path: current.active! }))
          .catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    if (!active) {
      setSnapshot(null);
      setText("");
      setDirty(false);
      return;
    }
    readNoteOnce(disk, active)
      .then((next) => {
        if (cancelledRef.current || activeDoc.current.active !== active) return;
        setSnapshot(next);
        setText(next.text);
        setDirty(false);
        if (initialScroll)
          setTimeout(() => {
            const viewport = container.current?.querySelector<HTMLElement>(
              "[data-slot='scroll-area-viewport']",
            );
            if (viewport) viewport.scrollTop = initialScroll;
          }, 350);
      })
      .catch((e) => {
        if (cancelledRef.current) return;
        setSnapshot(null);
        setText("");
        toast.error(
          "分屏文档无法读取：" + (e instanceof Error ? e.message : String(e)),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disk, active]);
  const noteOf = (path: string): Note | undefined =>
    projects.flatMap((p) => p.notes).find((n) => n.path === path);
  const note = active ? noteOf(active) : undefined;
  const title = note?.title ?? active?.split("/").at(-1) ?? "";
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      {tabs.length > 0 && (
        <TabStrip
          tabs={tabs}
          notes={projects.flatMap((p) => p.notes)}
          activePath={active}
          dirty={dirty}
          label="分屏标签页"
          paneId={paneId}
          onSelect={onSelect}
          onCloseTab={onCloseTab}
          onSplit={onSplit}
          onTabDrop={onTabDrop}
        />
      )}
      {!active ? null : (
        <>
          <ScrollArea className="min-h-0 flex-1" data-split-scroll="">
            <div ref={container} className="mx-auto w-full max-w-2xl px-6 py-6">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{active}</span>
                <span>·</span>
                <span className="shrink-0">
                  {saving ? "正在写入磁盘" : dirty ? "待保存" : "已保存到本地"}
                </span>
              </div>
              <div key={active} className="doc-enter">
                <MarkdownEditor
                  key={active}
                  value={text}
                  onChange={update}
                  readOnly={reading}
                  onReady={() => {}}
                  onSlash={() => {}}
                  resolveImage={(src) => imageUrl(disk, active, src)}
                  onImage={(file) =>
                    saveImage(disk, active.split("/")[0], active, file)
                  }
                />
              </div>
              <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                <span>{reading ? "阅读模式" : "编辑模式"}</span>
                <span>{text.replace(/\s/g, "").length} 字</span>
              </div>
            </div>
          </ScrollArea>
          <footer className="flex h-8 shrink-0 items-center gap-2 border-t px-3 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={reading ? "分屏切换为编辑" : "分屏切换为阅读"}
              onClick={() => setReading((v) => !v)}
            >
              {reading ? <Pencil /> : <BookOpen />}
            </Button>
            {saving ? (
              <Loader2 className="size-3 shrink-0 animate-spin" />
            ) : dirty ? (
              <span className="dirty-dot size-1.5 shrink-0 rounded-full bg-foreground" />
            ) : null}
            <span className="truncate">分屏 · {title}</span>
          </footer>
        </>
      )}
    </div>
  );
}
