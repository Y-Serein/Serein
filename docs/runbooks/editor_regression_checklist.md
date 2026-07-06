# Typora-like 编辑底座回归清单

最后更新：2026-05-21

用途：后续做 Obsidian-like Shell / Vault / Graph / Canvas 大改时，先用这份清单确认没有破坏基础写作体验。

## 文档生命周期

- 新建空白 Markdown。
- 打开独立 `.md/.markdown/.txt` 文件。
- 打开 Vault 内文件。
- 编辑后保存。
- 另存为 `.md` 和 `.txt`。
- 文件外部变更后保存冲突提示。
- 只读文件保存失败提示。
- 未保存修改时切换文件，需要确认。
- 关闭或打开新文件时不丢数据。

## Plain Edit

- 普通输入、换行、删除。
- 粘贴多段 Markdown。
- `Ctrl/Cmd+A` 全选。
- 代码块中 `Ctrl/Cmd+A` 智能选择代码块内容。
- 插入标题、引用、无序列表、有序列表。
- 插入表格。
- 插入链接。
- 插入图片。
- 拖拽/粘贴图片后写入相对路径。

## Rich Edit

- Markdown 初始内容正确渲染。
- Rich Edit 输入后 Markdown 源同步。
- Plain Edit 和 Rich Edit 切换不丢内容。
- 标题、列表、引用、粗体、斜体、删除线、行内代码渲染正确。
- 表格可见并能继续编辑。
- 图片可见，且本地图片不会破坏原始 Markdown 路径。
- 光标移动、选择、复制、粘贴基础行为正常。

## 链接体验

- `[text](./note.md)` 渲染为可识别链接。
- `[text](../folder/note.md)` 能解析并跳转。
- `[text](folder/)` 能解析目录下 `index.md/README.md`。
- `[text](./Untitled 2.md)` 带空格路径可解析。
- 普通点击链接用于编辑或展开。
- `Ctrl+左键` / macOS `Cmd+左键` 跳转。
- 外部 `http/https/mailto` 交给系统打开。
- 本地 Markdown/Text 优先在 Serein 内打开。
- 其他本地文件或目录交给系统打开。
- `[[note]]` 能解析和跳转。
- `[[note|alias]]` 显示 alias。
- `[[note#heading]]` 打开后应滚动到标题。
- 不存在链接应可创建文件。
- 同名文件歧义需要选择，不应静默打开第一个。

## 代码块

- 插入代码块。
- 语言控件常驻代码块下方右侧。
- 语言值可键盘直接编辑。
- `bash/Bash/BASH` 都保留用户输入。
- 识别语言则高亮，不识别则不高亮但保留输入。
- 点击语言控件可打开候选列表。
- 候选列表包含 `bash`。
- 代码块最后一行 `ArrowDown` 第一次进入语言控件。
- 语言控件中 `ArrowDown` 再退出到下一段；没有下一段则创建段落。
- 空白结构块中 `Enter` 退出结构块。

## 图片和附件

- 粘贴图片到已保存文档。
- 拖拽图片到已保存文档。
- 图片写入当前文档旁的 assets 或后续 Obsidian 附件目录。
- 图片文件名去除路径穿越风险。
- 大图片超过限制时提示。
- Vault 内图片路径不能越出 Vault。
- 图片预览失败不应破坏文档内容。

## Vault 写作体验

- 打开 Vault 只加载 root 第一层目录。
- 展开目录懒加载。
- 大目录超限提示。
- 不扫描 `.git/node_modules/target/dist/build` 等重目录。
- 新建文件。
- 新建文件夹。
- 重命名文件。
- 删除文件进入 `.serein/trash`，不永久删除。
- Quick Switcher 可打开 Vault 文件。
- Command Palette 可执行命令。

## 导出

- HTML 导出。
- PDF 导出。
- 带本地图片的导出。
- 缺失图片时明确提示。
- 导出目标扩展名和格式匹配。
- 导出不能覆盖目录。

## 最小验证命令

```bash
cd apps/serein-desktop
npm run test
npm run typecheck
npm run build
```

```bash
cd apps/serein-desktop/src-tauri
env CARGO_TARGET_DIR=/tmp/serein-tauri-target /home/slam/.cargo/bin/cargo check
```

## 必须手测

- Tauri GUI 开发态。
- Windows release `.exe`。
- 打开真实 Vault。
- 打开大 Vault。
- 编辑、保存、关闭、重开。
- 链接跳转、图片导入、导出。
