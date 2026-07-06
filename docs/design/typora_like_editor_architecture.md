# Typora-like Editor Architecture

最后更新：2026-07-06

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

当前采用方案 A。

原因：

- 当前最脆弱的不是缺少底层能力，而是 Plain/Rich 两套生命周期割裂。
- Serein 已在 Milkdown 上积累大量 Typora-like 细节，直接迁到 CodeMirror 会丢失这些细节。
- 项目记忆已明确禁止重新引入嵌套可编辑 CodeMirror 作为代码块主实现。

## 分阶段实施

### Phase 0：过渡修复，已完成

- App 层 Markdown undo/redo 栈兜底。
- 嵌套代码块退出逻辑从 DOM 焦点补丁转向文档结构判断。

### Phase 1：统一编辑器边界

目标：

- `EditorWorkspace` 不再把 plain/rich 当成两个无关编辑器入口。
- 新增统一的 Editor Host 边界，集中处理：
  - 当前 mode。
  - 当前 note markdown。
  - 命令入口。
  - selection/focus 请求。
  - 图片导入和链接打开。

要求：

- 用户可见行为不变。
- 不删除 `textarea`，只先把生命周期和命令分发收口。
- 回归验证必须覆盖 Rich/Plain 切换、撤销、链接展开、代码块退出。

### Phase 2：源码模式从独立状态降级为同源视图

目标：

- Plain/source mode 不再拥有独立 undo/selection 主权。
- 切换模式不重建文档状态。
- 优先保留用户对源码模式的直接编辑体验。

可选落地：

- 短期：保留 textarea UI，但通过统一 Editor Host 管理 selection snapshot、history 和 commit 边界。
- 中期：探索 ProseMirror 内 source block/view mode，减少 textarea 生命周期影响。

### Phase 3：补齐 markdown.com.cn / Typora 基础能力

按优先级补：

1. 任务列表 checkbox 交互和保存一致性。
2. 表格键盘路径、行列操作、Markdown 保存一致性。
3. KaTeX 数学公式。
4. Mermaid 图表。
5. `[TOC]` 自动目录。
6. Markdown 思维导图视图，和现有知识图谱区分为两种能力。

这些能力涉及新依赖或新视图时必须单独评估，不能混入编辑器生命周期迁移。

## 验证矩阵

每个阶段至少验证：

- `npm run typecheck`
- `npm run test`
- `npm run build`
- Rich 输入后保存。
- Plain 输入后保存。
- Rich -> Plain -> Rich 不丢内容。
- Rich 输入 -> 切 Plain -> `Ctrl+Z`。
- Plain 输入 -> 切 Rich -> `Ctrl+Z`。
- 标准 Markdown link 展开/跳转/收回。
- `tests/fixtures/rich-edit/00_raw.txt` 中 `list > quote > code` 退出。
- 代码块语言控件键盘编辑和候选选择。
- 图片预览和 frontmatter 顶部编辑条。

Windows release `.exe` 手测仍是最终验收面。
