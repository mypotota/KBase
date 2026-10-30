import { getRecord, setRecord } from "./db";
export type LogEntry = {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  module: string;
  event: string;
  fields: Record<string, string | number | boolean>;
};
const listeners = new Set<(logs: LogEntry[]) => void>();
let entries: LogEntry[] = [];
let pending = Promise.resolve();
const allowed = new Set([
  "path",
  "code",
  "requestId",
  "taskId",
  "durationMs",
  "count",
  "status",
  "operation",
  "bytes",
]);
export async function loadLogs() {
  entries = (await getRecord<LogEntry[]>("logs")) ?? [];
  return entries;
}
export function subscribeLogs(fn: (logs: LogEntry[]) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function log(
  level: LogEntry["level"],
  module: string,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const safe: LogEntry["fields"] = {};
  for (const [key, value] of Object.entries(fields)) {
    if (
      allowed.has(key) &&
      ["string", "number", "boolean"].includes(typeof value)
    )
      safe[key] =
        typeof value === "string"
          ? value.slice(0, 512)
          : (value as number | boolean);
  }
  const row = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    level,
    module,
    event,
    fields: safe,
  };
  entries = [row, ...entries].slice(0, 2000);
  for (const fn of listeners) fn([...entries]);
  const snapshot = [...entries];
  pending = pending.catch(() => {}).then(() => setRecord("logs", snapshot));
  pending.catch(() => {});
  return row.id;
}
export function errorCode(error: unknown) {
  return error instanceof Error
    ? error.name
    : typeof error === "string"
      ? error.split(":")[0]
      : "UNKNOWN";
}
export function diagnosticLogs() {
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), logs: entries },
    null,
    2,
  );
}
