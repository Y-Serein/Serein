# HANDOFF.md

最后更新：2026-05-26 10:15
当前分支：serein-vault
当前任务：Serein/Typora 桌面版进入内测，等待反馈后修 bug 和提升用户体验

## 当前在做什么

当前阶段已经从“能不能发”切换到“可以内测，等反馈后闭环修补”。

发布判定：

- 允许内测，不建议正式公开发布。
- Typora 写作体验优先级最高，Obsidian/Vault 功能第二优先但仍重要。
- 用户明确不能接受数据/链接问题，所以内测必须建议使用复制出来的 Vault，不要直接用唯一的重要文档。
- 用户有干净 Windows 机器，可做安装和 release `.exe` 回归。

当前可发内测包路径：

```text
D_deliverables\ys-writer-desktop\src-tauri\target\release\bundle\nsis\Serein_0.0.1_x64-setup.exe
```

推荐重新打包命令：

```powershell
.\T_tools\build_windows.ps1
```

说明：不加 `-SkipInstall` 是更稳的发包方式；`-SkipInstall` 只是依赖已经正确时的快速路径。

本轮新增复杂测试 Vault：

```text
D_deliverables/serein-complex-vault/
```

用户已用该复杂 Vault 测试全部通过。覆盖了写作、保存、wiki link、标题跳转、创建未解析目标、重复文件名歧义、图片 PDF 导出、中文路径、空格路径、目录链接等。

## 已经试过的方案和结果（含失败的）

- 已按项目规则运行 preflight；脚本仍硬编码 `/home/rv_nano/Sipeed`，在当前 `/home/slam/...` 环境会报告路径 missing，但命令退出成功。
- 已多次验证：`npm run test`、`npm run typecheck`、`npm run build`、`cargo check`、`git diff --check`。
- 既有 warning：`MilkdownEditor` chunk 超过 500 kB；`git diff --check` 会提示未改动 `LICENSE` CRLF。
- 用户此前反馈 PDF 导出失败、图片不导出、文字间距异常、图谱关不掉等问题；已经修完并由用户确认。
- 用户反馈 wiki link `[[A]]` 原来只是文本，不能跳转；已补 Rich Edit decoration、单击内部跳转、标题跳转。
- 用户反馈 `[[C# test|显示文字]]` 打开文件但不跳标题；已补 `# test|显示文字` 与 `test` 的锚点匹配。
- 用户反馈 `[[` 候选有时不显示或位置远；已改为 input 事件驱动、视口夹紧、portal 到 `document.body`。
- 用户反馈右侧搜索、左侧搜索、目录搜索重复；已删除右侧知识面板 Search tab，保留左侧搜索入口。
- 用户反馈右侧知识面板需要像图谱一样可开关；已加 ribbon 开关。
- 用户反馈窗口最大化/关闭迟钝；已修 Tauri capability 路径、close-request 自拦截、SVG 图标点击冒泡到标题栏拖拽的问题。
- 用户反馈窗口按钮仍有 0.5s 转圈；已去掉非必要 disabled/wait 光标，只保留内部 ref 防重复。
- 用户确认复杂 Vault 测试全部通过，当前进入等待内测反馈阶段。

## 下一步计划（3-5条actionable)

1. 用户用 `.\T_tools\build_windows.ps1` 重新打包最新版，发 1-3 个可信内测用户。
2. 内测用户必须先用复制出来的 Vault 测试，重点记录保存、导出、链接跳转、重命名、窗口关闭、安装卸载问题。
3. 收到反馈后按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环处理，先复现，再做最小修复。
4. 下一阶段主线：继续保护 Typora 写作体验；Obsidian 方向优先补移动文件/目录后的链接同步、图谱聚焦、索引增量化。
5. 正式发布前必须补：干净机安装矩阵、版本号递增、已知问题清单、数据备份/回滚策略、性能压力测试。

## 关键文件路径（相对路径，一行一个）

D_deliverables/ys-writer-desktop/src/App.tsx
D_deliverables/ys-writer-desktop/src/components/MilkdownEditor.tsx
D_deliverables/ys-writer-desktop/src/features/window-chrome/WindowChrome.tsx
D_deliverables/ys-writer-desktop/src/features/knowledge-rail/KnowledgeRail.tsx
D_deliverables/ys-writer-desktop/src/features/vault-sidebar/VaultSidebar.tsx
D_deliverables/ys-writer-desktop/src/shared/markdown.ts
D_deliverables/ys-writer-desktop/src/vault/index.ts
D_deliverables/ys-writer-desktop/src-tauri/src/commands.rs
D_deliverables/ys-writer-desktop/src-tauri/src/fs_ops.rs
D_deliverables/ys-writer-desktop/src-tauri/src/vault.rs
D_deliverables/serein-complex-vault/README.md
C_context/PROJECT_MEMORY.md
C_context/skills/serein-release-control/SKILL.md
T_tools/build_windows.ps1

## 当前验证状态

- 已运行：`npm run test`
- 结果：通过。
- 已运行：`npm run typecheck`
- 结果：通过。
- 已运行：`npm run build`
- 结果：通过；仍有既有 `MilkdownEditor` chunk 超过 500 kB 的 Vite warning。
- 已运行：`env CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target /home/slam/.cargo/bin/cargo check`
- 结果：通过。
- 已运行：`git diff --check`
- 结果：通过；仍有未改动 `LICENSE` 的 CRLF warning。
- 已运行：Playwright/Vite UI smoke，路径 `/?demoVault=obsidian`
- 结果：通过；确认 wiki 单击跳转、`[[` 候选浮层贴近光标、右侧面板/搜索收敛路径可用。
- 用户已手测：复杂 Vault 全部通过。
- 未验证：最新 commit 后的干净 Windows 机器安装；需要用户用 `.\T_tools\build_windows.ps1` 打包后验证。

## 还没搞清楚的问题

- 真实内测用户的大 Vault 下，全量索引、反链、未链接提及和图谱是否会慢。
- 移动文件/目录、外部文件系统改名后的链接同步还没完整闭环。
- 重命名链接同步目前是确认式批量更新，还没有 diff 预览和一键回滚。
- Rich Edit wiki link 使用 ProseMirror decoration，不是完整 Milkdown schema 节点；更深的标题候选、block reference 还没做。
- Windows SmartScreen 未签名提示仍存在，正式发布前需要代码签名。
