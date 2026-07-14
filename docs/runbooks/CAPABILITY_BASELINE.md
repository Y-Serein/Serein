# Serein Capability Baseline

最后更新：2026-07-07
适用范围：`apps/serein-desktop/`

本文件记录当前 Serein 已有能力、能力边界和后续修改保护规则。
它不是产品宣传文档，而是后续开发前必须对照的工程基线。

## 0. 硬规则

- 已有能力默认视为用户资产，不能在重构、架构整理、快捷键统一、模式切换、UI 美化或新功能开发中被顺手改掉。
- 如果改动会影响已有能力的行为、入口、快捷键、保存格式、selection、scroll、undo、链接跳转、代码块退出、语言控件、表格编辑、图片路径、Vault 索引或保存状态，必须先和用户确认。
- 确认前必须说明：
  - 当前已有行为是什么。
  - 为什么必须改。
  - 目标行为是什么。
  - 会影响哪些路径。
  - 最小验证方式是什么。
- 没有用户确认，不要用“顺便优化”“统一架构”“默认实现更干净”替换已有可用逻辑。
- 如果为了排查临时改动已有逻辑，必须在本轮结束前恢复到等价或更好的体验，并明确验证结果。
- 静态检查不能证明桌面编辑体验通过。Rich Edit、代码块、撤回、链接、保存、窗口行为最终以 GUI/Windows release 用户实测为准。

## 1. 当前能力总览

| 能力 | 已有能力 | 当前问题 / 边界 | 保护级别 |
| --- | --- | --- | --- |
| 单编辑器顺滑感 | 默认路径有 `EditorHost` 统一入口；Rich/Plain 共用同一份 Markdown 数据；有 App 层 markdown history 过渡；实验 text-buffer 路径已用同一 CodeMirror buffer 覆盖基础 Rich/Source 切换、代码块语言、表格、图片、frontmatter、wiki/link 第一段能力 | 默认路径本质仍是 `textarea` + `Milkdown` 两套实例；实验路径未成为默认，表格高级操作、wiki 候选/创建、真实 Vault 目录跳转和 Windows release 仍未完整验证 | 高 |
| Rich Edit 基础编辑 | Milkdown + CommonMark + GFM；支持标题、列表、引用、粗斜体、删除线、代码块、表格、图片、history | 自定义事件层较多，容易被重构破坏 | 高 |
| Ctrl+Z / Redo | Rich 内部已恢复滚动补偿：目标可见则保持滚动，离屏则滚到附近/中间 | 需要 GUI/Windows release 复测；跨 Plain/Rich 切换 undo 仍未根治 | 高 |
| 代码块编辑 | 代码文本和 selection 归 ProseMirror/Milkdown；NodeView 只做语言按钮、候选、复制、高亮 wrapper | EOF、嵌套 list/quote/code、语言控件焦点仍需回归 | 高 |
| 代码块退出 | 支持空行 `Enter` 退出、最后一行 `ArrowDown` 到语言控件、语言控件再 `ArrowDown` 退出；有 `00_raw.txt` / nested fixture 测试 | 真实 GUI 仍需测，尤其 EOF 和无语言控件路径 | 高 |
| 代码块语言 | 支持右下语言控件、键盘编辑、候选选择、`bash` alias、未知语言保留、语法高亮加载 | 语言控件参与导航退出流程，事件路径脆弱 | 高 |
| 链接编辑 | 标准 Markdown link 支持展开/收回；普通点击编辑，`Ctrl/Cmd+点击`跳转；支持 wiki link、目录 index、本地/外部跳转分流 | 状态机复杂，后续必须保护 | 高 |
| Vault 链接能力 | 有反链、出链、未解析链接、未链接提及、歧义链接选择、创建未解析目标、重命名后确认更新链接 | 这是知识工作流能力，不等于 Markdown mind map | 中高 |
| 表格 | Rich 里有 Milkdown `tableBlock`；有行列按钮、对齐按钮、导出表格；最后行 `ArrowDown` 有退出逻辑 | 需要系统回归：键盘退出、行列操作、保存一致性 | 中高 |
| 图片 | 支持粘贴、拖入、导入图片，复制到附件目录并写入 Markdown 图片路径；Rich 可预览本地图片 | 图片路径、安全、保存是高风险路径 | 高 |
| Frontmatter | Rich 顶部属性条；支持 tags/aliases/status；Vault 标签索引按 `status: active/inactive` | Rich serializer 和 App 同步边界要谨慎 | 中高 |
| 数学公式 | HTML/PDF 导出层能保留 `$x$` / `$$...$$`，渲成 `math-inline/math-block` 文本容器 | 当前没有 `katex` 依赖，不是 KaTeX 真渲染；Rich 里不是核心能力 | 低中 |
| Mermaid | 当前没有 `mermaid` 依赖；代码块按普通代码处理 | 未作为核心能力实现 | 低 |
| TOC | 有 outline 提取、标题列表、标题跳转 | 未实现 `[TOC]` 自动目录渲染/导出 | 低中 |
| 思维导图 | 有 Vault graph / local graph / global graph / link graph | 没有当前文档 Markdown mind map；知识图谱不是思维导图 | 低 |
| 自动保存 / 状态 | 有 dirty/saved/error 状态、保存/另存为、后台保存队列、外部文件变更冲突提示、行尾保持 | 与编辑流衔接还需体验打磨 | 中高 |
| 导出 | HTML/PDF 导出；支持标题、列表、表格、任务列表、脚注、图片、基础 math 文本保留 | 不支持 Mermaid/KaTeX 真渲染；复杂 Markdown 覆盖有限 | 中 |
| Vault / 文件树 | 懒加载目录树、避开重目录、Vault 索引、搜索、标签、图谱 | 大 Vault 压力和 Windows release 仍需测 | 中高 |

