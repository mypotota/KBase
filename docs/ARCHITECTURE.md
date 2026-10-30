# KBase application architecture

## Local files are authoritative

The selected operating-system folder contains project subdirectories and ordinary UTF-8 Markdown. The desktop backend accepts only root IDs registered through the native folder picker. Every relative path is checked; traversal and symlinks are rejected. Writes use a same-directory temporary file and atomic replacement, with an expected SHA-256 and a retained previous version.

`web/src/core/fs.ts` exposes the same interface for Tauri and browser directory handles. `library.ts` scans projects, reads/writes Markdown, renames files and manages physical trash. `use-workspace.ts` coordinates autosave, recovery drafts, external changes and navigation. IndexedDB is auxiliary state, never the authoritative document store.

The browser developer build requires a secure context and File System Access support. It asks for the actual directory, not a server-side path. The Tauri build uses native system dialogs and exposes full root paths, so local Agents can operate on the same files.

## Editing

Tiptap's Markdown extension supplies parsing and serialization for rich editing. Source mode bypasses serialization. Unsupported constructs are detected and displayed in a controlled source editor. Programmatic content loading and read-only changes explicitly disable update emission; only user changes schedule writes. Closing a dirty native window waits for save; an unsuccessful save preserves the draft and prevents closing.

A clean document loads external changes. A dirty document or failed expected-hash check enters conflict resolution. Both versions are saved under `.kbase/conflicts` before any overwrite. Resolution checks the current external hash again.

## Synchronization

Each local project can bind to one remote project. Bindings contain only server URL, remote ID and auto-sync preference. Server sessions remain in memory and can be revoked through the device API.

The client persists a baseline `{revision, hash}` for each relative file path. It scans files, fetches a manifest, compares both sides with the baseline and chooses upload, download, no-op or conflict. Deleted files remain remote tombstones. Identical content converges even when an upload response was lost. Each upload also includes an operation UUID for idempotency.

Simultaneous offline changes are never resolved using timestamps. Both raw byte versions are written to `.kbase/conflicts`, and the UI exposes explicit local/remote/manual merge choices. Resolution verifies the current local hash and current remote revision before proceeding. Remote replacement and deletion retain local history/trash.

Paths use NFC remotely. Locally decomposed names retain their real physical path. Case-only collisions are rejected before network mutation because Windows and common macOS volumes may be case-insensitive.

All enabled projects for logged-in servers are checked while the app is foregrounded. Saves and visibility/network recovery trigger further checks. Each active filesystem adapter serializes its writes; an individual project's sync cannot run twice concurrently. A failed operation leaves files and baselines on disk to be re-evaluated on the next attempt.

## HTTP API

- `GET /health`: readiness, no authentication.
- `POST /v1/session`: administrator password + device name; returns a random device token.
- `GET /v1/devices`, `DELETE /v1/devices/:id`: device listing/revocation.
- `GET|POST /v1/libraries`: remote projects (internal name is libraries).
- `GET /v1/libraries/:id/manifest`: latest metadata, including tombstones.
- `GET /v1/libraries/:id/file?path=...&revision=...`: current or immutable historical bytes.
- `PUT /v1/libraries/:id/file`: `{path, baseRevision, operationId, contentBase64}` or `deleted:true`.
- `GET /v1/libraries/:id/history?path=...`: the latest 100 historical records; older versions remain stored.

Stale versions return HTTP 409. Device tokens are random 256-bit values; only their SHA-256 is stored. Password comparison uses scrypt and constant-time comparison, login attempts are rate-limited, and origins are explicitly allowed. Request IDs correlate client diagnostics with JSONL server logs. Public deployments use HTTPS through Caddy; plaintext HTTP is allowed by the client only for loopback development addresses.

SQLite transactions commit the immutable version, current-file pointer and idempotent result together. Data lives in the Docker volume. This is a personal single-user service; multiple accounts and end-to-end encryption are outside this iteration.
