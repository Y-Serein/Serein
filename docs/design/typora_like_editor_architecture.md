# Typora-like Editor Architecture

最后更新：2026-07-07

## 目标

Serein 的编辑器目标是 Typora-like 单编辑器体验：

- 一个文档编辑状态承载 Markdown 内容、光标、选区、撤销/重做和结构块导航。
- Rich/实时预览是默认写作体验，源码模式是同一编辑状态的显示/编辑形态，不应销毁编辑器实例。
- 链接、图片、代码块、表格、任务列表、公式、图表、TOC 等都是基础 Markdown 写作能力，不是互相独立的外挂功能。
- 保留 Serein 已经调好的细节，不为架构迁移牺牲高频体验。

## 当前状态

当前实现仍是双编辑器架构：

- Plain Edit：`textarea`。
- Rich Edit：`MilkdownEditor` / ProseMirror。
- `EditorWorkspace` 按 `editorMode` 条件渲染，两种编辑器会互相卸载。
- 2026-07-06 的 P0 修复已加 App 层 Markdown undo/redo 栈，解决切模式后撤销内容丢失，但这只是过渡方案，不是最终单编辑器架构。

## 不可回归项

以下行为必须在每个阶段保留：

- 普通点击 Markdown link 展开源码，`Ctrl/Cmd + 点击`才跳转。
- 光标/选区仍在链接源码范围内时不自动收回；离开后恢复渲染。
- 本地 Markdown/Text 链接优先在 Serein 内打开，其他本地目标交给系统。
- Wiki link、目录链接、Vault 路径解析不能退化。
- 代码块语言控件常驻下方右侧。
- 代码块语言可直接键盘编辑；未知语言保留文本；候选列表包含 `bash`。
- 代码块最后一行 `ArrowDown` 第一次进入语言控件，语言控件中再次 `ArrowDown` 退出代码块。
- 结构块末尾空白行 `Enter` 退出当前结构块。
- 空代码块 `Backspace` 转普通段落。
- 代码块内 `Tab / Shift+Tab` 缩进/反缩进代码文本。
- Rich serializer cleanup 必须跳过 fenced code block。
- Frontmatter 顶部编辑条、图片导入/预览、表格已有键盘路径不能被架构迁移破坏。

## 路线选择

### 方案 A：Milkdown/ProseMirror 作为唯一编辑状态

做法：

- 保留 Milkdown/ProseMirror 作为文档模型、selection、history 的唯一所有者。
- 源码模式先不再使用独立 `textarea` 拥有文档状态，而是逐步迁移到同一编辑状态下的源码显示/编辑形态。
- NodeView 只做 UI wrapper，不能再嵌套拥有独立文档模型的可编辑 CodeMirror。

优点：

- 和当前 Rich Edit 代码兼容性最高。
- 能最大程度保留现有链接、图片、frontmatter、代码块语言控件等细节。
- 迁移可分阶段完成。

缺点：

- 真正纯源码编辑体验较难做到和 textarea 一样自然。
- ProseMirror 中做完整源码模式需要谨慎设计，不能靠全文 `replaceAll()` 反复重置文档。

### 方案 B：CodeMirror 6 作为唯一编辑状态，Live Preview 用 decoration

做法：

- 以 CodeMirror 6 作为 Markdown 源码底座。
- Live Preview 通过 decoration/widget/view plugin 渲染标题、链接、图片、代码块、表格等。

优点：

- 源码编辑、undo/redo、selection、搜索替换天然稳定。
- 更接近 Markdown 源码优先的实现。

缺点：

- 需要重做当前 Rich Edit 的大量行为。
- 代码块语言控件、表格可视化、图片、frontmatter、链接展开都要重新实现。
- 回归风险大，不适合作为当前版本的直接迁移路线。

## 决策

当前目标架构改为方案 B：CodeMirror 6 作为唯一 Markdown text buffer，Live Preview 由 decoration / widget / view plugin 实现。

原因：