## 2. 已有能力保护清单

### Rich Edit / Plain Edit

- Rich Edit 和 Plain Edit 都是主路径，不能只修一个。
- Plain/Rich 当前仍是两套实例；修单编辑器顺滑感时，不得破坏已有保存、链接、代码块、表格、图片、frontmatter 行为。
- Rich 模式标准 `Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z` 优先由 Rich Editor 内部 history 处理。
- 不要为了跨模式 undo，把 Rich 内部已验证过的 undo/scroll 路径删掉。
- App 层 markdown history 是过渡方案，不能替代 Rich 内部 ProseMirror history 的 selection 语义。

### Ctrl+Z / Redo / 滚动

- History 负责内容和 ProseMirror selection。
- 滚动补偿只读 selection 并调整 scroll，不得擅自改 selection。
- 目标 selection 已经在当前可视区域时保持滚动。
- 目标 selection 离屏时滚到目标附近/中间。
- 不能无条件 `scrollIntoView`。
- 不能让撤回目标贴在编辑框最上方。
- 不能用 markdown offset 到 ProseMirror selection 映射作为第一修法。
- 不能恢复 Rich undo fallback 到 App 字符串 markdown history，除非经过明确设计和用户确认。

### 代码块

- 代码块是基础能力，不是高级功能。
- 代码文本、selection、history、IME、保存归 Milkdown/ProseMirror。
- NodeView 只做 wrapper UI：语言按钮、候选列表、复制按钮、语法高亮 DOM。
- 不要重新引入嵌套可编辑 CodeMirror 作为代码块主编辑器。
- 必须保护：
  - IME 连续输入。
  - 代码块内 undo/redo。
  - 光标和滚动同步。
  - `Tab / Shift+Tab` 缩进/反缩进。
  - 空代码块 Backspace 转普通段落。
  - 空行 `Enter` 退出结构块。
  - 最后一行 `ArrowDown` 到语言控件。
  - 语言控件中 `ArrowDown` 退出代码块。
  - EOF code block 退出。
  - 嵌套 list/quote/code 退出。

### 代码块语言控件

- 语言控件必须常驻在当前代码块右下方。
- 语言值必须可键盘编辑。
- 候选列表必须可选择。
- 候选列表必须包含 `bash`。
- `bash/Bash/BASH` 等大小写输入要保留。
- 未识别语言不高亮，但必须保留用户输入值。
- 不要把“键盘可编辑”改成“只能键盘编辑”。
- 不要让语言控件阻塞代码块自然导航。

### 链接编辑和跳转

- 标准 Markdown link 普通点击用于展开/编辑。
- `Ctrl/Cmd + 左键` 才执行跳转。
- 光标或 selection 仍在展开链接内时，链接不能自动收回。
- 离开链接范围后再收回成渲染态。
- Wiki link、Markdown link、autolink 是不同状态机，不能混成一个简单 regex。
- 本地 `md/markdown/txt` 优先在 Serein 内打开。
- 其他本地文件或目录交给系统打开。
- 外部协议如 `http/https/mailto` 交给系统打开。
- 跳转失败必须 toast 提示。

### 表格

- 表格已有 Milkdown `tableBlock` 基础能力。
- 表格行列按钮、对齐按钮、最后行退出路径不能在样式或事件重构中丢失。
- 修表格时必须同时验证：
  - Rich 保存后 Markdown 一致。
  - 键盘进入/退出。
  - 行列增删。
  - 对齐保存。
  - 和代码块/链接快捷键不冲突。

