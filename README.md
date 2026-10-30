# KBase

本地文件优先的个人知识库：选择真实文件夹作为根知识库，子文件夹作为项目，文档直接保存为 **UTF-8 `.md` 文件**。Agent、VS Code、Git 和其他 Markdown 工具可直接按路径读写，无需经过 KBase 数据库或导出步骤。

界面沿用确认的紧凑黑白布局，使用官方 shadcn/ui 组件。客户端采用 React + TypeScript + Tauri 2，编辑器采用 Tiptap 3 + Markdown 扩展。同步服务采用 Node.js 24 + SQLite，可用 Docker 自建。

## 当前实现

- 系统文件夹选择、真实项目目录、扫描已有 Markdown 与嵌套子目录；根目录文档原位显示在“未归档”。
- 标准 Markdown 块编辑、源码编辑、标题、列表、任务、引用、表格、代码、链接与图片引用。粘贴 PNG/JPEG/GIF/WebP 图片会生成项目内的相对路径附件。
- 停止输入约 800ms 自动落盘；Ctrl/Cmd + S 立即保存。桌面端使用原子替换，写入前比较 SHA-256，旧文本保留在 `.kbase/history/`。
- 检测 Agent / 外部编辑器的修改。干净文档自动刷新；同时修改时保留双方内容，展示合并界面，防止旧编辑覆盖新文件。
- 重命名文档、文档回收站与恢复；桌面端支持项目整体重命名、项目回收站与完整恢复。
- 按项目选择同步；未连接的项目只留本地。支持鉴权、远端项目绑定、附件、版本备份、删除记录、多设备冲突与手动合并。
- 前台定期检查所有已启用且服务器已登录的项目；保存、恢复前台和恢复网络时继续同步。任务失败后可手动重试或等待下一轮检查。
- 持久化诊断日志与导出。日志不记录正文、管理员密码或登录令牌。

## 首个交付平台：macOS

当前优先完成 macOS，Windows/Linux 延后验收，Android 在桌面版之后适配。Mac 版本保留真实文件夹与 UTF-8 `.md` 读写，不需要启动同步服务。

Mac 上安装 Node.js 24、Rust stable 和 Xcode Command Line Tools 后：

```sh
xcode-select --install
npm ci --prefix web
npm run desktop      # 开发运行
npm run desktop:mac  # 构建 Apple Silicon + Intel 通用 DMG
```

构建产物在 `web/src-tauri/target/universal-apple-darwin/release/bundle/`。详细安装、权限和实机验收见 [macOS 说明](docs/MACOS.md)。GitHub Actions 优先生成 `KBase-macOS-universal-unsigned` 下载包；当前云环境为 Linux，尚未实际生成或验证 macOS 安装包。

## 本地运行

需要 Node.js 24 或更新版本。

```sh
npm ci --prefix web
npm run dev
```

浏览器开发版使用 Chromium 的 File System Access API 打开真实文件夹，需要 localhost 或 HTTPS。其他浏览器如不支持目录 API，会明确提示使用桌面应用，不会退回模拟存储。

桌面版还需要 Rust stable 和平台依赖：

```sh
npm run desktop
```

Linux（Debian / Ubuntu）的系统依赖：

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev patchelf build-essential
```

若已启动 Web 开发服务，请先停止占用 4174 端口的 Vite，再启动桌面开发模式。安装包版本不依赖开发服务器。

Windows 需要 Visual Studio C++ Build Tools 和 WebView2；macOS 需要 Xcode Command Line Tools。各平台构建命令相同：

```sh
npm run desktop:build
```

构建结果在 `web/src-tauri/target/release/bundle/`。仓库包含 Windows/macOS/Linux 的 GitHub Actions 构建工作流；工作流尚未在远端运行，Windows/macOS 安装包尚未在对应系统验证。Android 按确认的顺序留到桌面版之后，当前没有 Android 可安装版本。

## 自建同步服务

本地文档管理不需要服务器、账号或网络。只有启用某个项目同步时才需要此服务。

```sh
cp .env.example .env
```

在 `.env` 中安全设置 `KBASE_ADMIN_PASSWORD`（至少 12 个字符），不要提交该文件。然后：

```sh
docker compose up -d --build
```

默认仅绑定服务器本机：Web 客户端在 8080 端口，同步接口在 8787 端口。Web 客户端可将服务器地址设为 `http://localhost:8080/api`；桌面客户端在同机开发时可连接 `http://localhost:8787`。

公开部署必须通过 HTTPS。配置 `.env` 中的域名与 `KBASE_ALLOWED_ORIGINS`，加入实际 Web 客户端的完整 HTTPS origin，再运行：

