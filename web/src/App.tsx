import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  CloudCheck,
  Code2,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Library,
  List,
  Loader2,
  MoreHorizontal,
  Moon,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { useAppearance } from "./lib/use-appearance";
import { relativeTime } from "./lib/relative-time";
import { outlineOf } from "./lib/outline";
import { splitFrontmatter } from "./core/markdown";
import { frontmatterText, parseFrontmatter } from "./lib/frontmatter";
import { useWorkspace } from "./core/use-workspace";
import MarkdownEditor from "./MarkdownEditor";
import { MarqueeText } from "./marquee-text";
import { Api, serviceUrl } from "./core/api";
import {
  getBinding,
  setBinding,
  stateFor,
  synchronize,
  resolveConflict,
  type Binding,
  type SyncState,
  type Conflict,
  disconnectProject,
} from "./core/sync";
import {
  loadLogs,
  subscribeLogs,
  diagnosticLogs,
  type LogEntry,
} from "./core/log";
import { decode } from "./core/fs";
import { imageUrl, saveImage } from "./core/attachments";
import { getRecord } from "./core/db";
import { restore, type TrashItem } from "./core/library";

// localStorage can be unavailable in restricted contexts; the panel layout
// simply is not persisted then.
const layoutStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep the layout usable without persistence. */
    }
  },
};

// Sidebar width is remembered as a percentage of the window, so the tree
// keeps the same proportion when the window is resized.
const sidebarWidthKey = "kbase-sidebar-width";
const defaultSidebarWidth = 22;
function readSidebarWidth(): number {
  const raw = layoutStorage.getItem(sidebarWidthKey);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 12 && value <= 42
    ? value
    : defaultSidebarWidth;
}
function saveSidebarWidth(value: number) {
  if (!Number.isFinite(value) || value < 12 || value > 42) return;
  layoutStorage.setItem(sidebarWidthKey, String(value));
}

