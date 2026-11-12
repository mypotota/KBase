import { useEffect, useState } from "react";
import { ArrowUpRight, Flag, Layers, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Button as AnimatedButton } from "@animate-ui/react/primitives/buttons/button";
import { buttonVariants } from "@/components/ui/button";
import { type Disk } from "./core/fs";
import { createNote, readNote, writeNote, type Project } from "./core/library";
import { relativeTime } from "./lib/relative-time";
import { parseEngineeringBrief, briefTemplate } from "./core/engineering";

type Props = { disk: Disk; project: Project; open: (path: string) => Promise<void>; refresh: () => Promise<unknown>; fail: (e: unknown) => unknown; };
export default function EngineeringOverview({ disk, project, open, refresh, fail }: Props) {
  const path = [project.path, "工程概览.md"].filter(Boolean).join("/");
  const exists = project.notes.some(n => n.path === path);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setText(""); setError(""); setLoading(true);
    if (!exists) { setLoading(false); return; }
    readNote(disk, path).then(value => { if (live) setText(value.text); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [disk, path, exists, project]);
  const brief = parseEngineeringBrief(text);
  async function editBrief() {
    setBusy(true);
    try {
      if (!exists) {
        const created = await createNote(disk, project.path, "工程概览");
        const snapshot = await readNote(disk, created);
        await writeNote(disk, created, briefTemplate(project.name), snapshot.hash);
        await refresh();
      }
      await open(path);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const recent = [...project.notes].sort((a,b) => b.modified - a.modified).slice(0, 6);
  return <main className="min-h-0 flex-1 overflow-auto bg-muted/20">
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-8 sm:px-10 sm:py-12 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"><Layers className="size-4" />工程工作台<span> / </span>{disk.root.name}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">从目标到下一步，继续推进这个工程。</p></div>
        <div className="flex items-center gap-2"><Button variant="ghost" disabled={busy || loading} onClick={() => void refresh().catch(fail)}>刷新概览</Button><AnimatedButton className={buttonVariants({variant: "outline"})} disabled={busy || loading || !!error} onClick={() => void editBrief()}>
          {busy ? "正在准备…" : exists ? "编辑工程概览" : "建立工程概览"}<ArrowUpRight className="size-4" />
        </AnimatedButton></div>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">工程概览读取失败：{error}。请刷新后重试。</p>}
      <section className="grid gap-4 md:grid-cols-3" aria-label="工程上下文">
        {([{key:"目标", icon:Target, fallback:"明确这个工程要解决的问题与预期成果。"}, {key:"当前阶段",icon:Layers,fallback:"记录工程正在推进的阶段。"}, {key:"下一步",icon:Flag,fallback:"留下一个明确、可继续执行的动作。"}] as const).map(({key,icon:Icon,fallback}) =>
          <article key={key} className="rounded-xl border bg-card p-5 shadow-xs"><div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{key}</div><p className="whitespace-pre-wrap break-words text-sm leading-7">{loading ? "正在读取…" : brief[key] || fallback}</p></article>)}
      </section>
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <section><h2 className="mb-4 text-sm font-semibold">最近更新的资料</h2><div className="overflow-hidden rounded-xl border bg-card">
          {recent.length ? recent.map(note => <Button key={note.path} variant="ghost" className="h-auto w-full justify-between rounded-none border-b px-4 py-3.5 text-left last:border-0" onClick={() => void open(note.path).catch(fail)}><span className="min-w-0"><span className="block truncate">{note.title}</span><span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{note.folder || "工程根目录"}</span></span><span className="shrink-0 text-xs font-normal text-muted-foreground">{relativeTime(note.modified)}</span></Button>) : <p className="p-5 text-sm text-muted-foreground">还没有资料。先建立工程概览，写下目标和下一步。</p>}
        </div></section>
        <section><h2 className="mb-4 text-sm font-semibold">工作约定与关键资料</h2><div className="rounded-xl border bg-card p-5"><p className="whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{brief["关键资料"] || "在工程概览的“关键资料”章节维护需求、方案和验收记录的相对路径。"}</p><div className="mt-5 border-t pt-4 text-xs leading-6 text-muted-foreground">{project.notes.length} 份资料 · {new Set(project.notes.map(n=>n.folder).filter(Boolean)).size} 个资料目录<br/>概览保存在工程内的 Markdown 文件，外部编辑器和 Agent 也能直接维护。</div></div></section>
      </div>
    </div>
  </main>;
}
