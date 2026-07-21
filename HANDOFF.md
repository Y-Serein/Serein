# HANDOFF.md

最后更新：2026-07-21 09:18
当前分支：`main`，HEAD `cb35856`（与 `origin/main` 同步）
当前任务：完成单一 CodeMirror 编辑器路线的表格交互/标准 Markdown 语义收敛，并保留数学公式 WIP；本轮只做交接与沉淀，未新增源码修改

## 当前在做什么

- 正式应用只看 `apps/serein-desktop/`。当前架构已收敛到单一 CodeMirror text-buffer：内容、selection、history、Rich/Source 表现、保存和结构 widget 都应以同一 Markdown buffer 为真相。
- 最近一轮表格 UI 已按用户确认的方向实现：
  - 左侧网格选择行列，悬停预览、单击确认，下方支持行/列数字输入；
  - 网格后是左对齐、居中、右对齐；
  - 右侧只保留 `⋯` 和删除；
  - 对齐按标准 Markdown 的“列”处理，只作用于当前表格和当前列，不引入多单元格选区模型；
  - 表格输入框、表头、数据格和 Markdown 分隔行应同步体现列对齐。
- 当前工作区还包含数学公式渲染、单编辑器架构清理、剪贴板/结构块/表格回归等未提交改动。不要用 `git add .`，不要把 `docs/images/`、构建产物或无关 WIP 带入提交。
- 旧 Milkdown/textarea 源码已从当前源码路径删除，但历史提交仍可回看；不要擅自恢复成第二套编辑器。

## 已确认的根因与重要判断

- Frontmatter 打开时出现两份，不是两个文件，也不是两个编辑器：同一个 CodeMirror buffer 同时显示上方可视化属性条和下方原始 YAML。初始 selection 在文档开头，现有 active 判定使原始 YAML 没有隐藏。
- 表格“语法树能识别、Rich 不能识别”的原因是两条解析路径：CodeMirror/Lezer 语法树是一条，Rich 实际使用的自定义扫描器是另一条。不能只修语法树；必须验证运行时扫描器、输入补全和 Markdown 写回。
- 标准 Markdown 表格对齐是按列写入分隔行 `:---`、`:---:`、`---:`，不是依赖复杂的多个单元格选区。用户明确要求保持简单，不实现表格多选区。
- 表格视觉不能只验证 DOM 有 `<table>`：必须同时检查 HTML 对齐、输入框 `text-align`、源码分隔行、当前表格边界和表格下方点击坐标。
- Rich 多行表格必须以覆盖完整 source range 的原子 widget 替换；不能“首行挂 widget、其余源码行逐行隐藏”，否则会留下幽灵行高和可点击的错误坐标。跨行 widget 不用外部 margin/padding 伪造可编辑间距，间距由真实 Markdown 空行承担。

## 已经验证的内容

- `npm run typecheck`：通过。
- `npm run test`：通过（当前相关结果为 7/7 测试文件）。
- `git diff --check`：通过。
- `npm run build`：此前完整构建通过一次；最后一次小幅输入体验调整后的重跑卡在 Vite `transforming`，没有拿到最终退出码，不能把它写成最终通过。
- 真实/虚构文档回归已覆盖：空代码块 Backspace、引用/列表连续 Enter、嵌套结构退出、Rich 表格源码幽灵行、表格编辑/增删/对齐写回、代码块局部拖选、隐藏 fence 剪切后继续输入、Tauri clipboard mock；页面错误为 0 的结果已取得。
- Playwright 后续回归曾被 Vite `504 Outdated Optimize Dep` 阻塞；`npm run preview` 不加载依赖 `import.meta.env.DEV` 的 demo Vault，因此不能直接替代开发态 UI 回归。

## 未完成与风险

- 需要在干净 Vite 端口重新验证最新表格工具栏：网格悬停/点击、数字输入、当前列对齐、`⋯` 菜单、删除、表格外点击和 Source 保真。
- 需要验证最小输入 `|·1|12|12|`（实际输入为管道分隔格式）以及分隔行/空白行自动补全，确认 Rich 自定义扫描器和 CodeMirror 语法树不再分裂。
- 数学公式源码已进入当前 WIP（`shared/math.ts`、`export/katexCss.ts`、text-buffer widget），但本交接不把它视为已完成能力；需要后续验证行内/块公式、非法 LaTeX、保存/Source roundtrip 和构建产物。
- Frontmatter 重复显示的原因已确认，但是否采用“属性条 active 时隐藏对应源码行”的最终修正仍需单独验证；不能为了视觉隐藏破坏源码编辑、selection 或保存。
- Windows release `.exe`、WebView2、真实系统剪贴板、IME、真实 Vault 保存和 Windows Markdown 行尾仍未完成最终验收。Linux/Chromium/Tauri mock 不能替代它们。
- `agent_preflight.py --project typora` 仍指向旧路径 `/home/slam/Sipeed/Serein/Typora`；真实仓库是 `/home/slam/Project/Serein`。不要根据该误报改目录或恢复旧工程。

## 下一步计划（按优先级）

1. 重新启动干净 Vite 端口，使用虚构 Markdown 逐字符验证表格最小输入、表格 UI、当前列对齐、删除和 Source roundtrip。
2. 检查表格工具栏与 Frontmatter 的 DOM/布局/selection，不通过增加第二套编辑器或多选区模型解决问题。
3. 单独完成数学公式的行内/块/异常输入/保存/导出回归，并重新取得 `npm run build` 的明确退出码。
4. 在 Windows PowerShell 构建 release，验证代码块、表格、公式、剪切/复制、IME、真实保存和 WebView2 行为。
5. 只按功能边界审查 dirty worktree，再由用户明确决定是否 commit；不要自动 commit、tag 或 push。

## 关键文件路径

apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx
apps/serein-desktop/src/styles.css
apps/serein-desktop/src/shared/math.ts
apps/serein-desktop/src/export/katexCss.ts
apps/serein-desktop/src/editor/textBufferMarkdown.ts
apps/serein-desktop/src/services/clipboard.ts
apps/serein-desktop/tests/text-buffer-markdown.test.mjs
docs/runbooks/PROJECT_MEMORY.md
docs/runbooks/KNOWN_FAILURES.md
docs/runbooks/skills/serein-text-buffer-stability/SKILL.md

## 接手原则

- 先读 `AGENTS.md`、本文件、`docs/runbooks/PROJECT_MEMORY.md`、`docs/runbooks/KNOWN_FAILURES.md` 和相关 skill，再按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进。
- 用户要求先确认时只做只读诊断，不提前改代码；原因必须对应源码、运行时 DOM、日志或可复现脚本。
- 修改只动共享根因，不堆快捷键/样式补丁；任何已跑通的链接、保存、代码块、表格、图片、Rich/Source 路径都要做相邻回归。
- 所有 UI 自动化使用完全虚构文档，不读取或修改用户真实 Vault；Windows 未实测就明确标注未实测。
