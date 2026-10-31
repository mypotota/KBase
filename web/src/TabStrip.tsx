import { useRef, useState } from "react";
import { CornerDownLeft, CornerDownRight, CornerUpRight, FileText, X } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Note } from "./core/library";

// 分屏象限：1=右上 2=左下 3=右下（左上 0 是主编辑区，不在分屏集合里）。
export type PaneQuad = 1 | 2 | 3;
export type PaneTabs = { tabs: string[]; active: string | null };

// 侧栏文件与标签页拖拽共用 NOTE_MIME 携带文档路径；标签页额外用
// TAB_SRC_MIME 带上来源块，drop 侧据此区分"打开"与"移动"。
export const NOTE_MIME = "application/x-kbase-note";
export const TAB_SRC_MIME = "application/x-kbase-tab-src";
export type PaneId = 0 | PaneQuad;

type Props = {
  tabs: string[];
  notes: Note[];
  activePath: string | null;
  dirty?: boolean;
  label: string;
  paneId: PaneId;
  onSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  // 提供后右键标签出现分屏项（主区与分屏区都可再分屏到其他象限）。
  onSplit?: (path: string, quad: PaneQuad) => void;
  // 标签条 drop：fromPane 为 null 表示来自侧栏，否则是跨块/同块移动或排序。
  onTabDrop?: (
    path: string,
    fromPane: PaneId | null,
    hoverIndex: number | null,
    before: boolean,
  ) => void;
};

const splitTargets: { quad: PaneQuad; label: string; icon: typeof CornerUpRight }[] = [
  { quad: 1, label: "在右上分屏打开", icon: CornerUpRight },
  { quad: 2, label: "在左下分屏打开", icon: CornerDownLeft },
  { quad: 3, label: "在右下分屏打开", icon: CornerDownRight },
];

// 主编辑区与各分屏区共用的标签条：右键菜单提供关闭与分屏打开；
// 标签可拖动排序，也可拖到其他块的内容区或标签条完成分屏移动。
export default function TabStrip({
  tabs,
  notes,
  activePath,
  dirty = false,
  label,
  paneId,
  onSelect,
  onCloseTab,
  onSplit,
  onTabDrop,
}: Props) {
  const noteOf = (path: string) => notes.find((n) => n.path === path);
  // 排序插入指示：dropAt 在 dragover 中无法读到拖拽数据（浏览器安全限制），
  // 只按光标位置计算插入点，path 留到 drop 时再取。
  const [dropAt, setDropAt] = useState<{ index: number; before: boolean } | null>(null);
  const dropAtRef = useRef<{ index: number; before: boolean } | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  function updateDropAt(e: React.DragEvent) {
    const strip = stripRef.current;
    if (!strip) return;
    const tabEls = [...strip.querySelectorAll<HTMLElement>("[role='tab']")];
    let index = tabEls.length;
    let before = false;
    for (let i = 0; i < tabEls.length; i++) {
      const rect = tabEls[i].getBoundingClientRect();
      if (e.clientX < rect.right) {
        index = i;
        before = e.clientX < rect.left + rect.width / 2;
        break;
      }
    }
    if (index === tabEls.length && tabEls.length) {
      index = tabEls.length - 1;
      before = false;
    }
    const next = { index, before };
    dropAtRef.current = next;
    setDropAt(next);
  }
  function clearDropAt() {
    dropAtRef.current = null;
    setDropAt(null);
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      className="tab-strip animate-in flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/40 px-2 pt-1 fade-in slide-in-from-top-1 duration-200"
      onDragOver={
        onTabDrop
          ? (e) => {
              if (!e.dataTransfer.types.includes(NOTE_MIME)) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              updateDropAt(e);
            }
          : undefined
      }
      onDragLeave={
        onTabDrop
          ? (e) => {
              if (
                e.relatedTarget instanceof Node &&
                stripRef.current?.contains(e.relatedTarget)
              )
                return;
              clearDropAt();
            }
          : undefined
      }
      onDrop={
        onTabDrop
          ? (e) => {
              if (!e.dataTransfer.types.includes(NOTE_MIME)) return;
              e.preventDefault();
              e.stopPropagation();
              const path = e.dataTransfer.getData(NOTE_MIME);
              const src = e.dataTransfer.getData(TAB_SRC_MIME);
              const fromPane = src === "" ? null : (Number(src) as PaneId);
              const hover = dropAtRef.current;
              clearDropAt();
              if (path) onTabDrop(path, fromPane, hover?.index ?? null, hover?.before ?? true);
            }
          : undefined
      }
    >
      {tabs.map((path, tabIndex) => {
        const note = noteOf(path);
        const noteTitle = note?.title ?? path.split("/").at(-1) ?? path;
        const active = activePath === path;
        return (
          <ContextMenu key={path}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(NOTE_MIME, path);
                  e.dataTransfer.setData(TAB_SRC_MIME, String(paneId));
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "group tab animate-in relative flex h-8 max-w-[220px] shrink-0 cursor-default items-center gap-1.5 rounded-t-md pr-1 pl-2.5 text-sm transition-colors fade-in slide-in-from-left-1 fill-mode-backwards duration-200",
                  active
                    ? "border-b-2 border-b-background bg-background font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {onTabDrop && dropAt?.index === tabIndex && (
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute top-1 bottom-0.5 z-10 w-0.5 rounded-full bg-primary",
                      dropAt.before ? "-left-px" : "-right-px",
                    )}
                  />
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => onSelect(path)}
                >
                  <FileText className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{noteTitle}</span>
                </button>
                {active && dirty && (
                  <span
                    title="有未保存的修改"
                    className="size-1.5 shrink-0 rounded-full bg-foreground"
                  />
                )}
                <button
                  type="button"
                  aria-label={`关闭 ${noteTitle}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => onCloseTab(path)}
                >
                  <X className="size-3" />
                </button>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              {onSplit && (
                <>
                  {splitTargets.map(({ quad, label: text, icon: Icon }) => (
                    <ContextMenuItem
                      key={quad}
                      onSelect={() => onSplit(path, quad)}
                      disabled={!note}
                    >
                      <Icon />
                      {text}
                    </ContextMenuItem>
                  ))}
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem
                variant="destructive"
                onSelect={() => onCloseTab(path)}
              >
                <X />
                关闭标签
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}
