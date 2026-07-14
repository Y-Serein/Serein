# HANDOFF.md

最后更新：2026-07-14 13:56
当前分支：main（本轮架构重组已形成一个本地 commit；无 tag/push）
当前任务：Serein 实验 text-buffer 架构里程碑已收敛；继续做 Windows release、性能和剩余能力验收

## 当前在做什么

- 正式应用：`apps/serein-desktop/`；默认 Milkdown fallback 必须保留，text-buffer 仍是实验开关。
- 大纲：selection 归 CodeMirror，viewport 明确归外层 `.editor-surface`；使用 `lineBlockAt()` 计算目标并直接写外层 `scrollTop`，连续点击通过同一 measure key 保留最后一次滚动。
- Source gutter：稳定 decoration `StateField` + options facet；Rich/Source 切换不再重建不同 field。
- fence：正在键入的 ` ``` ` 是持久 pending 状态，保持可见、不与后方 closing fence 配对；按 Enter 才在当前位置插入 local closer。
- 快捷键设置：窄窗口下仍保持“命令 / 按键 / 启用 / 默认”单行，当前每行 40px。
- 代码块方向键：只在物理最后内容行按 `ArrowDown` 才进入语言控件，不再跳过尾部空行。
- Setext：单个 `-` 不再把上一行列表/普通文本误判成 H2；明确的多横线 Setext 仍保留。
- 用户明确要求：后续只用自建虚构文件测试，不读取、复制或操作其真实文档；不要操作 Windows 进程，除非用户单独授权。
- 本轮创建一个本地架构 commit；没有 tag，也没有 push。

## 已经试过的方案和结果（含失败的）

- v13/v14：`requestMeasure`、额外 `requestAnimationFrame`、延时大纲滚动无效，已删除；真正的 gutter 根因是切模式时创建不同 decoration `StateField`。
- v15 第一轮：把 `view.focus()` 移到 selection/scroll dispatch 前；Linux Chromium 通过，但用户 Windows 复测仍失败。该方案只改焦点顺序，没有解决滚动所有权，已被最终方案替代。
- v15 最终方向：`.cm-scroller { overflow: visible; }`，真实滚动条属于 `.editor-surface { overflow: auto; }`。不再用 `EditorView.scrollIntoView` 跨层滚动，直接控制外层 `scrollTop`。
- fence 复现：第三个反引号源码没有删除，而是 pending fence 被隐藏并压成 0 高度；若后面已有 fence，新 opener 会错误借用远端 closer，吞掉中间标题。
- fence 修法：`typedPendingFenceLines` 持久跟踪新输入 opener；pending 行不隐藏；Enter 本地闭合；普通同一行 InlineCode 不进入 fenced-code，深缩进多行兼容路径保留。
- 旧 Vite 5182 进程没有加载最新 text-buffer 模块，产生过“修复无效”的假反馈；换干净端口后失败反转。编辑器 UI 回归不要依赖长期 HMR。
- 清理：已删除因旧 HMR 假失败加入的“光标所在 fence 强制 pending”兜底，以及 `.editor-surface` 缺失时回退旧 `EditorView.scrollIntoView` 的死分支。删除后完整回归仍通过。

## 下一步计划（3-5条actionable)

1. 用户在 Windows PowerShell 运行 `.\scripts\build_windows.ps1 -SkipInstall`，安装最新 release；AI 不主动操作 Windows 进程。
2. 只用虚构文件复测大纲、pending fence、Rich/Source 切换、尾部空行 `ArrowDown` 和单横线 Setext。
3. 对长文档输入、selection 移动和换文件做性能剖析，确认全文 decoration 分析的真实耗时。
4. 补齐表格删除/对齐/最后行退出、Wiki link 候选/创建、目录链接 Vault 分流的最小闭环。
5. Windows 与性能通过后，再决定是否把 text-buffer 从实验开关提升为默认路径及是否发布新版本。

## 关键文件路径（相对路径，一行一个）

apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx
apps/serein-desktop/src/editor/textBufferMarkdown.ts
apps/serein-desktop/src/shared/markdown.ts
apps/serein-desktop/src/App.tsx
apps/serein-desktop/src/features/settings/SettingsDialog.tsx
apps/serein-desktop/src/styles.css
apps/serein-desktop/tests/text-buffer-markdown.test.mjs
out/outline-repro/duplicate-hierarchy.md
out/outline-repro/fence-heavy.md
out/outline-repro/rapid-outline.md
docs/images/v13.png
docs/images/v14.png
docs/images/v15.mp4
docs/runbooks/PROJECT_MEMORY.md
docs/runbooks/KNOWN_FAILURES.md
docs/runbooks/skills/serein-text-buffer-stability/SKILL.md

## 当前验证状态

- `npm run typecheck`：通过。
- `npm run test`：7/7 测试文件通过；text-buffer 39 个子测试通过。
- `npm run build`：最新构建通过，Vite 5.4.21，2850 modules，42.62 秒。
- `/tmp/serein_v15_outline_regression.cjs`：Rich/Source 各 12 次定点跳转；各 61 次快速点击；同名标题上下文正确；Source gutter 23 行最大 top 误差 0px；页面错误 0。
- `/tmp/serein_fence_repro.cjs`：文末 1/2/3 个反引号、标题上方 pending、后方既有 fence、Enter 本地闭合全部通过；页面错误 0。
- `/tmp/serein_pending_persistence.cjs`：光标离开后 opener 仍为 26px pending 行，标题仍为 H1，后方代码块独立。
- `/tmp/serein_shortcut_row.cjs`：1100px 下前 8 行均为单行 40px，四单元纵向中心误差 0px；页面错误 0。
- `/tmp/serein_code_arrowdown_verify.cjs`：第一次 `ArrowDown` 到物理最后空行，第二次才进入语言控件；页面错误 0。
- `/tmp/serein_v16_setext_repro.cjs`：单个 `-` 保持普通 16px 文本，上一行不再变 H2；页面错误 0。
- 清理两段冗余逻辑后，以上 fence/persistence/outline 回归重新冷启动通过。
- 未验证：包含最新改动的 Windows release `.exe`、Windows IME、真实 WebView2 连点、大文档切换性能。

## 还没搞清楚的问题

- Windows WebView2 是否完全消除大纲间歇性停在旧标题，仍需用户用虚构文件确认。
- text-buffer decoration 仍有全文分析路径，大文档/换文件性能风险未根治。
- 表格删除/对齐/最后行退出、Wiki link 候选与未解析创建、目录链接真实 Vault 分流仍未追平。
- text-buffer 仍是实验路径；默认 Milkdown fallback 不能删除，直到 Windows、性能和完整能力基线通过。