### 图片

- 图片导入、粘贴、拖入、附件目录复制、Markdown 路径写入属于数据安全路径。
- 不要静默改图片路径策略。
- 不要让本地绝对路径、相对路径、Windows 路径归一化互相污染。
- Rich 预览路径改动必须验证保存后的 Markdown 源码。

### Vault / 知识能力

- 右侧知识栏能力包括反链、出链、属性、图谱、标签。
- 当前图谱是 Vault graph / link graph，不是当前文档 Markdown mind map。
- 不要把 Markdown mind map 塞进右侧知识栏当作主入口。
- Markdown mind map 应作为编辑模式之一，与实时预览/源码模式同级。
- Vault 文件树必须懒加载，不能恢复整树递归扫描。
- 标签搜索不能依赖“文件已打开”；`status: active/inactive` 语义必须保留。

### 保存 / 自动保存 / 状态

- 保存状态必须清楚：dirty、saved、error、外部变更冲突。
- 背景保存不能吞错后显示成功。
- 保存时必须保留原文件行尾。
- 文件系统写入失败必须暴露给用户。
- 未保存内容保护优先级高于退出、重命名、链接批量更新。

## 3. 当前明显短板

1. 单编辑器状态还没完成。
   - 默认路径 Rich/Plain 仍是两套实例。
   - 实验 text-buffer 路径已经证明同一 Markdown buffer 可承载基础 Rich/Source、代码块语言、表格、图片、frontmatter、wiki/link 第一段能力，但还没过完整能力基线和 Windows release 手测。
   - App markdown history 只是默认路径过渡方案，不是最终单编辑器模型。

2. 高级 Markdown 渲染不足。
   - 数学只有导出层文本容器，不是 KaTeX。
   - Mermaid 未实现。
   - `[TOC]` 未实现。

3. Markdown mind map 未实现。
   - 现有的是 Vault graph / link graph。
   - 不是当前 Markdown 文档层级导图。

4. 表格、代码块、语言控件需要系统 GUI 回归。
   - 静态测试已有部分覆盖，但不能证明 Windows release 体验。

5. 自动保存体验还不够丝滑。
   - 基础保存和状态已有。
   - 但与 Rich/Plain 编辑流、外部变更、dirty baseline 的衔接还要继续打磨。

## 4. 后续改动确认协议

改已有能力前，先在回复里给出以下模板，不要直接动手：

```text
目标：
当前已有行为：
准备修改的文件：
为什么必须改：
会影响的已有能力：
准备保护的行为：
最小验证：
需要用户确认的变化：
```

只有以下情况可以不等用户确认直接改：

- 纯文档补充，不改变代码行为。
- 明确 bug fix，且只恢复已有行为，不改变用户可见语义。
- 小范围测试补充，不影响运行时。

以下情况必须等用户确认：

- 改 Rich/Plain 切换模型。
- 改 undo/redo/selection/scroll。
- 改代码块编辑模型或语言控件事件路径。
- 改链接展开/收回/跳转语义。
- 改保存、自动保存、dirty 状态、文件写入。
- 改 Vault 索引时机、搜索语义、标签 active/inactive 规则。
- 引入 KaTeX、Mermaid、mind map 等新依赖或新渲染引擎。
- 把现有入口移动、合并、删除。

## 5. 推荐推进顺序

1. 先稳编辑器地基。
   - Rich `Ctrl+Z / Redo`、selection、scroll。
   - Plain/Rich 切换状态。
   - 代码块退出和语言控件。
   - 链接状态机保护。

2. 再补系统回归。
   - 表格键盘路径。
   - 图片导入/预览/保存。
   - Frontmatter 与 dirty baseline。
   - 自动保存和外部文件冲突。

3. 再补 Markdown 高级能力。
   - KaTeX。
   - Mermaid。
   - `[TOC]`。

4. 最后做 Markdown mind map。
   - 作为编辑模式，不放右侧知识栏主入口。
   - 参考幕布和 markdown.com.cn/mind。
   - 先做可用层级视图，再做导出图片/PDF。

## 6. 修改后最低验证

根据改动范围选择最小相关验证，但不能只说“应该可以”：

```bash
cd apps/serein-desktop
npm run typecheck
npm run test
npm run build
```

Rust/Tauri 改动：

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-desktop-tauri-target /home/slam/.cargo/bin/cargo check
```

涉及 UI/编辑器交互时，必须补充：

- 是否启动 GUI。
- 是否测 Windows release `.exe`。
- 未测 Windows 时明确说明“未验证 Windows release 行为”。
- 用户复测结果优先级高于浏览器/dev server 推断。
