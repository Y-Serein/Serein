# Serein 桌面版用户指南

Serein 是一个本地 Markdown 桌面写作工具，提供沉浸式编辑和链接化 Vault 工作流。文件保存在本机磁盘上，打开、保存、重命名、删除等操作都会作用到真实本地文件。

## 快速开始

1. 打开 Serein。
2. 通过菜单 `文件 -> 打开 Vault`，或点击左侧 Vault 面板里的 `打开`。
3. 选择一个包含 Markdown 或文本文件的本地文件夹。
4. 在左侧文件树中点击 `.md`、`.markdown` 或 `.txt` 文件开始编辑。

如果应用恢复上次 Vault 时失败，可以在左侧面板点击 `清除 Vault 状态`，然后重新打开 Vault。

## 打开文件

- 打开 Vault 后，左侧会显示当前 Vault 的文件树。
- 点击文件即可打开并编辑。
- 如果启动时能恢复上次关闭前的文件，Serein 会自动打开它。
- 如果没有可恢复文件，编辑区会保持空白，并显示“请打开文件”。

## 编辑和保存

- `Plain Edit`：直接编辑 Markdown 源文本。
- `Rich Edit`：以富文本方式编辑同一份 Markdown。
- `Ctrl+S`：把当前文件保存回磁盘。
- `文件 -> 另存为`：把当前内容保存到新的路径。
- `新建文档`、`新建文件夹`、重命名、删除会作用在当前选中的 Vault 目录。

删除操作会先把文件移动到 Vault 下的 `.serein/trash`，不会直接从磁盘永久删除。确认删除前仍然要检查目标文件是否正确。

## Markdown 渲染

Rich Edit 模式使用 Milkdown 渲染 Markdown，支持常见 Markdown 结构：

- 标题
- 段落
- 加粗、斜体、删除线、行内代码
- 引用
- 有序列表和无序列表
- 链接
- 代码块

代码块支持语言选择和语法高亮。语言按钮位于代码块下方右侧，点击后可以搜索并切换语言。

## 左侧面板

左侧面板有两个标签页。

### 文件

显示当前 Vault 的文件树。

- 点击文件打开。
- 点击底部 `+` 新建文档。
- 使用 `文件 -> 新建文件夹` 在当前选中的 Vault 目录中新建文件夹。

### 大纲

显示当前文件中的标题结构。点击标题可以跳转到对应位置。

当前大纲主要显示：

- `#`
- `##`
- `###`

## 知识面板

右侧知识面板可以停靠在右侧，也可以变成浮动面板。

- 点击 `浮动`：让知识面板脱离右侧栏。
- 点击 `停靠`：恢复到右侧栏。
- 浮动状态下，可以拖动面板标题区域移动位置。

知识面板包含两个标签页：

- 反向链接
- 图谱

## 反向链接

反向链接会显示 Vault 内哪些文件链接到了当前文件。

反向链接出现需要满足：

1. 已经打开 Vault。
2. 链接来源文件在这个 Vault 内。
3. 链接格式是 Serein 当前支持的 Markdown 链接格式。
4. 文件已经保存，或 Vault 索引已经在打开、新建、重命名、删除后刷新。

## 图谱

图谱显示当前文件的局部关系。

- 中心节点是当前文件。
- 相邻节点是当前文件链接出去的文件，或链接到当前文件的文件。
- 连线来自 Vault 索引识别到的真实 Markdown 链接。
- 点击节点可以打开对应文件。

如果图谱只有一个节点，说明当前文件已经被索引，但暂时没有已解析的链接。  
如果图谱显示空状态，请先把文件保存到 Vault 内，或重新打开 Vault 让它进入索引。

## 支持的链接格式

Vault 索引当前识别这些格式：

```markdown
[[note]]
[[note#heading]]
[[note|alias]]
[text](path.md)
[text](folder/path.markdown)
[text](../relative/path.md)
[text](./)
#tag
```

对于 `[[note]]`，Serein 会按笔记名或相对路径解析。如果多个文件有相同基础文件名，可能会命中第一个索引结果。为了避免歧义，建议使用带路径的 Wiki 链接或标准 Markdown 相对链接。

对于 `[text](./)` 或 `[text](../folder/)` 这类目录链接，Serein 会尝试把目录解析到以下文件：

- `index.md`
- `index.markdown`
- `index.txt`
- `README.md`
- `README.markdown`
- `README.txt`

如果目录下没有这些文件，该链接会显示为未解析，也不会在图谱中形成文件节点连线。

外部链接和图片嵌入不会参与本地图谱。

## Vault 索引限制

为了避免大目录卡死，Vault 索引会跳过隐藏目录、重型目录和过大的文件。

当前限制：

- 支持文件类型：`.md`、`.markdown`、`.txt`
- 最多索引文件数：2000
- 单个文件最大索引大小：1 MB
- 默认跳过目录：`.git`、点号隐藏目录、`node_modules`、`target`、`build`、`dist`、`out`、`install`、`images`、`logs`、`tmp`、`__pycache__`、`venv`

如果右侧提示：

```text
索引达到上限，图谱可能不完整。
3 个过大或不可读文件已跳过。
```

意思是 Vault 索引为了保持流畅，停止继续扩大索引，或跳过了过大/不可读文件。这不会影响当前文件编辑和保存，只会让反向链接、图谱可能不完整。

处理方式：

- 缩小 Vault 范围，只打开真正写作目录。
- 把构建产物、依赖目录、图片目录、日志目录移出 Vault。
- 拆分超过 1 MB 的 Markdown 或文本文件。

## 窗口操作

- 拖动标题栏或菜单栏空白区域可以移动窗口。
- 右上角按钮用于最小化、最大化/还原和关闭窗口。
- 菜单按钮本身仍然是可点击控件，不作为拖动区域。

## 设置和快捷键

通过菜单打开：

- `帮助/应用菜单 -> 设置`
- `帮助/应用菜单 -> 快捷键`

设置中可以调整：

- 界面语言
- 默认编辑模式
- 是否启动时恢复上次 Vault
- 是否显示侧栏和知识面板
- 编辑器字体、字号、行高
- UI 缩放
- 默认保存格式
- 默认新文档名称

## Windows 打包

在 Windows PowerShell 中，从仓库根目录执行：

```powershell
.\T_tools\build_windows.ps1 -SkipInstall
```

如果缺少依赖，去掉 `-SkipInstall`：

```powershell
.\T_tools\build_windows.ps1
```

预期产物：

```text
D_deliverables\serein-desktop\src-tauri\target\release\bundle\nsis\Serein_0.0.1_x64-setup.exe
D_deliverables\serein-desktop\src-tauri\target\release\serein-desktop.exe
```
