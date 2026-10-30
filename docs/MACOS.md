# macOS 首版

macOS 是当前首个交付和验收平台。目标为 macOS 11 或更新版本，提供兼容 Apple Silicon（M 系列）与 Intel 的 Universal 应用。系统最低版本是构建目标，实际兼容性仍需实机验证。

## 开发与打包

需要 Node.js 24、Rust stable（通过 rustup 安装）及 Xcode Command Line Tools。

```sh
xcode-select --install
npm ci --prefix web
npm run desktop
```

构建独立安装包，不需要本地开发服务器：

```sh
npm run desktop:mac
```

脚本检查 macOS 和编译器、安装两个架构的 Rust 目标，再调用 Tauri Universal 构建。产物为 `web/src-tauri/target/universal-apple-darwin/release/bundle/dmg/` 下的 `.dmg`，校验值保存在上一级 `SHA256SUMS.txt`。在 bundle 目录运行 `shasum -a 256 -c SHA256SUMS.txt` 可检查完整性。

GitHub Actions 的 `macos` 任务在公共检查通过后执行相同构建，上传 `KBase-macOS-universal-unsigned`。Windows/Linux 只在手动触发工作流时继续构建。工作流配置不等于已经构建成功；需要实际远端执行后才能下载产物。

## 安装与文件

打开 DMG，将 KBase 拖入 Applications，再从 Applications 启动。首版尚未配置 Developer ID 签名和 Apple 公证；如果系统阻止首次打开，确认来源可信后，按系统提示在“系统设置 → 隐私与安全性”中允许打开。不同 macOS 版本的提示可能不同，不需要关闭 Gatekeeper 或 SIP。正式公开发布前需要补齐签名、公证和对应验证。

首次启动选择现有文件夹，或在选定位置新建知识库。选择器使用系统原生对话框，读写的是该位置真实的文件。建议初次验证使用本机普通文件夹；桌面、文稿、下载或外置卷可能触发系统文件访问授权，拒绝后需在系统设置中恢复相应权限。

项目是知识库的子文件夹，笔记是 UTF-8 `.md`。Agent 可以直接读写；应用检测外部变化，发生同时编辑时提供合并。⌘S 立即保存，⌘K 查找文档。授权根目录记录位于 `~/Library/Application Support/app.kbase.desktop/approved-roots.json`，它不存放正式笔记正文。

## 首版实机验收

- 首次安装、原生目录选择、退出重开后访问原目录。
- 创建项目、中文及 Unicode 文件名、块编辑与 Markdown 源码编辑、⌘S 保存。
- 用 Finder 和终端确认真实 `.md`；用 Agent 修改内容，检查自动刷新与同时编辑合并。
- 文档与项目的重命名、回收、恢复；关闭窗口时等待保存完成。
- 浅色/深色、紧凑布局、侧栏拖动、Retina 显示及中文输入法。
- 可选同步：连接 HTTPS 服务、项目单独启用、多设备冲突、网络恢复和日志导出。
- Apple Silicon 与 Intel 各验证一次，记录 macOS 版本；当前 Linux 云环境无法代替这些验证。