```sh
docker compose --profile https up -d --build
```

Caddy 负责 HTTPS；需要可解析到服务器的域名和 80/443 端口。这里没有替用户部署公网服务或验证域名证书。

也可直接运行后端：

```sh
# .env 由 server 的启动脚本读取；开发时将 4174 的完整 origin 加入允许列表。
npm run sync
```

项目内“同步”面板中输入地址与管理员密码登录，再新建或选择远端项目并连接。登录令牌只保留在内存，重启后需重新登录；密码不会写进知识库。所有已登录的设备属于同一位用户。

同步数据和历史版本保存在 Docker 的 `sync-data` 卷中。备份时应先停止 sync 服务，再备份整个数据卷；不要只拷贝正在使用的 SQLite 主文件而丢弃 WAL。

## 数据与文件

```text
你选择的知识库/
├── 产品设计/
│   ├── 说明.md
│   ├── 草稿/下一步.md
│   └── attachments/图片.png
├── 技术札记/
├── 根目录笔记.md
└── .kbase/
    ├── history/       # 以前的真实文档内容
    ├── trash/         # 回收站，包含路径元数据
    └── conflicts/     # 双方冲突快照
```

桌面根目录授权记录保存在系统应用数据目录，浏览器目录句柄、同步基线和恢复草稿保存在 IndexedDB。**IndexedDB 只存辅助状态和恢复草稿，正式文档始终是所选目录里的 `.md` 文件。** 清除应用缓存不会删除已落盘的文档，但会丢失目录授权、同步基线和回收站索引；隐藏目录中的原文仍可由 Agent 直接恢复。

## 验证

```sh
npm test
npm run build
cargo test --manifest-path web/src-tauri/Cargo.toml --locked --no-default-features
```

测试覆盖真实 Markdown 字节、外部修改保护、原子写入、路径越界和符号链接、目录整体恢复、Markdown 编辑器反馈循环、常见 Markdown 语法、多设备离线冲突、二进制附件、删除与恢复、大小写冲突、Unicode 文件名、鉴权、设备撤销、幂等请求及服务重启持久性。

浏览器端到端验证使用真实 File System Access API（自动化用 OPFS 句柄代替无法操作的系统选择框），检查磁盘写入、重开、外部修改合并、回收站和真实 HTTP 同步。原生 Rust 测试使用操作系统临时目录和标准文件读写，验证文件确实可从应用外直接读取。

## 当前边界

- 扩展 Markdown（例如 YAML front matter、脚注、原始 HTML）自动使用源码编辑，保留原文；未编辑的文档不会被编辑器自动重写。
- 文档编辑上限 5 MB，同步单文件上限 20 MB；图片粘贴支持 PNG/JPEG/GIF/WebP。其他附件可由 Agent 放入项目并参与同步。
- 文件同步基于内容哈希和版本号，目录自身不作为同步对象，空目录不会传输。项目名称可以在不同设备上不同；在本机整体回收项目时，远端项目及历史保留，不自动删除其他设备的整个项目。
- 项目文件夹整体移动/回收仅在桌面端提供；浏览器的文件夹接口不支持安全原子移动整个目录。
- 回收站和历史暂不自动清理，以保留可恢复性。更改文件名后，不自动批量改写其他 Markdown 内的引用链接。
- 当前为首个开发版本，尚未进行 Windows/macOS 实机验证或代码签名。历史 UI 原型保存在 `prototype/` 和 `design/`，它们不是正式应用的数据存储方式。

官方组件来源与许可证见 `web/SHADCN-SOURCE.md`、`web/SHADCN-LICENSE`。同步协议与架构见 `docs/ARCHITECTURE.md`。

## 浏览器端到端测试

```sh
cd web
npx playwright install chromium
npm run test:e2e
```

测试会启动本地开发服务与仅用于测试的同步服务；不读取生产密码。详细验证结果与 Linux 原生桌面截图见 `docs/VALIDATION.md`。

手工使用 Cargo 构建可发布的桌面二进制时，必须启用生产资源开关：

```sh
cargo build --manifest-path web/src-tauri/Cargo.toml --release --features custom-protocol
```

本次 Linux 开发包位于 `dist-desktop/`。它使用 Debian 12 / glibc 2.36 构建，适用于更新后的 Debian 12、Ubuntu 24.04 x86_64；可通过 `sudo apt install ./kbase_0.1.0_amd64.deb` 安装。Windows/macOS 请在对应系统通过 Tauri 构建。
