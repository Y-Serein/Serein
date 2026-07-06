# Serein Obsidian-like 改造规格

最后更新：2026-05-21

## 主线

Serein 的目标不是普通 Markdown 编辑器，也不是当前形态直接发布。

主线固定为：

- Typora-like 编辑体验打底。
- Obsidian-like Vault 知识工作台是接下来大改方向。
- 不为了 Obsidian 化破坏已有编辑底座。
- 不继续在 `App.tsx` 里无边界堆功能。

当前完成度粗评：

- Typora-like 编辑底座：30%-40%。
- Obsidian-like Vault 工作台：8%-12%。
- 用户第一眼是否像 Obsidian：0%-5%。
- 综合完成度：10%-15%。

## Obsidian 官方模型摘录

对标来源：

- Workspace: https://help.obsidian.md/workspace
- Sidebar: https://help.obsidian.md/sidebar
- Core plugins: https://help.obsidian.md/plugins
- Internal links: https://help.obsidian.md/links
- Outgoing links: https://help.obsidian.md/plugins/outgoing-links
- Properties: https://help.obsidian.md/properties
- Search: https://help.obsidian.md/plugins/search
- Canvas: https://help.obsidian.md/plugins/canvas
- Workspaces: https://obsidian.md/help/plugins/workspaces

核心结论：

- Obsidian 的桌面 workspace 由左侧 Ribbon、左右 Sidebar、Sidebar tab groups、中央 tab groups/tabs、Status bar 组成。
- Sidebar 是插件容器，File explorer、Backlinks、Outgoing links 等都以 tab/pane 形式挂载。
- Core plugins 是产品能力边界，不是零散组件；Backlinks、Outgoing links、Graph、Search、Tags、Properties、Canvas、Quick switcher、Command palette、Workspaces 都应按插件模型理解。
- Internal links 支持 wikilink、Markdown link、heading link、alias、embed。
- Outgoing links 不只是列出已存在链接，还要列出 active note 中可转成链接的 unlinked mentions。
- Canvas 是 `.canvas` 文件，基于 JSON Canvas，支持无限画布、note/text/media/web card、连接线、分组、缩放和平移。
- Properties 基于 frontmatter，默认属性包括 `tags`、`cssclasses`、`aliases`，并有文本、列表、数字、日期、checkbox、tags 等类型。

## 当前项目差距

### Workspace / Shell

当前：

- 左侧只有 files/outline。
- 右侧是固定知识面板。
- 中央是单活动文档为主。
- 没有 Ribbon、pane/tab group、status bar、workspace layout。

应改为：

- 左侧 Ribbon 承载核心入口：Files、Search、Graph、Canvas、Settings、Command。
- 左 Sidebar 是 tab group：File Explorer、Search、Bookmarks、Tags。
- 中央是 workspace tab group：Markdown note、Canvas、Graph、Search result 都可以是 leaf。
- 右 Sidebar 是 tab group：Backlinks、Outgoing links、Outline、Properties、Local graph。
- 底部 status bar 显示字数、链接数、索引状态、当前文件状态。

### Editor

当前：

- Rich Edit / Plain Edit 已有基础。
- 代码块、链接、图片、表格、导出仍在快速演进中。

原则：

- Editor 是稳定底座，先冻结回归清单。
- 所有 Obsidian shell 改造不能改坏编辑器保存、输入、链接编辑、图片导入、代码块语言控件。
- Editor 只通过清晰接口接受：active file、markdown、editor command、link open handler、asset import handler。

### Vault Engine

当前：

- 能索引文件、链接、标签、反链、出链、graph。
- 但 index 是一次性全量模型，properties、aliases、embeds、unlinked mentions、block refs、incremental update 都不足。

应改为：

- Vault index 拆为独立 engine。
- 建立结构：
  - files
  - headings
  - links
  - backlinks
  - unresolved links
  - unlinked mentions
  - embeds
  - properties
  - aliases
  - tags
  - graph stats
