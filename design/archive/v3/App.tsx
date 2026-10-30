import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAppearance } from "@/lib/use-appearance";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Code2,
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
  Smartphone,
  Sun,
  Terminal,
  Type,
  Quote,
  ListChecks,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

type Note = { id: string; title: string; html: string; folder: string };
type Project = {
  id: string;
  libraryId: string;
  name: string;
  description: string;
  notes: Note[];
  updated: string;
};
type Root = { id: string; name: string; path: string };
type Data = { roots: Root[]; projects: Project[]; rootId: string | null };
type Screen = "setup" | "projects" | "editor";
type Panel = "sync" | "logs" | "settings" | "outline" | null;
type Modal =
  | "open-root"
  | "create-root"
  | "new-project"
  | "new-note"
  | "source"
  | "conflict"
  | "about"
  | null;
const EMPTY: Data = { roots: [], projects: [], rootId: null };
const DATA_KEY = "kbase-v3-data";
function panelLayout(): Record<string, number> | undefined {
  try {
    return (
      JSON.parse(localStorage.getItem("kbase-v3-layout") || "null") ?? undefined
    );
  } catch {
    return undefined;
  }
}
function savePanelLayout(layout: Record<string, number>) {
  try {
    localStorage.setItem("kbase-v3-layout", JSON.stringify(layout));
  } catch {
    /* Keep resizing usable when browser storage is restricted. */
  }
}
function load(): Data {
  try {
    return JSON.parse(localStorage.getItem(DATA_KEY) || "null") ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
function persist(data: Data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    toast.error("保存失败，请导出重要内容。");
    return false;
  }
}
const uid = () =>
  crypto.randomUUID?.() ??
  Date.now().toString(36) + Math.random().toString(36).slice(2);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function asMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (!(node instanceof HTMLElement)) return "";
      const el = node;
      const text = el.textContent || "";
      if (el.tagName === "H2") return "## " + text;
      if (el.tagName === "H3") return "### " + text;
      if (el.tagName === "BLOCKQUOTE") return "> " + text;
      if (el.tagName === "UL")
        return [...el.children].map((e) => "- " + e.textContent).join("\n");
      if (el.tagName === "PRE") return "```\n" + text + "\n```";
      return text;
    })
    .join("\n\n");
}
function asHtml(source: string) {
  return source
    .split("\n")
    .map((line) =>
      line.startsWith("### ")
        ? `<h3>${escape(line.slice(4))}</h3>`
        : line.startsWith("## ")
          ? `<h2>${escape(line.slice(3))}</h2>`
          : line.startsWith("> ")
            ? `<blockquote>${escape(line.slice(2))}</blockquote>`
            : `<p>${escape(line) || "<br>"}</p>`,
    )
    .join("");
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
const starterHtml =
  '<p class="lead">让工具安静一点，让思考自由一点。</p><p>这里是你的项目。用文档留下想法，用文件夹梳理脉络。每一次记录，都是下一次思考的起点。</p><h2>从一个想法开始</h2><p>不必急着建立完整的体系。先写下眼前最重要的事情，再让内容慢慢生长。</p><blockquote>好的知识空间，应该让你忘记工具的存在。</blockquote><h2>留一点空间</h2><p>你可以直接点击正文开始编辑。输入 / 插入标题、列表或引用，也可以在右上角切换到 Markdown 源码。</p><p><br></p>';
function sampleProjects(rootId: string): Project[] {
  return [
    {
      id: uid(),
      libraryId: rootId,
      name: "产品设计",
      description: "从观察，到一个值得做的产品。",
      updated: "刚刚",
      notes: [
        { id: uid(), title: "写在开始之前", folder: "", html: starterHtml },
        {
          id: uid(),
          title: "一些设计原则",
          folder: "",
          html: "<p>简单来自对复杂的理解。</p><h2>以内容为中心</h2><p>克制的工具、清楚的层次，以及恰到好处的留白。</p>",
        },
        {
          id: uid(),
          title: "界面与交互",
          folder: "设计笔记",
          html: "<h2>让交互自然发生</h2><p>一个清晰的入口，一条顺畅的路径。把次要操作收进菜单，把空间留给内容。</p>",
        },
      ],
    },
    {
      id: uid(),
      libraryId: rootId,
      name: "技术札记",
      description: "理解原理，也记录实践。",
      updated: "昨天",
      notes: [
        {
          id: uid(),
          title: "本地优先",
          folder: "",
          html: "<p>文件属于用户，网络不应该成为记录的前提。</p><h2>同步的边界</h2><p>先安全保存，再异步传输。遇到版本分歧时保留双方内容。</p>",
        },
      ],
    },
    {
      id: uid(),
      libraryId: rootId,
      name: "日常记录",
      description: "把那些转瞬即逝的念头留下。",
      updated: "2 天前",
      notes: [
        {
          id: uid(),
          title: "今天想到的",
          folder: "",
          html: "<p>留下一件今天值得记住的小事。</p>",
        },
      ],
    },
  ];
}

export default function App() {
  const { resolvedTheme, setTheme } = useAppearance();
  const [data, setData] = useState<Data>(load),
    dataRef = useRef(data);
  dataRef.current = data;
  const [screen, setScreen] = useState<Screen>(() =>
    load().rootId ? "projects" : "setup",
  );
  const [projectId, setProjectId] = useState<string | null>(null),
    [noteId, setNoteId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null),
    [panel, setPanel] = useState<Panel>(null),
    [mobileNav, setMobileNav] = useState(false),
    [sidebar, setSidebar] = useState(true),
    [phone, setPhone] = useState(false);
  const [small, setSmall] = useState(() => innerWidth <= 760),
    [search, setSearch] = useState(""),
    [command, setCommand] = useState(false),
    [slash, setSlash] = useState(false),
    [read, setRead] = useState(false);
  const [name, setName] = useState(""),
    [path, setPath] = useState("文稿"),
    [description, setDescription] = useState(""),
    [source, setSource] = useState(""),
    [sourcePurpose, setSourcePurpose] = useState<"edit" | "merge">("edit");
  const [saving, setSaving] = useState(false),
    [count, setCount] = useState(0),
    [syncing, setSyncing] = useState(false),
    [server, setServer] = useState(""),
    [autoSync, setAutoSync] = useState(true),
    [synced, setSynced] = useState(false);
  const [logQuery, setLogQuery] = useState(""),
    [logLevel, setLogLevel] = useState("all"),
    [logs, setLogs] = useState([
      {
        time: "10:42:18",
        level: "INFO",
        text: "知识库界面已启动",
        detail: "UI 原型事件，不包含文档正文或凭据。",
      },
      {
        time: "10:42:19",
        level: "INFO",
        text: "本地草稿存储可用",
        detail: "当前原型使用浏览器存储。",
      },
    ]);
  const content = useRef<HTMLDivElement>(null),
    activeBlock = useRef<HTMLElement | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    activeRef = useRef({ projectId, noteId, read });
  const root = data.roots.find((r) => r.id === data.rootId),
    project = data.projects.find((p) => p.id === projectId),
    note = project?.notes.find((n) => n.id === noteId);
  const mobile = small || phone;
  activeRef.current = { projectId, noteId, read };
  function commit(next: Data) {
    dataRef.current = next;
    setData(next);
    return persist(next);
  }
  function flush() {
    if (timer.current) clearTimeout(timer.current);
    const active = activeRef.current;
    if (!content.current || active.read || !active.projectId || !active.noteId)
      return;
    const html = content.current.innerHTML;
    const next = {
      ...dataRef.current,
      projects: dataRef.current.projects.map((p) =>
        p.id === active.projectId
          ? {
              ...p,
              updated: "刚刚",
              notes: p.notes.map((n) =>
                n.id === active.noteId ? { ...n, html } : n,
              ),
            }
          : p,
      ),
    };
    if (commit(next)) setSaving(false);
  }
  function changed() {
    setSaving(true);
    setCount(content.current?.innerText.replace(/\s/g, "").length ?? 0);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }
  useEffect(() => {
    const change = () => {
      flush();
      setSmall(innerWidth <= 760);
    };
    window.addEventListener("resize", change);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
        toast.success("已保存到当前浏览器");
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("resize", change);
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", flush);
      if (timer.current) clearTimeout(timer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !modal && !command && !slash) {
        setPanel(null);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [modal, command, slash]);
  useLayoutEffect(() => {
    if (!content.current || screen !== "editor" || !note) return;
    content.current.innerHTML = note.html;
    activeBlock.current = null;
    setCount(content.current.innerText.replace(/\s/g, "").length);
    setSaving(false);
  }, [screen, projectId, noteId, sidebar, mobile, read]);
  function go(next: Screen) {
    flush();
    setScreen(next);
    setMobileNav(false);
    setSearch("");
  }
  function openProject(p: Project) {
    flush();
    setProjectId(p.id);
    setNoteId(p.notes[0]?.id ?? null);
    setScreen("editor");
    setSearch("");
    setRead(false);
  }
  function openNote(id: string) {
    flush();
    setNoteId(id);
    setMobileNav(false);
    setCommand(false);
    setRead(false);
  }
  function openModal(next: Modal) {
    flush();
    setName("");
    setDescription("");
    if (next === "create-root") setName("我的知识库");
    if (next === "open-root") setName("知识库");
    if (next === "source") {
      setSource(asMarkdown(content.current?.innerHTML ?? note?.html ?? ""));
      setSourcePurpose("edit");
    }
    setModal(next);
  }
  function createRoot() {
    if (!name.trim() || !path.trim()) return;
    const r = {
      id: uid(),
      name: name.trim(),
      path: path.replace(/\/$/, "") + "/" + name.trim(),
    };
    commit({ ...data, roots: [...data.roots, r], rootId: r.id });
    setModal(null);
    go("projects");
    toast.success("知识库已建立（浏览器演示）");
  }
  function demo(target: "projects" | "editor") {
    flush();
    let d = dataRef.current;
    let r = d.roots.find((r) => r.id === "demo-root");
    if (!r) {
      r = { id: "demo-root", name: "我的知识库", path: "文稿 / 我的知识库" };
      d = {
        ...d,
        roots: [...d.roots, r],
        projects: [...d.projects, ...sampleProjects(r.id)],
      };
    }
    d = { ...d, rootId: r.id };
    commit(d);
    if (target === "editor")
      openProject(d.projects.find((p) => p.libraryId === r.id)!);
    else go("projects");
  }
  function createProject() {
    if (!name.trim() || !root) return;
    const p = {
      id: uid(),
      libraryId: root.id,
      name: name.trim(),
      description: description.trim(),
      notes: [],
      updated: "刚刚",
    };
    commit({ ...data, projects: [...data.projects, p] });
    setModal(null);
    toast.success("项目已创建");
  }
  function createNote() {
    if (!name.trim() || !project) return;
    const n = {
      id: uid(),
      title: name.trim().replace(/\.md$/, ""),
      folder: "",
      html: "<p><br></p>",
    };
    commit({
      ...data,
      projects: data.projects.map((p) =>
        p.id === project.id
          ? { ...p, notes: [...p.notes, n], updated: "刚刚" }
          : p,
      ),
    });
    setNoteId(n.id);
    setModal(null);
    setRead(false);
    requestAnimationFrame(() => content.current?.focus());
  }
  function updateTitle(title: string) {
    if (!project || !note) return;
    commit({
      ...dataRef.current,
      projects: dataRef.current.projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              notes: p.notes.map((n) =>
                n.id === note.id ? { ...n, title } : n,
              ),
            }
          : p,
      ),
    });
  }
  function block(type: string) {
    const el = document.createElement(type);
    el.innerHTML =
      type === "h2"
        ? "新的标题"
        : type === "ul"
          ? "<li>新的列表项</li>"
          : type === "blockquote"
            ? "值得留下的一句话"
            : type === "pre"
              ? "// 在这里输入代码"
              : "<br>";
    const prev = activeBlock.current;
    if (prev?.textContent?.endsWith("/"))
      prev.textContent = prev.textContent.slice(0, -1);
    if (prev && content.current?.contains(prev)) prev.after(el);
    else content.current?.append(el);
    setSlash(false);
    requestAnimationFrame(() => {
      const selection = window.getSelection(),
        range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      content.current?.focus();
      changed();
    });
  }
  function sync() {
    if (syncing) return;
    setSyncing(true);
    setLogs((v) => [
      {
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "INFO",
        text: "开始执行演示同步",
        detail: "不发送实际网络请求。",
      },
      ...v,
    ]);
    syncTimer.current = setTimeout(() => {
      setSyncing(false);
      setSynced(true);
      toast.success("演示同步完成");
      setLogs((v) => [
        {
          time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
          level: "INFO",
          text: "演示同步完成",
          detail: "文件与设备状态均为模拟。",
        },
        ...v,
      ]);
    }, 1300);
  }
  function saveSource() {
    if (!project || !note) return;
    if (sourcePurpose === "merge") {
      try {
        localStorage.setItem(
          "kbase-v3-conflict-backup",
          JSON.stringify({
            original: note.html,
            remote: "先理解需求，再开始设计。",
          }),
        );
      } catch {
        toast.error("无法保存版本备份，未覆盖文档");
        return;
      }
    }
    const html = asHtml(source);
    commit({
      ...dataRef.current,
      projects: dataRef.current.projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              notes: p.notes.map((n) =>
                n.id === note.id ? { ...n, html } : n,
              ),
            }
          : p,
      ),
    });
    if (content.current) content.current.innerHTML = html;
    setModal(null);
    toast.success(
      sourcePurpose === "merge" ? "合并已保存，原版本已保留" : "源码已保存",
    );
  }
  const themeButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={resolvedTheme === "dark" ? "切换浅色" : "切换深色"}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {resolvedTheme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
  const globalMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="知识库菜单">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{root?.name ?? "KBase"}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            flush();
            setPanel("sync");
          }}
        >
          <Cloud />
          同步
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
        <DropdownMenuItem onSelect={() => go("setup")}>
          <FolderOpen />
          切换知识库
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setModal("about")}>
          <BookOpen />
          关于这个设计
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const tree = (
    <div className="file-sidebar">
      <div className="sidebar-top">
        <Folder className="project-folder" />
        <span>{project?.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="项目操作">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => go("projects")}>
              <ArrowLeft />
              返回所有项目
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openModal("new-note")}>
              <Plus />
              新建文档
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setPanel("sync");
                setMobileNav(false);
              }}
            >
              <Cloud />
              项目同步
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
          onClick={() => openModal("new-note")}
        >
          <Plus />
        </Button>
      </div>
      <ScrollArea className="file-scroll">
        <div className="file-list">
          {project?.notes
            .filter((n) => !n.folder)
            .map((n) => (
              <Button
                variant="ghost"
                className={"file-row " + (n.id === noteId ? "selected" : "")}
                key={n.id}
                onClick={() => openNote(n.id)}
              >
                <FileText />
                <span>{n.title || "未命名"}</span>
              </Button>
            ))}
          {Array.from(
            new Set(project?.notes.map((n) => n.folder).filter(Boolean)),
          ).map((folder) => (
            <div key={folder}>
              <div className="folder-label">
                <ChevronDown />
                <Folder />
                <span>{folder}</span>
              </div>
              <div className="nested-files">
                {project?.notes
                  .filter((n) => n.folder === folder)
                  .map((n) => (
                    <Button
                      variant="ghost"
                      key={n.id}
                      className={
                        "file-row " + (n.id === noteId ? "selected" : "")
                      }
                      onClick={() => openNote(n.id)}
                    >
                      <FileText />
                      {n.title}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
          {!project?.notes.length && <p className="no-files">还没有文档</p>}
        </div>
      </ScrollArea>
      <div className="sidebar-bottom">
        <HardDrive />
        <span>保存在本地</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="查看保存说明"
              onClick={() => setModal("about")}
            >
              <MoreHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>浏览器演示，不写入磁盘</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
  const editor = (
    <div className="editor-area">
      {note ? (
        <>
          <ScrollArea className="document-scroll">
            <div className="document-page">
              <div className="document-meta">
                <FileText />
                <span>Markdown 文档</span>
                <span className="meta-dot">·</span>
                <span>{saving ? "正在保存" : "所有更改已保存"}</span>
              </div>
              <Input
                key={note.id + "-title"}
                className="document-title"
                aria-label="文档标题"
                defaultValue={note.title}
                readOnly={read}
                onChange={(e) => updateTitle(e.target.value)}
              />
              <div
                ref={content}
                className={"document-body " + (read ? "reading" : "")}
                contentEditable={!read}
                suppressContentEditableWarning
                role="textbox"
                aria-label="文档正文"
                aria-multiline
                spellCheck={false}
                onInput={(e) => {
                  const selection = window.getSelection();
                  const node = selection?.anchorNode;
                  activeBlock.current =
                    node instanceof HTMLElement
                      ? node
                      : (node?.parentElement ?? null);
                  while (
                    activeBlock.current?.parentElement &&
                    activeBlock.current.parentElement !== content.current
                  )
                    activeBlock.current = activeBlock.current.parentElement;
                  changed();
                  if ((e.nativeEvent as InputEvent).data === "/")
                    setSlash(true);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  document.execCommand(
                    "insertText",
                    false,
                    e.clipboardData.getData("text/plain"),
                  );
                }}
              />
              <div className="writing-hint">
                {read ? "阅读模式" : "输入 / 插入内容"}
                <span>{count} 字</span>
              </div>
            </div>
          </ScrollArea>
          <footer className="document-footer">
            <span>
              <Check />
              {saving ? "正在保存…" : "本地已保存"}
            </span>
            <span>只属于你的思考空间。</span>
          </footer>
        </>
      ) : (
        <div className="editor-empty">
          <FileText />
          <h2>从第一篇文档开始。</h2>
          <p>想法、笔记，或一个尚未成形的计划。</p>
          <Button size="sm" onClick={() => openModal("new-note")}>
            <Plus />
            新建文档
          </Button>
        </div>
      )}
    </div>
  );
  const titles: Record<NonNullable<Modal>, string> = {
    "open-root": "打开知识库",
    "create-root": "新建知识库",
    "new-project": "新建项目",
    "new-note": "新建文档",
    source: sourcePurpose === "merge" ? "合并版本" : "Markdown 源码",
    conflict: "每个版本，都值得保留。",
    about: "简单一点，专注一点。",
  };
  return (
    <TooltipProvider delayDuration={450}>
      <div className={"preview-canvas " + (phone ? "phone-preview" : "")}>
        <div
          className={"app-window " + (screen === "editor" ? "workbench" : "")}
        >
          <header className="window-header">
            <div className="header-leading">
              {screen === "editor" ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="返回项目"
                    onClick={() => go("projects")}
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
                    onClick={() => {
                      flush();
                      mobile ? setMobileNav(true) : setSidebar((v) => !v);
                    }}
                  >
                    <PanelLeft />
                  </Button>
                  <span className="header-project">{project?.name}</span>
                </>
              ) : (
                <>
                  <Library className="brand-icon" />
                  <span className="brand-word">KBase</span>
                  {screen === "projects" && (
                    <>
                      <span className="breadcrumb-slash">/</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="root-switch"
                          >
                            {root?.name}
                            <ChevronDown />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel>知识库</DropdownMenuLabel>
                          {data.roots.map((r) => (
                            <DropdownMenuItem
                              key={r.id}
                              onSelect={() => commit({ ...data, rootId: r.id })}
                            >
                              <Folder />
                              {r.name}
                              {r.id === root?.id && (
                                <Check className="ml-auto" />
                              )}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => go("setup")}>
                            <Plus />
                            添加知识库
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="header-actions">
              {screen === "editor" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="同步状态"
                        onClick={() => {
                          flush();
                          setPanel("sync");
                        }}
                      >
                        {syncing ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Cloud />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>同步状态</TooltipContent>
                  </Tooltip>
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
                      <DropdownMenuItem
                        disabled={!note}
                        onSelect={() => {
                          flush();
                          setRead((v) => !v);
                        }}
                      >
                        <BookOpen />
                        {read ? "返回编辑" : "阅读模式"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!note}
                        onSelect={() => openModal("source")}
                      >
                        <Code2 />
                        Markdown 源码
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!note}
                        onSelect={() => {
                          flush();
                          setPanel("outline");
                        }}
                      >
                        <List />
                        文档大纲
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!note}
                        onSelect={() => {
                          flush();
                          download(
                            (note?.title ?? "文档") + ".md",
                            "# " +
                              note?.title +
                              "\n\n" +
                              asMarkdown(content.current?.innerHTML ?? ""),
                          );
                        }}
                      >
                        <ArrowDownToLine />
                        导出 Markdown
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setPanel("settings")}>
                        <Settings2 />
                        偏好设置
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setPanel("logs")}>
                        <Terminal />
                        诊断日志
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {themeButton}
              {screen !== "editor" && globalMenu}
            </div>
          </header>
          {screen === "setup" && (
            <main className="setup-page">
              <div className="setup-content">
                <span className="setup-symbol">
                  <Library />
                </span>
                <p className="eyebrow">一个文件夹，一整个知识世界。</p>
                <h1>建立你的知识库。</h1>
                <p className="setup-description">
                  选择一个本地文件夹，安放你的文档与想法。
                  <br />
                  知识库里，用项目整理每一个值得深入的方向。
                </p>
                <div className="setup-choices">
                  <Button
                    variant="outline"
                    className="setup-choice"
                    onClick={() => openModal("open-root")}
                  >
                    <span className="choice-icon">
                      <FolderOpen />
                    </span>
                    <span>
                      <strong>打开已有文件夹</strong>
                      <small>把现有文件夹作为知识库</small>
                    </span>
                    <ChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    className="setup-choice"
                    onClick={() => openModal("create-root")}
                  >
                    <span className="choice-icon">
                      <FolderPlus />
                    </span>
                    <span>
                      <strong>新建知识库</strong>
                      <small>从一个全新的文件夹开始</small>
                    </span>
                    <ChevronRight />
                  </Button>
                </div>
                {data.roots.length > 0 && (
                  <div className="recent-roots">
                    <span>最近使用</span>
                    {data.roots.slice(-2).map((r) => (
                      <Button
                        key={r.id}
                        variant="ghost"
                        onClick={() => {
                          commit({ ...data, rootId: r.id });
                          go("projects");
                        }}
                      >
                        <Folder />
                        <span>{r.name}</span>
                        <ChevronRight />
                      </Button>
                    ))}
                  </div>
                )}
                <div className="setup-footnote">
                  <HardDrive />
                  <span>本地优先。离线时，记录也不停。</span>
                </div>
              </div>
              <span className="setup-bottom">你的文件，始终由你掌控。</span>
            </main>
          )}
          {screen === "projects" && (
            <main className="projects-page">
              <div className="projects-heading">
                <div>
                  <p className="eyebrow">{root?.name}</p>
                  <h1>项目</h1>
                  <p>给每一个方向，留一处空间。</p>
                </div>
                <Button size="sm" onClick={() => openModal("new-project")}>
                  <Plus />
                  新建项目
                </Button>
              </div>
              {data.projects.some((p) => p.libraryId === root?.id) ? (
                <>
                  <div className="projects-tools">
                    <span>
                      {
                        data.projects.filter((p) => p.libraryId === root?.id)
                          .length
                      }{" "}
                      个项目
                    </span>
                    <div className="search-input">
                      <Search />
                      <Input
                        aria-label="查找项目"
                        placeholder="查找项目"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="project-list">
                    {data.projects
                      .filter(
                        (p) =>
                          p.libraryId === root?.id &&
                          p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p, i) => (
                        <Button
                          key={p.id}
                          variant="ghost"
                          className="project-row"
                          onClick={() => openProject(p)}
                        >
                          <span className={"project-icon tone-" + (i % 3)}>
                            <Folder />
                          </span>
                          <span className="project-copy">
                            <strong>{p.name}</strong>
                            <span>{p.description || "还没有项目描述"}</span>
                            <small>{p.notes.length} 篇文档</small>
                          </span>
                          <span className="project-updated">{p.updated}</span>
                          <ChevronRight className="project-chevron" />
                        </Button>
                      ))}
                    {!data.projects.some(
                      (p) =>
                        p.libraryId === root?.id &&
                        p.name.toLowerCase().includes(search.toLowerCase()),
                    ) && <p className="search-empty">没有找到相关项目。</p>}
                  </div>
                  <div className="library-location">
                    <HardDrive />
                    <span>{root?.path}</span>
                    <span className="location-tag">本地知识库</span>
                  </div>
                </>
              ) : (
                <div className="projects-empty">
                  <FolderPlus />
                  <h2>你的第一个项目。</h2>
                  <p>
                    读书、工作，或一个想慢慢完成的计划。
                    <br />
                    创建项目，再把想法写成文档。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openModal("new-project")}
                  >
                    <Plus />
                    创建项目
                  </Button>
                </div>
              )}
            </main>
          )}
          {screen === "editor" && (
            <div className="workspace">
              {mobile ? (
                editor
              ) : (
                <ResizablePanelGroup
                  orientation="horizontal"
                  key={sidebar ? "with-sidebar" : "without-sidebar"}
                  defaultLayout={sidebar ? panelLayout() : { editor: 100 }}
                  onLayoutChanged={(layout) => {
                    if (sidebar) savePanelLayout(layout);
                  }}
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
                    {editor}
                  </ResizablePanel>
                </ResizablePanelGroup>
              )}
            </div>
          )}
        </div>
        <div className="preview-controls">
          <span>
            UI 04 <span className="preview-mode">· 浏览器演示</span>
          </span>
          <div>
            <Button variant="ghost" size="xs" onClick={() => go("setup")}>
              初始化
            </Button>
            <Button variant="ghost" size="xs" onClick={() => demo("projects")}>
              示例项目
            </Button>
            <Button variant="ghost" size="xs" onClick={() => demo("editor")}>
              示例工作台
            </Button>
            <Separator orientation="vertical" />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={phone ? "桌面预览" : "移动预览"}
              onClick={() => {
                flush();
                setPhone((v) => !v);
              }}
            >
              <Smartphone />
            </Button>
          </div>
        </div>
      </div>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="file-sheet">
          <SheetHeader className="sr-only">
            <SheetTitle>项目文档</SheetTitle>
            <SheetDescription>选择文档，或返回项目列表。</SheetDescription>
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
                ? "同步"
                : panel === "logs"
                  ? "诊断日志"
                  : panel === "outline"
                    ? "文档大纲"
                    : "偏好设置"}
            </SheetTitle>
            <SheetDescription>
              {panel === "sync"
                ? "在你的设备之间，延续思考。"
                : panel === "logs"
                  ? "清楚记录每一步，方便排查问题。"
                  : panel === "outline"
                    ? "当前文档的内容脉络。"
                    : "把空间调整成喜欢的样子。"}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="inspector-scroll">
            <div className="inspector-content">
              {panel === "sync" && (
                <>
                  <div className="sync-summary">
                    {syncing ? <Loader2 className="animate-spin" /> : <Cloud />}
                    <h3>
                      {syncing
                        ? "正在同步"
                        : synced
                          ? "所有更改已同步"
                          : "本地内容已保存"}
                    </h3>
                    <p>
                      {server
                        ? "已配置演示服务器"
                        : "连接自己的服务器，开启多设备同步。"}
                    </p>
                    <Button size="sm" disabled={syncing} onClick={sync}>
                      {syncing ? "同步中…" : "演示同步"}
                    </Button>
                  </div>
                  <Separator />
                  <div className="setting-block">
                    <label htmlFor="server">服务器地址</label>
                    <Input
                      id="server"
                      placeholder="https://sync.example.com"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                    />
                    <p>仅演示连接配置，不发送网络请求。</p>
                  </div>
                  <div className="setting-inline">
                    <div>
                      <strong>前台自动同步</strong>
                      <p>打开应用或保存文档后同步</p>
                    </div>
                    <Switch
                      aria-label="前台自动同步"
                      checked={autoSync}
                      onCheckedChange={setAutoSync}
                    />
                  </div>
                  <Separator />
                  <div className="sync-devices">
                    <span>设备</span>
                    <div>
                      <HardDrive />
                      <span>这台电脑</span>
                      <small>当前设备</small>
                    </div>
                    <div>
                      <Smartphone />
                      <span>我的 Android</span>
                      <small>演示设备</small>
                    </div>
                  </div>
                  {note && (
                    <Button
                      variant="outline"
                      className="w-full mt-6"
                      size="sm"
                      onClick={() => {
                        setPanel(null);
                        openModal("conflict");
                      }}
                    >
                      体验版本冲突处理
                      <ChevronRight />
                    </Button>
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
                    <p>只保留黑、白与灰阶。让内容成为视觉中心。</p>
                  </div>
                  <Separator />
                  <div className="setting-inline">
                    <div>
                      <strong>自动保存</strong>
                      <p>停止输入约 800ms 后保存</p>
                    </div>
                    <Check className="subtle-icon" />
                  </div>
                  <div className="setting-inline">
                    <div>
                      <strong>本地文件</strong>
                      <p>正式客户端直接读写 Markdown</p>
                    </div>
                    <HardDrive className="subtle-icon" />
                  </div>
                  <Separator />
                  <div className="setting-block">
                    <label>当前知识库</label>
                    <p>
                      {root?.name ?? "尚未选择"}
                      <br />
                      {root?.path}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPanel(null);
                        go("setup");
                      }}
                    >
                      切换知识库
                      <ArrowRight />
                    </Button>
                  </div>
                </>
              )}
              {panel === "outline" && (
                <div className="outline-list">
                  {Array.from(
                    new DOMParser()
                      .parseFromString(note?.html ?? "", "text/html")
                      .querySelectorAll("h2,h3"),
                  ).map((h, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      onClick={() => {
                        setPanel(null);
                        setTimeout(
                          () =>
                            content.current
                              ?.querySelectorAll("h2,h3")
                              [i]?.scrollIntoView({ behavior: "smooth" }),
                          50,
                        );
                      }}
                    >
                      {h.textContent}
                    </Button>
                  ))}
                  {!note?.html.includes("<h2") && (
                    <p>添加标题后，大纲会显示在这里。</p>
                  )}
                </div>
              )}
              {panel === "logs" && (
                <>
                  <div className="search-input inspector-search">
                    <Search />
                    <Input
                      aria-label="搜索日志"
                      placeholder="查找事件"
                      value={logQuery}
                      onChange={(e) => setLogQuery(e.target.value)}
                    />
                  </div>
                  <Tabs value={logLevel} onValueChange={setLogLevel}>
                    <TabsList className="log-tabs">
                      <TabsTrigger value="all">全部</TabsTrigger>
                      <TabsTrigger value="INFO">信息</TabsTrigger>
                      <TabsTrigger value="ERROR">错误</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="log-list">
                    {logs
                      .filter(
                        (l) =>
                          (logLevel === "all" || l.level === logLevel) &&
                          l.text.includes(logQuery),
                      )
                      .map((l, i) => (
                        <div className="log-entry" key={i}>
                          <div>
                            <span>{l.time}</span>
                            <span>{l.level}</span>
                          </div>
                          <strong>{l.text}</strong>
                          <p>{l.detail}</p>
                        </div>
                      ))}
                    {!logs.some(
                      (l) =>
                        (logLevel === "all" || l.level === logLevel) &&
                        l.text.includes(logQuery),
                    ) && <p className="log-empty">没有符合条件的事件。</p>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      download(
                        "kbase-demo-logs.json",
                        JSON.stringify({ prototype: true, logs }, null, 2),
                      )
                    }
                  >
                    <ArrowDownToLine />
                    导出演示日志
                  </Button>
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
          className={
            modal === "source" || modal === "conflict" ? "wide-dialog" : ""
          }
        >
          <DialogHeader>
            <DialogTitle>{modal ? titles[modal] : ""}</DialogTitle>
            <DialogDescription>
              {modal === "open-root"
                ? "选择已有文件夹作为知识库，文件夹中的项目会归于这里。"
                : modal === "create-root"
                  ? "选择位置，为知识与项目建立一个根文件夹。"
                  : modal === "new-project"
                    ? "项目对应知识库中的一个文件夹。"
                    : modal === "new-note"
                      ? "在当前项目里，开始一篇 Markdown 文档。"
                      : modal === "source"
                        ? "当前为基础 Markdown 转换演示。复杂格式请先导出。"
                        : modal === "conflict"
                          ? "同一篇文档在两台设备上有了不同修改。"
                          : modal === "about"
                            ? "KBase · 黑白两种外观，留白与内容优先。"
                            : ""}
            </DialogDescription>
          </DialogHeader>
          {(modal === "open-root" || modal === "create-root") && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                createRoot();
              }}
            >
              <label htmlFor="root-name">
                {modal === "open-root" ? "文件夹名称" : "知识库名称"}
              </label>
              <Input
                id="root-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                maxLength={60}
              />
              <label htmlFor="root-location">
                {modal === "open-root" ? "所在位置" : "保存到"}
              </label>
              <Input
                id="root-location"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                required
                placeholder="文稿"
              />
              <div className="path-preview">
                <Folder />
                <span>
                  {path} / {name || "知识库名称"}
                </span>
              </div>
              <p className="dialog-note">
                此稿通过名称模拟文件夹选择，不会读取或新建磁盘目录。正式客户端将打开系统文件夹选择器。
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit">
                  {modal === "open-root" ? "打开知识库" : "创建知识库"}
                  <ArrowRight />
                </Button>
              </DialogFooter>
            </form>
          )}
          {modal === "new-project" && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                createProject();
              }}
            >
              <label htmlFor="project-name">项目名称</label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：产品设计"
                required
                autoFocus
                maxLength={60}
              />
              <label htmlFor="project-description">
                一句话描述 <span>可选</span>
              </label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="这个项目，想留住些什么？"
                maxLength={160}
              />
              <div className="path-preview">
                <Folder />
                <span>
                  {root?.name} / {name || "项目名称"}
                </span>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit">
                  创建项目
                  <ArrowRight />
                </Button>
              </DialogFooter>
            </form>
          )}
          {modal === "new-note" && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                createNote();
              }}
            >
              <label htmlFor="note-name">文档名称</label>
              <Input
                id="note-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="一个新的想法"
                required
                autoFocus
                maxLength={100}
              />
              <div className="path-preview">
                <FileText />
                <span>
                  {project?.name} / {name || "文档名称"}.md
                </span>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit">
                  创建文档
                  <ArrowRight />
                </Button>
              </DialogFooter>
            </form>
          )}
          {modal === "source" && (
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
                <Button onClick={saveSource}>
                  {sourcePurpose === "merge" ? "保存合并结果" : "保存修改"}
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "conflict" && (
            <>
              <div className="conflict-versions">
                <div>
                  <header>
                    <HardDrive />
                    这台电脑<span>10:42</span>
                  </header>
                  <p>{asMarkdown(note?.html ?? "").slice(0, 220)}</p>
                </div>
                <div>
                  <header>
                    <Smartphone />
                    Android<span>10:48</span>
                  </header>
                  <p>
                    先理解需求，再开始设计。
                    <br />
                    <br />
                    让桌面端与移动端拥有同样自然的记录体验。
                  </p>
                </div>
              </div>
              <p className="dialog-note">
                合并前会保留本机原文与远端演示版本，避免覆盖丢失。
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModal(null)}>
                  稍后处理
                </Button>
                <Button
                  onClick={() => {
                    setSource(
                      asMarkdown(note?.html ?? "") +
                        "\n\n先理解需求，再开始设计。",
                    );
                    setSourcePurpose("merge");
                    setModal("source");
                  }}
                >
                  编辑合并结果
                  <ArrowRight />
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "about" && (
            <>
              <p className="about-copy">
                初始化知识库，再创建项目。进入项目后，界面只留下文件与写作空间。同步、日志与设置按需出现。
              </p>
              <Separator />
              <p className="dialog-note">
                界面控件使用官方 shadcn/ui
                源码：Button、Dialog、Sheet、DropdownMenu、Input、Textarea、Tabs、Switch、ScrollArea、Resizable、Command、Tooltip、Separator
                与 Sonner。仅调整黑白主题变量和布局样式，没有另造一套控件。
              </p>
              <p className="dialog-note">
                当前为浏览器交互原型。数据存于当前浏览器，不读写真实文件，不执行真实同步。
              </p>
              <DialogFooter>
                <Button onClick={() => setModal(null)}>继续体验</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <CommandDialog
        open={command}
        onOpenChange={setCommand}
        title="查找项目文档"
        description="按名称快速打开文档。"
      >
        <CommandInput placeholder="查找文档…" />
        <CommandList>
          <CommandEmpty>没有找到相关文档。</CommandEmpty>
          <CommandGroup heading={project?.name ?? "请先进入项目"}>
            {project?.notes.map((n) => (
              <CommandItem
                key={n.id}
                value={n.title}
                onSelect={() => openNote(n.id)}
              >
                <FileText />
                {n.title}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <CommandDialog
        open={slash}
        onOpenChange={setSlash}
        title="插入内容"
        description="选择一个 Markdown 内容块。"
      >
        <CommandInput placeholder="插入内容…" />
        <CommandList>
          <CommandEmpty>没有找到这种内容。</CommandEmpty>
          <CommandGroup heading="基础内容">
            {[
              { id: "p", label: "段落", icon: Type },
              { id: "h2", label: "二级标题", icon: FileText },
              { id: "ul", label: "列表", icon: ListChecks },
              { id: "blockquote", label: "引用", icon: Quote },
              { id: "pre", label: "代码块", icon: Code2 },
            ].map((b) => (
              <CommandItem
                key={b.id}
                value={b.label}
                onSelect={() => block(b.id)}
              >
                <b.icon />
                {b.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Toaster
        theme={resolvedTheme}
        position="bottom-center"
        offset={65}
        closeButton
      />
    </TooltipProvider>
  );
}