- 用户确认最终目标应与 Typora 对齐：一个 Markdown 文本 buffer 承载内容、undo/redo、selection、scroll、IME 和保存。
- `textarea + Milkdown/ProseMirror` 双实例只能做过渡补偿，无法从根上解决切换模式丢 undo、selection 生命周期割裂的问题。
- 以文本 buffer 为核心能最大限度保留 Markdown 原文，避免 serializer 把用户文档重写成另一种 Markdown。
- 代码块、链接、表格、图片等 Rich 呈现必须作为同一文本 buffer 的 decoration/交互层，而不是另一个编辑器实例。

约束：

- 目标是替换底层模型，不是降低最终呈现。最终视觉和交互不得低于当前 Rich Edit。
- 迁移必须并行推进、可回退；默认 Milkdown 主路径在新 text-buffer 引擎达标前不能删除。
- 新引擎不得重新引入代码块内部嵌套可编辑编辑器。代码块内容仍必须属于同一个 Markdown text buffer。

## 分阶段实施

### Phase 0：过渡修复，已完成

- App 层 Markdown undo/redo 栈兜底。
- 嵌套代码块退出逻辑从 DOM 焦点补丁转向文档结构判断。

### Phase 1：并行落地 text-buffer 引擎骨架

目标：

- 新增实验性 CodeMirror text-buffer editor。
- plain/rich 两种显示模式都使用同一个 CodeMirror `EditorState`，切换模式不销毁编辑状态。
- 默认 Milkdown 路径保持不变；实验引擎通过显式本地开关启用。
- 第一阶段只证明：
  - Markdown 原文是唯一数据源。
  - 切换 plain/rich 不丢 CodeMirror undo/redo。
  - 基础标题、引用、列表、代码块、链接有初步 decoration。
  - 图片导入、链接打开、菜单命令有最小可用路径。

要求：

- 默认用户可见行为不变。
- 实验引擎必须明确标注能力缺口，不能伪装成完整替代。
- 不删除 `textarea` 和 `MilkdownEditor`，只新增并行实现。
- 回归验证必须覆盖默认路径仍可构建、实验路径能编译。

### Phase 2：补齐 Typora-like decoration

目标：

- Rich 呈现逐项追平当前 Milkdown：
  - 标题、列表、引用、代码块视觉。
  - 标准 Markdown link 局部展开/收回。
  - Wiki link 展示、跳转和编辑。
  - 图片预览。
  - Frontmatter 顶部属性条。
  - 表格可视化编辑。

要求：

- 所有交互都作用于同一份 Markdown text buffer。
- 光标进入局部源码范围时展开；离开后收回。
- 不允许通过另一个隐藏编辑器维持 Rich 状态。

### Phase 3：替换默认编辑器

前置条件：

- 新 text-buffer 引擎通过能力基线里的高风险路径：
  - undo/redo、selection、scroll。
  - 链接展开/收回/跳转。
  - 代码块退出和语言控件。
  - 表格编辑和保存。
  - 图片导入/预览/路径。
  - frontmatter 和 dirty baseline。
- Windows release `.exe` 手测通过。
- 用户确认新引擎可以替换默认路径。

### Phase 4：补齐 markdown.com.cn / Typora 基础能力

按优先级补：

1. KaTeX 数学公式。
2. Mermaid 图表。
3. `[TOC]` 自动目录。
4. Markdown 思维导图视图，和现有知识图谱区分为两种能力。

这些能力涉及新依赖或新视图时必须单独评估，不能混入 text-buffer 引擎替换。

## 验证矩阵

每个阶段至少验证：

- `npm run typecheck`
- `npm run test`
- `npm run build`
- 默认 Milkdown 路径仍可 Rich 输入后保存。
- 默认 Plain 路径仍可输入后保存。
- 实验 text-buffer 路径：Rich -> Plain -> Rich 不重建实例、不丢内容。
- 实验 text-buffer 路径：Rich 输入 -> 切 Plain -> `Ctrl+Z`。
- 实验 text-buffer 路径：Plain 输入 -> 切 Rich -> `Ctrl+Z`。
- 标准 Markdown link 展开/跳转/收回。
- `tests/fixtures/rich-edit/00_raw.txt` 中 `list > quote > code` 退出。
- 代码块语言控件键盘编辑和候选选择。
- 图片预览和 frontmatter 顶部编辑条。

Windows release `.exe` 手测仍是最终验收面。
