import {
  appendFileSync,
  existsSync,
  renameSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
export function createLogger(filename) {
  if (filename) mkdirSync(dirname(filename), { recursive: true });
  return (level, event, fields = {}) => {
    const safe = {};
    for (const key of [
      "requestId",
      "method",
      "route",
      "status",
      "durationMs",
      "deviceId",
      "code",
    ])
      if (fields[key] !== undefined) safe[key] = fields[key];
    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        event,
        ...safe,
      }) + "\n";
    if (filename) {
      if (existsSync(filename) && statSync(filename).size > 10 * 1024 * 1024) {
        for (let i = 4; i >= 1; i--)
          if (existsSync(filename + "." + i))
            renameSync(filename + "." + i, filename + "." + (i + 1));
        renameSync(filename, filename + ".1");
      }
      appendFileSync(filename, line, { mode: 0o600 });
    }
    process.stdout.write(line);
  };
}
