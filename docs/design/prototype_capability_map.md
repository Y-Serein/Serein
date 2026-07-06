# HTML 原型能力映射

## 需要保留

- 写作编辑：正式版用 Milkdown 替代手写 `contenteditable`。
- 标题：保留，交给 CommonMark。
- 列表：保留，交给 CommonMark 和编辑器快捷键。
- 撤销/重做：保留，交给编辑器历史能力，应用层保留入口。
- 保存：保留概念，本轮只做 demo 状态，后续接 Tauri FS。
- 导出：保留 toolbar，占位 Markdown / HTML / PDF。
- 主题：保留视觉方向，正式版用 CSS token。
- 侧栏：从“文档列表”升级为 Card / Document 列表。
- 大纲：保留右侧区域，本轮占位，后续从编辑器 state 提取。

## 暂缓

- 源码 / 预览 / 分屏模式
- 手写 Markdown parser
- localStorage 文档管理
- 打开本地 Markdown 文件
- 打字机模式
- 专注模式

## 不迁移

- 旧原型里的手写 live 编辑历史栈
- 旧原型里的手写表格、引用、代码块渲染逻辑
- 浏览器 print 作为正式 PDF 导出方案
