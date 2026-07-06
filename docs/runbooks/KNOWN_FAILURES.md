# KNOWN_FAILURES.md

本文件记录 Serein 已经踩过的失败路径。后续排查或继续改动前，先看这里；不要把已确认失败的方案重新引入。

## 2026-06-18｜快捷便签/托盘退出事故总账

### 背景

- 用户反馈 `Alt+W` 打开快捷便签从“秒出”退化为卡顿、白屏，严重时 Serein 整体卡死。
- 本轮曾为了优化启动速度引入过隐藏预热/复用 quick note WebView 的方向，实测失败。
- 用户要求：已经调好的快捷便签 UI 显示、位置、创建方式不要再被改坏；性能问题要定位根因，不要一味堆 patch。

### 当前代码基线

- 正式目录是 `apps/serein-desktop/`。
- quick note 仍走正常新建窗口路径：`open_quick_note_window`。
- Rust 创建便签窗口时应保持 `visible(false)`，由前端 `QuickNoteWindow.prepareAndShow()` 准备尺寸/位置后再 `show()`。
- `Alt+W` 默认快捷键应能在主窗口聚焦时也触发；不要因为 `main.is_focused()` 直接跳过。
- 托盘右键应有 `打开 Serein` 和 `退出 Serein`；退出要走前端未保存确认，不要在 Rust 里直接硬退出。

### 禁止再次引入

- 不要后台预热隐藏 quick note WebView。
- 不要关闭便签时改成 hide 复用窗口。
- 不要为了“看起来快”提前显示空白 WebView。
- 不要把快捷便签性能优化和 UI 样式/位置重做混在一起。
- 不要把托盘退出实现成直接 `app.exit(0)`，除非用户明确要求不保护未保存内容。

### 下次正确处理方式

- 先在 Windows release 包里复测并计时：快捷键按下、窗口创建、前端 ready、窗口 show、获得焦点分别耗时多少。
- 只改最小控制变量，例如减少 quick-note 入口 bundle、推迟非必要设置读取、减少窗口创建前同步工作。
- 每次性能实验必须可回滚，并且先确认没有破坏“位置/级联/标题栏/页脚/保存弹窗/右键菜单/任务栏显示”这些已调好的体验。

### 2026-06-18 补充：floral-notepaper 策略不能直接照搬

- `Achilng/floral-notepaper` 的便签快，是一整套池化协议：启动后延迟预热 hidden notepad window，打开时激活池中窗口，关闭时 recycle 回池，前端有 `standby=1` 和 `notepad:activate` 轻量重置路径。
- 这个策略依赖它的便签是轻量 textarea/markdown 组件；直接把“隐藏 WebView 预热/复用”搬到 Serein 已经造成卡死。
- Serein 当前优先方案是减小 quick-note 独立入口依赖，避免加载主应用共享文案、设置、文件服务和通用菜单代码；不要先恢复池化 WebView。
- 如果将来仍要实验池化，必须做成独立开关、单窗口容量、延迟到主窗口稳定后、可禁用、可回滚，并先在 Windows release 包验证。

### 2026-06-18 补充：关闭一个便签后下一次打开卡住

- 用户补充的准确现象：如果第二个便签不关，第三个、第四个打开时间和第一个一致；卡住发生在“关掉一个便签之后再开”。
- 这说明问题不应再按“窗口数量越多越慢”排查，而要优先查关闭路径、窗口销毁时序、焦点恢复和关闭前同步操作。
- 已调整方向：关闭便签时不再同步等待 `persistCurrentWindowSurface()`，避免关闭前的窗口位置读取阻塞下一次 `Alt+W`。
- 全局热键路径在主窗口可见时先轻量 focus 主窗口，再创建便签，降低 Windows 前台窗口权限导致新便签已创建但不显示/不聚焦的概率。
- 禁止把这个现象重新解释成“需要恢复隐藏 WebView 池化”。池化仍是高风险方案。

## 2026-06-18｜快捷便签预热 WebView 导致卡死

### 现象

- 为了让 `Alt+W` 秒开便签，曾尝试在 Serein 主窗口启动后后台创建一个隐藏的 `quick-note.html?cascade=0&warm=1` 便签 WebView。
- 用户实测结果是 Serein 卡死。

### 失败改动特征

不要重新引入以下标识或同类逻辑：

- `warm_quick_note_window`
- `warmQuickNoteWindow`
- `QUICK_NOTE_WARM_LABEL`
- `quick-note-revealed`
- `warm=1`
- `warmWindow`
- 关闭便签时不销毁、改成 `hide()` 并清空草稿复用窗口
- 主窗口启动阶段主动创建隐藏 quick note WebView

### 结论

- 便签启动性能不能通过“后台预热隐藏 WebView”解决。
- 后台 WebView 预加载会增加启动阶段和窗口管理复杂度，已造成卡死，禁止作为默认方案恢复。
- 后续若仍要优化 `Alt+W` 速度，必须先做可回滚实验，并在 Windows release 包里手测；不能直接并入主路径。

### 当前允许状态

- `Alt+W` 调用 `open_quick_note_window` 新建便签窗口。
- 便签窗口创建时 `visible(false)`，由 `QuickNoteWindow.prepareAndShow()` 在前端准备位置/大小后再 `show()`。
- 保留轻量 `300ms` 防抖，避免本地快捷键和全局快捷键同时触发造成双开。

