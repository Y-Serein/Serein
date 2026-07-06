# YS Writer Desktop 落地方案

## 当前定位

`examples/serein-prototype/` 是 HTML 单页交互验证版本。正式桌面版当前位于 `apps/serein-desktop/`，目标是本地优先的 Markdown 写作应用，并为后续 Card / Whiteboard / Tag 架构留出数据边界。

## 技术栈

- Desktop shell: Tauri 2
- Frontend: React + TypeScript + Vite
- Editor: Milkdown
- Data strategy: local-first, demo 阶段先用内存数据
- Future storage: local file system or embedded database, not implemented in this round

## 从原型保留的能力

- 写作编辑：从手写 `contenteditable` 迁移到 Milkdown。
- 标题：由 Milkdown CommonMark schema 支持。
- 列表：由 Milkdown CommonMark schema 支持，后续补快捷键策略。
- 撤销/重做：交给 ProseMirror/Milkdown 编辑器历史能力，应用层保留 toolbar 入口。
- 保存：本轮仅做 demo save state，后续接 Tauri 文件系统能力。
- 导出：本轮保留 toolbar 占位，后续实现 Markdown / HTML / PDF。
- 主题：先做 CSS 变量和主题语义，后续扩展主题包。
- 侧栏：正式版先做 Card / Document 列表。
- 大纲：本轮先做右侧 Outline 占位，后续从 Markdown AST 或 editor state 提取。

## 本轮不做

- 完整白板
- 拖拽
- 连线
- 云同步
- 插件系统
- 协作
- AI 功能
- 复杂文件系统工作区

## 工程边界

旧 HTML 原型保留为交互参考。正式工程不复用旧原型的手写 Markdown parser，不继续扩展 `examples/serein-prototype/`。

## 当前 npm 安装说明

当前仓库位于 WSL 的 Windows 9p/drvfs 挂载路径：

```text
C:\Serein_Y\Sipeed -> /home/slam/Sipeed
```

在该文件系统上，`npm install` 创建 bin links 时会对部分文件执行 `chmod`，已观察到 `EPERM: operation not permitted, chmod .../@babel/parser/bin/babel-parser.js`。

本工程当前使用：

```bash
npm install --no-bin-links
```

并在 `package.json` scripts 中直接调用 `node node_modules/...` 下的 JS 入口，避免依赖 `.bin` 可执行链接。

风险：

- 这不是标准 Node 项目默认形态。
- 新增工具依赖时，需要确认是否有 JS 入口可直接调用。
- 在 ext4 原生 Linux 路径下可以恢复标准脚本，例如 `vite`、`tsc`、`tauri`。

后续建议：

- 正式工程已迁到当前仓库的 `apps/serein-desktop/`；后续继续保持在 WSL ext4 路径下开发。
- 或修正 Windows 挂载权限策略后恢复普通 `npm install`。
- 不要修改全局 npm 配置来掩盖该问题。

## 当前 Tauri/Rust 验证说明

由于工程目录位于 WSL 的 9p/drvfs 挂载路径，Tauri build script 在默认 `src-tauri/target/` 下生成 permission manifest 时也会遇到 `Operation not permitted`。当前可验证命令为：

```bash
CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target cargo check
CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target npm run tauri:dev
```

这会把 Rust 构建产物放到 Linux 原生 `/tmp` 文件系统，避开 Windows 挂载权限问题。

后续建议：

- 正式开发时优先把整个工程迁移到 WSL ext4 路径。
- 如果继续放在 Windows 挂载路径，至少保持 `CARGO_TARGET_DIR` 指向 ext4/tmpfs。
- `src-tauri/Cargo.lock` 对桌面应用应保留，用于锁定 Tauri/Rust 依赖版本。

## Linux/WSL 系统依赖

Tauri 2 在 Linux/WSL 下编译桌面壳时会通过 `pkg-config` 查找系统库。官方 Ubuntu/Debian 依赖建议包括：

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

若出现：

```text
error: failed to run custom build command for `libdbus-sys`
No package 'dbus-1' found
The file `dbus-1.pc` needs to be installed
```

说明当前 Linux/WSL 环境缺少 D-Bus 开发包，不是前端或 Rust 业务代码错误。Ubuntu/WSL 可先补：

```bash
sudo apt install libdbus-1-dev pkg-config
```

如果继续出现：

```text
No package 'glib-2.0' found
No package 'gio-2.0' found
No package 'gobject-2.0' found
```

说明 GTK/WebKitGTK 开发依赖仍不完整。不要继续逐个猜 crate，应补齐 Tauri Linux 官方依赖，尤其是：

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

在 Ubuntu 22.04 Jammy 上，`libwebkit2gtk-4.1-dev` 位于 `universe` 仓库；若 apt 提示找不到包，先确认 `universe` 已启用。

验证命令：

```bash
pkg-config --modversion dbus-1
pkg-config --modversion glib-2.0
pkg-config --modversion gio-2.0
pkg-config --modversion gobject-2.0
CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target cargo check
```

如果桌面窗口中的中文显示为方框，通常是 WSL/Ubuntu 缺少 CJK 字体。当前 demo 数据包含中文 Markdown，因此建议安装：

```bash
sudo apt install fonts-noto-cjk
```

安装后重新启动 Tauri 应用。若只是终端日志中出现方框，多半是终端字体不支持 Vite/Tauri 输出里的 Unicode 符号，不影响应用编译；可以换终端字体或用更基础的终端主题。

## WSLg/MESA/EGL warning

在 WSLg 环境启动 Tauri 窗口时，可能看到：

```text
libEGL warning: failed to get driver name for fd -1
libEGL warning: MESA-LOADER: failed to retrieve device information
MESA: error: ZINK: failed to choose pdev
libEGL warning: egl: failed to create dri2 screen
```

只要桌面窗口可以正常启动和交互，本轮 P0 不把这些 WSLg 图形栈 warning 作为阻塞项处理。不要为了这些 warning 修改系统图形配置，也不要在应用里引入额外图形依赖。
