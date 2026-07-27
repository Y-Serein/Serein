# Serein Mermaid 自适应渲染一次性提示词

复制下面整段，并替换截图或复现文件路径即可：

```text
请接手 /home/slam/Project/Serein 的 Mermaid / 思维导图渲染收敛任务。先完整阅读 AGENTS.md、CLAUDE.md（若存在）、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，以及 docs/runbooks/skills/serein-mermaid-rendering-convergence/SKILL.md；运行 python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora。默认中文，直接、以安装版结果为导向，可以反驳我，但必须给证据、方案利弊和下一步。

目标不是“图能出现”或固定高度，而是：Mermaid 图需要多少内容空间就占多少；文字保持正常；编辑区不够宽时才等比缩小；容器高度紧贴内容；后续正文自然跟随。禁止按短图/长图分类，禁止固定 600px、任意 max-height/min-height、大边框或用加大字体掩盖错误坐标系。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进：

1. 先确认正式 app 目录、git dirty 状态、当前 HEAD、复现 Markdown、截图、运行中 Serein 的 PID/可执行路径、当前安装包和已安装 exe 的时间与哈希。不要先改代码。
2. 对标 Mermaid 官方支持能力以及 Typora、Obsidian、GitHub Markdown 的真实交互模型；不要凭空设计，也不要盲目照搬。
3. 把问题分层排查：
   - Markdown fence、语言大小写、未闭合 fence、selection 是否导致源码展开；
   - Mermaid 语法和渲染是否成功；
   - SVG width/height、viewBox、getBBox、getBoundingClientRect、节点 transform 和文字实际 rect；
   - 图类型使用的布局算法；
   - figure/diagram/svg CSS、可用编辑器宽度和图后正文间距；
   - debug/HMR、release、NSIS、installed exe 是否真的是同一版本。
4. 如果 viewBox 明显大于 getBBox，先在共享 Mermaid 渲染层按真实边界修正，只处理宽高/面积比例明显异常的输出，保留正常 viewBox，避免裁掉箭头、marker、阴影和标签。不要先调 CSS。
5. 如果 viewBox 和 bbox 都巨大，检查布局算法和节点坐标。mindmap 不要默认假设是 CSS；比较 Mermaid 支持的 dagre 与 cose-bilkent，并说明紧凑层级树和自由放射布局的取舍。
6. Mermaid SVG 离屏测量要考虑窗口隐藏/最小化。不要无条件等待 requestAnimationFrame 导致 HTML/PDF 导出挂起；优先同步强制布局测量。
7. Rich Edit 只能做 fenced Markdown 的原子视觉替换，不能创建第二套内容、selection、history 或保存路径。点击/selection 要能回源码编辑。
8. 使用 tests/fixtures/rich-edit/mermaid_messy_test.md，或生成同等真实的脏样本：中文流程图、长中英文节点、时序图、mindmap、MERMAID 大小写、错误图类型、未闭合 fence、普通链接、inline code 和表格。不要把样本刻意写得全部合规。
9. 保护保存、Rich/Plain Edit、链接、代码块、表格、图片和 Vault；只修改共享根因，不做无关重构或格式化。
10. UI 结论必须同时有指标和截图：记录每个 SVG 的 viewBox、bbox、rendered rect、figure 高度、文字大小、图后正文间距、console/page errors。一个流程图通过不能代表 mindmap 通过。
11. 完成前运行 npm run typecheck、npm run test、npm run build、git diff --check。然后在 Windows PowerShell 运行 scripts/build_windows.ps1 -SkipInstall，核对源码、dist、release、installer、installed exe 的时间与 SHA-256。
12. 不要关闭我的正式 Serein 或覆盖可能有未保存内容的安装实例。只关闭你自己启动的 debug/Vite 临时进程。只有最新安装包在同一复现文件中得到我的截图/反馈，才能宣布完成。
13. 完成后更新 HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md 和 Mermaid skill。不要自动 commit/tag/push；如果我要求提交，逐文件暂存，禁止 git add .，根目录 exe 默认不进源码提交。

复现输入：<在这里填写 Markdown 路径或粘贴内容>
截图：<在这里填写截图路径>
期望对标：<Typora / Obsidian / GitHub / Mermaid 官方示例>
Windows 显示缩放：<例如 100% / 125% / 150%>
当前安装包时间：<填写>
```