function download(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
type Panel = "sync" | "logs" | "settings" | "trash" | null;
type Modal =
  | "root"
  | "project"
  | "note"
  | "rename"
  | "delete"
  | "source"
  | "rename-project"
  | "discard"
  | "delete-project"
  | null;
export default function App() {
  const w = useWorkspace(),
    { resolvedTheme, setTheme } = useAppearance();
  const [panel, setPanel] = useState<Panel>(null),
    [modal, setModal] = useState<Modal>(null),
    [name, setName] = useState(""),
    [folder, setFolder] = useState(""),
    [source, setSource] = useState(""),
    [read, setRead] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [small, setSmall] = useState(innerWidth <= 760),
    [closed, setClosed] = useState<string[]>([]);
  // Read on every render so the width survives toggling the sidebar.
  const sidebarWidth = readSidebarWidth();
  const filesRef = useRef<PanelImperativeHandle | null>(null);
  const asideRef = useRef<PanelImperativeHandle | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [asideCollapsed, setAsideCollapsed] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  // Index of the heading the editor is currently scrolled to.
  const [activeOutline, setActiveOutline] = useState<number | null>(null);
  const [panelsAnimating, setPanelsAnimating] = useState(false);
  const [mobileAside, setMobileAside] = useState(false);
  const animTimer = useRef<number | null>(null);
  const [query, setQuery] = useState(""),
    [command, setCommand] = useState(false),
    [slash, setSlash] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [working, setWorking] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]),
    [logQuery, setLogQuery] = useState(""),
    [logLevel, setLogLevel] = useState("all"),
    [trashItems, setTrashItems] = useState<TrashItem[]>([]),
    // Open documents of the current project, shown as tabs.
    [tabs, setTabs] = useState<string[]>([]);
  const [server, setServer] = useState(""),
    [password, setPassword] = useState(""),
    [api, setApi] = useState<Api | null>(null),
    [remotes, setRemotes] = useState<{ id: string; name: string }[]>([]),
    [remoteId, setRemoteId] = useState("new"),
    [binding, setBound] = useState<Binding | undefined>(),
    [syncState, setSyncState] = useState<SyncState>({
      files: {},
      conflicts: [],
    }),
    [syncing, setSyncing] = useState(false),
    [syncError, setSyncError] = useState(""),
    [remoteConflict, setRemoteConflict] = useState<Conflict | null>(null),
    [versions, setVersions] = useState({
      local: "",
      remote: "",
      binary: false,
    }),
    [merge, setMerge] = useState(""),
    [externalMerge, setExternalMerge] = useState("");
  const sessions = useRef(new Map<string, Api>()),
    workspaceLatest = useRef(w),
    backgroundLatest = useRef<() => Promise<void>>(async () => {}),
    actionBusy = useRef(false),
    syncRunning = useRef(false),
    syncLatest = useRef<() => Promise<void>>(async () => {}),
    saveLatest = useRef(w.saveNow);
  saveLatest.current = w.saveNow;
  workspaceLatest.current = w;
  const act = async (fn: () => unknown | Promise<unknown>) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setWorking(true);
    try {
      await fn();
    } catch (error) {
      w.fail(error);
    } finally {
      actionBusy.current = false;
      setWorking(false);
    }
  };
  useEffect(() => {
    const resize = () => setSmall(innerWidth <= 760);
    window.addEventListener("resize", resize);
    loadLogs()
      .then(setLogs)
      .catch(() => {});
    const unsubscribe = subscribeLogs(setLogs);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveLatest
          .current()
          .then(() => toast.success("已保存到本地文件"))
          .catch(w.fail);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", key);
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    setRead(false);
  }, [w.notePath]);
  useEffect(() => {
    let cancelled = false;
    setBound(undefined);
    setSyncState({ files: {}, conflicts: [] });
    setSyncError("");
    if (w.disk && w.projectPath !== null)
      getBinding(w.disk, w.projectPath)
        .then(async (b) => {
          if (cancelled) return;
          setBound(b);
          if (b) {
            setApi(sessions.current.get(b.server) ?? null);
            setServer(b.server);
            setRemoteId(b.remoteId);
            const state = await stateFor(w.disk!, w.projectPath!, b);
            if (!cancelled) setSyncState(state);
          }
        })
        .catch(w.fail);
    return () => {
      cancelled = true;
    };
  }, [w.disk, w.projectPath]);
  useEffect(() => {
    if (panel === "trash" && w.disk)
      getRecord<TrashItem[]>("trash:" + w.disk.root.id)
        .then((items) => setTrashItems(items ?? []))
        .catch(w.fail);
  }, [panel, w.disk]);
  useEffect(() => {
    setExternalMerge(w.external?.local ?? "");
  }, [w.external?.path]);
  useEffect(() => {
    if (!w.disk) return;
    const run = () => {
      if (window.document.visibilityState === "visible")
        void backgroundLatest.current();
    };
    const timer = setInterval(run, 30000),
      initial = setTimeout(run, 1500);
    window.addEventListener("online", run);
    window.document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
      window.removeEventListener("online", run);
      window.document.removeEventListener("visibilitychange", run);
    };
  }, [w.disk, api]);
  useEffect(() => {
    if (!binding?.auto || !api || w.dirty || !w.snapshot) return;
    const timer = setTimeout(() => void syncLatest.current(), 1500);
    return () => clearTimeout(timer);
  }, [w.snapshot?.hash, w.dirty, binding?.auto, api]);
  async function syncNow() {
    if (
      syncRunning.current ||
      !w.disk ||
      w.projectPath === null ||
      !binding ||
      !api
    )
      return;
    if (api.base !== binding.server) {
      setSyncError("请登录当前项目的同步服务器");
      return;
    }
    syncRunning.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      await w.saveNow();
      const result = await synchronize(w.disk, w.projectPath, api, binding);
      setSyncState(result.state);
      await w.refresh();
      await w.checkExternal();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
      if (w.disk && w.projectPath !== null && binding)
        setSyncState(await stateFor(w.disk, w.projectPath, binding));
    } finally {
      syncRunning.current = false;
      setSyncing(false);
    }
  }
  syncLatest.current = syncNow;
  async function syncAll() {
    const current = workspaceLatest.current,
      disk = current.disk;
    if (!disk || syncRunning.current) return;
    syncRunning.current = true;
    try {
      await current.saveNow();
      for (const project of current.projects) {
        if (workspaceLatest.current.disk !== disk) break;
        const b = await getBinding(disk, project.path),
          client = b ? sessions.current.get(b.server) : null;
        if (!b?.auto || !client) continue;
        setSyncing(true);
        try {
          const result = await synchronize(disk, project.path, client, b);
          if (
            workspaceLatest.current.projectPath === project.path &&
            workspaceLatest.current.disk === disk
          ) {
            setSyncState(result.state);
            setSyncError("");
          }
        } catch (error) {
          if (workspaceLatest.current.projectPath === project.path)
            setSyncError(
              error instanceof Error ? error.message : String(error),
            );
        }
      }
      await current.refresh(disk);
      await workspaceLatest.current.checkExternal();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      syncRunning.current = false;
      setSyncing(false);
    }
  }
  backgroundLatest.current = syncAll;
  // Panel toggles animate their flex share; the transition is enabled for the
  // duration of the toggle only, so dragging the separator stays instant.
  function animatePanels(change: () => void) {
    setPanelsAnimating(true);
    if (animTimer.current !== null) window.clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(() => setPanelsAnimating(false), 320);
    change();
  }
  function toggleSidebar() {
    if (small) {
      setMobileNav(true);
      return;
    }
    const collapsing = !sidebarCollapsed;
    setSidebarCollapsed(collapsing);
    animatePanels(() => {
      if (collapsing) filesRef.current?.collapse();
      else filesRef.current?.expand();
    });
  }
  function toggleAside() {
    if (small) {
      setMobileAside(true);
      return;
    }
    const collapsing = !asideCollapsed;
    setAsideCollapsed(collapsing);
    animatePanels(() => {
      if (collapsing) asideRef.current?.collapse();
      else asideRef.current?.expand();
    });
  }
  // Every document the user opens becomes a tab; switching projects starts a
  // fresh set, and tabs of deleted documents disappear.
  const tabProject = useRef<string | null>(null);
  useEffect(() => {
    const projectPath = w.project?.path ?? null;
    if (tabProject.current !== projectPath) {
      tabProject.current = projectPath;
      setTabs([]);
    }
    const path = w.notePath;
    if (!path) return;
    setTabs((current) =>
      current.includes(path) ? current : [...current, path],
    );
  }, [w.project?.path, w.notePath]);
  useEffect(() => {
    const notes = w.project?.notes;
    if (!notes) return;
    const paths = new Set(notes.map((n) => n.path));
    setTabs((current) => {
      const next = current.filter((path) => paths.has(path));
      return next.length === current.length ? current : next;
    });
  }, [w.project?.notes]);
  function closeTab(path: string) {
    const index = tabs.indexOf(path);
    const next = tabs.filter((item) => item !== path);
    setTabs(next);
    if (path !== w.notePath) return;
    // Hand the editor over to the neighbouring tab.
    const target = next[index] ?? next[index - 1];
    if (target) void act(() => w.openNote(target));
    else void act(() => w.closeNote());
  }
  // Right-click actions work on any document: the note is opened first when
  // it is not the one being edited.
  async function withNote(path: string, action: () => void) {
    if (w.notePath !== path)
      await act(async () => {
        await w.openNote(path);
      });
    action();
  }
  function newNoteIn(folder: string) {
    setName("");
    setFolder(folder);
    setModal("note");
  }
  function renameNoteAt(path: string, title: string) {
    void withNote(path, () => {
      // The note is opened first, so the title is passed explicitly instead of
      // reading the stale note from the render closure.
      setName(title);
      setFolder("");
      setModal("rename");
    });
  }
  function deleteNoteAt(path: string) {
    void withNote(path, () => openModal("delete"));
  }
  // Scroll spy: the outline entry of the section currently in view is marked
  // as active while the document scrolls.
  useEffect(() => {
    const viewport = document.querySelector<HTMLElement>(
      "[data-editor-scroll] [data-slot='scroll-area-viewport']",
    );
    if (!viewport || !editor) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const headings = Array.from(
        editor.view.dom.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"),
      );
      if (!headings.length) return setActiveOutline(null);
      const line = viewport.getBoundingClientRect().top + 100;
      let index = 0;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top <= line) index = i;
        else break;
      }
      setActiveOutline(index);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, outlineOf(editor).length]);
  // Keep the active outline entry inside the panel.
  useEffect(() => {
    if (activeOutline === null) return;
    const viewport = document.querySelector<HTMLElement>(
      ".aside-scroll [data-slot='scroll-area-viewport']",
    );
    const item = viewport?.querySelector<HTMLElement>(
      `[data-outline-index="${activeOutline}"]`,
    );
    if (!viewport || !item) return;
    const area = viewport.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    if (box.top < area.top + 8)
      viewport.scrollTop -= area.top + 8 - box.top;
    else if (box.bottom > area.bottom - 8)
      viewport.scrollTop += box.bottom - (area.bottom - 8);
  }, [activeOutline]);
  function openModal(value: Modal) {
    setName(
      value === "root"
        ? "我的知识库"
        : value === "rename"
          ? (w.note?.title ?? "")
          : value === "rename-project"
            ? (w.project?.name ?? "")
            : "",
    );
    setFolder("");
    if (value === "source") setSource(w.text);
    setModal(value);
  }
  async function login() {
    const client = await new Api(server).login(
      password,
      navigator.platform || "KBase Desktop",
    );
    setPassword("");
    sessions.current.set(client.base, client);
    setApi(client);
    setRemotes(await client.libraries());
    toast.success("已登录；凭据仅保留在本次运行中");
  }
  async function bind() {
    if (!w.disk || w.projectPath === null || !w.project || !api) return;
    const remote =
      remoteId === "new"
        ? await api.createLibrary(w.project.name)
        : { id: remoteId };
    const b = { server: api.base, remoteId: remote.id, auto: true };
    await setBinding(w.disk, w.projectPath, b);
    setBound(b);
    setRemoteId(remote.id);
    setRemotes(await api.libraries());
    setSyncState(await stateFor(w.disk, w.projectPath, b));
    toast.success("项目已连接，首次同步会保留同名冲突文件");
  }
  async function inspect(conflict: Conflict) {
    if (!w.disk) return;
    let binary = !conflict.path.toLowerCase().endsWith(".md"),
      local = "",
      remote = "";
    try {
      local =
        conflict.localHash === null
          ? "（本地已删除）"
          : decode(await w.disk.read(conflict.backup + "/local.bin"));
      remote =
        conflict.remoteHash === null
          ? "（远端已删除）"
          : decode(await w.disk.read(conflict.backup + "/remote.bin"));
    } catch {
      binary = true;
    }
    setVersions({ local, remote, binary });
    setMerge(conflict.localHash === null ? "" : local);
    setRemoteConflict(conflict);
  }
  async function resolveRemote(choice: "local" | "remote" | "merge") {
    if (
      !w.disk ||
      w.projectPath === null ||
      !api ||
      !binding ||
      !remoteConflict
    )
      return;
    setSyncState(
      await resolveConflict(
        w.disk,
        w.projectPath,
        api,
        binding,
        remoteConflict,
        choice,
        merge,
      ),
    );
    setRemoteConflict(null);
    await w.refresh();
    await w.checkExternal();
    toast.success("冲突已解决，原始版本保留");
  }
  function insertBlock(kind: string) {
    if (!editor) return;
    const { from } = editor.state.selection;
    let chain = editor.chain().focus();
    if (from > 0 && editor.state.doc.textBetween(from - 1, from) === "/")
      chain = chain.deleteRange({ from: from - 1, to: from });
    if (kind === "heading") chain.toggleHeading({ level: 2 }).run();
    else if (kind === "list") chain.toggleBulletList().run();
    else if (kind === "task") chain.toggleTaskList().run();
    else if (kind === "quote") chain.toggleBlockquote().run();
    else if (kind === "code") chain.toggleCodeBlock().run();
    else if (kind === "table")
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else chain.setParagraph().run();
    setSlash(false);
  }
  const tree = (
    <div className="@container flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-4 pb-2 @max-[240px]:gap-1.5 @max-[240px]:px-2">
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <MarqueeText className="flex-1 text-sm font-medium">
          {w.project?.name}
        </MarqueeText>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="返回项目列表"
          onClick={() => void act(() => w.back())}
        >
          <ArrowLeft />
        </Button>
      </div>
      <div className="px-3 pb-2 @max-[240px]:px-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 font-normal text-muted-foreground"
          onClick={() => setCommand(true)}
        >
          <Search className="size-3.5" />
          查找文档
          <span className="ml-auto hidden text-xs tracking-widest @min-[280px]:block">
            ⌘K
          </span>
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 pb-1 @max-[240px]:px-3">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          文档
        </span>
      </div>
      {/* Right-clicking empty space creates a document in the project root. */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-2">
          {w.project?.notes
            .filter((n) => !n.folder)
            .map((n, index) => (
              <ContextMenu key={n.path}>
                <ContextMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ animationDelay: `${Math.min(index, 14) * 24}ms` }}
                    className={cn(
                      "sidebar-item h-8 w-full justify-start gap-2 px-2 text-left font-normal @max-[240px]:gap-1.5 @max-[240px]:px-1 @max-[240px]:has-[>svg]:px-1",
                      w.notePath === n.path
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/80",
                    )}
                    onClick={() =>
                      void act(async () => {
                        await w.openNote(n.path);
                        setMobileNav(false);
                      })
                    }
                  >
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <MarqueeText className="flex-1">{n.title}</MarqueeText>
                    <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 @min-[300px]:block">
                      {relativeTime(n.modified)}
                    </span>
                  </Button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  <ContextMenuItem onSelect={() => newNoteIn("")}>
                    <Plus />
                    新建文档
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => renameNoteAt(n.path, n.title)}>
                    <FileText />
                    重命名
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void withNote(n.path, () => setRead((v) => !v));
                    }}
                  >
                    <BookOpen />
                    阅读模式
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void withNote(n.path, () => openModal("source"));
                    }}
                  >
                    <Code2 />
                    Markdown 源码
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void withNote(n.path, () =>
                        download(n.title + ".md", w.text),
                      );
                    }}
                  >
                    <Download />
                    导出 Markdown
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => deleteNoteAt(n.path)}
                  >
                    <Trash2 />
                    移入回收站
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          {Array.from(
            new Set(w.project?.notes.map((n) => n.folder).filter(Boolean)),
          ).map((folder, folderIndex) => {
            const isClosed = closed.includes(folder);
            const count = w.project?.notes.filter(
              (n) => n.folder === folder,
            ).length;
            return (
              <div key={folder}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{
                        animationDelay: `${Math.min(folderIndex, 14) * 24}ms`,
                      }}
                      className="sidebar-item h-8 w-full justify-start gap-1.5 px-2 text-left font-normal text-muted-foreground @max-[240px]:px-1 @max-[240px]:has-[>svg]:px-1"
                      onClick={() =>
                        setClosed((v) =>
                          v.includes(folder)
                            ? v.filter((x) => x !== folder)
                            : [...v, folder],
                        )
                      }
                    >
                      <ChevronRight
                        className={cn(
                          "size-3.5 shrink-0 transition-transform duration-200",
                          !isClosed && "rotate-90",
                        )}
                      />
                      <Folder className="size-3.5 shrink-0" />
                      <MarqueeText className="flex-1">{folder}</MarqueeText>
                      <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 @min-[300px]:block">
                        {count}
                      </span>
                    </Button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onSelect={() => newNoteIn(folder)}>
                      <Plus />
                      在此文件夹新建文档
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    isClosed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pl-5 @max-[240px]:pl-3.5">
                      {w.project?.notes
                        .filter((n) => n.folder === folder)
                        .map((n) => (
                          <ContextMenu key={n.path}>
                            <ContextMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={cn(
                                  "sidebar-item h-8 w-full justify-start gap-2 px-2 text-left font-normal @max-[240px]:gap-1.5 @max-[240px]:px-1 @max-[240px]:has-[>svg]:px-1",
                                  w.notePath === n.path
                                    ? "bg-accent text-accent-foreground"
                                    : "text-foreground/80",
                                )}
                                onClick={() =>
                                  void act(async () => {
                                    await w.openNote(n.path);
                                    setMobileNav(false);
                                  })
                                }
                              >
                                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                                <MarqueeText className="flex-1">{n.title}</MarqueeText>
                                <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 @min-[300px]:block">
                                  {relativeTime(n.modified)}
                                </span>
                              </Button>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-44">
                              <ContextMenuItem onSelect={() => newNoteIn(folder)}>
                                <Plus />
                                在此文件夹新建文档
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => renameNoteAt(n.path, n.title)}
                              >
                                <FileText />
                                重命名
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void withNote(n.path, () => setRead((v) => !v));
                                }}
                              >
                                <BookOpen />
                                阅读模式
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void withNote(n.path, () => openModal("source"));
                                }}
                              >
                                <Code2 />
                                Markdown 源码
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void withNote(n.path, () =>
                                    download(n.title + ".md", w.text),
                                  );
                                }}
                              >
                                <Download />
                                导出 Markdown
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                variant="destructive"
                                onSelect={() => deleteNoteAt(n.path)}
                              >
                                <Trash2 />
                                移入回收站
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!w.project?.notes.length && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              还没有文档
            </p>
          )}
            </div>
          </ScrollArea>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => newNoteIn("")}>
            <Plus />
            新建文档
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuLabel>{w.disk?.root.name ?? "KBase"}</ContextMenuLabel>
          {w.project && (
            <ContextMenuItem onSelect={() => setPanel("sync")}>
              <Cloud />
              项目同步
            </ContextMenuItem>
          )}
          {w.project && !w.project.virtual && (
            <>
              <ContextMenuItem
                disabled={!w.disk?.root.native}
                onSelect={() => openModal("rename-project")}
              >
                <Folder />
                重命名项目
              </ContextMenuItem>
              <ContextMenuItem
                disabled={!w.disk?.root.native}
                onSelect={() => openModal("delete-project")}
              >
                <Trash2 />
                将项目移入回收站
              </ContextMenuItem>
            </>
          )}
          <ContextMenuItem
            disabled={!w.disk}
            onSelect={() => void act(() => w.refresh())}
          >
            <RefreshCw />
            刷新文件
          </ContextMenuItem>
          <ContextMenuItem disabled={!w.disk} onSelect={() => setPanel("trash")}>
            <Trash2 />
            回收站
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setPanel("logs")}>
            <Terminal />
            诊断日志
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setPanel("settings")}>
            <Settings2 />
            偏好设置
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void act(() => w.close())}>
            <FolderOpen />
            切换知识库
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
  const outline = outlineOf(editor);
  // The frontmatter is kept out of the editor and shown in the side panel.
  const { front, body } = splitFrontmatter(w.text);
  const meta = parseFrontmatter(front);
  const aside = (
    <div className="@container flex h-full min-h-0 flex-col border-l bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-3 pt-4 pb-2">
        <List className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium">文档</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="关闭右侧面板"
          onClick={toggleAside}
        >
          <X />
        </Button>
      </div>
      <ScrollArea className="aside-scroll min-h-0 flex-1">
        <div className="px-2 pb-4">
          <section className="pt-3">
            <p className="px-2 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground">
              文档大纲
            </p>
            {outline.map((entry, index) => (
              <button
                key={entry.pos}
                type="button"
                data-outline-index={index}
                className={cn(
                  "block w-full truncate rounded-md px-2 py-1 text-left text-sm transition-colors",
                  entry.level === 1 && "font-medium",
                  activeOutline === index
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                style={{ paddingLeft: `${8 + (entry.level - 1) * 12}px` }}
                onClick={() => {
                  if (!editor) return;
                  const { node } = editor.view.domAtPos(entry.pos + 1);
                  const target =
                    node instanceof Element ? node : node.parentElement;
                  target?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {entry.text || "（无标题）"}
              </button>
            ))}
            {!outline.length && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {editor
                  ? "当前文档没有标题"
                  : "源码模式下请使用文档内的 Markdown 标题"}
              </p>
            )}
          </section>
          {front && (
            <section className="mt-4 border-t pt-3">
              <div className="flex items-center gap-1 px-2 pb-2">
                <p className="flex-1 text-xs font-medium tracking-wide text-muted-foreground">
                  元数据
                </p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={editingMeta ? "完成编辑元数据" : "编辑元数据"}
                  onClick={() => setEditingMeta((v) => !v)}
                >
                  {editingMeta ? <Check /> : <Pencil />}
                </Button>
              </div>
              {editingMeta ? (
                <>
                  <Textarea
                    aria-label="文档元数据"
                    className="field-sizing-fixed min-h-24 w-full resize-y rounded-md bg-background/70 font-mono text-[11px] leading-relaxed"
                    value={front}
                    readOnly={read}
                    onChange={(e) =>
                      void act(() => w.updateText(e.target.value + body))
                    }
                  />
                  <p className="px-2 pt-1 text-[11px] text-muted-foreground/70">
                    YAML frontmatter · 原样保留
                  </p>
                </>
              ) : (
                <dl className="space-y-2 px-2">
                  {meta.error && (
                    <p className="text-[11px] text-destructive">{meta.error}</p>
                  )}
                  {meta.fields.map((field) => (
                    <div key={field.key}>
                      <dt className="text-[11px] text-muted-foreground">
                        {field.key}
                      </dt>
                      <dd className="mt-0.5 text-xs leading-relaxed break-words">
                        {Array.isArray(field.value) ? (
                          <span className="flex flex-wrap gap-1">
                            {field.value.map((item, index) => (
                              <Badge
                                key={`${field.key}-${index}`}
                                variant="secondary"
                                className="rounded-md px-1.5 py-0 text-[11px] font-normal"
                              >
                                {frontmatterText(item)}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span
                            className="line-clamp-4"
                            title={frontmatterText(field.value)}
                          >
                            {frontmatterText(field.value)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                  {!meta.fields.length && !meta.error && (
                    <p className="text-[11px] text-muted-foreground">
                      没有可显示的元数据
                    </p>
                  )}
                </dl>
              )}
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
  const editorPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {w.project && tabs.length > 0 && (
        <div
          role="tablist"
          aria-label="打开的文档"
          className="tab-strip animate-in flex h-9 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/40 px-2 pt-1 fade-in slide-in-from-top-1 duration-200"
        >
          {tabs.map((path) => {
            const note = w.project?.notes.find((n) => n.path === path);
            const label = note?.title ?? path.split("/").at(-1) ?? path;
            const active = w.notePath === path;
            return (
              <div
                key={path}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={cn(
                  "group tab animate-in flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-t-md pr-1 pl-2.5 text-sm transition-colors fade-in slide-in-from-left-1 fill-mode-backwards duration-200",
                  active
                    ? "border-b-2 border-b-background bg-background font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => void act(() => w.openNote(path))}
                >
                  <FileText className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{label}</span>
                </button>
                {active && w.dirty && (
                  <span
                    title="有未保存的修改"
                    className="size-1.5 shrink-0 rounded-full bg-foreground"
                  />
                )}
                <button
                  type="button"
                  aria-label={`关闭 ${label}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => closeTab(path)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {w.note ? (
        <>
          <ScrollArea className="min-h-0 flex-1" data-editor-scroll="">
            <div className="mx-auto w-full max-w-2xl px-8 py-8">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">
                  {w.note.path.split("/").at(-1)}
                </span>
                <span>·</span>
                <span className="shrink-0">
                  {w.saving
                    ? "正在写入磁盘"
                    : w.dirty
                      ? "待保存"
                      : "已保存到本地"}
                </span>
              </div>
              {w.recovery && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5 text-sm">
                  <span>发现尚未写入磁盘的恢复草稿。</span>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void act(() => w.recover(true))}
                  >
                    恢复草稿
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void act(() => w.recover(false))}
                  >
                    保留磁盘版本
                  </Button>
                </div>
              )}
              {w.error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm break-all"
                >
                  {w.error}
                </p>
              )}
              <MarkdownEditor
                key={w.notePath}
                value={w.text}
                onChange={w.updateText}
                readOnly={read}
                onReady={setEditor}
                onSlash={() => setSlash(true)}
                resolveImage={(src) => imageUrl(w.disk!, w.notePath!, src)}
                onImage={(file) =>
                  saveImage(w.disk!, w.projectPath!, w.notePath!, file)
                }
              />
              <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                <span>{read ? "阅读模式" : "输入 / 插入内容"}</span>
                <span>{w.text.replace(/\s/g, "").length} 字</span>
              </div>
            </div>
          </ScrollArea>
          <footer className="flex h-9 shrink-0 items-center justify-between gap-4 border-t px-4 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              {w.saving ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : w.dirty ? (
                <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
              ) : (
                <Check className="size-3 shrink-0" />
              )}
              <span className="truncate">{w.note.path}</span>
            </span>
            <button
              type="button"
              aria-label="项目同步"
              onClick={() => setPanel("sync")}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {syncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : syncState.conflicts.length ? (
                <TriangleAlert className="size-3.5 text-destructive" />
              ) : binding ? (
                <CloudCheck className="size-3.5" />
              ) : (
                <Cloud className="size-3.5" />
              )}
              <span aria-live="polite">
                {syncing
                  ? "同步中"
                  : syncState.conflicts.length
                    ? `${syncState.conflicts.length} 个冲突`
                    : binding
                      ? syncState.lastSync
                        ? `已同步 · ${new Date(syncState.lastSync).toLocaleTimeString()}`
                        : "已连接"
                      : "未连接同步"}
              </span>
            </button>
          </footer>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <FileText className="mb-4 size-9 text-muted-foreground/60" />
          <h2 className="text-lg font-semibold tracking-tight">
            从第一篇文档开始
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            文档将直接保存到项目文件夹中。
          </p>
          <Button size="sm" className="mt-5" onClick={() => openModal("note")}>
            <Plus />
            新建文档
          </Button>
        </div>
      )}
    </div>
  );
  const modalTitle = {
    root: "新建知识库",
    project: "新建项目",
    note: "新建 Markdown 文档",
    rename: "重命名文档",
    delete: "移入回收站？",
    source: "Markdown 源码",
    "rename-project": "重命名项目",
    "delete-project": "将项目移入回收站？",
    discard: "放弃未保存的修改？",
  };
  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {w.project ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="返回项目"
                  onClick={() => void act(() => w.back())}
                >
                  <ArrowLeft />
                </Button>
                <div className="flex h-4 items-center">
                  <Separator orientation="vertical" />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="切换文件侧栏"
                  onClick={toggleSidebar}
                >
                  <PanelLeft />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="max-w-[220px] justify-start gap-1 px-2 font-medium"
                    >
                      <MarqueeText className="flex-1">{w.project.name}</MarqueeText>
                      <ChevronRight className="size-3.5 shrink-0 rotate-90 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60">
                    <DropdownMenuLabel>切换项目</DropdownMenuLabel>
                    {w.projects.map((p) => (
                      <DropdownMenuItem
                        key={p.path}
                        onSelect={() => void act(() => w.openProject(p))}
                      >
                        <Folder />
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.path === w.project?.path && <Check />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => openModal("project")}>
                      <Plus />
                      新建项目
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Library className="size-4 shrink-0" />
                <span className="text-sm font-semibold tracking-tight">
                  KBase
                </span>
                {w.disk && (
                  <>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="truncate text-sm font-normal text-muted-foreground">
                      {w.disk.root.name}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="偏好设置"
              onClick={() => setPanel("settings")}
            >
              <Settings2 />
            </Button>
            {w.note && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={asideCollapsed ? "展开右侧面板" : "收起右侧面板"}
                onClick={toggleAside}
              >
                <PanelRight />
              </Button>
            )}
          </div>
        </header>
        {!w.disk ? (
          <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
            <div className="m-auto flex w-full max-w-md flex-col px-6 py-10 text-center">
              <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl border bg-muted/50">
                <Library className="size-6 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                建立你的知识库
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                选择真实的本地文件夹，Markdown 文档可由
                Agent 和其他编辑器直接访问。
              </p>
              <div className="mt-7 flex flex-col gap-2 text-left">
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-3"
                  disabled={working || w.busy}
                  onClick={() => void act(() => w.choose())}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FolderOpen className="size-4 text-muted-foreground" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">打开已有文件夹</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      直接读取现有项目与 .md 文件
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Button>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-start gap-3 px-4 py-3"
                  disabled={working || w.busy}
                  onClick={() => openModal("root")}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FolderPlus className="size-4 text-muted-foreground" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="text-sm font-medium">新建知识库</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      选择位置，创建一个真实文件夹
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              </div>
              {w.roots.length > 0 && (
                <div className="mt-6 flex flex-col gap-1 text-left">
                  <span className="mb-1 px-1 text-xs text-muted-foreground">
                    已打开的知识库
                  </span>
                  {w.roots.map((root) => (
                    <Button
                      key={root.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 font-normal"
                      onClick={() => void act(() => w.reopen(root))}
                    >
                      <Folder className="size-3.5 text-muted-foreground" />
                      <span className="truncate">{root.name}</span>
                      <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              )}
              <div className="mt-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <HardDrive className="size-3.5" />
                <span>标准 UTF-8 Markdown · 本地优先</span>
              </div>
              {w.error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm break-all"
                >
                  {w.error}
                </p>
              )}
            </div>
          </main>
        ) : !w.project ? (
          <main className="mx-auto w-full max-w-5xl min-h-0 flex-1 overflow-y-auto px-8 py-8">
            <div className="mb-6 flex animate-in items-start justify-between gap-4 slide-in-from-bottom-2 fade-in duration-300">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  {w.disk.root.name}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  项目
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  真实文件夹，整理每一个方向。
                </p>
              </div>
              <Button
                size="sm"
                className="mt-4 shrink-0"
                disabled={working}
                onClick={() => openModal("project")}
              >
                <Plus />
                新建项目
              </Button>
            </div>
            {w.projects.length ? (
              <>
                <div className="flex items-center justify-between gap-4 border-b pb-3">
                  <span className="text-xs text-muted-foreground">
                    {w.projects.length} 个项目
                  </span>
                  <div className="relative w-52">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="查找项目"
                      placeholder="查找项目"
                      className="h-8 pl-8 text-sm"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
                  {w.projects
                    .filter((p) =>
                      p.name
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                    )
                    .map((p, index) => (
                      <Button
                        variant="outline"
                        className="group h-auto w-full animate-in flex-col items-start gap-3 rounded-lg p-4 text-left font-normal shadow-xs fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300 hover:-translate-y-0.5 hover:bg-card hover:text-foreground hover:shadow-md active:translate-y-0 active:shadow-xs dark:bg-card dark:hover:bg-card"
                        style={{
                          animationDelay: `${Math.min(index, 12) * 40}ms`,
                        }}
                        key={p.path}
                        onClick={() => void act(() => w.openProject(p))}
                      >
                        <span className="flex w-full items-center justify-between">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-accent">
                            <Folder className="size-5 text-muted-foreground" />
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </span>
                        <span className="flex min-w-0 flex-col items-start gap-0.5">
                          <span className="w-full truncate text-sm font-medium">
                            {p.name}
                          </span>
                          <span className="w-full truncate text-xs text-muted-foreground">
                            {p.virtual ? "根目录文档，文件保持原位" : p.path}
                          </span>
                          <span className="text-xs text-muted-foreground/80">
                            {p.notes.length} 篇 Markdown 文档
                          </span>
                        </span>
                      </Button>
                    ))}
                </div>
                <div className="mt-5 flex items-center gap-2 px-3 text-xs text-muted-foreground">
                  <HardDrive className="size-3.5 shrink-0" />
                  <span className="truncate">{w.disk.root.path}</span>
                </div>
              </>
            ) : (
              <div className="animate-in fade-in slide-in-from-bottom-2 py-16 text-center duration-300">
                <FolderPlus className="mx-auto mb-4 size-10 text-muted-foreground/50" />
                <h2 className="text-lg font-semibold tracking-tight">
                  还没有项目
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  创建项目文件夹，再把想法写成文档。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-5"
                  onClick={() => openModal("project")}
                >
                  <Plus />
                  创建项目
                </Button>
              </div>
            )}
          </main>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {small ? (
              editorPane
            ) : (
              <ResizablePanelGroup
                orientation="horizontal"
                className={cn(panelsAnimating && "panels-animating")}
                onLayoutChanged={(layout, meta) => {
                  // Only remember widths the user chose by dragging.
                  if (!meta.isUserInteraction) return;
                  saveSidebarWidth(layout.files ?? NaN);
                }}
              >
                <ResizablePanel
                  id="files"
                  panelRef={filesRef}
                  collapsible
                  collapsedSize={0}
                  defaultSize={`${sidebarWidth}%`}
                  minSize="200px"
                  maxSize="380px"
                  style={{ overflow: "hidden" }}
                >
                  {tree}
                </ResizablePanel>
                <ResizableHandle className="w-2 cursor-col-resize bg-transparent after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-accent-foreground/40 active:after:w-0.5 active:after:bg-accent-foreground/60" />
                <ResizablePanel id="editor" minSize="350px">
                  {editorPane}
                </ResizablePanel>
                <ResizableHandle className="w-2 cursor-col-resize bg-transparent after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-accent-foreground/40 active:after:w-0.5 active:after:bg-accent-foreground/60" />
                <ResizablePanel
                  id="aside"
                  panelRef={asideRef}
                  collapsible
                  collapsedSize={0}
                  defaultSize="240px"
                  minSize="200px"
                  maxSize="400px"
                  style={{ overflow: "hidden" }}
                >
                  {aside}
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        )}
      </div>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[280px] gap-0 p-0 sm:w-[280px]">
          <SheetHeader className="sr-only">
            <SheetTitle>项目文档</SheetTitle>
            <SheetDescription>本地 Markdown 文件列表。</SheetDescription>
          </SheetHeader>
          <div className="h-full pt-10">{tree}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={mobileAside} onOpenChange={setMobileAside}>
        <SheetContent side="right" className="w-[300px] gap-0 p-0 sm:w-[300px]">
          <SheetHeader className="sr-only">
            <SheetTitle>文档大纲</SheetTitle>
            <SheetDescription>当前文档的标题结构与文档操作。</SheetDescription>
          </SheetHeader>
          <div className="h-full pt-10">{aside}</div>
        </SheetContent>
      </Sheet>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent className="gap-0">
          <SheetHeader>
            <SheetTitle>
              {panel === "sync"
                ? "项目同步"
                : panel === "logs"
                  ? "诊断日志"
                  : panel === "trash"
                    ? "回收站"
                    : "偏好设置"}
            </SheetTitle>
            <SheetDescription>
              {panel === "sync"
                ? "按项目开启，其他项目保持本地。"
                : panel === "trash"
                  ? "删除的文件仍保留在知识库 .kbase/trash 中。"
                  : panel === "logs"
                    ? "真实操作日志，不记录正文、密码或令牌。"
                    : "黑白两种外观，本地文件优先。"}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 pb-8">
              {panel === "sync" && (
                <>
                  {!w.project ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      请先进入需要同步的项目。
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2.5 py-3">
                        <label
                          htmlFor="sync-server"
                          className="text-sm font-medium"
                        >
                          服务器地址
                        </label>
                        <Input
                          id="sync-server"
                          placeholder="https://sync.example.com/api"
                          value={server}
                          onChange={(e) => setServer(e.target.value)}
                        />
                        <label
                          htmlFor="sync-password"
                          className="mt-2 text-sm font-medium"
                        >
                          管理员密码
                        </label>
                        <Input
                          id="sync-password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 self-start"
                          disabled={working || !password}
                          onClick={() => void act(login)}
                        >
                          登录服务器
                        </Button>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          使用 HTTPS；密码与登录令牌不写入知识库。
                        </p>
                      </div>
                      {api && (
                        <div className="flex flex-col gap-2.5 py-3">
                          <label className="text-sm font-medium">远端项目</label>
                          <Select value={remoteId} onValueChange={setRemoteId}>
                            <SelectTrigger
                              className="w-full"
                              aria-label="远端项目"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">新建远端项目</SelectItem>
                              {remotes.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="self-start"
                            disabled={working}
                            onClick={() => void act(bind)}
                          >
                            连接当前项目
                          </Button>
                        </div>
                      )}
                      {binding && (
                        <>
                          <Separator className="my-2" />
                          <div className="flex items-center justify-between gap-4 py-3">
                            <div>
                              <p className="text-sm font-medium">自动同步</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                前台每 30 秒检查，保存后同步
                              </p>
                            </div>
                            <Switch
                              aria-label="自动同步"
                              checked={binding.auto}
                              onCheckedChange={(v) =>
                                void act(async () => {
                                  const b = { ...binding, auto: v };
                                  await setBinding(w.disk!, w.projectPath!, b);
                                  setBound(b);
                                })
                              }
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            上次同步：
                            {syncState.lastSync
                              ? new Date(syncState.lastSync).toLocaleString()
                              : "尚未同步"}
                          </p>
                          <Button
                            className="mt-3 w-full"
                            disabled={syncing || !api}
                            onClick={() => void syncNow()}
                          >
                            {syncing ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Cloud />
                            )}
                            {syncing ? "同步中" : "立即同步"}
                          </Button>
                          <Button
                            variant="outline"
                            className="mt-2 w-full"
                            disabled={syncing}
                            onClick={() =>
                              void act(async () => {
                                await disconnectProject(
                                  w.disk!,
                                  w.projectPath!,
                                );
                                setBound(undefined);
                                setSyncState({ files: {}, conflicts: [] });
                                toast.success(
                                  "此项目已恢复为仅本地，远端版本保留",
                                );
                              })
                            }
                          >
                            断开此项目同步
                          </Button>
                          {!api && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              请登录后恢复此项目的同步连接。
                            </p>
                          )}
                        </>
                      )}
                      {syncError && (
                        <p
                          role="alert"
                          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm break-all"
                        >
                          {syncError}
                        </p>
                      )}
                      {syncState.conflicts.length > 0 && (
                        <div className="flex flex-col gap-2 py-3">
                          <label className="text-sm font-medium">
                            需要处理的冲突
                          </label>
                          {syncState.conflicts.map((c) => (
                            <Button
                              key={c.id}
                              variant="outline"
                              className="w-full justify-between"
                              onClick={() => void act(() => inspect(c))}
                            >
                              <span className="min-w-0 truncate">{c.path}</span>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            </Button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {panel === "settings" && (
                <>
                  <div className="flex flex-col gap-2.5 py-3">
                    <label className="text-sm font-medium">外观</label>
                    <Tabs value={resolvedTheme} onValueChange={setTheme}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="light">
                          <Sun />
                          浅色
                        </TabsTrigger>
                        <TabsTrigger value="dark">
                          <Moon />
                          深色
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">项目同步</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {binding
                          ? syncState.lastSync
                            ? `上次同步 ${new Date(syncState.lastSync).toLocaleString()}`
                            : "已连接同步服务器"
                          : "当前项目仅保存在本地"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!w.project}
                      onClick={() => setPanel("sync")}
                    >
                      <Cloud />
                      {syncing ? "同步中" : "管理同步"}
                    </Button>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">真实本地存储</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        文档直接保存为 UTF-8 .md
                      </p>
                    </div>
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <Separator className="my-2" />
                  <div className="flex flex-col gap-2.5 py-3">
                    <label className="text-sm font-medium">知识库位置</label>
                    <p className="text-xs leading-relaxed break-all text-muted-foreground">
                      {w.disk?.root.path ?? "尚未选择文件夹"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() =>
                        void act(async () => {
                          await w.close();
                          setPanel(null);
                        })
                      }
                    >
                      切换知识库
                      <ArrowRight />
                    </Button>
                  </div>
                </>
              )}
              {panel === "logs" && (
                <>
                  <Input
                    aria-label="查找日志"
                    placeholder="事件或相对文件路径"
                    className="mt-2"
                    value={logQuery}
                    onChange={(e) => setLogQuery(e.target.value)}
                  />
                  <Tabs
                    value={logLevel}
                    onValueChange={setLogLevel}
                    className="mt-3"
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="all">全部</TabsTrigger>
                      <TabsTrigger value="WARN">警告</TabsTrigger>
                      <TabsTrigger value="ERROR">错误</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="mt-2">
                    {logs
                      .filter(
                        (l) =>
                          (logLevel === "all" || l.level === logLevel) &&
                          (l.event + JSON.stringify(l.fields)).includes(
                            logQuery,
                          ),
                      )
                      .map((l) => (
                        <div className="border-b py-4 last:border-0" key={l.id}>
                          <div className="flex gap-3 font-mono text-xs text-muted-foreground">
                            <span className="shrink-0">
                              {new Date(l.time).toLocaleTimeString()}
                            </span>
                            <span className="truncate">
                              {l.level} · {l.module}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm">{l.event}</p>
                          <p className="mt-1 text-xs break-all text-muted-foreground">
                            {Object.entries(l.fields)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </p>
                        </div>
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() =>
                      download("kbase-diagnostics.json", diagnosticLogs())
                    }
                  >
                    <Download />
                    导出诊断日志
                  </Button>
                </>
              )}
              {panel === "trash" && (
                <>
                  {trashItems.length ? (
                    trashItems.map((item) => (
                      <div
                        className="flex items-center gap-4 border-b py-4 last:border-0"
                        key={item.id}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm break-all">{item.path}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(item.deletedAt).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            void act(async () => {
                              await restore(w.disk!, item);
                              await w.refresh();
                              setTrashItems((v) =>
                                v.filter((i) => i.id !== item.id),
                              );
                            })
                          }
                        >
                          恢复
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">
                      回收站为空。
                    </p>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent
          className={modal === "source" ? "sm:max-w-2xl" : undefined}
        >
          <DialogHeader>
            <DialogTitle>{modal ? modalTitle[modal] : ""}</DialogTitle>
            <DialogDescription>
              {modal === "root"
                ? "填写名称后，系统会让你选择父文件夹。"
                : modal === "project"
                  ? "将在知识库中创建一个真实的项目文件夹。"
                  : modal === "note"
                    ? "文档直接写入本地项目，文件扩展名为 .md。"
                    : modal === "rename"
                      ? "这会重命名磁盘上的文件，已有链接可能需要同步更新。"
                      : modal === "discard"
                        ? "磁盘文件不会被覆盖。可以先导出当前草稿，再放弃未保存内容并返回项目列表。"
                        : modal === "delete-project"
                          ? "整个项目文件夹将移入 .kbase/trash，包含子目录与附件，可完整恢复。"
                          : modal === "rename-project"
                            ? "重命名真实项目文件夹，外部引用链接可能需要更新。"
                            : modal === "delete"
                              ? "原文移入 .kbase/trash，可以从回收站恢复。"
                              : "直接编辑标准 Markdown 原文，保存后写回磁盘。"}
            </DialogDescription>
          </DialogHeader>
          {modal === "discard" ? (
            <DialogFooter className="flex-wrap">
              <Button
                variant="outline"
                onClick={() =>
                  download((w.note?.title ?? "恢复草稿") + ".md", w.text)
                }
              >
                导出草稿
              </Button>
              <Button variant="outline" onClick={() => setModal(null)}>
                取消
              </Button>
              <Button
                onClick={() =>
                  void act(async () => {
                    await w.discardAndBack();
                    setModal(null);
                  })
                }
              >
                不保存并返回项目
              </Button>
            </DialogFooter>
          ) : modal === "source" ? (
            <>
              <Textarea
                className="max-h-[50vh] min-h-[280px] resize-y font-mono text-[13px] leading-relaxed"
                aria-label="Markdown 源码"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setModal(null)}>
                  取消
                </Button>
                <Button
                  disabled={working}
                  onClick={() =>
                    void act(async () => {
                      w.updateText(source);
                      await w.saveNow();
                      setModal(null);
                    })
                  }
                >
                  保存到本地文件
                </Button>
              </DialogFooter>
            </>
          ) : modal === "delete" || modal === "delete-project" ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setModal(null)}>
                取消
              </Button>
              <Button
                disabled={working}
                onClick={() =>
                  void act(async () => {
                    if (modal === "delete-project") await w.removeProject();
                    else await w.remove();
                    setModal(null);
                  })
                }
              >
                移入回收站
              </Button>
            </DialogFooter>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  if (modal === "root") await w.choose(name);
                  else if (modal === "project") await w.addProject(name);
                  else if (modal === "note") await w.addNote(name, folder);
                  else if (modal === "rename") await w.rename(name);
                  else if (modal === "rename-project")
                    await w.renameProject(name);
                  setModal(null);
                });
              }}
            >
              <label htmlFor="entry-name" className="text-sm font-medium">
                名称
              </label>
              <Input
                id="entry-name"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {modal === "note" && (
                <>
                  <label htmlFor="entry-folder" className="text-sm font-medium">
                    子文件夹（可选）
                  </label>
                  <Input
                    id="entry-folder"
                    placeholder="例如：设计/草稿"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                  />
                </>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={working || w.busy}>
                  {working ? <Loader2 className="animate-spin" /> : null}
                  {modal === "root" ? "选择位置并创建" : "确认"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!w.external} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>文件被外部程序修改</DialogTitle>
            <DialogDescription>
              Agent
              或其他编辑器修改了磁盘文件。选择处理方式前，不会覆盖任何一方。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="overflow-hidden rounded-md border">
              <header className="bg-muted px-3 py-2 text-sm font-medium">
                当前编辑内容
              </header>
              <Textarea
                aria-label="当前编辑内容"
                className="min-h-[150px] resize-y rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                readOnly
                value={w.external?.local ?? ""}
              />
            </div>
            <div className="overflow-hidden rounded-md border">
              <header className="bg-muted px-3 py-2 text-sm font-medium">
                磁盘上的内容
              </header>
              <Textarea
                aria-label="磁盘上的内容"
                className="min-h-[150px] resize-y rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                readOnly
                value={w.external?.remote?.text ?? "（文件已被外部删除）"}
              />
            </div>
          </div>
          <label className="text-sm font-medium" htmlFor="external-merge">
            手动合并结果
          </label>
          <Textarea
            id="external-merge"
            className="max-h-[50vh] min-h-[150px] resize-y font-mono text-[13px] leading-relaxed"
            value={externalMerge}
            onChange={(e) => setExternalMerge(e.target.value)}
          />
          <DialogFooter className="flex-wrap">
            <Button
              variant="ghost"
              onClick={() => download("恢复草稿.md", w.text)}
            >
              导出草稿
            </Button>
            <Button
              variant="ghost"
              onClick={() => void act(() => w.discardAndBack())}
            >
              不保存并返回
            </Button>
            <Button
              variant="outline"
              onClick={() => void act(() => w.resolveExternal("remote"))}
            >
              采用磁盘版本
            </Button>
            <Button
              variant="outline"
              onClick={() => void act(() => w.resolveExternal("local"))}
            >
              保留当前编辑
            </Button>
            <Button
              onClick={() =>
                void act(() => w.resolveExternal("merge", externalMerge))
              }
            >
              保存合并结果
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!remoteConflict}
        onOpenChange={(open) => {
          if (!open) setRemoteConflict(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>同步版本冲突</DialogTitle>
            <DialogDescription>
              {remoteConflict?.path} · 双方文件已备份到 .kbase/conflicts
            </DialogDescription>
          </DialogHeader>
          {versions.binary ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              这是二进制附件，请选择保留哪一方；原版本备份不会删除。
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="overflow-hidden rounded-md border">
                  <header className="bg-muted px-3 py-2 text-sm font-medium">
                    本地版本
                  </header>
                  <Textarea
                    className="min-h-[150px] resize-y rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                    readOnly
                    value={versions.local}
                  />
                </div>
                <div className="overflow-hidden rounded-md border">
                  <header className="bg-muted px-3 py-2 text-sm font-medium">
                    远端版本
                  </header>
                  <Textarea
                    className="min-h-[150px] resize-y rounded-none border-0 font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
                    readOnly
                    value={versions.remote}
                  />
                </div>
              </div>
              <Textarea
                aria-label="合并后的 Markdown"
                className="max-h-[50vh] min-h-[150px] resize-y font-mono text-[13px] leading-relaxed"
                value={merge}
                onChange={(e) => setMerge(e.target.value)}
              />
            </>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void act(() => resolveRemote("local"))}
            >
              保留本地
            </Button>
            <Button
              variant="outline"
              disabled={working}
              onClick={() => void act(() => resolveRemote("remote"))}
            >
              采用远端
            </Button>
            {!versions.binary && (
              <Button
                disabled={working}
                onClick={() => void act(() => resolveRemote("merge"))}
              >
                保存合并结果
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CommandDialog
        open={command}
        onOpenChange={setCommand}
        title="查找文档"
        description="按名称打开本地项目文档。"
      >
        <CommandInput placeholder="输入文档名称…" />
        <CommandList>
          <CommandEmpty>没有找到相关文档。</CommandEmpty>
          <CommandGroup heading={w.project?.name ?? "请先进入项目"}>
            {w.project?.notes.map((note) => (
              <CommandItem
                key={note.path}
                value={note.path}
                onSelect={() =>
                  void act(async () => {
                    await w.openNote(note.path);
                    setCommand(false);
                    setMobileNav(false);
                  })
                }
              >
                <FileText />
                {note.title}
                <span className="ml-auto text-xs text-muted-foreground">
                  {note.folder}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <CommandDialog
        open={slash}
        onOpenChange={setSlash}
        title="插入内容"
        description="插入原生 Markdown 内容块。"
      >
        <CommandInput placeholder="插入内容…" />
        <CommandList>
          <CommandEmpty>没有找到这种内容。</CommandEmpty>
          <CommandGroup heading="基础内容">
            {[
              ["paragraph", "段落"],
              ["heading", "二级标题"],
              ["list", "列表"],
              ["task", "待办事项"],
              ["quote", "引用"],
              ["code", "代码块"],
              ["table", "表格"],
            ].map(([kind, label]) => (
              <CommandItem
                key={kind}
                value={label}
                onSelect={() => insertBlock(kind)}
              >
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Toaster theme={resolvedTheme} position="bottom-center" closeButton />
    </>
  );
}
