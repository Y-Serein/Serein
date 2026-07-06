# Serein 产品化审查与下一阶段路线图

最后更新：2026-07-02

## 1. 审查结论

Serein 现在不是纯 demo，但也还不是成熟产品。更准确的判断是：

> 可内测的工程型本地写作工具 / 产品化半成品。

它已经具备真实功能闭环的雏形：

- 本地 Markdown / Text 文件编辑。
- Vault-style 文件夹浏览与懒加载。
- Plain Edit 和 Rich Edit 双模式。
- 大纲、反向链接、出链、局部/全局图谱。
- 中英文 UI。
- 设置、快捷键、窗口状态、文件关联。
- Tauri 2 桌面壳和 Windows 打包脚本。

但从真实用户是否愿意长期使用的角度看，它还缺成熟产品最关键的几类能力：

- 稳定、可复现、可交付的 Windows release 链路。
- 用户文档数据的恢复机制和安全承诺。
- 长时间写作中的低摩擦体验。
- 可解释、可恢复、可诊断的错误处理。
- 完整手测矩阵和发布验收标准。
- 产品级视觉一致性。
- 清晰定位：到底优先做 Typora-like 写作工具，还是 Obsidian-like 知识工作台。

当前不建议把 Serein 描述为正式成熟产品；可以描述为“可进入小范围内测的本地 Markdown 桌面写作工具”。

## 2. 当前阶段判断

| 维度 | 判断 | 说明 |
| --- | --- | --- |
| Demo | 否 | 已经不只是展示 UI 或模拟数据，存在真实本地文件读写、Vault、索引、设置和打包链路。 |
| 工具 | 是 | 已能解决个人本地 Markdown 写作和轻量知识管理的部分问题。 |
| 半成品 | 是 | 高频路径仍在反复修 Rich Edit、代码块、链接、光标、快捷便签和发布体验。 |
| 成熟产品 | 否 | 发布、恢复、错误诊断、视觉一致性、长期使用稳定性还没闭环。 |

## 3. 项目证据

### 已具备的产品基础

- 根 README 已明确当前应用目录是 `apps/serein-desktop/`。
- `apps/serein-desktop/package.json` 中已有 `test`、`typecheck`、`build`、`tauri:build` 脚本。
- `src-tauri/tauri.conf.json` 已配置产品名、版本号、窗口尺寸、图标和 `.md/.markdown/.txt` 文件关联。
- `scripts/build_windows.ps1` 已形成 Windows NSIS 打包入口，并包含安装流程 patch。
- `src/app/workspaceModel.ts` 已定义 markdown、canvas、graph、search leaf，以及 ribbon、左右 sidebar、status bar 等 workspace 模型。
- `src/features/knowledge-rail/` 已拆出 Backlinks、Outgoing、Properties、Graph、Tags 等面板组件。

### 仍暴露的产品化缺口

- 根 README 仍写着 release downloads 要等 Windows packaging verified。
- `apps/serein-desktop/README.md` 仍有 screenshot placeholder 和 download link placeholder。
- `HANDOFF.md` 记录当前 main 本地领先 `origin/main` 5 个提交，未 push。
- 安装包已按新结构迁到 `out/Serein_1.0.4_x64-setup.exe`；仍不能确认它包含最新修复。
- 项目规则已经迁到 `apps/`、`examples/`、`scripts/`、`docs/` 等常见结构；旧交付目录仅作为历史归档或本地缓存处理。
- `App.tsx`、`styles.css`、`MilkdownEditor.tsx` 规模较大，后续继续堆功能会增加回归风险。

## 4. 和同行产品的对比

### 4.1 Typora：沉浸式写作体验

Typora 的核心不是功能数量，而是“实时预览写作”的低摩擦体验：去掉传统 Markdown 编辑器的源码/预览双窗口切换，让用户直接在文档中编辑内容。

可学习对象：

- 实时预览必须稳定，不只是“能渲染”。
- 代码块、表格、图片、链接、标题、大纲、导出都是基础写作能力，不是高级能力。
- 写作界面要安静、克制，不让知识面板和调试状态抢占主任务。
- Typora 的 Focus Mode、Typewriter Mode、行宽、主题、导出等能力，都围绕长时间写作体验服务。