- 支持增量刷新和可取消索引，避免大 Vault 阻塞。

### Knowledge Panels

当前：

- 一个 `KnowledgeRail` 里混合 backlinks/outgoing/graph/search/tags。

应改为：

- 每个 panel 按 core plugin 拆分：
  - BacklinksPanel
  - OutgoingLinksPanel
  - OutlinePanel
  - PropertiesPanel
  - LocalGraphPanel
  - TagsPanel
  - SearchPanel
- 面板共享 Vault engine 查询结果，不直接自己临时算一套。

### Graph

当前：

- SVG 点阵，布局和交互都很弱。

应改为：

- 第一阶段：更像 Obsidian 的局部图谱面板，优先 active note 的一跳关系、未解析链接、孤立节点提示。
- 第二阶段：全局 graph 独立 workspace leaf，不放在窄右栏里硬塞。
- 第三阶段：过滤器、分组、颜色、orphan/dead-end、性能上限。

### Canvas

当前：

- 未实现。

应改为：

- 支持 `.canvas` 文件。
- 兼容 JSON Canvas。
- 第一阶段只做基础：
  - text card
  - note card
  - edge
  - pan/zoom
  - save/load
- 不先做复杂动画和花哨样式。

## 第一轮改造顺序

### Step 1: 冻结 Typora 编辑底座

先补一份回归清单和最小测试，不动核心行为：

- Plain Edit 输入、保存、另存。
- Rich Edit 输入、保存、切换。
- Markdown link 渲染、展开编辑、Ctrl/Cmd 点击跳转。
- wiki link 渲染和跳转。
- 代码块语言控件。
- 图片导入和预览。
- 表格插入。
- 大文件保护和保存冲突提示。

### Step 2: 定义 Workspace 数据模型

新增或迁移到明确模型：

```ts
type WorkspaceLeaf =
  | { type: "markdown"; id: string; filePath: string | null }
  | { type: "canvas"; id: string; filePath: string | null }
  | { type: "graph"; id: string; scope: "global" | "local" }
  | { type: "search"; id: string; query: string };

type SidebarTab =
  | "file-explorer"
  | "search"
  | "bookmarks"
  | "tags"
  | "backlinks"
  | "outgoing-links"
  | "outline"
  | "properties"
  | "local-graph";
```

目标不是一次做完多窗格，而是先让 UI 按 Obsidian 的概念组织。

### Step 3: 重做 Shell 视觉和信息架构

第一版落地：

- 增加左 Ribbon。
- 左栏改成 Obsidian-like sidebar tab group。
- 右栏改成 Obsidian-like plugin tabs。
- 中央保留当前编辑器，不重写 Milkdown。
- 增加 status bar。

### Step 4: Vault Engine 扩展

优先补：

- YAML frontmatter parser。
- aliases。
- properties。
- unlinked mentions。
- `[[note#heading]]` 打开后滚动到标题。
- embed link 识别。

### Step 5: Graph / Canvas

先 Graph 后 Canvas：

- Graph 独立 workspace leaf。
- Local graph 保留右栏。
- Canvas 做 `.canvas` 文件读写和基础卡片。

## 禁止偏离

- 不先追求发布。
- 不先做云同步、协作、后端、数据库。
- 不引入大型状态管理替换现有 Zustand，除非现有 store 明确无法维护。
- 不重写编辑器内核。
- 不把 Obsidian UI 理解成“换个黑色主题”。
- 不把索引数据存在误判为知识面板可用。

## 下一步具体动作

1. 先补 `docs/runbooks/editor_regression_checklist.md`，冻结 Typora 底座。
2. 在代码里新增 workspace/shell 类型，不接复杂 UI。
3. 拆 `KnowledgeRail` 为插件面板目录结构。
4. 增加左 Ribbon 和 Status bar 的最小 UI 骨架。
5. 再开始补 Properties / aliases / unlinked mentions。
