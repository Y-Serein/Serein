# Serein Desktop 发布审核

审核时间：2026-05-21
审核范围：`D_deliverables/ys-writer-desktop/` 当前工作区改动
审核结论：暂不建议发布

## 当前状态

- 当前代码可以通过 Linux/WSL 下的单测、TypeScript 构建和 Rust `cargo check`。
- 当前工作区存在大量未提交改动，包含 Vault、知识面板、命令面板、导出、图片导入、编辑器和 Rust 文件能力。
- 尚未完成 Tauri GUI 真实交互验证、Windows release `.exe` 打包验证和 Windows GUI 手测。

## 发布阻塞项

1. Windows 发布链路未验证。
   - README 仍写着下载和截图需要在 Windows GUI 验证后补充。
   - 未运行 `.\scripts\build_windows.ps1 -SkipInstall`，也没有验证 NSIS 安装包和 `serein-desktop.exe`。

2. Tauri 桌面壳关键交互未手测。
   - 本次浏览器冒烟只能证明 Vite 页面可渲染，不能覆盖 Tauri 文件对话框、系统打开、窗口控制、文件读写权限、安装包运行形态。
   - 新增的图片导入、HTML/PDF 导出、Vault 文件创建和链接跳转都依赖 Tauri 命令，必须在桌面壳里走真实用户路径。

3. 大 Vault 性能风险还没有实测。
   - Vault index 会递归扫描目录，最多读取 2000 个文本文件，每个文件上限 1MB。
   - 该设计能避免无限索引，但仍可能在真实大目录、慢磁盘或 Windows 文件系统上带来明显等待。

4. PDF 导出还不够稳定，不能当作已发布功能承诺。
   - 当前 PDF 由浏览器 `foreignObject` 渲染成整页 JPEG 后拼 PDF。
   - 这会导致文字不可选择、文件体积可能偏大、分页质量和跨平台 WebView 行为需要实测。

5. UI 完成度未达到正式发布标准。
   - 宽屏下可渲染，但右侧知识面板标签拥挤，中文标签出现生硬换行。
   - 窄窗口下存在横向溢出，右侧面板不可见；虽然这是桌面应用，但最小窗口体验仍需要约束或自适应。

## 非阻塞但应进入发布前修复列表

- `[[note#heading]]` 已解析 heading，但跳转仍主要打开文件，没有滚动到目标标题。
- `.obsidian/app.json` 的 `attachmentFolderPath` 已读取，但图片导入仍固定写入当前文档旁的 `assets/`。
- 未解析链接一键创建依赖父目录已存在，深层不存在目录不会递归创建。
- 前端主编排文件和样式文件已经过大，`App.tsx` 超过 2200 行、`styles.css` 超过 2600 行，后续维护风险升高。
- Vite build 仍有 `MilkdownEditor` chunk 超过 500 kB 的警告，首次进入 Rich Edit 的加载体验需要实测。

## 已验证

- `npm run test`：通过。
- `env CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target /home/slam/.cargo/bin/cargo check`：通过。
- `npm run build`：通过；仍有大 chunk 警告。
- `git diff --check`：通过；仅提示未改动 `LICENSE` 的 CRLF warning。
- Vite 浏览器冒烟：页面可渲染，截图输出到 `/tmp/serein-home.png` 和 `/tmp/serein-mobile.png`。

## 发布前建议顺序

1. 先在 Windows PowerShell 运行 `.\scripts\build_windows.ps1 -SkipInstall`，确认产物存在。
2. 用 release `.exe` 手测打开 Vault、打开/保存文件、图片导入、HTML/PDF 导出、链接跳转、命令面板、右侧知识面板。
3. 用真实大 Vault 做启动和索引耗时记录，确认卡顿是否可接受。
4. 修窄窗口和右侧知识面板视觉问题，至少保证最小窗口下无明显截断。
5. 补 release 截图、下载说明和手测记录后，再考虑发布。
