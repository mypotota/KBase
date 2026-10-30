import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type ComponentType,
} from "react";
import { useAppearance } from "@/lib/use-appearance";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  CloudCheck,
  Code,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Leaf,
  List,
  Logs,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  RefreshCw,
  TriangleAlert,
  X,
  Clock,
  Type,
  ListTodo,
  Quote,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
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
import seeds from "./documents.json";
import sprite from "./icons.svg?raw";

type Doc = { id: string; name: string; folder: string; html: string };
type Page = "editor" | "sync" | "logs" | "settings";
type Modal =
  | "new"
  | "project"
  | "source"
  | "server"
  | "conflict"
  | "review"
  | "log"
  | "reset"
  | null;
type Log = {
  id: string;
  time: string;
  level: string;
  module: string;
  message: string;
};
const folders = ["开始使用", "我的项目", "日常记录"];
function get<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem("kbase-react-" + key) || "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem("kbase-react-" + key, JSON.stringify(value));
    return true;
  } catch {
    toast.error("浏览器存储失败，请导出文档备份");
    return false;
  }
}
function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function markdown(text: string) {
  return text
    .split("\n")
    .map((line) =>
      line.startsWith("## ")
        ? `<h2>${escapeHtml(line.slice(3))}</h2>`
        : line.startsWith("# ")
          ? `<h1>${escapeHtml(line.slice(2))}</h1>`
          : line.trim()
            ? `<p class="block">${escapeHtml(line)}</p>`
            : "",
    )
    .join("");
}
function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function useSmall() {
  const [small, setSmall] = useState(matchMedia("(max-width: 720px)").matches);
  useEffect(() => {
    const mq = matchMedia("(max-width: 720px)");
    const update = () => setSmall(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return small;
}
function IconButton({
  label,
  icon: Icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={active ? "active-icon" : ""}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
const initialLogs: Log[] = [
  {
    id: "sync-demo-004",
    time: "10:48:32",
    level: "WARN",
    module: "同步",
    message: "检测到版本分歧，双方内容已保留",
  },
  {
    id: "sync-demo-003",
    time: "10:48:31",
    level: "INFO",
    module: "同步",
    message: "远端变更检查完成，发现 1 个文件需要处理",
  },
  {
    id: "conn-demo-002",
    time: "10:48:30",
    level: "INFO",
    module: "连接",
    message: "演示连接就绪，等待同步任务",
  },
  {
    id: "file-demo-008",
    time: "10:42:18",
    level: "INFO",
    module: "文件",
    message: "产品设计笔记.md 已写入本地草稿",
  },
  {
    id: "conn-demo-001",
    time: "10:42:17",
    level: "ERROR",
    module: "连接",
    message: "模拟请求超时，已在下一次重试中恢复",
  },
  {
    id: "app-demo-001",
    time: "10:40:01",
    level: "INFO",
    module: "系统",
    message: "项目索引完成，共发现 5 篇文档",
  },
];

export default function App() {
  const { theme, setTheme, resolvedTheme } = useAppearance();
  const small = useSmall();
  const [phone, setPhone] = useState(false),
    mobile = small || phone;
  const [docs, setDocs] = useState<Doc[]>(() => get("documents", seeds)),
    [current, setCurrent] = useState("welcome"),
    [opened, setOpened] = useState(["welcome", "sync-note"]);
  const [page, setPage] = useState<Page>("editor"),
    [sideOpen, setSideOpen] = useState(true),
    [sheetOpen, setSheetOpen] = useState(false),
    [outline, setOutline] = useState(true),
    [outlineSheet, setOutlineSheet] = useState(false);
  const [query, setQuery] = useState(""),
    [collapsed, setCollapsed] = useState<string[]>([]),
    [read, setRead] = useState(false),
    [dirty, setDirty] = useState(false),
    [wordCount, setWordCount] = useState(0);
  const [modal, setModal] = useState<Modal>(null),
    [command, setCommand] = useState(false),
    [slash, setSlash] = useState(false),
    [docName, setDocName] = useState(""),
    [docFolder, setDocFolder] = useState("开始使用");
  const [source, setSource] = useState(""),
    [server, setServer] = useState(() =>
      get("server", "https://sync.example.com"),
    ),
    [serverInput, setServerInput] = useState(""),
    [pairCode, setPairCode] = useState("");
  const [conflict, setConflict] = useState(
      () => !get("conflict-resolved", false),
    ),
    [merging, setMerging] = useState(false),
    [merge, setMerge] = useState(
      "# 产品设计笔记\n\n## 设计原则\n\n让记录变得简单，让知识随时可用。\n\n第一版完善桌面端写作体验，同时验证移动端的编辑流程。\n\n保持本地文件的独立性。",
    ),
    [syncing, setSyncing] = useState(false);
  const [logs, setLogs] = useState(initialLogs),
    [logQuery, setLogQuery] = useState(""),
    [logLevel, setLogLevel] = useState("all"),
    [logModule, setLogModule] = useState("all"),
    [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [font, setFont] = useState(() => get("font", 13)),
    [wide, setWide] = useState(() => get("wide", false)),
    [autoSync, setAutoSync] = useState(() => get("autosync", true)),
    [tasks, setTasks] = useState<boolean[]>(() =>
      get("tasks", [false, false, false]),
    );
  const content = useRef<HTMLElement>(null),
    activeBlock = useRef<HTMLElement | null>(null),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    docsRef = useRef(docs),
    currentRef = useRef(current),
    readRef = useRef(read);
  docsRef.current = docs;
  currentRef.current = current;
  readRef.current = read;
  const doc = docs.find((d) => d.id === current) ?? docs[0];
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !modal && !command && !slash) {
        setSheetOpen(false);
        setOutlineSheet(false);
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [modal, command, slash]);
  const persist = () => {
    if (!content.current || readRef.current) return;
    const html = content.current.innerHTML;
    const next = docsRef.current.map((d) =>
      d.id === currentRef.current ? { ...d, html } : d,
    );
    if (save("documents", next)) {
      docsRef.current = next;
      setDocs(next);
      setDirty(false);
    }
  };
  const flush = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persist();
  };
  const queueSave = () => {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 800);
    setWordCount(content.current?.innerText.replace(/\s/g, "").length ?? 0);
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
        toast.success("已保存到当前浏览器");
      }
    };
    const leave = () => flush();
    window.addEventListener("keydown", handle);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", handle);
      window.removeEventListener("beforeunload", leave);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, []);
  useLayoutEffect(() => {
    if (page !== "editor" || !content.current) return;
    content.current.innerHTML = doc.html.replace(
      /<label class="check">[\s\S]*?<\/label>/g,
      "",
    );
    content.current.querySelectorAll<HTMLElement>(".block").forEach((el) => {
      el.contentEditable = String(!read);
      el.spellcheck = false;
    });
    content.current
      .querySelectorAll("h2")
      .forEach((el, i) => (el.id = "section-" + i));
    activeBlock.current = null;
    setWordCount(content.current.innerText.replace(/\s/g, "").length);
    setDirty(false);
  }, [current, read, page, mobile, sideOpen, outline]);
  function navigate(next: Page) {
    flush();
    setPage(next);
    setSheetOpen(false);
  }
  function openDoc(id: string) {
    flush();
    setCurrent(id);
    setOpened((v) => (v.includes(id) ? v : [...v, id]));
    setPage("editor");
    setSheetOpen(false);
  }
  function closeTab(id: string) {
    const next = opened.filter((d) => d !== id);
    if (!next.length) next.push("welcome");
    if (current === id) openDoc(next.at(-1)!);
    setOpened(next);
  }
  function showModal(next: Modal) {
    flush();
    if (next === "source") setSource(toMarkdown());
    if (next === "server") {
      setServerInput(server);
      setPairCode("");
    }
    if (next === "conflict") setMerging(false);
    if (next === "new") setDocName("");
    setModal(next);
  }
  function toMarkdown() {
    if (!content.current) return doc.html;
    const clone = content.current.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(".doc-eyebrow,.docmeta,.num")
      .forEach((e) => e.remove());
    return [...clone.children]
      .map((e) => {
        const text = e.textContent || "";
        if (e.tagName === "H1") return "# " + text;
        if (e.tagName === "H2") return "## " + text;
        if (e.tagName === "UL")
          return [...e.querySelectorAll("li")]
            .map((li) => "- " + li.textContent)
            .join("\n");
        if (e.classList.contains("codebox")) return "```\n" + text + "\n```";
        if (e.classList.contains("doc-rule")) return "---";
        return text;
      })
      .join("\n\n");
  }
  function createDoc() {
    if (!docName.trim()) return;
    const name = docName.trim(),
      id = "new-" + Date.now();
    const d = {
      id,
      name,
      folder: docFolder,
      html: `<div class="doc-eyebrow">A NEW THOUGHT</div><h1>${escapeHtml(name)}</h1><div class="docmeta">刚刚创建 · 本地文档</div><p class="block" data-placeholder="写下你的想法，或输入 / 插入内容"></p>`,
    };
    const next = [...docsRef.current, d];
    docsRef.current = next;
    setDocs(next);
    save("documents", next);
    setCurrent(id);
    setOpened((v) => [...v, id]);
    setPage("editor");
    setModal(null);
    setSheetOpen(false);
    toast.success("文档已创建");
  }
  function addBlock(type: string) {
    const el = document.createElement(
      type === "h2"
        ? "h2"
        : type === "ul"
          ? "ul"
          : type === "quote"
            ? "blockquote"
            : type === "code"
              ? "pre"
              : "p",
    );
    el.className = "block" + (type === "code" ? " codebox" : "");
    el.contentEditable = "true";
    el.dataset.placeholder = "写下你的想法…";
    el.innerHTML =
      type === "h2"
        ? "新的标题"
        : type === "ul"
          ? "<li>新的列表项</li>"
          : type === "code"
            ? "// 在这里输入代码"
            : type === "quote"
              ? "值得留下的一句话"
              : "";
    const previous = activeBlock.current;
    if (previous?.textContent?.endsWith("/"))
      previous.textContent = previous.textContent.slice(0, -1);
    if (previous && content.current?.contains(previous)) previous.after(el);
    else content.current?.append(el);
    activeBlock.current = el;
    setSlash(false);
    requestAnimationFrame(() => {
      el.focus();
      queueSave();
    });
  }
  function addLog(message: string) {
    setLogs((v) => [
      {
        id: "demo-" + Date.now(),
        time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
        level: "INFO",
        module: "同步",
        message,
      },
      ...v,
    ]);
  }
  function runSync() {
    if (syncing) return;
    setSyncing(true);
    addLog("开始演示同步，扫描待处理文件");
    syncTimer.current = setTimeout(() => {
      setSyncing(false);
      addLog("演示同步检查完成");
      toast.success(
        conflict
          ? "检查完成，仍有 1 个冲突待处理"
          : "所有文档已是最新版本（演示）",
      );
    }, 1600);
  }
  function resolve(choice: "local" | "remote" | "merge") {
    const original = docsRef.current.find((d) => d.id === "design")!;
    save("conflict-backup", {
      localHtml: original.html,
      local: "第一版先完善桌面端的写作体验。",
      remote: "第一版同时验证桌面与移动端的编辑流程。",
    });
    const text =
      choice === "merge"
        ? merge
        : `# 产品设计笔记\n\n## 设计原则\n\n让记录变得简单，让知识随时可用。\n\n${choice === "local" ? "第一版先完善桌面端的写作体验。" : "第一版同时验证桌面与移动端的编辑流程。"}\n\n保持本地文件的独立性。`;
    const next = docsRef.current.map((d) =>
      d.id === "design" ? { ...d, html: markdown(text) } : d,
    );
    setDocs(next);
    docsRef.current = next;
    save("documents", next);
    save("conflict-resolved", true);
    setConflict(false);
    setModal(null);
    addLog("冲突已解决，双方快照已保留");
    if (current === "design" && content.current) {
      content.current.innerHTML = markdown(text);
      content.current
        .querySelectorAll<HTMLElement>(".block")
        .forEach((el) => (el.contentEditable = String(!read)));
    }
    toast.success("冲突已解决，原始版本已保留");
  }
  function exportLogs() {
    download(
      "kbase-demo-diagnostics.json",
      JSON.stringify({ prototype: true, logs }, null, 2),
      "application/json",
    );
    toast.success("演示日志已导出");
  }
  const navigation = [
    { id: "editor" as Page, icon: Folder, label: "文档工作台" },
    { id: "sync" as Page, icon: RefreshCw, label: "同步中心" },
    { id: "logs" as Page, icon: Logs, label: "日志中心" },
  ];
  const navButtons = (
    <>
      {navigation.map((n) => (
        <IconButton
          key={n.id}
          label={n.label}
          icon={n.icon}
          active={page === n.id}
          onClick={() => navigate(n.id)}
        />
      ))}
    </>
  );
  const tree = (
    <div className="file-sidebar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="project-switch">
            <span className="project-mark">
              <Leaf />
            </span>
            <span>
              <strong>我的知识花园</strong>
              <small>PERSONAL WORKSPACE</small>
            </span>
            <ChevronDown className="ml-auto size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>我的项目</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setSheetOpen(false)}>
            <Leaf />
            我的知识花园
            <Check className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => showModal("project")}>
            <FolderOpen />
            打开其他项目
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => showModal("server")}>
            <CloudCheck />
            从同步服务连接
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        className="search-launch"
        onClick={() => setCommand(true)}
      >
        <Search className="size-4" />
        查找文件…<kbd>⌘ K</kbd>
      </Button>
      <div className="file-heading">
        <span>项目文件</span>
        <IconButton
          label="新建文档"
          icon={Plus}
          onClick={() => showModal("new")}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="项目操作">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => showModal("new")}>
              新建文档
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => showModal("project")}>
              项目详情
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="file-filter">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="筛选文件名…"
          aria-label="筛选文件"
        />
      </div>
      <ScrollArea className="tree-scroll">
        <div className="tree-inner">
          {folders.map((f) => {
            const files = docs.filter(
              (d) =>
                d.folder === f &&
                d.name.toLowerCase().includes(query.toLowerCase()),
            );
            if (!files.length) return null;
            const closed = collapsed.includes(f) && !query;
            return (
              <div key={f}>
                <Button
                  variant="ghost"
                  className="tree-folder"
                  onClick={() =>
                    setCollapsed((v) =>
                      v.includes(f) ? v.filter((x) => x !== f) : [...v, f],
                    )
                  }
                >
                  {closed ? <ChevronRight /> : <ChevronDown />}
                  <Folder />
                  <span>{f}</span>
                  <small>{files.length}</small>
                </Button>
                {!closed && (
                  <div className="tree-children">
                    {files.map((d) => (
                      <Button
                        variant="ghost"
                        key={d.id}
                        className={
                          "tree-file " + (current === d.id ? "chosen" : "")
                        }
                        onClick={() => openDoc(d.id)}
                      >
                        <FileText />
                        <span>{d.name}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <Separator className="my-5" />
          <Button
            variant="ghost"
            className="tree-folder"
            onClick={() => showModal("new")}
          >
            <Plus />
            新建文档
          </Button>
          <Button
            variant="ghost"
            className="tree-folder"
            onClick={() => showModal("project")}
          >
            <FolderOpen />
            打开其他项目
          </Button>
        </div>
      </ScrollArea>
      <Button
        variant="ghost"
        className="sidebar-sync"
        onClick={() => navigate("sync")}
      >
        <CloudCheck className="size-4" />
        <span>{syncing ? "正在同步…" : "所有更改已同步"}</span>
        <ArrowRight className="ml-auto size-3" />
      </Button>
      {mobile && (
        <div className="mobile-nav">
          {navButtons}
          <IconButton
            label="设置"
            icon={Settings}
            onClick={() => navigate("settings")}
          />
        </div>
      )}
    </div>
  );
  const outlineContent = (
    <aside className="outline-pane">
      <div className="outline-title">
        此页内容
        <IconButton
          label="关闭大纲"
          icon={X}
          onClick={() => (mobile ? setOutlineSheet(false) : setOutline(false))}
        />
      </div>
      {(doc.html.match(/<h2[^>]*>[\s\S]*?<\/h2>/g) || []).map((h, i) => (
        <Button
          variant="ghost"
          className={"outline-item " + (i === 0 ? "current" : "")}
          key={i}
          onClick={() =>
            content.current
              ?.querySelectorAll("h2")
              [i]?.scrollIntoView({ behavior: "smooth" })
          }
        >
          {h
            .replace(/<span class="num">.*?<\/span>/, "")
            .replace(/<[^>]*>/g, "")}
        </Button>
      ))}
      <div className="outline-note">
        <p>给想法一个生长的地方。</p>
        <p>
          文档始终属于你。
          <br />以 Markdown 格式保存在本地，
          <br />
          随时编辑，自由迁移。
        </p>
        <span>
          <ShieldCheck />
          本地优先 · 自由掌控
        </span>
      </div>
    </aside>
  );
  const editor = (
    <section className="editor-column">
      <div className="editor-scroll">
        <article
          ref={content}
          className={"document " + (wide ? "full-width" : "")}
          style={{ "--doc-font": font + "px" } as React.CSSProperties}
          onInput={(e) => {
            activeBlock.current = (e.target as HTMLElement).closest(".block");
            queueSave();
            if ((e.nativeEvent as InputEvent).data === "/") setSlash(true);
          }}
          onFocusCapture={(e) => {
            const target = (e.target as HTMLElement).closest<HTMLElement>(
              ".block",
            );
            if (target) activeBlock.current = target;
          }}
          onPaste={(e) => {
            if ((e.target as HTMLElement).closest("[contenteditable=true]")) {
              e.preventDefault();
              document.execCommand(
                "insertText",
                false,
                e.clipboardData.getData("text/plain"),
              );
            }
          }}
        />
        {current === "welcome" && (
          <div className="welcome-tasks">
            <h3>从一个小小的行动开始</h3>
            {[
              "创建我的第一篇文档",
              "整理一个属于自己的项目文件夹",
              "连接自己的同步服务器",
            ].map((task, i) => (
              <label key={task}>
                <Checkbox
                  checked={tasks[i]}
                  disabled={read}
                  onCheckedChange={(checked) => {
                    const next = tasks.map((v, j) =>
                      j === i ? checked === true : v,
                    );
                    setTasks(next);
                    save("tasks", next);
                  }}
                />
                <span className={tasks[i] ? "done" : ""}>{task}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {!read && (
        <div className="editor-tools">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="加粗"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => document.execCommand("bold")}
          >
            <b>B</b>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="斜体"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => document.execCommand("italic")}
          >
            <i>I</i>
          </Button>
          <IconButton
            label="插入内容块"
            icon={Plus}
            onClick={() => setSlash(true)}
          />
          <span>块编辑 · 输入 / 插入内容</span>
          <IconButton
            label="Markdown 源码"
            icon={Code}
            onClick={() => showModal("source")}
          />
        </div>
      )}
    </section>
  );
  const editorWorkspace = mobile ? (
    editor
  ) : (
    <ResizablePanelGroup
      orientation="horizontal"
      id="editor-panels"
      defaultLayout={get("editor-layout-" + outline, undefined)}
      onLayoutChanged={(layout) => save("editor-layout-" + outline, layout)}
      key={outline ? "with-outline" : "no-outline"}
    >
      {
        <ResizablePanel id="document-panel" minSize="350px">
          {editor}
        </ResizablePanel>
      }
      {outline && (
        <>
          <ResizableHandle className="panel-handle" />
          <ResizablePanel
            id="outline-panel"
            defaultSize="224px"
            minSize="190px"
            maxSize="360px"
          >
            {outlineContent}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
  const main = (
    <main className="main">
      <header className="topbar">
        <IconButton
          label="切换文件侧栏"
          icon={PanelLeft}
          onClick={() => {
            flush();
            mobile ? setSheetOpen(true) : setSideOpen((v) => !v);
          }}
        />
        <div className="breadcrumbs">
          <span>我的知识花园</span>
          <span>/</span>
          <span>
            {page === "editor"
              ? doc.folder
              : { sync: "同步中心", logs: "日志中心", settings: "设置" }[page]}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="sync-top"
          onClick={() => navigate("sync")}
        >
          {syncing ? <RefreshCw className="animate-spin" /> : <CloudCheck />}
          <span>{syncing ? "同步中" : "已同步"}</span>
        </Button>
        <Separator orientation="vertical" className="h-4!" />
        {page === "editor" && (
          <>
            <IconButton
              label={read ? "切换块编辑" : "切换阅读模式"}
              icon={read ? Pencil : FileText}
              onClick={() => {
                flush();
                setRead((v) => !v);
              }}
            />
            <IconButton
              label="切换文档大纲"
              icon={PanelRight}
              onClick={() => {
                flush();
                mobile ? setOutlineSheet((v) => !v) : setOutline((v) => !v);
              }}
            />
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="更多操作">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>文档与工作空间</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={page !== "editor"}
              onSelect={() => showModal("source")}
            >
              <Code />
              Markdown 源码
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={page !== "editor"}
              onSelect={() => download(doc.name + ".md", toMarkdown())}
            >
              <Download />
              导出当前文档
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const backup = get("conflict-backup", null);
                backup
                  ? download(
                      "冲突版本备份.json",
                      JSON.stringify(backup, null, 2),
                      "application/json",
                    )
                  : toast.info("请先完成一次演示冲突处理");
              }}
            >
              <Clock />
              导出冲突版本备份
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("settings")}>
              <Settings />
              设置
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => showModal("review")}>
              组件与评审说明
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {page === "editor" ? (
        <>
          <div className="document-tabs">
            <Tabs value={current} onValueChange={openDoc}>
              <TabsList variant="line">
                {opened.map((id) => {
                  const d = docs.find((d) => d.id === id);
                  return (
                    d && (
                      <span
                        className={
                          "tab-wrap " + (id === current ? "selected" : "")
                        }
                        key={id}
                      >
                        <TabsTrigger value={id}>
                          <FileText />
                          {d.name}
                        </TabsTrigger>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={"关闭 " + d.name}
                          onClick={() => closeTab(id)}
                        >
                          <X />
                        </Button>
                      </span>
                    )
                  );
                })}
              </TabsList>
            </Tabs>
            <IconButton
              label="新建标签文档"
              icon={Plus}
              onClick={() => showModal("new")}
            />
          </div>
          <div className="workarea">{editorWorkspace}</div>
        </>
      ) : (
        <ScrollArea className="page-scroll">
          <div className="page-inner">
            {page === "sync"
              ? syncPage()
              : page === "logs"
                ? logsPage()
                : settingsPage()}
          </div>
        </ScrollArea>
      )}
      <footer className="statusbar">
        <span>
          {dirty ? <Clock /> : <Check />}
          {dirty ? "正在保存…" : "本地已保存"}
        </span>
        <span className="status-path">{doc.folder}</span>
        <div className="ml-auto flex gap-4">
          <span>{wordCount.toLocaleString()} 字</span>
          <span className="status-extra">Markdown</span>
          <span className="status-extra">UTF-8</span>
          <span className="status-extra">{read ? "阅读模式" : "块编辑"}</span>
        </div>
      </footer>
    </main>
  );
  function syncPage() {
    return (
      <>
        <div className="page-eyebrow">CONNECTED, ON YOUR TERMS</div>
        <div className="page-heading">
          <div>
            <h1>让知识，在设备间流动。</h1>
            <p>本地安心记录，同步从容发生。</p>
          </div>
          <Button disabled={syncing} onClick={runSync}>
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            {syncing ? "同步中…" : "立即同步"}
          </Button>
        </div>
        <div className="info-panel server-row">
          <span className="panel-symbol">
            <CloudCheck />
          </span>
          <div className="flex-1 min-w-0">
            <strong>
              我的同步服务器 <Badge variant="secondary">演示连接</Badge>
            </strong>
            <p className="server-url">{server}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => showModal("server")}
          >
            配置
          </Button>
        </div>
        <div className="stat-grid">
          {[
            ["待同步", syncing ? "2" : "0", "个文件"],
            ["需要处理", conflict ? "1" : "0", "个冲突"],
            ["已连接设备", "2", "台"],
          ].map(([label, n, unit]) => (
            <div className="stat-card" key={label}>
              <span>{label}</span>
              <strong>
                {n}
                <small>{unit}</small>
              </strong>
            </div>
          ))}
        </div>
        {conflict && (
          <Alert className="conflict-alert">
            <TriangleAlert />
            <AlertTitle>有一个想法，需要你来决定。</AlertTitle>
            <AlertDescription>
              <span>「产品设计笔记」存在两个版本，双方内容已保留。</span>
              <Button
                variant="link"
                size="sm"
                onClick={() => showModal("conflict")}
              >
                查看冲突 <ArrowRight />
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="section-heading">
          我的知识花园<span>上次同步：刚刚</span>
        </div>
        <div className="info-panel task-list">
          {["欢迎来到 KBase", "产品设计笔记", "同步方案"].map((name, i) => (
            <div className="task-row" key={name}>
              <FileText />
              <div className="flex-1">
                <strong>{name}.md</strong>
                <p>
                  {i === 0 ? "开始使用" : "我的项目"} / {name}.md
                </p>
              </div>
              {i === 1 && conflict ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="conflict-button"
                  onClick={() => showModal("conflict")}
                >
                  需要合并
                </Button>
              ) : (
                <Badge variant="secondary">
                  <Check />
                  已同步
                </Badge>
              )}
            </div>
          ))}
        </div>
        <div className="section-heading">已连接设备</div>
        <div className="info-panel task-list">
          <div className="task-row">
            <Monitor />
            <div className="flex-1">
              <strong>
                我的电脑 <span className="muted">· 当前设备</span>
              </strong>
              <p>桌面客户端 · 刚刚活跃</p>
            </div>
            <span className="online-dot" />
          </div>
          <div className="task-row">
            <Smartphone />
            <div className="flex-1">
              <strong>我的 Android</strong>
              <p>移动客户端 · 12 分钟前活跃</p>
            </div>
            <span className="muted text-xs">前台自动同步</span>
          </div>
        </div>
        <p className="prototype-note">
          服务器、设备及传输状态为交互演示，不会上传真实文件。
        </p>
      </>
    );
  }
  function logsPage() {
    const filtered = logs.filter(
      (l) =>
        (logLevel === "all" || l.level === logLevel) &&
        (logModule === "all" || l.module === logModule) &&
        (!logQuery ||
          (l.message + l.id).toLowerCase().includes(logQuery.toLowerCase())),
    );
    return (
      <>
        <div className="page-eyebrow">EVERY DETAIL, TRACEABLE</div>
        <div className="page-heading">
          <div>
            <h1>每一步，都有迹可循。</h1>
            <p>定位问题，从一条清晰的日志开始。</p>
          </div>
          <Button variant="outline" onClick={exportLogs}>
            <Download />
            导出日志
          </Button>
        </div>
        <div className="log-filters">
          <Input
            aria-label="搜索日志"
            placeholder="搜索事件或任务编号…"
            value={logQuery}
            onChange={(e) => setLogQuery(e.target.value)}
          />
          <Select value={logLevel} onValueChange={setLogLevel}>
            <SelectTrigger aria-label="日志级别">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["all", "全部级别"],
                ["INFO", "INFO"],
                ["WARN", "WARN"],
                ["ERROR", "ERROR"],
              ].map(([v, l]) => (
                <SelectItem value={v} key={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={logModule} onValueChange={setLogModule}>
            <SelectTrigger aria-label="日志模块">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["all", "全部模块"],
                ...["同步", "连接", "文件", "系统"].map((v) => [v, v]),
              ].map(([v, l]) => (
                <SelectItem value={v} key={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="info-panel p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>级别</TableHead>
                <TableHead className="log-module">模块</TableHead>
                <TableHead>事件摘要</TableHead>
                <TableHead className="sr-only">详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="log-time">{l.time}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={"level-" + l.level.toLowerCase()}
                    >
                      {l.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="muted log-module">{l.module}</TableCell>
                  <TableCell>
                    <Button
                      variant="link"
                      className="log-message"
                      onClick={() => {
                        setSelectedLog(l);
                        setModal("log");
                      }}
                    >
                      {l.message}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <IconButton
                      label={"查看事件 " + l.id}
                      icon={ChevronRight}
                      onClick={() => {
                        setSelectedLog(l);
                        setModal("log");
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!filtered.length && (
            <p className="empty-state">没有符合条件的日志。</p>
          )}
        </div>
        <Alert className="privacy-alert">
          <ShieldCheck />
          <AlertTitle>记录过程，保护内容。</AlertTitle>
          <AlertDescription>
            此处为演示日志，默认不包含文档正文、密码或访问令牌。
          </AlertDescription>
        </Alert>
      </>
    );
  }
  function settingRow(title: string, desc: string, control: ReactNode) {
    return (
      <div className="setting-row">
        <div>
          <strong>{title}</strong>
          <p>{desc}</p>
        </div>
        {control}
      </div>
    );
  }
  function settingsPage() {
    return (
      <>
        <div className="page-eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>你的空间，你的习惯。</h1>
        <p className="page-description">调整到恰到好处，然后专注于内容。</p>
        <Tabs defaultValue="appearance">
          <TabsList>
            <TabsTrigger value="appearance">外观</TabsTrigger>
            <TabsTrigger value="sync">同步</TabsTrigger>
            <TabsTrigger value="diagnostics">诊断与数据</TabsTrigger>
          </TabsList>
          <TabsContent value="appearance">
            <div className="info-panel mt-6">
              {settingRow(
                "界面主题",
                "选择浅色、深色，或跟随系统变化。",
                <Tabs value={theme || "light"} onValueChange={setTheme}>
                  <TabsList>
                    {[
                      ["light", "浅色"],
                      ["dark", "深色"],
                      ["system", "系统"],
                    ].map(([v, l]) => (
                      <TabsTrigger value={v} key={v}>
                        {l}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>,
              )}
              {settingRow(
                "正文字号",
                "适合长时间阅读的文字大小。",
                <Select
                  value={String(font)}
                  onValueChange={(v) => {
                    setFont(Number(v));
                    save("font", Number(v));
                  }}
                >
                  <SelectTrigger aria-label="正文字号">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[13, 14, 15, 16, 18].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
              {settingRow(
                "正文全宽",
                "让编辑区域使用全部可用宽度。",
                <Switch
                  aria-label="正文全宽"
                  checked={wide}
                  onCheckedChange={(v) => {
                    setWide(v);
                    save("wide", v);
                  }}
                />,
              )}
              {settingRow(
                "自动保存",
                "停止输入约 800ms 后保存到当前浏览器。",
                <Badge variant="secondary">始终开启</Badge>,
              )}
            </div>
          </TabsContent>
          <TabsContent value="sync">
            <div className="info-panel mt-6">
              {settingRow(
                "前台自动同步",
                "正式客户端在启动、恢复前台与保存后同步。",
                <Switch
                  aria-label="前台自动同步"
                  checked={autoSync}
                  onCheckedChange={(v) => {
                    setAutoSync(v);
                    save("autosync", v);
                    toast.info("偏好已保存，此原型不执行真实同步");
                  }}
                />,
              )}
              {settingRow(
                "同步服务器",
                "连接自己的 Docker 同步服务。",
                <Button variant="outline" onClick={() => showModal("server")}>
                  配置连接
                </Button>,
              )}
            </div>
          </TabsContent>
          <TabsContent value="diagnostics">
            <div className="info-panel mt-6">
              {settingRow(
                "导出诊断日志",
                "只包含演示事件，不含文档正文。",
                <Button variant="outline" onClick={exportLogs}>
                  <Download />
                  导出
                </Button>,
              )}
              {settingRow(
                "恢复演示数据",
                "清除浏览器内 React 原型的编辑与偏好。",
                <Button variant="outline" onClick={() => showModal("reset")}>
                  重置
                </Button>,
              )}
            </div>
          </TabsContent>
        </Tabs>
        <div className="component-note">
          <Badge variant="outline">shadcn/ui</Badge>
          <p>
            当前页面真实使用 Tabs、Switch、Select、Button、Badge 等官方组件。
          </p>
          <Button variant="link" onClick={() => showModal("review")}>
            查看组件来源与使用说明 <ArrowRight />
          </Button>
        </div>
      </>
    );
  }
  const title = {
    new: "新的想法，从这里开始",
    project: "我的知识花园",
    source: "Markdown 源码",
    server: "连接你的同步服务器",
    conflict: merging ? "编辑合并结果" : "保留每一个版本，再做决定",
    review: "真实组件，可交互的设计稿",
    log: "事件详情",
    reset: "恢复原型的初始状态？",
  };
  const description = {
    new: "文档会存入所选文件夹；原型内容只保存在当前浏览器。",
    project: "本地文件夹，就是你的知识空间。",
    source: "原型仅支持基础标题与段落转换；复杂内容请先导出备份。",
    server: "自建 Docker 服务 · 当前为连接流程演示。",
    conflict: "产品设计笔记.md · 两台设备修改了同一基线版本。",
    review: "React + TypeScript + shadcn/ui · UI PREVIEW 02",
    log: "演示日志 · 关联任务可追踪。",
    reset: "清除当前浏览器的 React 原型数据，不影响旧版 HTML 原型。",
  };
  return (
    <TooltipProvider delayDuration={350}>
      <div className={"preview-root " + (phone ? "phone-preview" : "")}>
        <div dangerouslySetInnerHTML={{ __html: sprite }} />
        <div className="application">
          <nav className="activity-bar">
            <Button
              className="brand-mark"
              aria-label="关于 KBase"
              onClick={() => showModal("review")}
            >
              k.
            </Button>
            {navButtons}
            <div className="flex-1" />
            <IconButton
              label="切换主题"
              icon={resolvedTheme === "dark" ? Moon : Sun}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            />
            <IconButton
              label="设置"
              icon={Settings}
              active={page === "settings"}
              onClick={() => navigate("settings")}
            />
            <Button
              variant="secondary"
              className="avatar"
              onClick={() => showModal("project")}
            >
              Y
            </Button>
          </nav>
          {mobile ? (
            main
          ) : (
            <ResizablePanelGroup
              orientation="horizontal"
              id="workspace-panels"
              defaultLayout={get("workspace-layout-" + sideOpen, undefined)}
              onLayoutChanged={(layout) =>
                save("workspace-layout-" + sideOpen, layout)
              }
              key={sideOpen ? "with-sidebar" : "no-sidebar"}
            >
              {sideOpen && (
                <>
                  <ResizablePanel
                    id="sidebar-panel"
                    defaultSize="254px"
                    minSize="200px"
                    maxSize="480px"
                  >
                    {tree}
                  </ResizablePanel>
                  <ResizableHandle className="panel-handle" />
                </>
              )}
              <ResizablePanel id="main-panel" minSize="450px">
                {main}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
          <Sheet open={sheetOpen && mobile} onOpenChange={setSheetOpen}>
            <SheetContent
              side="left"
              className="mobile-sheet w-[300px] p-0"
              aria-describedby="file-tree-description"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>项目文件</SheetTitle>
                <SheetDescription id="file-tree-description">
                  浏览文件夹，打开文档或进入同步与日志中心。
                </SheetDescription>
              </SheetHeader>
              {tree}
            </SheetContent>
          </Sheet>
          {mobile && (
            <Sheet open={outlineSheet} onOpenChange={setOutlineSheet}>
              <SheetContent>
                <SheetHeader className="sr-only">
                  <SheetTitle>文档大纲</SheetTitle>
                  <SheetDescription>跳转到当前文档中的章节。</SheetDescription>
                </SheetHeader>
                {outlineContent}
              </SheetContent>
            </Sheet>
          )}
        </div>
        <footer className="review-bar">
          <span className="version-label">DESIGN PREVIEW 02</span>
          <span className="review-caption">KBase · 留住每一个想法</span>
          <div className="review-controls">
            <Button
              variant="ghost"
              size="sm"
              className={!phone ? "selected" : ""}
              onClick={() => {
                flush();
                setPhone(false);
              }}
            >
              <Monitor />
              桌面
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={phone ? "selected" : ""}
              onClick={() => {
                flush();
                setPhone(true);
              }}
            >
              <Smartphone />
              移动
            </Button>
            <Separator orientation="vertical" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Moon />
              {resolvedTheme === "dark" ? "浅色" : "深色"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("sync")}>
              <RefreshCw />
              <span className="review-hide">同步</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => showModal("conflict")}
            >
              <TriangleAlert />
              冲突
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => showModal("review")}
            >
              <List />
              <span className="review-hide">组件说明</span>
            </Button>
          </div>
        </footer>
      </div>
      <Dialog
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <DialogContent
          className={
            "app-dialog " +
            (modal === "conflict" || modal === "source" ? "wide-dialog" : "")
          }
        >
          <DialogHeader>
            <DialogTitle>{modal && title[modal]}</DialogTitle>
            <DialogDescription>{modal && description[modal]}</DialogDescription>
          </DialogHeader>
          {modal === "new" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDoc();
              }}
              className="dialog-form"
            >
              <label htmlFor="doc-name">文档名称</label>
              <Input
                id="doc-name"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="例如：一个新的想法"
                maxLength={80}
                required
                autoFocus
              />
              <label htmlFor="doc-folder">所在文件夹</label>
              <Select value={docFolder} onValueChange={setDocFolder}>
                <SelectTrigger id="doc-folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem value={f} key={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit">
                  创建文档 <ArrowRight />
                </Button>
              </DialogFooter>
            </form>
          )}
          {modal === "project" && (
            <>
              <div className="server-row">
                <span className="panel-symbol">
                  <Folder />
                </span>
                <div>
                  <strong>我的知识花园</strong>
                  <p className="muted text-xs mt-1">
                    {docs.length} 篇文档 · 演示项目
                  </p>
                </div>
                <Badge variant="secondary" className="ml-auto">
                  当前项目
                </Badge>
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground leading-7">
                正式客户端通过系统文件选择器打开本地文件夹。当前 React
                原型只使用浏览器存储，不读取磁盘。
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => showModal("server")}>
                  从同步服务连接
                </Button>
                <Button onClick={() => showModal("new")}>
                  <Plus />
                  新建文档
                </Button>
              </DialogFooter>
            </>
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
                <Button
                  onClick={() => {
                    const next = docs.map((d) =>
                      d.id === current ? { ...d, html: markdown(source) } : d,
                    );
                    docsRef.current = next;
                    setDocs(next);
                    save("documents", next);
                    if (content.current) {
                      content.current.innerHTML = markdown(source);
                      content.current
                        .querySelectorAll<HTMLElement>(".block")
                        .forEach((e) => (e.contentEditable = String(!read)));
                    }
                    setModal(null);
                    toast.success("源码已保存");
                  }}
                >
                  保存源码
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "server" && (
            <form
              className="dialog-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const url = new URL(serverInput);
                  if (url.protocol !== "https:") throw Error();
                  setServer(url.origin);
                  save("server", url.origin);
                  setPairCode("");
                  setModal(null);
                  toast.success("连接配置已保存（演示）");
                } catch {
                  toast.error("请输入有效的 HTTPS 服务器地址");
                }
              }}
            >
              <label htmlFor="server-url">服务器地址</label>
              <Input
                id="server-url"
                type="url"
                required
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
              />
              <label htmlFor="pair-code">设备配对码</label>
              <Input
                id="pair-code"
                autoComplete="off"
                placeholder="服务器生成的配对码"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
              />
              <p className="muted text-xs">
                只保存服务器地址，不保存配对码，也不会发出请求。
              </p>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModal(null)}
                >
                  取消
                </Button>
                <Button type="submit">模拟连接</Button>
              </DialogFooter>
            </form>
          )}
          {modal === "conflict" &&
            (merging ? (
              <>
                <label htmlFor="merge-content" className="text-sm">
                  合并后的 Markdown
                </label>
                <Textarea
                  id="merge-content"
                  className="source-editor"
                  value={merge}
                  onChange={(e) => setMerge(e.target.value)}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setMerging(false)}>
                    返回对比
                  </Button>
                  <Button onClick={() => resolve("merge")}>
                    保存并解决冲突
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <Alert className="privacy-alert">
                  <ShieldCheck />
                  <AlertDescription>
                    无论如何处理，双方演示版本都会保留。
                  </AlertDescription>
                </Alert>
                <div className="version-grid">
                  {[
                    ["本机版本", "10:42", "第一版先完善桌面端的写作体验。"],
                    [
                      "Android 版本",
                      "10:48",
                      "第一版同时验证桌面与移动端的编辑流程。",
                    ],
                  ].map(([name, time, text], i) => (
                    <div className="version-card" key={name}>
                      <header>
                        {i === 0 ? <Monitor /> : <Smartphone />}
                        {name}
                        <span>{time}</span>
                      </header>
                      <p>
                        设计原则
                        <br />
                        让记录变得简单，让知识随时可用。
                      </p>
                      <div className={i === 0 ? "removed" : "inserted"}>
                        {text}
                      </div>
                      <p>保持本地文件的独立性。</p>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => resolve("local")}>
                    保留本机
                  </Button>
                  <Button variant="outline" onClick={() => resolve("remote")}>
                    采用远端
                  </Button>
                  <Button onClick={() => setMerging(true)}>
                    编辑合并结果 <ArrowRight />
                  </Button>
                </DialogFooter>
              </>
            ))}
          {modal === "log" && selectedLog && (
            <>
              <pre className="log-detail">{`时间：${selectedLog.time}\n级别：${selectedLog.level}\n模块：${selectedLog.module}\n任务：${selectedLog.id}\n\n${selectedLog.message}\n\n${selectedLog.level === "ERROR" ? "该演示错误已在重试后恢复。" : selectedLog.level === "WARN" ? "可前往同步中心检查版本冲突。" : "当前事件无需额外处理。"}`}</pre>
              <DialogFooter>
                <Button variant="outline" onClick={exportLogs}>
                  <Download />
                  导出诊断日志
                </Button>
                <Button onClick={() => setModal(null)}>完成</Button>
              </DialogFooter>
            </>
          )}
          {modal === "review" && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge>React 19</Badge>
                <Badge variant="secondary">Tailwind CSS 4</Badge>
                <Badge variant="secondary">shadcn/ui</Badge>
                <Badge variant="outline">Radix UI</Badge>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                本版使用官方 shadcn/ui 组件源码，来自指定 GitHub
                仓库的固定提交，保留 MIT 许可证。组件放在{" "}
                <code>web/src/components/ui</code>，不再使用原生控件模仿样式。
              </p>
              <div className="component-grid">
                {[
                  "Button / Badge",
                  "Dialog / Sheet",
                  "DropdownMenu / Tooltip",
                  "Tabs / Select",
                  "Input / Textarea",
                  "ScrollArea / Separator",
                  "Resizable / Command",
                  "Checkbox / Switch",
                  "Alert / Table",
                  "Sonner",
                ].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
              <Alert className="privacy-alert">
                <Leaf />
                <AlertDescription>
                  建议体验：拖动面板 → 输入 / 插入块 → 切换主题与移动布局 →
                  合并冲突 →
                  筛选日志。块编辑仍为交互原型；文件、服务器与同步均为演示。
                </AlertDescription>
              </Alert>
              <a
                className="source-link"
                href="https://github.com/shadcn-ui/ui/tree/96da9cc7f1aa10580a3741664e2a77c721206c00/apps/v4/registry/new-york-v4/ui"
                target="_blank"
                rel="noreferrer"
              >
                查看官方组件来源 ↗
              </a>
              <DialogFooter>
                <Button onClick={() => setModal(null)}>
                  开始体验 <ArrowRight />
                </Button>
              </DialogFooter>
            </>
          )}
          {modal === "reset" && (
            <>
              <p className="text-sm text-muted-foreground leading-7">
                新建文档、编辑内容与偏好将被删除。请先导出需要保留的内容。
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModal(null)}>
                  取消
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    Object.keys(localStorage)
                      .filter((k) => k.startsWith("kbase-react-"))
                      .forEach((k) => localStorage.removeItem(k));
                    location.reload();
                  }}
                >
                  确认重置
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <CommandDialog
        open={command}
        onOpenChange={setCommand}
        title="查找文件"
        description="按名称查找并打开项目文档。"
      >
        <CommandInput placeholder="输入文件名…" />
        <CommandList>
          <CommandEmpty>没有找到相关文档。</CommandEmpty>
          {folders.map((f) => (
            <CommandGroup heading={f} key={f}>
              {docs
                .filter((d) => d.folder === f)
                .map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.name}
                    onSelect={() => {
                      setCommand(false);
                      openDoc(d.id);
                    }}
                  >
                    <FileText />
                    {d.name}
                    <span className="ml-auto text-xs text-muted-foreground">
                      .md
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
      <CommandDialog
        open={slash}
        onOpenChange={setSlash}
        title="插入内容块"
        description="选择要插入的块类型。"
      >
        <CommandInput placeholder="选择块类型…" />
        <CommandList>
          <CommandEmpty>没有找到这种块类型。</CommandEmpty>
          <CommandGroup heading="基础块">
            {[
              { id: "p", name: "段落", icon: Type },
              { id: "h2", name: "二级标题", icon: FileText },
              { id: "ul", name: "项目列表", icon: ListTodo },
              { id: "quote", name: "引用", icon: Quote },
              { id: "code", name: "代码块", icon: Code },
            ].map((b) => (
              <CommandItem
                key={b.id}
                value={b.name}
                onSelect={() => addBlock(b.id)}
              >
                <b.icon />
                {b.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <Toaster
        theme={resolvedTheme}
        position="bottom-center"
        offset={60}
        closeButton
      />
    </TooltipProvider>
  );
}