## 2026-06-18｜便签窗口先显示空白 WebView

### 现象

- 便签打开时先白一会儿，再显示真实 UI。
- 用户体感是卡顿，不像桌面软件。

### 失败原因

- Rust 创建便签窗口时曾根据 `initial_surface.is_some()` 设置 `visible(true)` / `focused(true)`。
- 有上次位置和大小时，窗口会先显示一个空白 WebView，再等 React 页面加载完成。

### 禁止恢复

- 不要让 quick note WebView 在 React 便签页面准备好之前直接 `visible(true)`。
- 不要为了“看起来更快”提前显示空白窗口。

### 当前允许状态

- Rust 创建便签窗口时保持 `visible(false)`。
- 可设置和页面一致的背景色，减少极短暂平台底色闪烁。
- 前端准备尺寸、位置、置顶状态后再显示窗口。

## 2026-06-18｜Alt+W 在主窗口聚焦时不打开

### 现象

- 按 `Alt+W` 没有出现便签。

### 失败原因

- Windows 全局快捷键回调里曾判断主窗口正在聚焦就直接 `return`。
- 如果前端本地快捷键被 WebView、编辑器或焦点状态吃掉，就会变成完全不打开。

### 禁止恢复

- 不要在全局 `Alt+W` 回调里用 `main.is_focused()` 跳过打开便签。

### 当前允许状态

- 全局 `Alt+W` 无论主窗口是否聚焦，都调用同一条 `open_quick_note_window` 路径。
- 用已有防抖处理重复触发。

## 2026-06-18｜托盘退出不能直接 app.exit(0)

### 现象

- 用户要求托盘右键有彻底关闭 Serein 的选项。
- 但写作工具必须保护未保存内容。

### 失败风险

- Rust 托盘菜单直接 `app.exit(0)` 会绕过前端未保存确认，可能丢数据。

### 当前允许状态

- 托盘右键菜单应包含 `打开 Serein` 和 `退出 Serein`。
- `退出 Serein` 应先唤出主窗口，再向前端发 `serein-tray-exit-requested`。
- 前端收到后走真正退出路径：先确认未保存内容，再关闭窗口。
- 只有用户明确要求“不管未保存内容直接退出”时，才考虑硬退出；默认禁止。

## 2026-06-18｜Windows-only Rust 编译路径漏检

### 现象

- Linux/WSL 下 `cargo check` 通过，但 Windows 打包失败。
- 报错示例：调用 `get_webview_window` 时缺少 `tauri::Manager` trait 导入。

### 原因

- `#[cfg(target_os = "windows")]` 模块不会被 Linux 默认 target 编译覆盖。

### 规则

- 改 Windows 专属模块时，必须特别检查该模块自己的 `use` 作用域。
- 本机没有 Windows Rust target 时，最终回复必须明确说明“未能在本机验证 Windows target”。
- 用户在 Windows 打包报错后，要优先按报错位置修，不要假装 Linux 检查等价于 Windows 打包。

## 2026-07-01｜Rich Edit Markdown 链接预览/展开状态机反复失效

### 现象

- Rich Edit 实时预览有时不显示链接 label，而显示半截源码，例如 `[NUT(7)](https://networkupstools.org/docs/man/nut.html`。
- 普通点击链接时，源码只在鼠标按下瞬间显示，松开后又收回；再次按下可能也不展开，导致用户无法拖选复制 URL。
- Rich serializer 可能把链接保存成带多余反斜杠的源码，例如 `\[...\]\(https\://...)`。
- 用户真实片段包含：

```markdown
## 3. [eez\_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)

* <https://www.cnblogs.com/tianwuyvlianshui/p/18698331>
```

### 失败原因

- 只用简单 regex 解析 Markdown link，会在 label/URL 中出现括号、转义字符、嵌套坏链接时截断或保留错误反斜杠。
- 把标准 link `[text](url)` 和 autolink `<url>` 混成同一形态，会导致点击展开和收回转换不稳定。
- `pointerdown` 展开后，如果 `pointerup`、普通 `click` 或下一帧 `selectionchange` 继续刷新链接状态，会把刚展开的源码立即收回。
- 只判断光标是否在展开链接内不够；拖选复制时 selection 与展开链接相交也应保持展开。

### 禁止恢复

- 不要恢复 `\[([^\]]+)]\(([^)]+)\)` 这类简单链接 regex 作为 Rich Edit 主解析逻辑。
- 不要在 `pointerup` 上无条件调用链接展开/收回刷新。
- 不要让普通 anchor `click` 在非 Ctrl/Cmd 情况下既展开又触发下一帧收回。
- 不要全局删除所有反斜杠；代码块里的转义内容必须保持原样。
- 不要只用 `NUT(7)` 单个例子判断完成，必须覆盖普通链接、转义 label、autolink、嵌套坏链接和拖选复制。

### 当前允许状态

- 标准 Markdown link 由扫描式 parser 处理 bracket/paren/escape。
- Rich 模式保存/dirty baseline 使用 `normalizeRichMarkdownEscapes`，Plain 模式保留原路径。
- autolink `<https://...>` 作为独立源码形态展开和收回。
- 普通点击用于展开/编辑；`Ctrl/Cmd + 左键` 才打开链接。
- selection 与展开链接相交时保持展开；光标/焦点离开后再收回。
