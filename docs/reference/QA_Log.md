## 2026-06-18｜快捷便签卡顿/卡死失败路径记录

### 原始问题
请把现在和之前出意外的改动都记录在案，以免再次还改成这样

### 答案核心
- 已将快捷便签和托盘退出相关事故集中记录到 `docs/runbooks/KNOWN_FAILURES.md`。
- 禁止恢复的失败方向包括：后台预热隐藏 quick note WebView、关闭便签后 hide 复用窗口、React ready 前提前显示空白 WebView、主窗口聚焦时跳过 `Alt+W`、托盘退出直接 `app.exit(0)`。
- 当前允许基线是：quick note 正常新建窗口；Rust 先 `visible(false)`；前端准备尺寸和位置后再 `show()`；`Alt+W` 不因主窗口聚焦被跳过；托盘退出通过前端确认流程保护未保存内容。
- 后续若继续优化 `Alt+W` 速度，必须先在 Windows release 包里计时定位，不要再用隐藏 WebView 预热作为默认方案。

### 相关引用
- docs/runbooks/KNOWN_FAILURES.md
- HANDOFF.md
- apps/serein-desktop/src-tauri/src/global_hotkey.rs
- apps/serein-desktop/src-tauri/src/lib.rs
- apps/serein-desktop/src/features/quick-note/QuickNoteWindow.tsx

### 备注
- 本条是事故沉淀，不代表 Windows release 已完成复测；最终体验仍以用户重新打包后的 `.exe` 为准。

## 2026-05-12｜Codex 全局 AGENTS 的可见性

### 原始问题
这份AGENTS是我启动codex你就看得到的吗

### 答案核心
- 当前会话里可以确认：`~/.codex/AGENTS.md` 文件可读，且其内容已经出现在本轮上下文规则中。
- 一般理解是：Codex 启动时会把可见的全局/项目规则注入到会话上下文，之后执行时按这些规则约束行为。
- 但具体加载机制取决于 Codex 版本、启动目录和配置；不能脱离当前环境保证所有启动方式都自动读取同一路径。
- 规则冲突时，应优先遵守更具体的仓库级 `AGENTS.md`，其次才是全局规则。

### 相关引用
- /home/slam/.codex/AGENTS.md
- AGENTS.md

### 备注
- 本结论基于当前会话实际可见文件和已注入上下文。

## 2026-05-12｜PowerShell 执行 ps1 脚本的两种写法

### 原始问题
powershell -ExecutionPolicy Bypass -File这一段做什么的，我记得只要.\scripts\build_windows.ps1 -SkipInstall即可

### 答案核心
- 如果已经在 Windows PowerShell 里，通常直接运行 `.\scripts\build_windows.ps1 -SkipInstall` 即可。
- `powershell -ExecutionPolicy Bypass -File ...` 会再启动一个 PowerShell 进程，并对这次执行临时使用 `Bypass` 执行策略。
- 这个长写法主要用于脚本被 Windows 执行策略拦截时的备用方案。
- 对当前打包任务，首选命令应是 `.\scripts\build_windows.ps1 -SkipInstall`；长写法只作为失败后的 fallback。

### 相关引用
- scripts/build_windows.ps1
- HANDOFF.md

### 备注
- 适用于 Windows PowerShell 下执行当前仓库的打包脚本。

## 2026-05-11｜Tauri 运行时为什么像有后端

### 原始问题
为什么运行伴随着一个后端，能不能不要

### 答案核心
- `npm run tauri:dev` 会同时启动 Vite dev server 和 Tauri/Rust 桌面壳，所以开发期看起来像“前端 + 后端”。
- 打包后的 `.exe` 不需要 Vite dev server，前端资源会被打进应用包里。
- Tauri 应用本身仍会有一个 Rust 主进程，它是桌面壳和系统 API 桥，不等同于网络后端服务。
- 如果只想测试启动速度和真实用户体验，应优先运行 release `.exe`，不要用 `tauri:dev` 判断最终体验。
- 完全不要 Rust/Tauri 主进程就不是 Tauri 架构，需要换成纯 Web/浏览器应用或其他桌面壳。

### 相关引用
- D_deliverables/ys-writer-desktop/package.json
- D_deliverables/ys-writer-desktop/src-tauri/tauri.conf.json
- D_deliverables/ys-writer-desktop/src-tauri/src/lib.rs

### 备注
- 适用于当前 Tauri 2 + Vite + React 工程。