Serein 当前差距：

- Rich Edit 仍在修光标、链接、代码块和序列化稳定性。
- Plain/Rich 切换虽然已有，但还需要完整回归清单保证不丢内容、不破坏格式。
- PDF/HTML 导出质量和 Windows release 行为还未充分验证。

参考：

- https://typora.io/
- https://support.typora.io/Export/

### 4.2 Obsidian：本地知识工作台

Obsidian 的成熟点不只是 graph，而是 Workspace + Core Plugins + Vault 数据模型。

官方 core plugins 覆盖：

- Backlinks
- Canvas
- Command palette
- File recovery
- Graph view
- Outgoing links
- Page preview
- Properties
- Quick switcher
- Search
- Tags
- Workspaces

可学习对象：

- Workspace 由 ribbon、左右 sidebar、sidebar tab groups、中央 tab/pane、status bar 组成。
- Sidebar 是插件容器，不是固定信息栏。
- Backlinks 不只是反链列表，还要提供上下文和未链接提及。
- Outgoing links 不只是已存在链接，还要提示 active note 中可能转成链接的文本。
- Properties 是 frontmatter 的产品化编辑界面，而不是裸 YAML 展示。
- Workspaces 能保存和切换不同任务布局。
- File recovery 是写作工具信任基础。

Serein 当前差距：

- 已有 ribbon、右侧知识面板、graph leaf 雏形，但还没有完整 tab/pane/workspace layout。
- Vault index 已能识别文件、链接、标签和图谱，但增量索引、取消、恢复、未链接提及、block refs、embeds、属性编辑还不足。
- Graph 仍偏基础可视化，布局、过滤、分组、性能边界和解释能力不够。
- Canvas 类型已出现在模型里，但 `.canvas` 文件读写和基础画布功能未形成。

参考：

- https://help.obsidian.md/Plugins/Core+plugins
- https://help.obsidian.md/User+interface/Sidebar
- https://help.obsidian.md/Linking+notes+and+files/Internal+links
- https://help.obsidian.md/Plugins/Outgoing+links
- https://help.obsidian.md/Editing+and+formatting/Properties
- https://help.obsidian.md/Plugins/Workspaces
- https://help.obsidian.md/Plugins/Canvas

## 5. 必须补齐的产品闭环

### 5.1 写作闭环

目标：用户能放心把真实文档交给 Serein。

必须补齐：

- 新建、打开、编辑、保存、另存、关闭、恢复、冲突处理稳定。
- Rich Edit / Plain Edit / 代码块 / 链接 / 图片 / 表格互不破坏。
- 文件外部变更有明确冲突提示。
- 保存失败明确显示原因和下一步。
- 删除进入 `.serein/trash` 后有恢复入口。
- 加入文件快照或自动备份机制，保存前保留最近 N 个版本。

不建议：

- 先追 Canvas、AI、云同步。
- 用“保存光标再恢复”掩盖 Rich Edit 全文替换等根因。

### 5.2 Vault 闭环

目标：Vault 是用户的知识库，而不是目录浏览器加若干统计面板。

必须补齐：

- 打开大 Vault 不阻塞。
- 索引状态可见，可取消，可重试。
- 索引失败不影响编辑保存。
- 搜索、反链、出链、未链接提及、属性、标签来自同一个 Vault engine。
- 支持增量刷新，避免每次全量重建。
- 对超限、跳过、不可读文件给用户解释。

### 5.3 知识面板闭环

目标：右侧知识面板帮助用户行动，而不是展示调试数据。

必须补齐：

- Backlinks：linked mentions、unlinked mentions、上下文、过滤、排序、点击跳转。
- Outgoing links：已解析、未解析、可创建、歧义选择。
- Properties：可编辑 frontmatter，而不是只读展示。
- Tags：点击过滤、统计、跳转关联文件。
- Graph：局部关系优先，说明孤立节点、未解析节点和过滤结果。

### 5.4 Workspace 闭环

