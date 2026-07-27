# HANDOFF.md

最后更新：2026-07-24 17:09
当前分支：`main`（HEAD `deedd50`）
当前任务：可编辑 Markdown 思维导图已按 Markmap 式块级树重构并完成 Linux/Chromium 验证；尚未提交、push 或做 Windows release 实测

## 当前在做什么

- Markdown 仍是唯一数据源；思维导图是实时派生的无界画布视图，写回继续复用 CodeMirror transaction、dirty、保存和 Undo/Redo。
- 右上角仍只有原来的单个文档模式按钮，循环为 `实时预览 -> 源码模式 -> 思维导图 -> 实时预览`，没有新增三段模式入口。
- 已删除导图左侧固定 Markdown 编辑栏；节点增删、升降级、排序、编辑、定位、撤销、缩放和导出集中在画布顶部单行工具栏。
- 标题、列表项、段落、引用、表格、围栏代码块和独立图片按 Markdown 源码顺序派生为独立节点；例如 `规则 -> 说明段落 / 表格 / 代码块`，不再把表格和代码块堆进“规则”标题大卡片。
- 标题/列表节点可在原位置改名；段落、表格、代码块等内容节点可双击或点顶部铅笔，在节点原位置编辑源码，失焦或 `Ctrl/Cmd+Enter` 精确写回该 block 的 Markdown range，`Escape` 取消。
- 表格编辑当前是在表格节点原位置编辑 Markdown 表格源码，不是逐单元格 WYSIWYG；代码块编辑包含 fence 和语言名，保存后恢复高亮渲染。
- 初次进入和切换布局时至少保留 72% 编辑倍率：向右布局把根节点放在画布左侧起点，左右布局把根节点置中；远端节点通过拖动画布访问。只有主动点“适配窗口”才缩放到整图总览，避免初始 34% 导致内容不可读。
- 节点没有使用整体 DOM `scale()`；位置、尺寸、字体都按当前倍率以真实 CSS 数值重排，缩放后文字保持浏览器实际字体渲染。
- 背景改为低对比度点阵；标题/列表使用轻量分支线，表格、代码块使用独立轻容器，不再采用厚重大卡片视觉。
- `v7.png` 没有出现在仓库、`/tmp` 或可访问附件路径，未假装看过；实际对照过 `https://mind.markdown.com.cn/` 的 Markmap 节点模型。

## 已经试过的方案和结果（含失败的）

- 左侧停靠 Markdown 编辑栏：不符合用户目标。用户要节点内直接编辑，已完全删除侧栏和相关 CSS。
- 标题节点内同时渲染段落、表格、代码块：信息模型错误。它只是导图形态的预览卡片；当前改为独立、有序、有父子的 block 节点。
- 只美化旧大卡片：不能解决层级和编辑入口问题，已放弃，改为先重构派生模型再收敛视觉。
- 自动把整棵复杂树塞入当前窄画布：能总览但初始倍率降到 34%-39%，文字虽不模糊但太小；当前改为 72% 可编辑入口，显式 Fit 才总览。
- 第一轮 UI helper 等待 `5173`：失败。项目 `vite.config.ts` 固定开发端口为 `1420`，服务实际 686ms 已启动；改用真实端口后通过。
- 无界入口后测试仍直接点击视口外远端节点：失败。测试应先平移或点 Fit；修正测试导航后通过，产品数据和节点交互没有失败。
- 开发态 UI 回归：通过。段落、表格、代码节点内编辑、模式循环、布局、缩放、重命名、Undo、SVG/PNG 导出和源码回写全部通过，控制台无异常。
- `dist` 生产预览重复同一套 UI 回归：通过，排除只在 HMR 开发态生效。

## 下一步计划（3-5条actionable)

1. 在 Windows release `.exe` 中打开真实复杂 Markdown，手测右上角单按钮三模式循环、72% 无界入口、拖动画布、Fit、段落/表格/代码节点内编辑、保存后重开和 Undo/Redo。
2. 用用户真实文档补测围栏代码块、嵌套列表、引用、本地图片、长表格和超长代码；当前自动化样本覆盖标题、段落、任务列表、嵌套列表、表格和 fenced code。
3. 和用户确认表格下一阶段是否需要“逐单元格直接编辑”；当前块内 Markdown 编辑安全、可回滚，但不是幕布式单元格 WYSIWYG。
4. 若用户确认当前交互，再决定是否增加内容 block 的拖拽排序；当前结构标题/列表支持拖拽，内容块保持源码顺序以优先保护数据安全。
5. 若准备提交，使用显式文件列表审查和暂存；工作区还有 Mermaid、导出和其他 WIP，禁止 `git add .`，不要把无关改动混入。

## 关键文件路径（相对路径，一行一个）

apps/serein-desktop/src/features/mindmap/MarkdownMindmapView.tsx
apps/serein-desktop/src/features/mindmap/model.ts
apps/serein-desktop/src/features/mindmap/layout.ts
apps/serein-desktop/src/features/window-chrome/WindowChrome.tsx
apps/serein-desktop/src/app/i18n.ts
apps/serein-desktop/src/styles.css
apps/serein-desktop/tests/mindmap.test.mjs
apps/serein-desktop/tsconfig.test.json
HANDOFF.md

## 当前验证状态

- `python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora`：通过；启动时工作区已有 25 项未提交改动。
- `npm run typecheck`：通过。
- `npm run test`：9/9 通过；导图用例覆盖块级顺序树、结构移动、增删、层级限制、代码块精确写回和相邻表格保护。
- `npm run build`：通过；仅有既有大 chunk warning。
- Vite 开发态 + Playwright Chromium：通过；13 个派生节点，无侧栏，顶部单行工具栏，72% 入口，向右/左右布局，Fit，字体缩放，段落/表格/代码块节点内编辑，源码核对，重命名，Undo，SVG/PNG 导出，控制台无异常。
- `dist` + Vite preview + 同一套 Playwright：通过。
- 人工截图检查：`/tmp/serein_mindmap_entry_ui.png`；根节点、块级分支、表格、代码块和背景观感正常。
- 相关 tracked 文件 `git diff --check`：通过；导图目录和测试仍是未跟踪文件，尚未 commit。
- Windows Tauri release `.exe`：本轮未构建、未实测；Linux/Chromium 结果不能替代 Windows WebView2。
- 当前未 commit、未 tag、未 push，GitHub 不可见。

## 还没搞清楚的问题

- 用户提到的 `v7.png` 当前文件系统不可见，无法做逐像素对照；需要用户提供可访问路径或重新上传。
- 表格最终交互是否必须逐单元格 WYSIWYG，还是“在表格节点内直接编辑 Markdown 源码”已经满足本阶段，需要用户实测决定。
- 超大真实文档在 72% 无界入口下的首屏分支取舍、内容块拖拽排序和 Windows WebView2 字体观感仍需 release 实测。
