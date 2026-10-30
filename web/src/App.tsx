import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
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
  Plus,
  Search,
  Settings2,
  Sun,
  Terminal,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { useAppearance } from "./lib/use-appearance";
import { useWorkspace } from "./core/use-workspace";
import MarkdownEditor from "./MarkdownEditor";
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
type Panel = "sync" | "logs" | "settings" | "outline" | "trash" | null;
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
    [sidebar, setSidebar] = useState(true),
    [small, setSmall] = useState(innerWidth <= 760),
    [closed, setClosed] = useState<string[]>([]);
  const [query, setQuery] = useState(""),
    [command, setCommand] = useState(false),
    [slash, setSlash] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [working, setWorking] = useState(false),
    [title, setTitle] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]),
    [logQuery, setLogQuery] = useState(""),
    [logLevel, setLogLevel] = useState("all"),
    [trashItems, setTrashItems] = useState<TrashItem[]>([]);
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
    setTitle(w.note?.title ?? "");
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
  async function copyRootPath() {
    const value = w.disk?.root.path;
    if (!value) return;
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(value);
    else {
      const input = window.document.createElement("textarea");
      input.value = value;
      input.readOnly = true;
      input.style.cssText = "position:fixed;left:-9999px;top:0";
      window.document.body.append(input);
      input.select();
      const copied = window.document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("剪贴板不可用，请从项目列表复制知识库路径");
    }
    toast.success("路径已复制");
  }
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
  const theme = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="切换外观"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="更多操作">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{w.disk?.root.name ?? "KBase"}</DropdownMenuLabel>
        {w.project && (
          <DropdownMenuItem onSelect={() => setPanel("sync")}>
            <Cloud />
            项目同步
          </DropdownMenuItem>
        )}
        {w.project && !w.project.virtual && (
          <>
            <DropdownMenuItem
              disabled={!w.disk?.root.native}
              onSelect={() => openModal("rename-project")}
            >
              <Folder />
              重命名项目
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!w.disk?.root.native}
              onSelect={() => openModal("delete-project")}
            >
              <Trash2 />
              将项目移入回收站
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          disabled={!w.disk}
          onSelect={() => void act(() => w.refresh())}
        >
          <RefreshCw />
          刷新文件
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!w.disk} onSelect={() => setPanel("trash")}>
          <Trash2 />
          回收站
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPanel("logs")}>
          <Terminal />
          诊断日志
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPanel("settings")}>
          <Settings2 />
          偏好设置
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void act(() => w.close())}>
          <FolderOpen />
          切换知识库
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const tree = (
    <div className="file-sidebar">
      <div className="sidebar-top">
        <Folder className="project-folder" />
        <span>{w.project?.name}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="返回项目列表"
          onClick={() => void act(() => w.back())}
        >
          <ArrowLeft />
        </Button>
      </div>
      <Button
        variant="ghost"
        className="file-search"
        onClick={() => setCommand(true)}
      >
        <Search />
        查找文档<span>⌘ K</span>
      </Button>
      <div className="files-heading">
        <span>文档</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="新建文档"
          onClick={() => openModal("note")}
        >
          <Plus />
        </Button>
      </div>
      <ScrollArea className="file-scroll">
        <div className="file-list">
          {w.project?.notes
            .filter((n) => !n.folder)
            .map((n) => (
              <Button
                key={n.path}
                variant="ghost"
                className={
                  "file-row " + (w.notePath === n.path ? "selected" : "")
                }
                onClick={() =>
                  void act(async () => {
                    await w.openNote(n.path);
                    setMobileNav(false);
                  })
                }
              >
                <FileText />
                <span>{n.title}</span>
              </Button>
            ))}
          {Array.from(
            new Set(w.project?.notes.map((n) => n.folder).filter(Boolean)),
          ).map((folder) => (
            <div key={folder}>
              <Button
                variant="ghost"
                className="folder-label w-full justify-start"
                onClick={() =>
                  setClosed((v) =>
                    v.includes(folder)
                      ? v.filter((x) => x !== folder)
                      : [...v, folder],
                  )
                }
              >
                {closed.includes(folder) ? <ChevronRight /> : <ChevronDown />}
                <Folder />
                {folder}
              </Button>
              {!closed.includes(folder) && (
                <div className="nested-files">
                  {w.project?.notes
                    .filter((n) => n.folder === folder)
                    .map((n) => (
                      <Button
                        key={n.path}
                        variant="ghost"
                        className={
                          "file-row " +
                          (w.notePath === n.path ? "selected" : "")
                        }
                        onClick={() =>
                          void act(async () => {
                            await w.openNote(n.path);
                            setMobileNav(false);
                          })
                        }
                      >
                        <FileText />
                        <span>{n.title}</span>
                      </Button>
                    ))}
                </div>
              )}
            </div>
          ))}
          {!w.project?.notes.length && <p className="no-files">还没有文档</p>}
        </div>
      </ScrollArea>
      <div className="sidebar-bottom">
        <HardDrive />
        <span>真实本地文件</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="复制知识库路径"
          onClick={() => void act(copyRootPath)}
        >
          <MoreHorizontal />
        </Button>
      </div>
    </div>
  );
  const editorPane = (
    <div className="editor-area">
      {w.note ? (
        <>
          <ScrollArea className="document-scroll">
            <div className="document-page">
              <div className="document-meta">
                <FileText />
                <span>{w.note.path.split("/").at(-1)}</span>
                <span>·</span>
                <span>
                  {w.saving
                    ? "正在写入磁盘"
                    : w.dirty
                      ? "待保存"
                      : "已保存到本地"}
                </span>
              </div>
              <Input
                className="document-title"
                aria-label="文档名称"
                value={title}
                readOnly={read}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title !== w.note?.title) void act(() => w.rename(title));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
              {w.recovery && (
                <div className="recovery-banner">
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
                <p className="file-error" role="alert">
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
              <div className="writing-hint">
                <span>{read ? "阅读模式" : "输入 / 插入内容"}</span>
                <span>{w.text.replace(/\s/g, "").length} 字</span>
              </div>
            </div>
          </ScrollArea>
          <footer className="document-footer">
            <span>
              {w.saving ? <Loader2 className="animate-spin" /> : <Check />}
              {w.dirty ? "修改尚未落盘" : "本地文件已保存"}
            </span>
            <span>{w.note.path}</span>
          </footer>
        </>
      ) : (
        <div className="editor-empty">
          <FileText />
          <h2>从第一篇文档开始。</h2>
          <p>文档将直接保存到项目文件夹中。</p>
          <Button size="sm" onClick={() => openModal("note")}>
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
      <div className="preview-canvas production-canvas">
        <div className={"app-window " + (w.project ? "workbench" : "")}>
          <header className="window-header">
            <div className="header-leading">
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
                  <Separator
                    orientation="vertical"
                    className="header-separator"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="切换文件侧栏"
                    onClick={() =>
                      small ? setMobileNav(true) : setSidebar((v) => !v)
                    }
                  >
                    <PanelLeft />
                  </Button>
                  <span className="header-project">{w.project.name}</span>
                </>
              ) : (
                <>
                  <Library className="brand-icon" />
                  <span className="brand-word">KBase</span>
                  {w.disk && (
                    <>
                      <span className="breadcrumb-slash">/</span>
                      <span className="root-switch">{w.disk.root.name}</span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="header-actions">
              {w.project && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="项目同步"
                  onClick={() => setPanel("sync")}
                >
                  {syncing ? <Loader2 className="animate-spin" /> : <Cloud />}
                </Button>
              )}
              {w.note && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="文档操作"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setRead((v) => !v)}>
                      <BookOpen />
                      {read ? "返回编辑" : "阅读模式"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openModal("source")}>
                      <Code2 />
                      Markdown 源码
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setPanel("outline")}>
                      <List />
                      文档大纲
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openModal("rename")}>
                      <FileText />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => download(w.note!.title + ".md", w.text)}
                    >
                      <Download />
                      导出 Markdown
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {w.dirty && (
                      <DropdownMenuItem onSelect={() => openModal("discard")}>
                        放弃未保存的修改
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => openModal("delete")}>
                      <Trash2 />
                      移入回收站
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {theme}
              {menu}
            </div>
          </header>
          {!w.disk ? (
            <main className="setup-page">
              <div className="setup-content">
                <span className="setup-symbol">
                  <Library />
                </span>
                <p className="eyebrow">一个文件夹，一整个知识世界。</p>
                <h1>建立你的知识库。</h1>
                <p className="setup-description">
                  选择真实的本地文件夹。
                  <br />
                  Markdown 文档可由 Agent 和其他编辑器直接访问。
                </p>
                <div className="setup-choices">
                  <Button
                    variant="outline"
                    className="setup-choice"
                    disabled={working || w.busy}
                    onClick={() => void act(() => w.choose())}
                  >
                    <span className="choice-icon">
                      <FolderOpen />
                    </span>
                    <span>
                      <strong>打开已有文件夹</strong>
                      <small>直接读取现有项目与 .md 文件</small>
                    </span>
                    <ChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    className="setup-choice"
                    disabled={working || w.busy}
                    onClick={() => openModal("root")}
                  >
                    <span className="choice-icon">
                      <FolderPlus />
                    </span>
                    <span>
                      <strong>新建知识库</strong>
                      <small>选择位置，创建一个真实文件夹</small>
                    </span>
                    <ChevronRight />
                  </Button>
                </div>
                {w.roots.length > 0 && (
                  <div className="recent-roots">
                    <span>已打开的知识库</span>
                    {w.roots.map((root) => (
                      <Button
                        key={root.id}
                        variant="ghost"
                        onClick={() => void act(() => w.reopen(root))}
                      >
                        <Folder />
                        <span>{root.name}</span>
                        <ChevronRight />
                      </Button>
                    ))}
                  </div>
                )}
                <div className="setup-footnote">
                  <HardDrive />
                  <span>标准 UTF-8 Markdown · 本地优先</span>
                </div>
                {w.error && (
                  <p className="file-error" role="alert">
                    {w.error}
                  </p>
                )}
              </div>
            </main>
          ) : !w.project ? (
            <main className="projects-page">
              <div className="projects-heading">
                <div>
                  <p className="eyebrow">{w.disk.root.name}</p>
                  <h1>项目</h1>
                  <p>真实文件夹，整理每一个方向。</p>
                </div>
                <Button
                  size="sm"
                  disabled={working}
                  onClick={() => openModal("project")}
                >
                  <Plus />
                  新建项目
                </Button>
              </div>
              {w.projects.length ? (
                <>
                  <div className="projects-tools">
                    <span>{w.projects.length} 个项目</span>
                    <div className="search-input">
                      <Search />
                      <Input
                        aria-label="查找项目"
                        placeholder="查找项目"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="project-list">
                    {w.projects
                      .filter((p) =>
                        p.name
                          .toLocaleLowerCase()
                          .includes(query.toLocaleLowerCase()),
                      )
                      .map((p, i) => (
                        <Button
                          variant="ghost"
                          className="project-row"
                          key={p.path}
                          onClick={() => void act(() => w.openProject(p))}
                        >
                          <span className={"project-icon tone-" + (i % 3)}>
                            <Folder />
                          </span>
                          <span className="project-copy">
                            <strong>{p.name}</strong>
                            <span>
                              {p.virtual ? "根目录文档，文件保持原位" : p.path}
                            </span>
                            <small>{p.notes.length} 篇 Markdown 文档</small>
                          </span>
                          <ChevronRight className="project-chevron" />
                        </Button>
                      ))}
                  </div>
                  <div className="library-location">
                    <HardDrive />
                    <span>{w.disk.root.path}</span>
                    <span className="location-tag">本地知识库</span>
                  </div>
                </>
              ) : (
                <div className="projects-empty">
                  <FolderPlus />
                  <h2>你的第一个项目。</h2>
                  <p>创建项目文件夹，再把想法写成文档。</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openModal("project")}
                  >
                    <Plus />
                    创建项目
                  </Button>
                </div>
              )}
            </main>
          ) : (
            <div className="workspace">
              {small ? (
                editorPane
              ) : (
                <ResizablePanelGroup
                  orientation="horizontal"
                  key={sidebar ? "with" : "without"}
                >
                  {sidebar && (
                    <>
                      <ResizablePanel
                        id="files"
                        defaultSize="204px"
                        minSize="180px"
                        maxSize="300px"
                      >
                        {tree}
                      </ResizablePanel>
                      <ResizableHandle className="workspace-handle" />
                    </>
                  )}
                  <ResizablePanel id="editor" minSize="350px">
                    {editorPane}
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          )}
        </div>
      </div>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="file-sheet">
          <SheetHeader className="sr-only">
            <SheetTitle>项目文档</SheetTitle>
            <SheetDescription>本地 Markdown 文件列表。</SheetDescription>
          </SheetHeader>
          {tree}
        </SheetContent>
      </Sheet>
      <Sheet
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent className="inspector">
          <SheetHeader>
            <SheetTitle>
              {panel === "sync"
                ? "项目同步"
                : panel === "logs"
                  ? "诊断日志"
                  : panel === "trash"
                    ? "回收站"
                    : panel === "outline"
                      ? "文档大纲"
                      : "偏好设置"}
            </SheetTitle>
            <SheetDescription>
              {panel === "sync"
                ? "按项目开启，其他项目保持本地。"
                : panel === "trash"
                  ? "删除的文件仍保留在知识库 .kbase/trash 中。"
                  : panel === "logs"
                    ? "真实操作日志，不记录正文、密码或令牌。"
                    : panel === "outline"
                      ? "当前文档的标题结构。"
                      : "黑白两种外观，本地文件优先。"}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="inspector-scroll">
            <div className="inspector-content">
              {panel === "sync" && (
                <>
                  {!w.project ? (
                    <p className="dialog-note">请先进入需要同步的项目。</p>
                  ) : (
                    <>
                      <div className="setting-block">
                        <label htmlFor="sync-server">服务器地址</label>
                        <Input
                          id="sync-server"
                          placeholder="https://sync.example.com/api"
                          value={server}
                          onChange={(e) => setServer(e.target.value)}
                        />
                        <label htmlFor="sync-password" className="mt-4">
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
                          disabled={working || !password}
                          onClick={() => void act(login)}
                        >
                          登录服务器
                        </Button>
                        <p>使用 HTTPS；密码与登录令牌不写入知识库。</p>
                      </div>
                      {api && (
                        <div className="setting-block">
                          <label>远端项目</label>
                          <Select value={remoteId} onValueChange={setRemoteId}>
                            <SelectTrigger aria-label="远端项目">
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
                            disabled={working}
                            onClick={() => void act(bind)}
                          >
                            连接当前项目
                          </Button>
                        </div>
                      )}
                      {binding && (
                        <>
                          <Separator />
                          <div className="setting-inline">
                            <div>
                              <strong>自动同步</strong>
                              <p>前台每 30 秒检查，保存后同步</p>
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
                          <p className="dialog-note">
                            上次同步：
                            {syncState.lastSync
                              ? new Date(syncState.lastSync).toLocaleString()
                              : "尚未同步"}
                          </p>
                          <Button
                            className="w-full mt-4"
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
                            className="w-full mt-3"
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
                            <p className="dialog-note mt-3">
                              请登录后恢复此项目的同步连接。
                            </p>
                          )}
                        </>
                      )}
                      {syncError && (
                        <p className="file-error" role="alert">
                          {syncError}
                        </p>
                      )}
                      {syncState.conflicts.length > 0 && (
                        <div className="setting-block">
                          <label>需要处理的冲突</label>
                          {syncState.conflicts.map((c) => (
                            <Button
                              key={c.id}
                              variant="outline"
                              className="w-full justify-between mb-2"
                              onClick={() => void act(() => inspect(c))}
                            >
                              {c.path}
                              <ChevronRight />
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
                  <div className="setting-block">
                    <label>外观</label>
                    <Tabs value={resolvedTheme} onValueChange={setTheme}>
                      <TabsList className="appearance-tabs">
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
                  <Separator />
                  <div className="setting-inline">
                    <div>
                      <strong>真实本地存储</strong>
                      <p>文档直接保存为 UTF-8 .md</p>
                    </div>
                    <HardDrive className="subtle-icon" />
                  </div>
                  <div className="setting-block">
                    <label>知识库位置</label>
                    <p className="break-all">
                      {w.disk?.root.path ?? "尚未选择文件夹"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
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
                    value={logQuery}
                    onChange={(e) => setLogQuery(e.target.value)}
                  />
                  <Tabs
                    value={logLevel}
                    onValueChange={setLogLevel}
                    className="mt-4"
                  >
                    <TabsList className="log-tabs">
                      <TabsTrigger value="all">全部</TabsTrigger>
                      <TabsTrigger value="WARN">警告</TabsTrigger>
                      <TabsTrigger value="ERROR">错误</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="log-list">
                    {logs
                      .filter(
                        (l) =>
                          (logLevel === "all" || l.level === logLevel) &&
                          (l.event + JSON.stringify(l.fields)).includes(
                            logQuery,
                          ),
                      )
                      .map((l) => (
                        <div className="log-entry" key={l.id}>
                          <div>
                            <span>{new Date(l.time).toLocaleTimeString()}</span>
                            <span>
                              {l.level} · {l.module}
                            </span>
                          </div>
                          <strong>{l.event}</strong>
                          <p className="break-all">
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
                    className="w-full"
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
                      <div className="trash-row" key={item.id}>
                        <div>
                          <strong>{item.path}</strong>
                          <p>{new Date(item.deletedAt).toLocaleString()}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
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
                    <p className="dialog-note">回收站为空。</p>
                  )}
                </>
              )}
              {panel === "outline" && (
                <div className="outline-list">
                  {editor?.state.doc.content.content
                    .filter((node) => node.type.name === "heading")
                    .map((node, i) => (
                      <Button
                        variant="ghost"
                        key={i}
                        onClick={() => {
                          setPanel(null);
                          setTimeout(
                            () =>
                              window.document
                                .querySelectorAll(
                                  ".tiptap h1,.tiptap h2,.tiptap h3,.tiptap h4,.tiptap h5,.tiptap h6",
                                )
                                [i]?.scrollIntoView({ behavior: "smooth" }),
                            50,
                          );
                        }}
                      >
                        {node.textContent}
                      </Button>
                    ))}
                  {!editor && <p>源码模式下请使用文档内的 Markdown 标题。</p>}
                </div>
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
        <DialogContent className={modal === "source" ? "wide-dialog" : ""}>
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
            <DialogFooter>
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
                className="source-editor"
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
              className="dialog-form"
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
              <label htmlFor="entry-name">名称</label>
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
                  <label htmlFor="entry-folder">子文件夹（可选）</label>
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
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>文件被外部程序修改</DialogTitle>
            <DialogDescription>
              Agent
              或其他编辑器修改了磁盘文件。选择处理方式前，不会覆盖任何一方。
            </DialogDescription>
          </DialogHeader>
          <div className="conflict-versions">
            <div>
              <header>当前编辑内容</header>
              <Textarea
                aria-label="当前编辑内容"
                readOnly
                value={w.external?.local ?? ""}
              />
            </div>
            <div>
              <header>磁盘上的内容</header>
              <Textarea
                aria-label="磁盘上的内容"
                readOnly
                value={w.external?.remote?.text ?? "（文件已被外部删除）"}
              />
            </div>
          </div>
          <label className="text-xs" htmlFor="external-merge">
            手动合并结果
          </label>
          <Textarea
            id="external-merge"
            className="source-editor"
            value={externalMerge}
            onChange={(e) => setExternalMerge(e.target.value)}
          />
          <DialogFooter>
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
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>同步版本冲突</DialogTitle>
            <DialogDescription>
              {remoteConflict?.path} · 双方文件已备份到 .kbase/conflicts
            </DialogDescription>
          </DialogHeader>
          {versions.binary ? (
            <p className="dialog-note">
              这是二进制附件，请选择保留哪一方；原版本备份不会删除。
            </p>
          ) : (
            <>
              <div className="conflict-versions">
                <div>
                  <header>本地版本</header>
                  <Textarea readOnly value={versions.local} />
                </div>
                <div>
                  <header>远端版本</header>
                  <Textarea readOnly value={versions.remote} />
                </div>
              </div>
              <Textarea
                aria-label="合并后的 Markdown"
                className="source-editor"
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