目标：从“固定布局工具”进化为“可长期工作的桌面工作台”。

必须补齐：

- 真正的 tab/leaf：Markdown、Graph、Search result。
- 至少支持一个中心 tab group，而不是单文件假 tab。
- 保存和恢复 workspace layout。
- 支持写作布局、知识布局、图谱布局。
- Ribbon 和 sidebar tab 的状态持久化。
- Status bar 显示保存状态、字数、链接数、索引状态、当前 Vault。

### 5.5 视觉质感闭环

目标：用户连续使用 30 分钟不累，不觉得是工程调试界面。

当前静态截图观察：

- 已经有桌面工具外观，不是粗糙网页。
- 但整体绿色单色倾向偏强，层级和焦点节奏不够成熟。
- 侧栏、ribbon、tab、编辑区、状态区的视觉语言还需要统一。
- 知识面板和工具控件不能抢写作主区。

必须补齐：

- 统一 design tokens：颜色、边框、hover、active、icon stroke、tab 高度、面板间距。
- 控制主色使用，避免整屏单一色系。
- 右侧面板要更像信息工具，不像调试面板。
- 空状态要给出下一步动作，而不是只显示空。
- 桌面最小窗口下无明显溢出或挤压。

### 5.6 配置能力闭环

已有优势：

- 字体、字号、主题、快捷键、布局、附件路径、语言等配置已经存在。

下一步需要：

- 每 Vault 独立配置。
- 排除目录规则配置。
- 索引文件数和文件大小上限配置。
- 附件路径策略。
- 链接格式偏好：wiki link / markdown link。
- 自动备份策略。
- 诊断日志开关。
- 设置导入/导出。

### 5.7 错误处理闭环

目标：用户出错时知道发生了什么、影响什么、如何恢复。

必须补齐：

- 错误提示包含失败原因、影响范围和下一步。
- 所有文件写入失败、导出失败、索引失败都能重试。
- 添加诊断面板：
  - 应用版本
  - 构建号 / commit
  - Vault root
  - 索引状态
  - 最近错误
  - 日志路径
  - 配置导出
- 崩溃或异常退出后给恢复入口。

### 5.8 文档和发布闭环

目标：一个外部测试者能下载、安装、使用、反馈问题。

必须补齐：

