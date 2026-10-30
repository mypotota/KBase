import { useEffect, useRef, useState } from "react";
import {
  Disk,
  knownRoots,
  selectRoot,
  reopenRoot,
  type Root,
  decode,
  utf8,
  digest,
  missing,
} from "./fs";
import {
  scan,
  createProject as mkdirProject,
  createNote as newNote,
  readNote,
  writeNote,
  renameNote,
  localDraft,
  draft,
  clearDraft,
  type Project,
  type Note,
  type Snapshot,
  trash,
  trashProject,
} from "./library";
import { filename } from "./fs";
import { migrateProjectBinding, disconnectProject } from "./sync";
import { log, errorCode } from "./log";
import { toast } from "sonner";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
export type ExternalConflict = {
  base: Snapshot;
  local: string;
  remote: Snapshot | null;
  path: string;
};
export function useWorkspace() {
  const [roots, setRoots] = useState<Root[]>([]),
    [disk, setDisk] = useState<Disk | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [projectPath, setProjectPath] = useState<string | null>(null),
    [notePath, setNotePath] = useState<string | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [external, setExternal] = useState<ExternalConflict | null>(null),
    [recovery, setRecovery] = useState<{ text: string; at: string } | null>(
      null,
    );
  const active = useRef({ disk, notePath, snapshot, text, dirty });
  active.current = { disk, notePath, snapshot, text, dirty };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    writeQueue = useRef(Promise.resolve()),
    savingRef = useRef(false),
    externalRef = useRef(external);
  externalRef.current = external;
  const project = projects.find((p) => p.path === projectPath),
    note = project?.notes.find((n) => n.path === notePath);
  function fail(e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    setError(message);
    log("ERROR", "app", "操作未完成", { code: errorCode(e) });
    toast.error(message);
    return message;
  }
  useEffect(() => {
    knownRoots().then(setRoots).catch(fail);
  }, []);
  async function refresh(target = active.current.disk) {
    if (!target) return;
    const next = await scan(target);
    if (active.current.disk === target) setProjects(next);
    return next;
  }
  function showExternal(value: ExternalConflict | null) {
    externalRef.current = value;
    setExternal(value);
  }
  function clearSelection() {
    active.current = {
      ...active.current,
      notePath: null,
      snapshot: null,
      text: "",
      dirty: false,
    };
    setNotePath(null);
    setSnapshot(null);
    setText("");
    setDirty(false);
    setRecovery(null);
  }
  async function checkExternal() {
    const current = active.current;
    if (
      !current.disk ||
      !current.notePath ||
      !current.snapshot ||
      savingRef.current ||
      externalRef.current
    )
      return;
    try {
      const fresh = await readNote(current.disk, current.notePath);
      if (fresh.hash === current.snapshot.hash) return;
      const latest = active.current;
      if (
        latest.notePath !== current.notePath ||
        latest.disk !== current.disk ||
        savingRef.current ||
        latest.snapshot?.hash !== current.snapshot.hash
      )
        return;
      if (latest.dirty) {
        showExternal({
          base: latest.snapshot,
          local: latest.text,
          remote: fresh,
          path: current.notePath,
        });
        log("WARN", "files", "检测到外部修改，等待合并", {
          path: current.notePath,
        });
        return;
      }
      setSnapshot(fresh);
      setText(fresh.text);
      active.current = { ...latest, snapshot: fresh, text: fresh.text };
      log("INFO", "files", "已载入外部文件修改", { path: current.notePath });
    } catch (e) {
      const latest = active.current;
      if (latest.notePath !== current.notePath || latest.disk !== current.disk)
        return;
      if (missing(e)) {
        if (latest.dirty && latest.snapshot)
          showExternal({
            base: latest.snapshot,
            local: latest.text,
            remote: null,
            path: current.notePath,
          });
        else {
          clearSelection();
          await refresh();
          log("INFO", "files", "已载入外部文件删除", {
            path: current.notePath,
          });
        }
      } else
        setError(
          "当前文档无法读取，草稿仍保留：" +
            (e instanceof Error ? e.message : String(e)),
        );
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void checkExternal();
    }, 2000);
    const scanTimer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 15000);
    return () => {
      clearInterval(timer);
      clearInterval(scanTimer);
    };
  }, []);
  function updateText(value: string) {
    const current = active.current;
    if (!current.disk || !current.notePath) return;
    setText(value);
    setDirty(value !== current.snapshot?.text);
    active.current = {
      ...current,
      text: value,
      dirty: value !== current.snapshot?.text,
    };
    void localDraft(current.disk, current.notePath, value).catch(fail);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveNow().catch(fail);
    }, 800);
  }
  async function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    await writeQueue.current.catch(() => {});
    const current = active.current;
    if (
      !current.disk ||
      !current.notePath ||
      !current.snapshot ||
      !current.dirty
    )
      return;
    if (externalRef.current) throw new Error("请先处理外部修改冲突");
    const work = writeQueue.current
      .catch(() => {})
      .then(async () => {
        const latest = active.current;
        if (latest.notePath !== current.notePath || !latest.dirty) return;
        savingRef.current = true;
        setSaving(true);
        try {
          const next = await writeNote(
            current.disk!,
            current.notePath!,
            current.text,
            latest.snapshot!.hash,
          );
          if (active.current.notePath === current.notePath) {
            const stillDirty = active.current.text !== next.text;
            active.current = {
              ...active.current,
              snapshot: next,
              dirty: stillDirty,
            };
            setSnapshot(next);
            setDirty(stillDirty);
            if (!stillDirty) await clearDraft(current.disk!, current.notePath!);
          }
          setError("");
        } catch (e) {
          if (
            String(e).includes("FileChangedError") ||
            (e instanceof Error && e.name === "FileChangedError") ||
            missing(e)
          ) {
            let remote: Snapshot | null;
            try {
              remote = await readNote(current.disk!, current.notePath!);
            } catch (readError) {
              if (!missing(readError)) throw readError;
              remote = null;
            }
            showExternal({
              base: current.snapshot!,
              local: active.current.text,
              remote,
              path: current.notePath!,
            });
          }
          throw e;
        } finally {
          savingRef.current = false;
          setSaving(false);
        }
      });
    writeQueue.current = work;
    await work;
    if (
      active.current.notePath === current.notePath &&
      active.current.disk === current.disk &&
      active.current.dirty
    )
      await saveNow();
  }
  async function activate(target: Disk) {
    await saveNow();
    await target.permission();
    setBusy(true);
    try {
      const next = await scan(target);
      setDisk(target);
      active.current = {
        disk: target,
        notePath: null,
        snapshot: null,
        text: "",
        dirty: false,
      };
      setProjects(next);
      setProjectPath(null);
      setNotePath(null);
      setSnapshot(null);
      setText("");
      setDirty(false);
      setRecovery(null);
      setExternal(null);
      setError("");
      setRoots(await knownRoots());
    } finally {
      setBusy(false);
    }
  }
  async function choose(name?: string) {
    setBusy(true);
    try {
      const target = await selectRoot(name);
      if (target) await activate(target);
      return !!target;
    } finally {
      setBusy(false);
    }
  }
  async function reopen(root: Root) {
    await activate(await reopenRoot(root));
  }
  async function openNote(path: string) {
    await saveNow();
    const current = active.current.disk;
    if (!current) return;
    const next = await readNote(current, path);
    active.current = {
      disk: current,
      notePath: path,
      snapshot: next,
      text: next.text,
      dirty: false,
    };
    setNotePath(path);
    setSnapshot(next);
    setText(next.text);
    setDirty(false);
    setExternal(null);
    setError("");
    const saved = await draft(current, path);
    setRecovery(saved && saved.text !== next.text ? saved : null);
  }
  async function openProject(value: Project) {
    await saveNow();
    setProjectPath(value.path);
    if (value.notes[0]) await openNote(value.notes[0].path);
    else {
      active.current = {
        ...active.current,
        notePath: null,
        snapshot: null,
        text: "",
        dirty: false,
      };
      setNotePath(null);
      setSnapshot(null);
      setText("");
      setDirty(false);
      setRecovery(null);
    }
  }
  async function addProject(name: string) {
    if (!disk) return;
    await mkdirProject(disk, name);
    await disconnectProject(disk, name.trim().normalize("NFC"));
    await refresh();
    return name.trim();
  }
  async function addNote(name: string, folder = "") {
    if (!disk || projectPath === null) return;
    const path = await newNote(disk, projectPath, name, folder);
    await refresh();
    await openNote(path);
  }
  async function rename(name: string) {
    await saveNow();
    const current = active.current;
    if (!current.disk || !current.notePath || !current.snapshot) return;
    const path = await renameNote(
      current.disk,
      current.notePath,
      name,
      current.snapshot.hash,
    );
    await refresh();
    await openNote(path);
  }
  async function remove() {
    await saveNow();
    const current = active.current;
    if (!current.disk || !current.notePath || !current.snapshot) return;
    await trash(current.disk, current.notePath, current.snapshot.hash);
    active.current = {
      ...current,
      notePath: null,
      snapshot: null,
      text: "",
      dirty: false,
    };
    setNotePath(null);
    setSnapshot(null);
    setText("");
    await refresh();
  }
  async function renameProject(name: string) {
    await saveNow();
    const current = active.current;
    if (!current.disk || !project || project.virtual) return;
    const target = filename(name),
      old = project.path;
    if (target === old) return;
    await current.disk.moveDirectory(old, target);
    await migrateProjectBinding(current.disk, old, target);
    await refresh();
    setProjectPath(target);
    if (current.notePath)
      await openNote(target + current.notePath.slice(old.length));
  }
  async function removeProject() {
    await saveNow();
    const current = active.current;
    if (!current.disk || !project || project.virtual) return;
    await trashProject(current.disk, project.path);
    await disconnectProject(current.disk, project.path);
    active.current = {
      ...current,
      notePath: null,
      snapshot: null,
      text: "",
      dirty: false,
    };
    setProjectPath(null);
    setNotePath(null);
    setSnapshot(null);
    setText("");
    await refresh();
  }
  async function back() {
    await saveNow();
    setProjectPath(null);
    setNotePath(null);
    setSnapshot(null);
    setText("");
    active.current = {
      ...active.current,
      notePath: null,
      snapshot: null,
      text: "",
      dirty: false,
    };
  }
  async function close() {
    await back();
    setDisk(null);
    setProjects([]);
    active.current = { ...active.current, disk: null };
  }
  async function recover(use: boolean) {
    if (use && recovery) updateText(recovery.text);
    else if (disk && notePath) await clearDraft(disk, notePath);
    setRecovery(null);
  }
  async function resolveExternal(
    choice: "local" | "remote" | "merge",
    merged?: string,
  ) {
    const conflict = externalRef.current,
      current = active.current;
    if (!conflict || !current.disk) return;
    const disk = current.disk;
    let remote: Snapshot | null;
    try {
      remote = await readNote(disk, conflict.path);
    } catch (e) {
      if (!missing(e)) throw e;
      remote = null;
    }
    if ((remote?.hash ?? null) !== (conflict.remote?.hash ?? null)) {
      showExternal({ ...conflict, local: current.text, remote });
      throw new Error("磁盘版本再次更新，已刷新对比，请检查后重试");
    }
    const backup = ".kbase/conflicts/" + crypto.randomUUID();
    await disk.write(backup + "/local.md", utf8.encode(current.text), null);
    if (remote)
      await disk.write(backup + "/external.md", utf8.encode(remote.text), null);
    if (choice === "remote" && !remote) {
      await clearDraft(disk, conflict.path);
      clearSelection();
      showExternal(null);
      setError("");
      await refresh();
      return;
    }
    const value =
      choice === "remote"
        ? remote!
        : remote
          ? await writeNote(
              disk,
              conflict.path,
              choice === "merge" ? (merged ?? current.text) : current.text,
              remote.hash,
            )
          : {
              text:
                choice === "merge" ? (merged ?? current.text) : current.text,
              hash: "",
            };
    if (!remote) {
      const bytes = utf8.encode(value.text);
      await disk.write(conflict.path, bytes, null);
      value.hash = await digest(bytes);
    }
    active.current = {
      ...current,
      text: value.text,
      snapshot: value,
      dirty: false,
    };
    setText(value.text);
    setSnapshot(value);
    setDirty(false);
    showExternal(null);
    setError("");
    await clearDraft(disk, conflict.path);
    await refresh();
    log("INFO", "files", "外部修改已处理，双方备份保留", {
      path: conflict.path,
    });
  }
  async function discardAndBack() {
    if (timer.current) clearTimeout(timer.current);
    await writeQueue.current.catch(() => {});
    const current = active.current;
    if (current.disk && current.notePath)
      await clearDraft(current.disk, current.notePath).catch(() =>
        log("WARN", "files", "恢复草稿清理未完成"),
      );
    clearSelection();
    showExternal(null);
    setProjectPath(null);
    setError("");
  }
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (active.current.dirty || savingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri())
      getCurrentWindow()
        .onCloseRequested(async (e) => {
          if (active.current.dirty || savingRef.current) {
            e.preventDefault();
            try {
              await saveNow();
              await getCurrentWindow().destroy();
            } catch (error) {
              fail(error);
            }
          }
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        });
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", handler);
      unlisten?.();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return {
    roots,
    disk,
    projects,
    project,
    note,
    projectPath,
    notePath,
    snapshot,
    text,
    busy,
    dirty,
    saving,
    error,
    external,
    recovery,
    fail,
    choose,
    reopen,
    refresh,
    openProject,
    openNote,
    addProject,
    addNote,
    rename,
    remove,
    back,
    close,
    updateText,
    saveNow,
    checkExternal,
    recover,
    resolveExternal,
    discardAndBack,
    renameProject,
    removeProject,
  };
}
