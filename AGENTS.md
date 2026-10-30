# KBase — agent instructions

Local-files-first personal knowledge base: a user-selected OS folder is the root library, subfolders are projects, and documents are plain UTF-8 `.md` files that agents/editors can read and write directly. React 19 + TypeScript + Vite frontend with Tiptap 3 editor, Tauri 2 (Rust) desktop shell, and an optional Node.js 24 + SQLite sync server. **macOS is the first delivery platform**; Windows/Linux deferred, Android later. Project language (README, docs, UI) is Chinese — keep it that way.

## Layout

- `web/` — frontend (`kbase-ui`). `src/core/` is the real logic (fs, library, sync, db, markdown, use-workspace); `src/components/ui/` is official shadcn/ui (new-york style, Tailwind 4, lucide icons — see `web/SHADCN-SOURCE.md`); `src/lib/` small utilities; `src/documents.json` is the bundled welcome/demo content.
- `web/src-tauri/` — Rust desktop backend (`desktop.rs`, `files.rs`). Security-critical: only folder roots registered via the native picker are accepted; all relative paths checked; traversal and symlinks rejected.
- `server/` — sync server (`@kbase/sync-server`), plain ESM `.mjs`, no framework, `node --test` for tests. Reads `../.env` at startup.
- `docs/` — `ARCHITECTURE.md` (sync protocol + HTTP API, read before touching sync/auth), `MACOS.md`, `VALIDATION.md`.
- `design/`, `prototype/` — historical UI prototypes only, NOT the real app; don't build on them.
- `scripts/build-macos.mjs` — universal macOS DMG build (must run on a Mac).

## Commands (from repo root; npm >= Node 24)

```sh
npm ci --prefix web            # install (no root node_modules; deps live in web/)
npm run dev                    # web dev server, port 4174, --strictPort
npm test                       # web vitest + server node --test
npm run build                  # web: tsc -b && vite build
npm run sync                   # run sync server directly (reads .env)
npm run desktop                # tauri dev (requires Rust stable + Xcode CLT)
npm run desktop:build          # tauri build
npm run desktop:mac            # universal Apple Silicon + Intel DMG

cargo test --manifest-path web/src-tauri/Cargo.toml --locked --no-default-features
```

E2E (browser, real File System Access / OPFS): `cd web && npx playwright install chromium && npm run test:e2e`.

Manual `cargo build --release` for a shippable desktop binary needs `--features custom-protocol`.

## Architecture rules

- **Local files are authoritative.** IndexedDB holds only auxiliary state (directory handles, sync baselines, recovery drafts) — never document content. The user's library contains a hidden `.kbase/` (`history/`, `trash/`, `conflicts/`).
- Writes are atomic (same-dir temp + rename) with SHA-256 expected-hash checks; previous content goes to `.kbase/history/`. External/agent edits are detected; dirty documents go to conflict resolution — both byte versions are kept, and resolution re-verifies hashes. **Never resolve conflicts by timestamp.**
- Extended Markdown (YAML front matter, footnotes, raw HTML) falls back to source-edit mode; unedited documents must never be auto-rewritten/re-serialized.
- `web/src/core/fs.ts` is the single adapter layer (Tauri IPC vs browser File System Access) — all file access goes through it.
- Sync: per-file `{revision, hash}` baselines, operation UUIDs for idempotency, NFC paths remotely, tombstones for deletes, case-only renames rejected (case-insensitive volumes). HTTP API surface is listed in `docs/ARCHITECTURE.md`.
- Logging must never record document bodies, the admin password, or login tokens.

## Conventions

- Web imports use the `@/` alias → `web/src` (Vite alias + tsconfig paths). New UI goes through existing shadcn components in `src/components/ui/` before adding dependencies.
- Server code stays dependency-light plain ESM `.mjs` with `node:` builtins; tests in `server/test/*.test.mjs` run on `node --test`.
- `.env` is gitignored; `KBASE_ADMIN_PASSWORD` must be ≥12 chars; never commit it. CORS origins are explicitly listed via `KBASE_ALLOWED_ORIGINS` — dev on port 4174 must be allow-listed.

## Gotchas

- Stop the Vite dev server (port 4174) before `npm run desktop` — it conflicts.
- Browser dev build requires Chromium's File System Access API (localhost/HTTPS secure context); there is deliberately no in-memory storage fallback.
- Docker compose binds only 127.0.0.1 (sync :8787, web :8080); public exposure requires the `https` profile (Caddy) and HTTPS — plaintext HTTP is client-allowed only for loopback.
- CI (`.github/workflows/desktop.yml`) runs the full verify chain then builds unsigned macOS binaries; macOS packages have not been built/signed on real hardware yet.