- 发布页：下载、截图、安装说明、已知问题。
- Windows SmartScreen / 未签名包说明。
- 安装、覆盖安装、卸载、重装手测记录。
- 版本号同步：
  - `package.json`
  - `package-lock.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
- release notes。
- tag 和 push 流程。
- 安装包校验信息。

## 6. 下一阶段优先级路线图

### P0：可信内测产品

目标：让小范围真实用户能安全试用。

可执行事项：

1. 重新生成 Windows release `.exe`。
2. 在干净 Windows 环境验证：
   - 安装
   - 覆盖安装
   - 卸载
   - 重装
   - 文件关联
   - 打开真实 Vault
3. 建立写作安全回归包：
   - 保存
   - 另存
   - 关闭
   - 恢复
   - 外部修改冲突
   - 删除进 trash
   - Rich/Plain 切换
   - 代码块
   - 链接
   - 图片
4. 增加最小文件快照机制。
5. 补发布材料：
   - 真实截图
   - 下载说明
   - 已知问题
   - Windows 手测记录
6. 不做 Canvas，不做插件系统，不扩功能。

验收标准：

- Windows release 包能安装并完成 30 分钟真实写作测试。
- 打开复制出来的真实 Vault，不丢数据、不长时间卡死。
- 保存失败、索引失败、导出失败都有明确提示。

### P1：Vault 变成真正知识工作流

目标：让 Vault 不只是文件树，而是可靠知识关系层。

可执行事项：

1. 拆出明确 Vault engine。
2. 建立统一索引结构：
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
3. SearchPanel 升级：
   - path filter
   - tag filter
   - property filter
   - 最近搜索
   - 结果排序
4. Backlinks / Outgoing Links 补上下文、过滤和一键创建。
5. Properties 做成可编辑 UI。

验收标准：

- 用户能通过搜索、反链、出链、标签、属性完成一次真实知识整理流程。
- 索引状态清楚，失败可恢复。

### P2：Workspace 产品骨架

目标：形成可长期工作的桌面工作区。

可执行事项：

1. 实现真实 tab/leaf：
   - Markdown
   - Graph
   - Search result
2. 保存/恢复 workspace layout。
3. Ribbon 可配置。
4. 左右 sidebar tab 状态持久化。
5. 增加写作布局、知识布局、图谱布局。
6. Status bar 完整显示：
   - 保存状态
   - 字数
   - 链接数
   - 索引状态
   - 当前 Vault

验收标准：

- 用户能在不同任务布局之间切换，不丢上下文。
- 关闭再打开后恢复上次工作状态。

### P3：视觉和交互打磨

目标：从工程工具视觉进入产品视觉。

可执行事项：

1. 统一 UI token。
2. 减少单一绿色系压屏。
3. 控制边框、阴影、hover、active、icon stroke。
4. 优化侧栏信息密度。
5. 优化空状态和错误状态。
6. 增加专注模式、Typewriter mode、行宽控制。
7. 做真实 30 分钟连续写作测试。

验收标准：

- 截图第一眼像稳定桌面产品。
- 连续写作 30 分钟无明显视觉疲劳和误触。

### P4：Canvas

目标：在写作和 Vault 可信后，再补视觉化知识整理。

可执行事项：

1. 支持 `.canvas` 文件。
2. 兼容 JSON Canvas。
3. 第一版只做：
   - text card
   - note card
   - edge
   - pan/zoom
   - save/load
4. 暂不做复杂动画、协作、插件化。

验收标准：

- 用户能创建一个 `.canvas`，放入文本卡片和笔记卡片，连线并保存重开。

## 7. 不建议下一阶段做的事

- 不建议先做云同步。
- 不建议先做 AI 功能。
- 不建议先做插件生态。
- 不建议先追全量 Obsidian Canvas。
- 不建议继续在 `App.tsx` 中无限堆功能。
- 不建议把视觉改版和编辑器稳定性修复混在同一轮。
- 不建议把“图谱更漂亮”当成知识工作流完成。

## 8. 下一阶段主优化对象

建议下一阶段只抓四件事：

1. 写作可信度：数据不丢、光标不跳、保存可恢复。
2. Vault 可用性：搜索、反链、出链、属性、未链接提及形成闭环。
3. 发布可信度：Windows release 包、截图、文档、版本、tag、手测矩阵。
4. 视觉克制感：减少工程味，形成安静、稳定、长期可看的写作界面。

这四项完成前，不应把 Canvas、云同步、AI、插件生态作为主线。

## 9. 建议的最近一次工作计划

### 第 1 周：发布可信度

- 清理当前工作区和未跟踪安装包状态。
- 重新生成 Windows 1.0.4 或下一版本安装包。
- 完成 Windows 安装 / 覆盖安装 / 卸载 / 文件关联验证。
- 补 release screenshot 和下载说明。

### 第 2 周：写作安全

- 增加保存前快照。
- 完成写作安全回归清单。
- 修复回归清单中任何 P0 问题。
- 明确保存失败、冲突、恢复路径。

### 第 3 周：Vault 工作流

- 梳理 Vault engine 边界。
- 优化搜索、反链、出链、未链接提及。
- 将 Properties 从只读展示推进到可编辑。

### 第 4 周：视觉和布局

- 统一 ribbon、tab、sidebar、status bar 的视觉语言。
- 增加写作 / 知识 / 图谱布局。
- 做一次 30 分钟连续写作 + 30 分钟 Vault 知识整理实测。

## 10. 最终判断

Serein 下一阶段最重要的不是“功能更多”，而是“用户敢把真实文档放进来，并愿意每天打开”。

成熟产品的第一门槛不是 Canvas、Graph、AI，而是：

- 保存可信。
- 恢复可信。
- 错误可信。
- 发布可信。
- 写作过程稳定。
- UI 不打扰用户。

只要这条主线不偏，Serein 有机会从当前的产品化半成品，推进到一个可靠的本地写作与知识工作台。
