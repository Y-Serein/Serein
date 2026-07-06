# Typora 调研与 YS Writer 首版方向

## 参考来源

- Typora 官网：https://typora.io/
- Typora Markdown Reference：https://support.typora.io/Markdown-Reference/
- Typora Export：https://support.typora.io/Export/

## Typora 产品基线

Typora 的核心不是双栏 Markdown 编辑器，而是实时预览写作：用户在同一个文档区输入 Markdown，编辑痕迹会尽量转化成最终排版效果。

关键能力：

- Markdown 实时预览
- 源码模式
- 文件侧栏
- 大纲视图
- 表格、任务列表、代码块、数学公式、图表、图片
- 字数统计
- 专注模式、打字机模式
- 主题系统
- 导入导出，常见目标包括 PDF、HTML、Word 等

## YS Writer 首版取舍

首版先做“可用的写作产品”，不直接复刻 Typora 视觉。

已落地：

- 单文档区实时写作模式
- Markdown 源码编辑与即时预览
- 实时写作、源码、预览、分屏四种视图，其中实时写作是默认模式
- 本地文档列表与 localStorage 保存
- 打开本地 Markdown 文件
- 导出 Markdown、HTML、通过打印导出 PDF
- 大纲跳转、搜索、统计
- 专注模式、打字机模式、三套主题
- 常用 Markdown 渲染：标题、段落、列表、任务列表、引用、代码块、表格、链接、图片、行内代码、加粗、斜体、删除线、简单数学标记

未完成或需要后续增强：

- 真正的单区所见即所得编辑
- Word / EPUB 等高级导出
- 数学公式正式渲染
- Mermaid / PlantUML 等图表渲染
- 图片资源管理
- 多标签、文件夹工作区、全文搜索
- 插件或主题市场
