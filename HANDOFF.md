# HANDOFF.md

最后更新：2026-05-29 15:11
当前分支：serein-vault
当前任务：Serein/Typora Rich Edit 代码块光标/选区偏移已修复，正在做交接沉淀

## 当前在做什么

用户在 Windows release `.exe` 中复现的核心问题已经修好：打开 `Sipeed\docs\Project_00_Serein.txt` 后，Rich Edit 代码块内删除、空格、回车、`Ctrl+X`、跨行选择都会出现像光标向前偏移一样的错误。最终根因不是剪贴板，也不是单个快捷键，而是该文件使用 CRLF 行尾；CodeMirror 代码块内部按 LF 计位，ProseMirror 文档保留 `\r\n` 时，第二行开始每行多出的 `\r` 会让 CodeMirror -> ProseMirror 的位置映射偏移。

当前修复策略：打开文件进入编辑器状态时统一把行尾规范成 LF；记录原文件行尾类型；保存时按原行尾写回。这样既消除编辑器坐标偏移，又不把用户原 CRLF 文件静默改成 LF。

用户已确认 Windows 新包复测通过：“可以了！！”

## 已经试过的方案和结果（含失败的）

- 已按项目规则读取 `AGENTS.md`、`HANDOFF.md`、`/home/slam/Sipeed/C_context/KNOWN_FAILURES.md`，运行 `python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora`。脚本能跑，但内部硬编码 `/home/rv_nano/Sipeed`，路径检查不可直接采信。
- 项目内未找到 `CLAUDE.md` 和 `C_context/KNOWN_FAILURES.md`；实际 known failures 在 `/home/slam/Sipeed/C_context/KNOWN_FAILURES.md`。
- 第一轮误判偏向 Windows WebView2 / DOM selection 和 CodeMirror selection 不同步，于是在 `sereinCodeBlockView.ts` 中拦截 `copy/cut`、增加 `Mod-c/Mod-x`，让剪切复制走 CodeMirror 内部 selection。该方案只能覆盖剪切表象，用户反馈 Windows 仍然不行。
- 后续重新分析“空格、回车、删除、剪切、跨行选择全部错”这一共同特征，判断是底层位置坐标系不一致，而不是剪贴板单点问题。
- 用 `file /home/slam/Sipeed/docs/Project_00_Serein.txt` 和字节统计确认目标文件是 CRLF：`crlf 9 lf 9 cr 9`。
- Vite dev server 上用 Playwright 探针验证 LF 路径正常：`ode` 剪切得到 `cx`，`c` 后空格得到 `c odex`，`c` 后回车得到 `c`/`odex` 两行。注意：浏览器 textarea 会规范 CRLF，所以旧探针不能完整复现 Windows 打开真实 CRLF 文件的偏移。
- 最终改动：
  - `src/vault/workspace.ts`：新增 `normalizeEditorLineEndings`、`detectLineEnding`、`applyLineEnding`；`createFileNote` 内部统一 LF，并记录原行尾。
  - `src/domain/model.ts`：`Note` 增加 `lineEnding?: "lf" | "crlf"`。
  - `src/App.tsx`：保存时按 `note.lineEnding` 写回；磁盘同步比较时先规范化行尾。
  - `tests/vault.test.mjs`：新增 CRLF 文件进入编辑器后 LF、保存时仍写回 CRLF 的单测。
- 已运行 `npm run test`：通过。
- 已运行 `node node_modules/typescript/lib/tsc.js --noEmit`：通过。
- 已运行 `npm run build`：通过；仍有既有 chunk > 500 kB warning。
- 已运行代码块交互探针：LF 路径通过。
- 用户 Windows `.exe` 新包复测通过。

## 下一步计划（3-5条actionable)

1. 保留本次 CRLF 修复，不要回退到只修 `Ctrl+X` / DOM selection 的思路；如果以后代码块再偏移，先检查输入文件行尾、不可见字符和 CodeMirror/ProseMirror 坐标映射。
2. 下次发 Windows 包前确认 Windows 源码已包含 `normalizeEditorLineEndings`，再执行 `.\T_tools\build_windows.ps1` 或 `.\T_tools\build_windows.ps1 -SkipInstall`。
3. 对真实 Windows `.txt/.md` 文件继续补一轮手测：CRLF 文件、LF 文件、含多行代码块、跨行选择、保存后重新打开。
4. 如果后续保存行为出现“整份文件变脏”或外部 diff 很大，优先检查行尾写回是否按原格式保持。
5. 若要进一步工程化，可把“打开真实 CRLF 文件 -> Rich Edit 代码块操作 -> 保存仍 CRLF”做成 Tauri/Windows 专项回归测试。

## 关键文件路径（相对路径，一行一个）

D_deliverables/ys-writer-desktop/src/vault/workspace.ts
D_deliverables/ys-writer-desktop/src/domain/model.ts
D_deliverables/ys-writer-desktop/src/App.tsx
D_deliverables/ys-writer-desktop/tests/vault.test.mjs
D_deliverables/ys-writer-desktop/src/components/sereinCodeBlockView.ts
D_deliverables/ys-writer-desktop/src/components/MilkdownEditor.tsx
D_deliverables/ys-writer-desktop/package.json
C_context/PROJECT_MEMORY.md
C_context/skills/serein-release-control/SKILL.md
HANDOFF.md

## 当前验证状态

- 已运行：`python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora`
- 结果：脚本执行成功，但路径硬编码旧根，路径检查不可直接采信。
- 已运行：`file /home/slam/Sipeed/docs/Project_00_Serein.txt`
- 结果：确认目标文件是 UTF-8 + CRLF。
- 已运行：`npm run test`
- 结果：通过，包含新增 CRLF 行尾单测。
- 已运行：`node node_modules/typescript/lib/tsc.js --noEmit`
- 结果：通过。
- 已运行：`npm run build`
- 结果：通过，存在既有 chunk size warning。
- 已运行：Vite dev server Playwright 代码块交互探针
- 结果：通过，覆盖 `Ctrl+X`、右键剪切、空格、回车的 LF 路径。
- 已验证：用户 Windows release `.exe` 复测通过。

## 还没搞清楚的问题

- 当前没有自动化覆盖 Windows Tauri 直接打开真实 CRLF 文件的完整链路；这次依赖用户 release 实测闭环确认。
- 工作区仍有大量既有未提交改动，后续提交时必须只纳入本次相关文件，不能混入无关功能和旧改动。
- `src/components/sereinCodeBlockView.ts` 当前是未跟踪文件但已被 `MilkdownEditor.tsx` 引用；提交/打包前要确认它确实进入版本控制或进入 Windows 源码目录。
