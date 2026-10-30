# Validation record — 0.1.0 development build

Validated on 2026-10-30. This is a first development version, not a claim of production readiness across all target operating systems.

## Automated checks

| Check | Outcome |
| --- | --- |
| Web/core Vitest suites | 15 tests passed across 3 files |
| Node.js synchronization service | 3 tests passed |
| Native Rust filesystem | 4 tests passed; no failures |
| TypeScript + Vite production build | Passed |
| Playwright local-files workflow | Passed, including real directory handles, nested Markdown writes, external edits/deletion, merge, trash, reopen and 390px layout |
| Playwright HTTP synchronization workflow | Passed, including real login, project binding, upload, concurrent offline versions and merge |
| Docker server and web image builds | Passed |
| Nginx static files / API reverse proxy / authentication | Passed |
| SQLite data after Docker container restart | Passed |
| Compose configuration validation | Passed |

The two Playwright workflows passed individually after a test polling correction for file recreation. The corrected filesystem test waits for the asynchronous write instead of treating a temporarily absent file as a failed save. No assertions were removed or disabled.

Run unit/integration tests with `npm test`. Run browser checks after installing a Playwright Chromium build:

```sh
cd web
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration starts a local Vite server and a test-only in-memory sync server. The fixture uses an isolated test password, binds to loopback, and does not read production credentials. In this cloud environment, checks used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` to reuse the available browser.

## Actual Linux desktop GUI and real operating-system files

The release binary was built with the **custom-protocol** feature, so it embeds its production frontend and does not require the Vite development server. A bare `cargo build --release` without that Tauri feature is not sufficient for packaging; the Docker builder now enables it explicitly. The standard `tauri build` command handles production mode automatically.

The binary was launched as an unprivileged test user using GTK/WebKit under Xvfb, without disabling the WebKit sandbox. The test used the real native system folder chooser, not a browser directory-picker substitute:

1. Created an operating-system directory with a project and a UTF-8 `.md` document from outside the app.
2. Selected that root through the GTK folder dialog.
3. Opened the discovered project and Markdown document in KBase.
4. Typed a new paragraph into the desktop editor and saved with Ctrl+S.
5. Read the physical file using a separate shell process and confirmed plain Markdown, including the original Chinese text and the new paragraph.
6. Confirmed a previous version exists under `.kbase/history/`.
7. Changed the physical file from outside KBase and confirmed the desktop editor automatically refreshed.

Screenshot: `docs/screenshots/linux-native-agent-refresh.png`.

The headless environment emitted an accessibility-bus warning because it has no accessibility service. The actual window rendered, the native picker returned a real path, IPC file operations completed, and the file round trip succeeded. This warning was not treated as a filesystem or editor failure.

## Artifact and platform scope

The local Linux binary was compiled on Debian 12 x86_64 (glibc 2.36). The generated `.deb` declares GTK/WebKit dependencies and is intended for an updated Debian 12 or Ubuntu 24.04 x86_64 system. Its structure and file permissions were checked with `dpkg-deb`. It has not been installed onto the read-only host OS during this task.

Windows and macOS source paths and CI build jobs are present, but their installers and runtime behavior have not been tested on those operating systems. Android native directory authorization and application packaging remain a later phase, as requested. No public deployment or certificate issuance has been performed.
