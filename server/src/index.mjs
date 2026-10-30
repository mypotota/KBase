import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { Store } from "./store.mjs";
import { createApi } from "./http.mjs";
import { createLogger } from "./logger.mjs";
process.umask(0o077);
const directory = resolve(process.env.KBASE_DATA_DIR || "./data");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const log = createLogger(join(directory, "logs/server.jsonl")),
  store = new Store(
    join(directory, "sync.sqlite"),
    process.env.KBASE_ADMIN_PASSWORD,
  );
const origins = (
  process.env.KBASE_ALLOWED_ORIGINS ||
  "tauri://localhost,http://tauri.localhost,https://tauri.localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const server = createApi(store, { log, allowedOrigins: origins }),
  port = Number(process.env.PORT || 8787);
server.listen(port, process.env.HOST || "0.0.0.0", () =>
  log("info", "server.started", { code: "READY" }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });
