# Serein Project Memory

最后更新：2026-07-10 19:00

## 用户偏好

- 默认中文沟通，表达直接、具体、以结果为导向。
- 用户接受反驳，但反驳必须给出原因、替代方案、利弊和下一步动作。
- 用户喜欢“工程控制论”闭环：目标 → 状态 → 误差 → 控制动作 → 反馈 → 修正 → 验证 → 沉淀。
- 用户反复强调：主矛盾优先，不要被零散小 bug 拖偏；但高频路径的小 bug 如果影响真实体验，也要一起修。
- 用户更喜欢简洁风格，UI 不要堆太多重复入口。搜索入口过多就是用户明确反感的例子。
- 用户对数据安全极敏感，不能接受真实文档数据或链接被破坏。
- 用户愿意做 Windows release 实测，也愿意提供干净 Windows 机器。
- 用户偏好：沉浸式写作体验优先级第一，Vault/知识工作流第二优先但仍重要。
- 用户要的是内测可用，不是为了“看起来完成”而隐藏风险。
- 用户希望 AI 先读项目规则、HANDOFF、KNOWN_FAILURES，运行 preflight，再接手；但不能停在流程表演，必须尽快收敛到可验证结果。
- 用户能接受“先不改代码、先汇报状态”的对齐阶段，但一旦问题明确，期望 AI 主动推进到修复、验证、沉淀。
- 用户会用 Windows release `.exe` 做真实反馈；Linux/浏览器验证只能作为辅助，不能替代用户实际运行环境。
- 用户对“同一个问题反复修不好”非常敏感。解释必须说明前一次假设为什么错、这次控制变量为什么更接近根因。

## 从错误里学到的最佳实践

- 不要把“索引数据存在”当成“用户体验可用”。`[[A]]` 必须在 Rich Edit 中可看、可点、可编辑、可跳转。
- UI 自动化通过不等于 Windows release 通过。Tauri 窗口控制、文件创建、安装包体验必须在 Windows/Tauri 环境实测。
- 对 Tauri 2 权限要看 capability，不要凭 API 名字猜。最大化按钮曾因走 `isMaximized/maximize/unmaximize` 权限路径而不可靠，改为已授权的 `toggleMaximize()`。
- 点击问题要考虑 SVG 图标事件目标。`event.target instanceof HTMLElement` 会漏掉 SVGElement，导致按钮点击被标题栏拖拽抢走。
- ProseMirror/Milkdown 的点击模型会吃掉第一次点击。内部 wiki link 如要单击跳转，应在 `pointerdown` 阶段处理，而不是只等 `click`。
- 浮层不要随便放在编辑器内部。`position: fixed` 在复杂布局里可能被局部上下文影响，`[[` 候选最终通过 portal 到 `document.body` 才稳定。
- 禁用按钮的视觉反馈不能制造“程序卡住”的错觉。窗口按钮执行期间用 ref 防重复即可，不要把光标变成 `wait`。
- PDF/图片导出、保存、链接跳转这些高频路径，必须让用户真实跑一遍；静态检查不能替代体验检查。
- 对数据改写功能要确认式执行。重命名链接同步不能静默批量改文档，必须保护未保存内容和并发修改。
- 复杂测试数据很有价值。`examples/complex-vault/` 比简单 demo 更能发现发布前问题。
- 当空格、回车、删除、剪切、跨行选择一起表现为“光标偏移”时，不要继续修单个快捷键；优先怀疑底层坐标系、不可见字符、行尾、编码和编辑器模型映射。
- 真实输入文件比复现脚本更重要。`Project_00_Serein.txt` 是 CRLF，浏览器 textarea/Playwright `.fill()` 可能自动规范成 LF，从而掩盖真实 Windows 文件路径的问题。
- CodeMirror 与 ProseMirror 共存时，必须保证内部文档文本的行尾一致。CodeMirror 按 LF 计位，ProseMirror 若保留 CRLF，会在第二行后出现 offset 漂移。
- 修数据入口通常优于修事件出口。本次不要再只补 `Ctrl+X`、DOM selection 或右键剪切；应在打开文件时规范化编辑器内部行尾，并在保存时保留原文件行尾。
- 修改文本规范化必须同时考虑数据安全：不能为了修编辑器坐标，把用户 CRLF 文件无提示改成 LF；应记录原行尾并保存时写回。

## 项目关键约束

- 正式交付物在 `apps/serein-desktop/`。
- 旧原型 `examples/serein-prototype/` 默认不要修改。
- 技术栈：Tauri 2 + Rust + React 18 + TypeScript + Vite + Milkdown。
- Windows `.exe` 推荐打包入口：

```powershell
.\scripts\build_windows.ps1
```

- `-SkipInstall` 是快速路径，不是不可以；发给别人前更推荐不加 `-SkipInstall`。
- 当前测试命令：

```bash
cd apps/serein-desktop
npm run test
npm run typecheck
npm run build
cd src-tauri
env CARGO_TARGET_DIR=/tmp/serein-tauri-target /home/slam/.cargo/bin/cargo check
```

- 常见 warning：
  - `MilkdownEditor` chunk 超过 500 kB。
  - `git diff --check` 可能提示未改动 `LICENSE` CRLF。
- 复杂内测 Vault：

```text
examples/complex-vault/
```

- 代码块编辑器关键路径：
  - `apps/serein-desktop/src/components/sereinCodeBlockView.ts`
  - `apps/serein-desktop/src/components/MilkdownEditor.tsx`
  - `apps/serein-desktop/src/vault/workspace.ts`
  - `apps/serein-desktop/src/App.tsx`
- 文本文件打开后，编辑器内部应统一 LF；`Note.lineEnding` 记录原始 `lf/crlf`，保存时用 `applyLineEnding` 写回。
- Windows `.txt` 文件很可能是 CRLF，尤其是用户在 PowerShell/Windows 工具链里创建或维护的文件。

## 项目关键坑

- 大目录不能递归扫描；Vault 文件树必须懒加载，并避开 `.git/node_modules/target/dist/build/images/logs/tmp` 等重目录。
- 工作区索引、图谱、未链接提及对大 Vault 有潜在性能风险，需要真实压力测试。
- Rich Edit 与 Plain Edit 都是主路径，不能只修一个。
- 标准 Markdown link 和 wiki link 的点击/编辑模型不同：Markdown link 普通点击用于编辑，wiki 内链用户期望单击跳转。
- `[[A#标题|显示文字]]` 要保留 alias 和 heading；`# test|显示文字` 这种用户写法要能跳到 `test`。
- 重命名链接同步当前是确认式批量更新，不是完整 diff 预览；正式发布前最好补预览/回滚。
- 未签名 Windows 包会触发 SmartScreen，内测可以接受，正式发布不能忽略。
- 版本号需随内测发包持续确认；频繁内测发包时要提醒测试者卸载旧版或确认安装的是新包。
- `Sipeed/docs/Project_00_Serein.txt` 是 CRLF。曾导致 Rich Edit 代码块内 `codex` 选 `ode` 后 `Ctrl+X` 变成 `ex`，以及空格、回车、跨行选择偏移。根因是 CodeMirror/ProseMirror 行尾计位不一致。
- 浏览器 dev server 探针通过不能证明 Windows release 打开真实文件也通过；如果探针通过但用户 Windows 失败，要检查真实文件字节、行尾和打包源码是否一致。
- `src/components/sereinCodeBlockView.ts` 曾处于未跟踪状态但被 `MilkdownEditor.tsx` 引用；提交/同步 Windows 源码前必须确认该文件被纳入。

## 2026-06-08 编辑器回归与剪贴板沉淀

### 用户偏好新增

- 用户对“浏览器思维”极其敏感。Serein 是桌面写作工具，不能用浏览器默认焦点跳转、Web Clipboard 权限弹窗、DOM 全页选择、页面滚动副作用来解释或掩盖编辑器行为。
- 用户反复强调：Rich Edit 和 Plain Edit 都是主路径。不能只修 Plain，Rich 仍然走浏览器默认行为；也不能只修代码块，普通文本、标题、列表同样要符合写作工具语义。
- 用户期望 AI 主动检查同类路径，不要等用户逐个截图指出。例如发现菜单粘贴问题后，要同步查复制、剪切、快捷键、上下文菜单、静态页、构建产物，而不是只修一个按钮。
- 用户接受强反驳，但不能用“理论上应该”替代验证。每次结论必须对应搜索结果、构建结果、Windows release 结果或明确的未验证说明。
- 用户更重视一次收敛和可复现验证，而不是多轮临时 patch。若前一轮假设错了，必须说清错在哪里、这次控制变量怎么变了。
- 用户希望最终沉淀到 HANDOFF、PROJECT_MEMORY 和 skill，便于 3 天后或下次 session 直接接上。

### 从错误里学到的最佳实践

- 搜索必须覆盖源码和构建产物。前端源码没有 `navigator.clipboard` 不代表 `dist` 没有；第三方宽入口可能把默认实现打入 vendor chunk。
- 不要把 `.enable_clipboard_access()` 当成原生桌面剪贴板修复。它只是放开 WebView 页面剪贴板访问，仍然保留浏览器态语义。
- 主动剪贴板读写应走 Tauri/Rust command；用户真实 `paste` 事件里的 `event.clipboardData` 可以保留，因为它是操作事件携带的数据，不是主动 Web Clipboard API 请求。
- 菜单“编辑→粘贴”不能调用 `document.execCommand("paste")`。这类浏览器遗留命令行为不可靠，也容易和权限/focus/selection 状态纠缠。
- 复制路径也要审计。只修 `readText()` 不够，`writeText()` 同样会让复制/剪切/代码块复制按钮回到 Web Clipboard API。
- 避免宽入口导入第三方组件。`@milkdown/kit/component/code-block` 只为拿 `codeBlockConfig`，却把 Milkdown 默认 copy button 的 `navigator.clipboard.writeText` 打入 vendor；应本地化配置 ctx 或使用更窄、稳定的入口。
- Linux `cargo check` 不能验证 Windows-only FFI。`#[cfg(target_os = "windows")]` 下的 import、类型、feature 必须用 Windows build 验证，或者查 `windows-sys` 实际定义并明确未实测。
- `windows-sys 0.59` 中 `CF_UNICODETEXT` 不在 `Win32::System::DataExchange`；若不想引入 `System::Ole` feature，可使用 Win32 标准格式编号 `const CF_UNICODETEXT: u32 = 13;`。
- 静态练习页也会进入 `dist`。如果用户要求“下次不想看到 Web Clipboard API”，`public/vault-quickstart.html` 这类非主应用文件也要查。
- 最后要用负向搜索收口：`navigator.clipboard`、`.readText()`、`.writeText(`、`execCommand("paste")`、`enable_clipboard_access`，并同时查 `src/src-tauri/public/dist`。

### 项目关键约束和坑新增

- 正式目录是 `apps/serein-desktop/`。旧 `archive/ys-writer-desktop/` 仅作历史归档，实际工作要以当前目录为准。
- `Serein_1.0.1_x64-setup.exe` 可能作为未跟踪安装包出现在仓库根目录；不要默认加入提交。
- 当前没有 `docs/runbooks/KNOWN_FAILURES.md`。遇到重复问题时优先查 `docs/runbooks/PROJECT_MEMORY.md`、`HANDOFF.md` 和 `docs/runbooks/skills/`。
- Windows 打包是关键验证面。WSL 的 `npm run build`、Linux `cargo check` 和源码搜索只能证明一部分，不能替代 `scripts\build_windows.ps1` 和 release `.exe` 手测。
- Rich Edit 中 Tab/Shift+Tab、Ctrl+A、Ctrl+Z、粘贴、代码块内编辑都容易被浏览器默认行为、ProseMirror selection、CodeMirror selection 三套模型互相影响；修复时必须统一成编辑器语义。
- Ctrl+Z 滚动修复不能在滚动层擅自改 ProseMirror selection。上一轮用“撤销后 selection 靠近文首就 restore 到撤销前位置”的补偿逻辑导致真实环境里无论在哪里撤销都跳文首；正确边界是 history 负责 selection，滚动层只判断当前 selection 是否可见并按需滚动。
- Vault 标签索引语义：启用状态来自 frontmatter `status: active` / `status: inactive`。未启用标签不应被搜索命中；标签不应只因当前文件打开而被索引。
- Vault 全库索引不能因单个不可读目录、条目或 metadata 读取失败而整体失败；应跳过并计入 skipped，否则搜索会退化成“只有打开过的文件靠 upsert/draft 能搜到”。

### 下次一次性达到这个效果的提示词

```text
你是 Serein 桌面编辑器回归修复负责人。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md 和 docs/runbooks/skills/serein-editor-regression-control/SKILL.md；如果项目有 preflight 就先跑。不要先猜，不要只修我指出的一个按钮。

目标：把 Serein 的编辑器行为从浏览器默认态收敛到桌面写作工具语义。Rich Edit、Plain Edit、代码块、普通文本、标题、列表、菜单命令、快捷键都要一致。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进：
1. 先列当前事实：相关源码路径、工作区改动、已知 Windows release 反馈、可验证命令。
2. 如果问题涉及粘贴/复制/剪切，必须全局搜索并消除主动 Web Clipboard API：navigator.clipboard、readText、writeText、execCommand("paste")、enable_clipboard_access；搜索范围包括 src、src-tauri、public、dist。
3. 如果问题涉及 Tab/全选/撤销/光标滚动，必须同时检查 Rich Edit、Plain Edit、CodeMirror 代码块、ProseMirror selection 和 DOM selection，不允许只 patch 单一路径。
4. 如果问题涉及 Vault 标签/索引，必须验证未打开文件、同层文件、保存后索引、status: active/inactive 过滤，不允许只验证当前打开文件。
5. 每个修复只改最小共享根因，不做无关重构；完成后跑 npm run typecheck、npm run build、cargo check，并说明 Windows build/release 是否已验证。
6. 若改到 Windows-only Rust/Tauri API，必须让 Windows build 验证；如果本机不能验证，必须查 API 定义并明确标注未实测。
7. 完成后更新 HANDOFF、PROJECT_MEMORY，并沉淀新坑到 skill。
```

### 本次沉淀出的项目 skill

```text
docs/runbooks/skills/serein-editor-regression-control/SKILL.md
```

触发场景：

- 用户提到 Web Clipboard API、浏览器态、菜单粘贴、复制/剪切、权限弹窗。
- 用户提到 Rich Edit/Plain Edit、Tab/Shift+Tab、Ctrl+A、Ctrl+Z、光标/选区/滚动异常。
- 用户提到 `@remark`、frontmatter 标签、`status: active/inactive`、未打开文件索引不到。
- 用户提到 Windows release `.exe` 和 Linux/浏览器验证不一致。

## 2026-06-09 @remark / Ctrl+Z / 启动性能回归沉淀

### 从错误里学到的新边界

- 不要为了修 `@remark` 把全库 Vault 索引放回启动链路。启动只应恢复 Vault root 和第一层目录；搜索、图谱等明确用户意图出现时再触发索引。否则会牺牲用户最敏感的启动体验。
- `@remark` 的正确闭环是：未打开目标文件时，搜索面板能触发全库索引；索引中显示状态；索引完成后命中 `status: active` frontmatter `tags`。打开/保存当前文件的 upsert 只能作为新鲜度补偿，不能作为唯一检索来源。
- Ctrl+Z 滚动判断不能用“撤销后 selection 在旧 scrollTop 下是否可见”这种坐标推断，真实环境会出现方向反。应记录撤销前 selection 是否可见：可见则保持原滚动，不可见才滚到撤销后的真实 selection。
- Ctrl+Z 修复仍不能改 ProseMirror selection。滚动层只调整 scroll；撤销/重做 selection 归 history 管。
- 2026-06-09 用户复测进一步证明：在当前代码形态下，任何自定义 `Ctrl+Z` scroll restore/scrollIntoView 包装都可能把撤销带回文首。当前应先完全撤掉自定义撤销滚动层，回到 Milkdown/ProseMirror history 默认行为；若离屏不滚动仍存在，必须基于 Windows release 真实复现重新设计。
- `@remark` 搜索入口不止左侧搜索面板。Quick open / CommandPalette 也会调用 `searchVaultIndex`，不能只给 VaultSidebar 加索引触发。快速打开不能以 `vaultIndex.files.length` 作为启用条件，否则未索引时入口本身会被锁死。
- 2026-06-09 用户确认 `Ctrl+Z` 回开头主因在代码块。正文 ProseMirror 相对正常不代表代码块正常；CodeMirror node view 有自己的 history/selection/scroll 桥接，必须单独测。
- 代码块内 `Ctrl+Z` 的目标行为：光标离屏时撤销后把光标滚到编辑区域中间，不是滚到代码块或编辑框开头；撤销后继续输入必须留在代码块原光标附近。
- 所有涉及撤销、光标、滚动、Tab、剪切/复制/粘贴、选择的编辑器回归测试都必须包含代码块路径。只测正文是无效覆盖。
- Playwright/Vite smoke 可验证滚动方向，但 Windows release `.exe` 仍是最终体验面。若用户 Windows 反馈和浏览器 smoke 冲突，优先相信用户反馈并查打包源码、WebView 焦点/滚动差异。

### 本轮有效验证

- `npm run typecheck`、`npm test`、`npm run build`、`cargo check` 全部通过。
- Playwright smoke 覆盖：
  - 光标可见：`Ctrl+Z` 后 `scrollTop` 不变。
  - 光标离屏：`Ctrl+Z` 后滚回光标附近。
  - 撤销后继续输入：token 留在文尾，不跑到文首。
- `tests/vault.test.mjs` 已有真实 `../../tests/fixtures/rich-edit/new.md` 未打开文件 `@remark` fixture，但 Tauri release 中“搜索面板触发索引”仍需 Windows 手测确认。

## 下次一次性达到类似效果的提示词

```text
你是这个项目的发布审核者和工程控制论式接手者。请先阅读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md（如存在），运行项目 preflight。目标是判断 Serein 是否能发内测，不要急着改代码。

我的优先级是：沉浸式写作体验第一，Vault/知识工作流第二；数据安全不能妥协；UI 简洁，不要重复入口；必须以 Windows release .exe 体验为准。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进：
1. 先给发布状态和风险清单。
2. 如果发现阻断内测的问题，做最小可回滚修复。
3. 每个修复必须说明验证命令或无法验证原因。
4. 对 Vault/链接/保存/导出/窗口控制要优先保护真实用户数据。
5. 不要修改旧原型 `examples/serein-prototype/`。
6. 完成后更新 HANDOFF 和项目 memory，并给我可执行的 Windows 手测清单。
```

### 针对 Rich Edit / 代码块偏移的更强提示词

```text
你是 Serein Rich Edit 编辑器问题排查者。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md，运行 preflight。我的问题发生在 Windows release .exe，不要只用浏览器 dev server 结论替代。

请按闭环定位，不要先猜快捷键：
目标：代码块内光标、选区、输入、删除、剪切、跨行选择都必须和视觉位置一致。
状态：先确认问题文件的真实字节特征，包括 CRLF/LF、编码、是否含不可见字符；再确认 Windows 包是否包含当前源码。
误差：如果多个编辑动作一起偏移，优先检查 CodeMirror/ProseMirror 的位置映射、行尾规范化、DOM selection 与内部 selection 的差异。
控制动作：只改最小共享根因，不要分别 patch 空格、回车、Ctrl+X。
验证：覆盖真实问题文件、代码块第二行以后、c 后空格、c 后回车、选 ode 后 Ctrl+X、跨行选择删除；说明哪些只能由 Windows release 实测确认。
沉淀：修复后写 HANDOFF、PROJECT_MEMORY，并更新项目 skill。
```

## 当前发布判定

- 当前可以发内测。
- 不建议正式公开发布。
- 内测用户应先用复制出来的 Vault 测试，不要直接打开唯一的重要文档。
- 等内测反馈后，按 bug 严重度和高频路径优先修补。

## 跨项目设计沉淀

- 通用设计方法论：`docs/design/PROJECT_DESIGN_PLAYBOOK.md`
- 可复制到新项目的通用 skill：`docs/runbooks/skills/product-control-design/SKILL.md`
- Serein release/bug triage skill：`docs/runbooks/skills/serein-release-control/SKILL.md`
- 全局记忆：`/home/slam/.codex/memories/project_engineering_design_playbook.md`

下次新项目不应照搬 Serein 的具体功能，而应复用它的判断标准：主矛盾优先、数据安全优先、主路径体验优先、UI 简洁克制、架构边界清楚、验证贴近真实风险。

## 2026-06-15 代码块架构、菜单栏与简洁 UI 回归沉淀

### 本轮结果状态

- 已提交本地发布版本：`baa8a93 Release v1.0.3`。
- 已创建本地 tag：`v1.0.3`。
- 未 push，所以 GitHub 暂时不会显示 `v1.0.3`。
- 未生成 Windows v1.0.3 安装包；根目录仍有未跟踪旧包 `Serein_1.0.2_x64-setup.exe`，不要默认加入提交。
- 本轮验证通过：`git diff --check`、`npm test`、`npm run build`、`cargo check`。
- Windows release `.exe` 仍需用户实测；Linux/WSL 验证不能替代搜狗输入法、WebView、窗口拖动和菜单 hover 体验。

### 用户偏好新增

- 用户不反对参考 Typora/Obsidian，但明确不接受“盲目模仿”。目标是做得好、简洁、稳定，并保留 Serein 自己已经有用的小细节。
- 用户反复强调代码块是基础功能，不是高级功能。代码块内 IME 输入、撤销/恢复、光标滚动、退出规则、复制粘贴、语言显示、语法高亮都属于必须稳定的写作路径。
- 用户对“之前做过的小细节被新架构吃掉”非常敏感。右下角语言控件、代码块退出、文末代码块回车、语言候选、键盘可编辑语言名等细节不能因为换实现方式丢失。
- 用户喜欢轻、克制、少边框的 UI：左侧目录栏、ribbon、tab、菜单栏不要到处有框、粗图标、厚 hover 背景、浮夸阴影。
- 用户会用截图框选具体空隙/厚度/蓝框范围。遇到这种反馈时，应先确认截图里被框选的是哪个真实 CSS 盒子，再改最小选择器。
- 用户希望“差不多了”之后 AI 主动做全局细节检索，查旧类名、草稿态、未清状态、菜单/快捷键相邻路径，而不是等用户逐个发现。
- 用户要的是桌面写作工具体验：光标和屏幕必须同步；撤销目标可见时不要强行居中，离屏时也不能贴到输入框最上方。
- 用户允许反驳，但必须有证据、替代方案和利弊。比如从嵌套 CodeMirror 切回单一 ProseMirror 模型，需要说明为什么更稳，以及会牺牲/保留哪些 UI 细节。

### 从错误里学到的最佳实践

- 代码块不要再使用“可编辑 CodeMirror 嵌套在 ProseMirror NodeView”作为主实现。双编辑器模型会让 IME、撤销历史、selection、保存、复制粘贴和滚动补偿互相打架。
- 当前有效架构是：代码文本与 selection 归 Milkdown/ProseMirror；NodeView 只提供 wrapper UI；语法高亮是 display-only 装饰，不拥有文档模型。
- 修代码块时必须先列出要保护的旧细节：右下角语言控件、语言可键盘编辑、候选列表、`bash/Bash/BASH` 保留、识别不到语言也保留文本、`ArrowDown` 进入语言控件/再退出代码块、空行退出规则、空代码块 Backspace 转普通段落。
- 撤销/恢复滚动要以“撤销目标 selection 是否已经在当前可视区域”为边界。已可见则保持滚动；不可见才滚到目标附近。不要无条件 `scrollIntoView` 或居中。
- 搜狗输入法这类 IME 问题通常说明编辑器模型或事件桥接错了，不能靠 patch 单个 `input`/`keydown` 分支长期稳定。
- CSS 视觉问题要查 cascade。v31 代码块“绿底太大”的根因不是代码块宽度，而是通用 `.milkdown pre` 的背景/padding 泄漏到了 `.serein-code-host`。
- 代码块视觉盒子应区分外层布局盒和可见内容盒。外层可以保留透明 padding 对齐，背景应放在 `.serein-code-content`，这样可见块大小接近截图蓝框。
- 语言控件状态要清理完整。`data-language-draft` 草稿态如果不在候选菜单选择或外部语言属性更新时清掉，会出现右下角显示和真实语言不一致。
- 菜单栏交互必须同时考虑 hover、点击命令、点击外部和窗口拖动。空白菜单栏应可拖动；菜单按钮/弹层不能误触发拖动；鼠标离开菜单栏和弹层后弹层应关闭。
- UI“变轻”不只是改颜色：要一起看边框、阴影、active 条、hover 位移、SVG stroke-width、按钮尺寸、tab 高度和局部留白。
- 发布版本必须同步版本号：`package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`。
- 提交发布版本前必须检查 staged 范围，不要把旧根目录 `.exe` 或构建产物混进 commit。
- Git 仓库可能有 dubious ownership；用 `git -c safe.directory=/home/slam/Project/Serein ...`，不要为了方便改全局配置。
- 如果仓库没有 Git 身份，按项目规则可用一次性身份 `Y-Serein <2034755070@qq.com>` 提交，不改全局 Git 配置。

### 项目关键约束和坑新增

- 当前正式目录是 `apps/serein-desktop/`，不是旧规则里的 `ys-writer-desktop`。
- 2026-06-18 起当前仓库已有 `docs/runbooks/KNOWN_FAILURES.md`；重复问题必须先查该文件，再查 `HANDOFF.md`、`docs/runbooks/PROJECT_MEMORY.md` 和 `docs/runbooks/skills/`。
- `python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora` 可运行，但脚本内置路径仍指向 `/home/rv_nano/Sipeed/...`，会报告目标路径缺失；不要把这个误判为当前仓库不存在。
- `rg` 在当前环境可能不可用；按全局习惯优先 `rg`，失败后直接退到 `grep/find`，不要卡住。
- 代码块相关关键路径：
  - `apps/serein-desktop/src/components/MilkdownEditor.tsx`
  - `apps/serein-desktop/src/components/sereinCodeBlockView.ts`
  - `apps/serein-desktop/src/components/codeBlockConfig.ts`
  - `apps/serein-desktop/src/styles.css`
- 顶部菜单栏关键路径：
  - `apps/serein-desktop/src/features/window-chrome/WindowChrome.tsx`
  - `apps/serein-desktop/src/App.tsx` 中的 `isWindowDragBlockedTarget` / `handleChromeDragMouseDown`
  - `apps/serein-desktop/src/styles.css` 中的 `.menu-popover` / `.command-bar`
- 侧栏/简洁 UI 关键路径：
  - `apps/serein-desktop/src/features/vault-sidebar/VaultSidebar.tsx`
  - `apps/serein-desktop/src/features/shell/WorkspaceRibbon.tsx`
  - `apps/serein-desktop/src/styles.css`
- 当前发布状态：`v1.0.3` 是本地 commit + 本地 tag；GitHub 可见需要 push 分支和 tag。

### 下次一次性达到这轮效果的提示词

```text
你是 Serein 桌面编辑器和发布回归负责人。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md，以及 docs/runbooks/skills/serein-editor-regression-control/SKILL.md；如果 preflight 可运行就跑，但不要被旧路径误导。请默认中文、直接、以结果为导向。

目标：收敛 Rich Edit/代码块/窗口 chrome/UI 细节到可发内测状态。不要只修我指出的一个现象，要保护已有小细节，避免新架构吃掉旧体验。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进：
1. 先确认当前分支、tag、工作区改动、正式 app 目录、最近 HANDOFF 状态。
2. 代码块必须采用单一 ProseMirror/Milkdown 文档模型：代码文本和 selection 归主编辑器，NodeView 只做语言按钮/候选/复制/高亮 wrapper；不要重新嵌套可编辑 CodeMirror。
3. 修代码块前列出必须保留的小细节：搜狗/IME 连续输入、撤销/恢复滚动、复制粘贴、空行退出规则、空代码块 Backspace、右下角语言显示、语言可键盘编辑、候选列表、ArrowDown 进入语言控件再退出、识别不到语言也保留语言名。
4. 如果问题是撤销/滚动：目标 selection 已在当前屏幕时不要滚动；目标离屏时滚到附近但不能贴在输入框最上方。不要无条件居中或 scrollIntoView。
5. 如果问题是 UI 厚重：先确认截图中被框选的是哪个 CSS 盒子，再从边框、阴影、hover 背景、active 条、SVG stroke-width、留白逐项最小收敛。不要为了轻量删掉功能控件。
6. 如果问题是菜单栏：同时验证 hover 自动展开/离开关闭、点击菜单项后关闭、点击外部关闭、菜单栏空白区拖动窗口、菜单按钮/弹层不误拖动。
7. 完成后做全局细节扫尾：旧类名残留、草稿态未清、TODO/debugger、旧 CodeMirror `.cm-*` 残留、未跟踪安装包、版本号不同步。
8. 验证至少跑 `git diff --check`、`npm test`、`npm run build`、`cargo check`；Windows release 未手测必须明确标注。
9. 若做发布版本，同步 package/lock/tauri/Cargo/Cargo.lock 版本号，提交后打 tag；未 push 时明确说明 GitHub 不可见。
10. 结束时更新 HANDOFF、PROJECT_MEMORY，并把可复用流程补进项目 skill。
```

### 本轮沉淀到 skill 的方向

已将本轮流程沉淀到：

```text
docs/runbooks/skills/serein-editor-regression-control/SKILL.md
```

下次以下场景应触发该 skill：

- 代码块 IME、撤销、滚动、复制粘贴、语言控件、语法高亮、退出规则异常。
- 用户说“之前做过的小细节没了”“不要一味模仿 Typora/Obsidian”“做得更简洁但保留细节”。
- 顶部菜单 hover 不关闭、菜单栏空白不能拖动、窗口 chrome 行为不符合桌面应用。
- 侧栏/ribbon/tab/icon 看起来太厚、边框太多、符号不简洁。
- 发布前要提交版本、打 tag、确认本地/远端/GitHub 可见状态。

## 2026-06-18 快捷便签/托盘退出事故沉淀

### 当前结论

- 快捷便签性能不能再走“后台预热隐藏 WebView”方向。该方案已经造成 Serein 卡死。
- 便签窗口不要在 React 页面准备好之前显示。提前 `visible(true)` 会产生白屏和卡顿体感。
- `Alt+W` 不应因为主窗口聚焦而跳过全局快捷键路径，否则前端本地快捷键被吃掉时会完全打不开。
- 快捷便签已调好的 UI 显示、位置、级联创建方式不要再随性能优化重做。
- 托盘退出必须保护未保存内容，默认通过前端 `serein-tray-exit-requested` 走确认流程；不要在 Rust 托盘菜单里直接 `app.exit(0)`。

### 下次处理原则

- 先读 `docs/runbooks/KNOWN_FAILURES.md`，其中已经记录禁止恢复的标识和失败路径。
- 继续优化 `Alt+W` 时先测 Windows release 包真实耗时，再决定是否减小 quick-note bundle、推迟设置读取或减少同步工作。
- 不要把“启动速度优化”和“便签 UI 样式/位置优化”混在同一轮里改；否则很难判断卡顿来自窗口创建、前端加载、焦点切换还是样式/布局。
- Linux/WSL 的 `cargo check` 不能覆盖 Windows-only Rust 模块；改 `#[cfg(target_os = "windows")]` 代码后必须让 Windows 打包验证。

## 2026-07-01 Rich Edit Markdown 链接状态机沉淀

### 本轮结果状态

- 本轮修复 Rich Edit 中 Markdown link、escaped link、nested-bad link、autolink 的预览/展开/收回不一致问题。
- 当前正式 app 目录仍是 `apps/serein-desktop/`。
- 本轮涉及文件：
  - `apps/serein-desktop/src/components/MilkdownEditor.tsx`
  - `apps/serein-desktop/src/shared/markdown.ts`
  - `apps/serein-desktop/src/App.tsx`
  - `apps/serein-desktop/tests/vault.test.mjs`
- 本轮验证通过：`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check`。
- GUI 自动化未完成：当前环境缺 Python `playwright` 包。Windows release `.exe` 手测仍是最终体验面。
- 根目录仍可能有未跟踪安装包 `Serein_1.0.4_x64-setup.exe`；不要默认纳入提交。

### 用户偏好新增

- 用户反复强调“实时预览”不是只要能渲染，而是 Typora-like 的稳定编辑模型：默认显示渲染结果，普通点击展开源码方便编辑/复制，离开后收回。
- 用户对“只修一个示例”不满意。链接问题必须覆盖同一机制下的标准链接、转义链接、文本含转义字符、URL autolink、嵌套坏链接、选择复制。
- 用户会用真实 Markdown 片段复测，不接受只用简化测试串证明成功。
- 用户希望 AI 能反驳，但更希望前一次失败后明确说明为什么失败、这次扩大了哪些相邻路径，而不是继续堆 patch。
- 用户对编辑器高频路径的状态机问题很敏感：按下显示、松开消失、再次按下不展开，这类现象必须按事件竞争和 selection 状态排查。
- 用户希望沉淀能直接复用：更新 `HANDOFF.md`、`PROJECT_MEMORY.md`，并把可复用过程写成 skill。

### 从错误里学到的最佳实践

- Markdown link 不能用简单 `\[([^\]]+)]\(([^)]+)\)` 这类 regex 处理。链接文本和 URL 都可能包含括号、转义字符或嵌套坏链接，必须用扫描式 parser 追踪 bracket/paren 和 escape。
- 不要把 link、autolink、wiki link 混成一个状态。标准 Markdown link `[text](url)`、autolink `<https://...>`、wiki link `[[target]]` 的源码形态和点击语义不同。
- Rich Edit link 至少有三态：
  - 预览态：默认只显示 label 或 URL，可点击。
  - 源码展开态：普通点击后在正文里临时显示 `[text](url)` 或 `<url>`，方便编辑/选择复制。
  - 跳转态：`Ctrl/Cmd + 左键` 才打开链接。
- 事件状态机要明确“谁可以展开、谁可以收回”。`pointerdown` 展开后，不能让 `pointerup`、普通 `click` 或下一帧 `selectionchange` 立刻收回。
- 选区和光标要区别处理。选区仍与展开链接相交时应保持展开，否则用户无法拖选复制；光标/焦点离开才收回并转换成 link mark。
- Rich serializer 可能为了 Markdown 安全输出 `\[...\]\(...)`、`https\:`、`\_`、`\<...\>`。保存/dirty baseline 层要做有边界的归一化，但不能全局删除反斜杠。
- 归一化必须跳过 fenced code block。代码块里的 `\[link]`、`https\:` 是用户源码，不应被写作层修正。
- 修 Rich Edit 交互时，应同时补测试里的真实用户片段。测试至少覆盖：
  - `### \[NUT(7)]\(https\://networkupstools.org/docs/man/nut.html)`
  - 嵌套坏链接 `[text]([url](url))`
  - `[eez\_studio...](...)`
  - `* \<https\://www.cnblogs.com/...\>` 或 `<https://...>`

### 项目关键约束和坑新增

- `MilkdownEditor.tsx` 是 Rich Edit link 状态机主战场。核心函数包括：
  - `markdownLinkSources`
  - `convertTypedMarkdownLink`
  - `markdownLinkTextRangeAtCursor`
  - `convertMarkdownLinkRange`
  - `expandActiveLinkToMarkdown`
  - `refreshExpandedLink`
  - `handlePointerDown`
  - `handleFocusOut`
  - `handleClick`
- `shared/markdown.ts` 是保存/dirty baseline 层的 Markdown 归一化位置。Rich 模式可用 `normalizeRichMarkdownEscapes`，Plain 模式不要被误改。
- `App.tsx` 中 Rich/Plain mode 的 `handleMarkdownChange` 和 `handleRichMarkdownBaseline` 必须分流；不要让 Rich 的 serializer 修复污染 Plain Edit。
- GUI 自动化验证需要 Python Playwright 环境。当前环境没有 `playwright` 包；如果下次要做鼠标点击/拖选验证，先安装或启用可用 Playwright 工具链。
- Linux `npm run build` 只能证明前端可构建，不能证明 Windows release WebView 下鼠标拖选、链接打开、系统浏览器跳转完全一致。

### 下次一次性达到这轮效果的提示词

```text
你是 Serein Rich Edit Markdown 链接状态机修复负责人。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，以及 docs/runbooks/skills/serein-rich-edit-markdown-links/SKILL.md；运行 preflight，但不要被旧 /home/rv_nano 路径误导。默认中文，直接、以结果为导向。

目标：让 Rich Edit 的 Markdown link/autolink 行为接近 Typora：默认渲染 label 或 URL；普通点击在正文中临时展开源码方便编辑和复制；选区仍在链接内时保持展开；光标/焦点离开后收回；Ctrl/Cmd+点击才打开链接。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进：
1. 先确认正式 app 目录、当前 git 状态、最近 HANDOFF、已有 Rich Edit link 相关函数和测试。
2. 不要用简单 regex 修链接。必须检查标准链接 `[text](url)`、文本含转义如 `[eez\_studio](url)`、URL/label 含括号、嵌套坏链接 `[text]([url](url))`、autolink `<https://...>`、wiki link 是否被误伤。
3. 把 link 机制分成三态：预览态、源码展开态、跳转态；明确每个事件 pointerdown/click/pointerup/selectionchange/focusout/keydown 是否能展开或收回。
4. 普通点击只负责展开/定位光标，不打开链接；Ctrl/Cmd+点击才打开。拖选复制时不要因为 selectionchange 自动收回。
5. Rich serializer 产生的 `\[...\]\(...)`、`https\:`, `\_`, `\<...\>` 要在 Rich 保存/baseline 层有边界地归一化；代码块必须跳过。
6. 每次修复都加入用户真实 Markdown 片段作为测试，不要只用简化字符串。
7. 验证至少跑 `npm run test`、`npm run typecheck`、`npm run build`、`git diff --check`。如果没有 GUI 自动化或 Windows release 手测，明确标注未验证。
8. 完成后更新 HANDOFF、PROJECT_MEMORY、KNOWN_FAILURES 和 skill，只提交本轮相关文件，不要纳入未跟踪 `.exe`。
```

### 本轮沉淀到 skill 的方向

新增项目 skill：

```text
docs/runbooks/skills/serein-rich-edit-markdown-links/SKILL.md
```

下次以下场景应触发该 skill：

- Rich Edit 链接默认预览显示了 `[text](url)` 源码或半截链接。
- 标题链接、普通链接、URL autolink、带转义字符的链接显示不一致。
- 用户点击链接时“按下显示、松开消失”或无法拖选复制链接。
- Rich Edit 保存后出现多余反斜杠，如 `\[...\]\(...)`、`https\:`、`\_`、`\<https...\>`。
- 链接普通点击/编辑和 Ctrl/Cmd 跳转边界不清。

## 2026-07-01 Rich Edit 光标跳文末 / nested fence 回归沉淀

### 本轮结果状态

- 用户反馈：最新版安装包中，打开 `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt`，Rich Edit 预览模式下任意位置输入字符或空格后，真实光标跳到文末；页面本身不立即滚动，按方向键后才滚过去。
- 用户补充后修正判断：不是所有文件都触发，也不是代码块内部特有问题；目前只发现该复杂 `.txt` 文件触发。
- 已修复并本地提交：`45979ad fix: stabilize rich edit cursor with nested fences`。
- 用户复测确认：“确实是那个问题，现在可以了”。
- 当前 main 本地领先 `origin/main` 5 个提交；未 push。
- 根目录仍有未跟踪安装包 `Serein_1.0.4_x64-setup.exe`，不要默认纳入提交。

### 用户偏好新增

- 用户会先要求“别急着改代码、先接手汇报”，但一旦根因明确，就希望 AI 自主修复、验证、提交和沉淀。
- 用户接受 AI 反驳和修正判断，但必须基于新事实。例如“任意位置都会跳”一开始像全局 Rich 回灌；用户补充“只有这一个文件”后必须立刻收窄到文件内容触发条件。
- 用户重视真实用户文件。`tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt` 这类复杂真实文档比简化字符串更能代表风险。
- 用户不满意“保存光标再恢复”这种治标方案；更希望定位导致光标跳转的共享根因。
- 用户希望完成后沉淀到 `HANDOFF.md`、`PROJECT_MEMORY.md` 和项目 skill，下次能 30 秒接上。
- 用户愿意直接复测安装版并反馈结论；这种反馈优先级高于浏览器/dev server 推断。

### 从错误里学到的最佳实践

- “任意输入后光标跳文末”不应先修 selection restore。Rich Edit 里更应优先查是否触发了全文 `replaceAll(...)`、文档重设、父子 markdown A/B 回灌差异。
- 如果问题只在某个文件触发，不能继续按全局事件 bug 推断；要分析该文件的 Markdown 结构、HTML、frontmatter、fenced code、链接、转义字符和行尾。
- Rich serializer cleanup 和编辑器内部 `lastKnownMarkdownRef` 必须使用同一份最终归一化结果。否则 Milkdown 发出 A，App 存 B，下一轮 B 回传时会被误判为外部文档变化。
- 归一化函数必须按 CommonMark fence 字符和长度处理 fenced code block：
  - 三反引号只能关闭三反引号或更短的同字符 fence。
  - 四反引号代码块里的三反引号是普通内容，不能反转 inFence 状态。
  - 反引号 fence 和波浪线 fence 不能互相关闭。
- `normalizeWikiLinkEscapes()` 和 `normalizeRichMarkdownEscapes()` 这类写作层归一化只能处理 code fence 外的行。代码块里的 `\[link]`、`https\:`、三反引号示例都是用户源码。
- 修 Rich Edit 链接/归一化时，要同时验证“不会让当前真实文件发生无意义文本变化”。本轮用 `Project_03_vibe-keyboard.txt` 做 `normalizeRichMarkdownEscapes` 前后比较，结果 `same: true`。
- 遇到复杂编辑器问题时，控制变量要小：本轮只改 fence 状态机、Rich change 出口和测试，没有碰代码块 UI、滚动补偿、链接点击状态机。

### 项目关键约束和坑新增

- `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt` 是 Rich Edit 回归样本，包含 frontmatter、`<br />`、大量 fenced code block、标准 Markdown link、autolink、反斜杠转义和四反引号包三反引号结构。
- 最新 Rich 链接修复 `6863d44 fix: stabilize rich edit markdown links` 引入了 `normalizeRichMarkdownEscapes`，后续所有改动都必须注意 App 层归一化和编辑器内部同步边界。
- `MilkdownEditor.tsx` 中 `emitMarkdownChange`、`lastKnownMarkdownRef`、`markdown` prop 同步 effect 和 `replaceAll(nextDocument.bodyMarkdown)` 是光标跳转类问题的关键链路。
- `shared/markdown.ts` 中的 Markdown 归一化函数属于数据安全边界，不要把它写成全局反斜杠清洗器。
- `npm run test` 能覆盖 parser/normalizer 回归，但不能证明 Windows WebView 下所有交互行为；用户安装版复测仍是重要反馈面。
- 当前正式目录以 `apps/serein-desktop/`、`AGENTS.md` 和 `HANDOFF.md` 为准；旧 `archive/ys-writer-desktop/` 只作历史归档。

### 下次一次性达到这轮效果的提示词

```text
你是 Serein Rich Edit 光标/归一化回归修复负责人。请先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，以及 docs/runbooks/skills/serein-rich-edit-cursor-stability/SKILL.md；运行 preflight，但不要被旧 /home/rv_nano 路径误导。默认中文，直接、以结果为导向。

目标：定位并修复 Rich Edit 预览模式下输入字符后光标跳文末、跳文首、selection 丢失、页面不动但真实光标改变的问题。不要先做“保存光标再恢复”的治标方案。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进：
1. 先确认正式 app 目录、当前 git 状态、用户复现文件、最近提交、Rich Edit 相关同步链路。
2. 如果用户说只有某个文件触发，先分析该文件结构：frontmatter、行尾、HTML、fenced code、四反引号/三反引号嵌套、链接、autolink、反斜杠转义。
3. 优先检查 `MilkdownEditor.tsx` 中 `emitMarkdownChange`、`lastKnownMarkdownRef`、`markdown` prop 同步 effect、`replaceAll(...)` 是否形成自回灌。
4. 检查 `shared/markdown.ts` 中 Rich/Wiki 归一化是否只作用于 fenced code 外部，并按 fence 字符和长度处理关闭规则。
5. 控制动作只改共享根因：同步边界、归一化状态机或 parser；不要同时改代码块 UI、滚动补偿、链接点击状态机。
6. 必须用用户真实文件做归一化前后比较，确认不产生无意义文本变化。
7. 验证至少跑 `npm run test`、`npm run typecheck`、`npm run build`、`git diff --check`；如果没有重新打 Windows 安装包，明确说明。
8. 修复后更新 HANDOFF、PROJECT_MEMORY 和 skill。提交时只 stage 本轮源码/测试/文档，不要纳入根目录 `.exe` 安装包。
```

### 本轮沉淀到 skill 的方向

新增项目 skill：

```text
docs/runbooks/skills/serein-rich-edit-cursor-stability/SKILL.md
```

同时应更新/参考：

```text
docs/runbooks/skills/serein-rich-edit-markdown-links/SKILL.md
docs/runbooks/skills/serein-editor-regression-control/SKILL.md
```

下次以下场景应触发 `serein-rich-edit-cursor-stability`：

- Rich Edit 预览模式输入字符、空格、删除或回车后光标跳文末/文首。
- 页面不滚动但真实光标跳走，按方向键后页面才跟过去。
- 只有某个复杂文件触发光标异常。
- 修链接、frontmatter、wiki link、autolink 或 Rich serializer 后出现编辑器全文替换迹象。
- `Project_03_vibe-keyboard.txt`、四反引号嵌套三反引号、fenced code 内 Markdown-like 内容相关问题。

## 2026-07-07 Ctrl+Z 基础滚动语义回归沉淀

### 本轮事实

- 用户反馈：撤回内容位置基本正确，但 `Ctrl+Z` 后光标显示在编辑框最上方，而不是回到编辑区域中间附近。
- 已确认旧行为曾经修过：`ca2d581` 引入 `runRichHistoryWithEditorScroll(...)`，策略是撤回前记录 `scrollTop`，执行 Milkdown/ProseMirror history 后先恢复原滚动；如果撤回后的真实 selection 不可见，再滚到 selection 附近/中间。
- 回归来源：`2f6a8c7 fix: stabilize rich edit navigation and undo` 为了解 plain/rich 切换 undo 丢失，把 Rich 编辑器内部 undo keydown 和滚动补偿删掉，改成 App 层截获 `edit.undo/edit.redo` 后发 command signal。这个改动混淆了“Rich 内部撤回滚动语义”和“跨编辑模式 history”两个问题。
- 当前最小修复方向：编辑器内标准 `Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z` 让 Rich Editor 自己处理，并恢复已验证过的滚动补偿；App 层不要截获 Rich 编辑器内标准撤回快捷键。

### 必须记住的规则

- 当前能力基线和改动确认协议已整理到 `docs/runbooks/CAPABILITY_BASELINE.md`；后续改已有能力前必须先对照该文件。
- 基础编辑语义属于产品地基，不是实现细节。已经调通的撤回、光标、滚动、链接展开、代码块退出、语言控件、表格键盘路径等，不能因为架构整理、快捷键统一、模式切换或命令分发重构被顺手替换。
- 如果确实需要改基础交互，必须先写清旧行为、目标行为、风险、最小验证；改完后必须恢复到等价或更好的用户体验，不能只说“默认 history 应该能处理”。
- `Ctrl+Z / Redo` 的职责边界：history 负责内容和 ProseMirror selection；滚动补偿只读 selection 并调整 scroll，不得擅自改 selection。
- 撤回滚动的目标语义：目标 selection 已经可见时保持当前滚动；目标离屏时滚到目标附近/中间；不能无条件 `scrollIntoView`，也不能让目标贴在编辑框最上方。
- 不要为了修 plain/rich 两套实例切换丢 undo，把 Rich 内部已经验证过的 undo/scroll 路径删除。跨模式 history 是另一个问题，应单独设计和验证。

### 下次排查提示

- 如果用户说“以前修过，现在又坏了”，先用 `git log -S` / `git log -G` 查旧修复在哪个 commit 引入、在哪个 commit 删除，不要直接补新逻辑。
- 针对本类问题优先查：
  - `apps/serein-desktop/src/App.tsx` 中是否截获编辑器内 `edit.undo/edit.redo`。
  - `apps/serein-desktop/src/components/MilkdownEditor.tsx` 中 Rich keydown 是否仍走带滚动补偿的 Milkdown history。
  - 是否重新引入 Rich undo fallback 到 App markdown history、`replaceAll(...)` 后 selection restore、markdown offset 到 ProseMirror selection 映射等高风险补偿层。

## 2026-07-07 Markdown text buffer 单编辑器实验沉淀

### 本轮事实

- 用户确认目标架构应改为：以 Markdown 文本 buffer 为核心，用 Typora-like decoration / widget 实现 Rich 呈现，而不是继续维护 `textarea + Milkdown` 两套编辑实例。
- 已更新设计文档：`docs/design/typora_like_editor_architecture.md`，决策改为 CodeMirror 6 作为唯一 Markdown text buffer 目标架构。
- 已新增实验组件：`apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx`。
- 实验组件通过本地开关启用：

```js
localStorage.setItem("serein.experimentalTextBufferEditor", "1")
```

- 2026-07-07 补充：已在设置页增加可点入口：设置 -> 编辑器 -> 启用实验性单编辑器 text-buffer 引擎。这个设置仍写入同一个 localStorage 实验键，不进入正式 settings schema。
- 默认路径仍不变：未设置开关时继续使用当前 `MilkdownEditor` + plain `textarea`。
- 实验路径下，plain/rich 两种模式都进入同一个 CodeMirror `EditorState`；切换 mode 只重配 decoration，不卸载编辑器实例。
- 已做最小 decoration：标题、引用、列表 marker、代码围栏/代码行、Markdown link/image、inline code、strong、strike。
- 已做最小 command bridge：undo/redo、cut/copy/paste、select all、标题、段落、引用、列表、代码块、表格、link、image。
- 已把实验 text-buffer rich mode 的保存/dirty 比较从旧 Rich serializer baseline 中隔离出来，避免 `normalizeRichMarkdownEscapes` 改写源码。

### 已验证

- `npm run typecheck`：通过。
- `npm run test`：通过，5 个 Node test 文件通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- Playwright smoke：通过。流程是打开实验开关、新建文档、输入 `# Text Buffer Smoke / alpha`、点击模式按钮切到 Plain、按 `Ctrl+Z`，确认 `alpha` 被撤销，证明同一 CodeMirror history 跨模式保留。
- Playwright settings smoke：通过。流程是从设置页启用实验引擎，再新建文档、输入、切 Plain、`Ctrl+Z` 撤销。

### 必须记住的边界

- 这只是 Phase 1 骨架，不是默认替换，也不能对外宣称已经完成 Typora-like 单编辑器。
- 当前实验引擎还没追平 Milkdown Rich：
  - 标准 Markdown link 的局部展开/收回状态机未完成。
  - Wiki link、目录 link、Vault 跳转语义未完成。
  - 代码块语言控件和 EOF/嵌套退出未完成。
  - 表格可视化编辑未完成。
  - 图片预览、frontmatter 顶部属性条未完成。
  - KaTeX、Mermaid、TOC、mind map 未完成。
- 默认 Milkdown 主路径必须保留，直到新 text-buffer 引擎逐项通过能力基线和 Windows release 手测。
- 后续推进应继续采用并行替换策略：先在实验引擎补齐能力，再由用户确认是否切默认；不要直接删除 `MilkdownEditor` 或 plain `textarea`。

### 2026-07-07 补充：text-buffer live preview 基础语义回归

- 用户实测指出实验引擎的严重问题：输入 ```` ```bash ```` 后会把后续内容全部当成代码块；Rich 里标题已经变大但仍显示 `#`；围栏 marker 也仍可见，说明 Source/Rich 呈现边界没守住。
- 本轮修正的控制变量只限实验 text-buffer parser/decorations：
  - 新增 `src/editor/textBufferMarkdown.ts` 的 pending fence 状态：未闭合 fence opener 在 Rich 里隐藏 marker，但不把后续整篇吞进代码块。
  - 完整 fenced block 继续隐藏 opening/closing fence，只把中间内容标为 code。
  - 标题 `#`/`##`/`###` marker 作为 `richHiddenRanges`，Rich 隐藏、Source 保留。
  - README 常见的四反引号包三反引号示例加入 fixture，避免示例代码块把后续标题吞掉。
- 已补测试：`tests/text-buffer-markdown.test.mjs` 和 `tests/fixtures/text-buffer-markdown/readme-fences.md`。
- 已验证：`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check` 通过；Playwright smoke 通过 Rich/Source DOM 检查。
- 仍然不能宣称实验引擎可替换默认编辑器。它只是修掉了 Markdown 基础预览语义的阻断问题；链接展开/收回、表格、图片、代码块语言控件、frontmatter、Vault 跳转仍未追平 Milkdown。

### 2026-07-07 补充：Rich 粘贴 Markdown 源码被反斜杠转义

- 用户复测指出长期问题：从源码模式/Typora 源码复制 Markdown，如 `# vibe-bridge`、```` ```bash ````、`ls /dev/hid*`，粘到 Serein 后会变成 `\# vibe-bridge`、`\`\`\`bash`、`hid\*`。
- 根因不是保存层，也不是 `normalizeRichMarkdownEscapes()` 没有全局去反斜杠；根因是 Rich/Milkdown 默认 paste 把剪贴板 text/plain 当普通文本插入，serializer 为了保留普通文本语义会转义 Markdown 标点。
- 禁止用“保存时全局去反斜杠”修这个问题，那会破坏用户确实想写普通文本的场景，也可能污染链接、代码块和转义语义。
- 本轮正确边界：只在 Rich paste 阶段处理。多行剪贴板内容如果明显像 Markdown block（标题、fence、引用、列表、表格、图片），且当前不在代码块内，就阻止默认文本粘贴，走 Milkdown parser 插入 Markdown slice；Plain 源码模式继续原样粘贴。
- 试过直接 `.use(clipboard)`，干净启动时报 `MilkdownError: Timer "SchemaReady" not found`，当前 kit 组合里不能直接挂该插件，已撤回。
- 已补纯函数 `src/editor/markdownPaste.ts` 和 `tests/markdown-paste.test.mjs`，覆盖用户样例、单行 shell 注释不误判、普通多行文本不误判。
- 已验证：Rich paste Playwright smoke 通过，切到源码后保留 `# vibe-bridge`、`### 设备挂载`、```` ```bash ````、`ls /dev/hid*`，没有 `\#`、`\`\`\``、`hid\*`。

### 2026-07-07 补充：清空文档后编辑器消失

- 用户复测指出：在测试网页里把文件内容清空后就不能继续编辑。
- 根因是 `hasActiveDocument` 通过 `isEmptyPlaceholder(activeNote)` 判断，而旧 `isEmptyPlaceholder` 用 `!filePath && !dirty && markdown.trim() === ""` 推断无文档。新建草稿清空后会回到 `dirty=false` 且 markdown 为空，于是被误判成初始空占位页，编辑器被卸载。
- 修法：给真正的初始占位 note 增加显式 `placeholder: true`，`isEmptyPlaceholder()` 只认这个标记；空草稿、清空后的草稿、空文件都仍是可编辑文档。
- 后续规则：不要用“内容为空”判断“没有文档”。空文档是合法用户数据，必须能编辑、保存、另存为。
- 已补 `tests/vault.test.mjs` 回归：初始 placeholder 为 true，清空后的 draft 和磁盘空文件都不是 placeholder。
- 已验证：Playwright empty-clear smoke 覆盖 Rich 清空后继续输入、Source 清空后继续输入；`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check` 通过。

### 2026-07-07 补充：Rich 复制、跨模式撤回和浏览器外链

- 用户复测指出：
  - Source 模式复制 Markdown 正常，但 Rich/实时预览复制后再粘贴会丢 `#`、`-`、```` ```bash ```` 等 Markdown 源码标记。
  - 模式内撤回正常，但 Rich/Source 切换后不能撤回。
  - 测试网页里 Ctrl/单击标准外链 `[Improv Wi-Fi](https://www.improv-wifi.com)` 会提示没有可打开链接。
- Rich copy 根因：`copyRichSelection()` 旧逻辑使用 `doc.textBetween(...)`，只能拿到可见文本，必然丢 Markdown 结构。已改为用 Milkdown serializer 序列化选区 Markdown，并接管 Rich 原生 `copy/cut` 事件；菜单 copy/cut 和快捷键 copy/cut 都走 Markdown 源码。
- Milkdown serializer 默认把无序列表输出成 `*`，已配置 `remarkStringifyOptionsCtx.bullet = "-"`，让 Rich copy/save 更贴近常见 GitHub README 风格。
- 跨模式撤回：默认路径仍是 Rich/Source 双实例，不能共享原生 undo stack。已加一个窄过渡桥：只在刚切换模式、且切换后没有新编辑时，`Ctrl+Z/Ctrl+Y` 走 App markdown history；模式内 undo 仍交给当前编辑器，避免再次破坏 Rich 内部滚动/selection。
- 外链：测试网页不是 Tauri 环境，`openExternalTarget` 旧逻辑直接 invoke Tauri command 会失败。已给 `http/https/mailto` 增加浏览器 fallback `window.open`；Tauri release 仍走系统打开。
- 链接点击语义没有改变：普通点击仍用于编辑/展开，`Ctrl/Cmd+点击`才跳转。这是当前能力基线，不能因浏览器测试 fallback 顺手改掉。
- 已验证：
  - Playwright Rich copy/link smoke：Rich 全选复制后包含 `#`、`-`、```` ```bash ```` 和外链 Markdown；Ctrl+点击外链触发 browser fallback。
  - Playwright cross-mode undo smoke：Rich 输入后切 Source，`Ctrl+Z` 能撤回，`Ctrl+Y` 能恢复。
  - `npm run test`、`npm run typecheck`、`npm run build`、`git diff --check` 通过。

### 2026-07-07 补充：Source 模式视觉和 text-buffer 历史边界

- 用户提供的 Typora `</>` 截图说明：源码模式不是纯 textarea，而是带设计的源码编辑器。源码 token 必须可见，同时应有行号、当前行/块感、语法着色、标题层级和代码块视觉。
- 本轮实验 text-buffer 的 Source 模式增加 CodeMirror line number、active line / gutter；Source 保留 `#`、`-`、```、link URL 等源码 token，Rich 才通过 decoration 隐藏 marker。
- Rich link 初步按 Typora-like 状态处理：默认只显示 label；光标/选区进入链接源码范围时展开 `[label](url)`；`Ctrl/Cmd+点击`仍跳转。后续仍需覆盖 wiki link、目录链接、拖选复制和 Windows release。
- Markdown link 解析不能回到简单 regex。实验 text-buffer 已把 inline link scanner 放进 `src/editor/textBufferMarkdown.ts` 并补测试，覆盖 URL 中括号、转义 label 和 autolink。
- 单编辑器路线中，CodeMirror `EditorState` 是 undo/redo 的所有者。若 CodeMirror undo 返回 false，不应再回落到 App 字符串 markdown history，否则会重新引入两套历史模型。
- 切换文件必须重建或隔离 CodeMirror state，避免一个文件的 undo stack 串到另一个文件；切换 Rich/Source 只应 reconfigure decoration。
- 已验证：`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check`、Playwright text-buffer Source/Rich smoke 均通过。未验证 Windows release `.exe`。

### 2026-07-07 补充：text-buffer 追平默认 Milkdown 的第一段核心能力

- 用户要求先把实验 text-buffer 追平默认 Milkdown 路径里的代码块语言控件、EOF/嵌套退出、表格可视化、图片预览、frontmatter、wiki link、目录链接，不要给一个会崩的半成品。
- 本轮有效结果：
  - 代码块语言控件：Rich 中显示可编辑语言 input，候选包含 `bash`；输入 `BASH` 后写回 fence info。
  - EOF 退出：代码块最后内容行 `ArrowDown` 进入语言控件，语言控件内再 `ArrowDown` 在 EOF 后创建新行。
  - 嵌套退出：新增 `stripTextBufferContainerPrefix()`，用同一套 parser 容器前缀识别处理 `> `、`> - `、`> 1. ` 等空结构行。
  - 表格：pipe table 在 Rich 中显示可编辑表格，支持单元格编辑、加行、加列，回 Source 后 Markdown 保真。
  - 图片：standalone image Markdown 在 Rich 中显示预览或 missing placeholder，回 Source 后保留原始 `![alt](src)`。
  - Frontmatter：Rich 顶部属性条读取当前 CodeMirror buffer，tags/aliases/status 编辑后写回 YAML。
  - Wiki link / 目录 link：wiki link 有 Rich widget 并走 `serein-wiki:` 打开路径；标准 Markdown link / 目录 link 继续交给 App 层已有 Vault index / 目录 index / 本地外部分流。
- CodeMirror 约束沉淀：
  - 不要在 `ViewPlugin` decorations 里跨行 `Decoration.replace`，会报 `Decorations that replace line breaks may not be specified via plugins`。
  - 当前 CM 版本下，block widget 也会触发 `Block decorations may not be specified via plugins`。本轮稳定方案是不用 block widget，改成行内 widget + 每行源码隐藏/折叠。
  - widget 内 input 提交后 DOM 重建会触发 blur；如果 blur 再 dispatch，会报 `Calls to EditorView.update are not allowed while an update is in progress`。提交类 widget 必须记录 committed value，避免 Enter 后 blur 二次提交。
- 已验证：
  - `npm run test` 通过，7 个 Node test 文件通过。
  - `npm run build` 通过。
  - `git -c safe.directory=/home/slam/Project/Serein diff --check` 通过。
  - Playwright text-buffer parity smoke 通过且无 pageerror；截图：`/tmp/serein-text-buffer-rich-parity.png`、`/tmp/serein-text-buffer-parity.png`。
- 用户追问“是否大量测试、是否测 `-` 内嵌 ```bash / `>` 组合、文末是否意外”后，补了组合回归：
  - 单测覆盖 list-contained fence、blockquote-contained fence、quote+list nested fence、pending nested fence 不吞后续 heading、空结构行退出。
  - 浏览器 smoke 覆盖同一文档内 root/list/blockquote/quote+list/EOF 五个 fence；Rich 不露 `>`/结构缩进，EOF `ArrowDown` 退出并追加文本，回 Source 后 Markdown 保真。
  - 长期运行的旧 Vite `5176` HMR 曾保留旧模块导致误报；干净启动 `5177` 后通过。做编辑器 smoke 时优先干净启动 dev server。
- 仍未完成：
  - 实验 text-buffer 还不是默认路径。
  - 表格删除行/列、对齐保存、最后行键盘退出仍未追平。
  - Wiki link 候选/创建未解析目标、目录链接真实 Vault 跳转、拖选复制、Windows release 行为仍需测。
  - 大文档 decoration 性能还未压测。

### 2026-07-08 补充：text-buffer Rich 坐标错位 / 隐藏 fence 误编辑

- 用户反馈截图 `docs/images/v3.png`、`v4.png`、`v5.png`：光标看似在上一行，active line 高亮在下一行；在代码块末尾输入 `1` 后，隐藏 closing fence 被改成 ```1，后续 `### vibe` 被吞进代码块；上下键到不了标题，`Ctrl+Z` 也显得乱跳。
- 这不是单纯 parser 问题。直接根因是 Rich mode 把 Markdown fence/heading marker 用 decoration 隐藏后，仍让隐藏行和带外边距的可编辑行参与 CodeMirror 坐标映射；CSS `margin-top` 和语言控件 `margin` 会让视觉位置与 CodeMirror selection line 不一致。
- 当前修正边界：
  - Rich mode 的隐藏 fence 行不能被普通编辑事务改写；语言变更、EOF 退出、表格替换这类明确结构写回必须显式标注。
  - CodeMirror `.cm-line` / 行内 widget 不要用 CSS margin 制造 Typora-like 垂直间距；改用参与测量的 padding，避免点击标题仍选中上一段 code line。
  - active line 颜色使用主题 accent 淡色，不再用和代码块背景混淆的色块。
- 后续规则：凡是 text-buffer Rich 中出现“看得见但点不到、上下键跳不过去、Ctrl+Z selection 位置奇怪”，优先检查 decoration、隐藏行和 CSS 布局是否破坏 CodeMirror 坐标映射，不要先继续补 Markdown parser case。
- 已验证：用户场景 Playwright smoke 通过，覆盖输入 `1` 不产生 ```1、`### vibe` 不被吞、点击标题可进入 active line、ArrowUp/ArrowDown 可回到标题、`Ctrl+Z` 撤回字符且不落到隐藏 fence 行；`npm run test`、`npm run typecheck`、`npm run build`、`git diff --check` 通过。

## 2026-07-10 text-buffer 稳定化合作沉淀

### 用户偏好和反复强调的产品原则

- 用户的第一性原则优先于库/官方默认行为。CommonMark、CodeMirror、Milkdown 等库语义只能作为工具；如果库默认行为破坏 Serein 已经确认的写作体验，应加产品层状态机保护。
- 用户已经调过的设计细节不能丢：代码块块感、左内缩、右下角语言控件、语言控件只跟随当前光标所在代码块、Rich 模式无源码 active line、源码模式才显示当前行高亮。
- 用户不接受“我只修你截图里的一个 bug”。如果问题暴露的是架构/状态机缺陷，要主动检查同类路径，例如代码块输入、撤回、上下键、切文件、保存、复制粘贴和性能。
- 用户接受反驳，但必须基于证据、复现和替代方案；不能用“官方就是这样”压过用户的已验证设计。
- 用户希望按工程控制论闭环推进：目标 -> 状态 -> 误差 -> 控制动作 -> 反馈 -> 修正 -> 验证 -> 沉淀。
- 用户更重视真实可写、可撤回、不卡、数据不坏，而不是“功能列表看起来完成”。
- 用户明确鼓励不要害怕问题，应该解决问题；但不能为了推进而隐藏未验证风险。
- 用户对“同一基础问题反复回来”极其敏感，尤其是 `Ctrl+Z` 滚动、代码块退出/语言控件、Rich/Source 边界、链接展开/跳转。

### 从本次错误里学到的最佳实践

- 单编辑器架构不能只搭骨架。`EditorState` 共用只是第一步，必须同步迁移旧路径已经验证过的行为契约：undo/redo 滚动、代码块语言控件、EOF/嵌套退出、链接展开、表格、图片、frontmatter、保存 dirty baseline。
- Markdown parser 只能提供结构候选，不能直接决定编辑意图。用户在已有代码块内容里输入 ``` 时，产品语义应先保护“这是代码内容”，必要时自动升级外层 fence 长度，而不是让 parser 立刻重组整篇文档。
- CodeMirror 可编辑行不能随便用 CSS `margin` 做 Typora-like 视觉间距。margin 会破坏 DOM 坐标与 selection 映射；应使用参与测量的 padding 或更明确的 widget/layout 策略。
- Rich 模式和 Source 模式必须分清：Source 显示源码 token、行号、active line；Rich 隐藏语法标记、无源码 active line，只有当前编辑语义需要的控件。
- `Ctrl+Z / Redo` 的滚动补偿必须明确职责：history 负责内容和 selection，滚动层只判断 selection 是否可见；可见则保持滚动，离屏才滚到附近/中间。
- 代码块语言控件不是普通装饰。它是用户设计过的交互控件：只跟随当前光标所在代码块，最后一行 ArrowDown 进入控件，控件 ArrowDown 退出代码块，语言可键盘编辑且保留未知语言。
- 大文档性能不能靠“功能过了 smoke”判断。当前 text-buffer 每次 selection/doc change 全量 `doc.toString()`、syntax tree analysis、link/table scan、line decoration，可能导致换文件卡死。下一轮必须优先做 viewport/cached/增量策略。
- Playwright smoke 必须模拟用户真实操作，而不是只看 DOM 字符串。关键场景包括点击、输入、方向键、Ctrl+Z、切 Source、截图视觉检查、长文档滚动。
- 临时 smoke 通过后，要把测试思想沉淀到项目测试或 skill；否则下一轮会再次依赖人工截图。
- 不要把实验路径提升为默认，除非能力基线、性能、Windows release 真实手测都通过。

### 项目关键约束和坑

- 正式应用仍是 `apps/serein-desktop/`。旧原型和历史目录不要改。
- 当前 text-buffer 仍是实验引擎，默认 Milkdown 主路径必须保留。
- 代码块相关能力是高频写作路径，不是边缘功能。任何 Markdown 编辑器改动都必须覆盖 root/list/blockquote/nested/EOF code block。
- 用户真实文件如 `Project_00_Serein.txt`、`Project_03_vibe-keyboard.txt` 比简化样例更重要，里面有中文、Windows 路径、shell 命令、代码块、标题、长文档、CRLF/路径等组合。
- `docs/images/v1-v8` 是用户反馈截图，保留用于复现设计和回归。
- 浏览器/Vite smoke 只能证明一部分；Windows release `.exe` 和真实 Vault 手测仍是最终体验面。
- Preflight 脚本当前仍指向旧 `/home/rv_nano/...`，可作为流程提示，但不能把旧路径缺失当成当前仓库缺失。
- 工作区存在大量前面 AI 实验改动和未跟踪文件；提交前必须精确审查，不要混入无关文件或构建产物。

### 下次一次性达到本轮目标的提示词

```text
请接手 Serein text-buffer 单编辑器稳定化。先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，并使用 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md。

目标：不是继续堆功能，而是把实验 text-buffer 变成能写字的 Typora-like 单编辑器基础路径。请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”推进。

必须保护我的第一性原则：
1. Rich/实时预览不显示源码 active line；Source 才有行号和当前行。
2. Ctrl+Z/Redo：history 负责内容和 selection，滚动层只负责视口；离屏撤回要滚回光标附近/中间，不能贴顶部。
3. 代码块内输入 ``` 是代码内容，不应重组文档或吞掉后续标题；必要时升级外层 fence。
4. 代码块语言控件保留我的设计：只跟随当前光标所在代码块，右下角，bash 位置正确，ArrowDown 进入/退出逻辑稳定，未知语言保留。
5. 代码块视觉必须保留块感、左内缩、留白和整体设计，不要变成一行一块的平铺背景。
6. 切文件/大文档不能卡死，优先检查 decoration 是否全量扫描。

请先用 Project_00_Serein.txt / docs/images/v7-v8 场景 / 长文档 undo 场景做复现，再改最小控制变量。每次改完必须跑 npm run typecheck、npm run test、npm run build、git diff --check，并用 Playwright smoke 验证 Rich 输入、Source 保真、Ctrl+Z 滚动、代码块 fence、语言控件显示条件。未做 Windows release 手测必须明确说未验证。
```

### 本次沉淀出的项目 skill

```text
docs/runbooks/skills/serein-text-buffer-stability/SKILL.md
```

触发场景：

- 用户提到单编辑器、text-buffer、Typora-like decoration、Rich/Source 混淆。
- 用户反馈代码块内输入 ```、EOF ArrowDown、嵌套 list/quote/code、语言控件、bash 位置、代码块视觉。
- 用户反馈 Ctrl+Z/Redo 跳顶部、光标离屏撤回、Rich active line、上下键到不了标题。
- 用户反馈换文件卡死、大文档卡顿、text-buffer decoration 性能。

## 2026-07-10 18:40 单编辑器语义收敛与合作完整总结

### 用户的底层逻辑和长期偏好

- 用户要的不是“CodeMirror 能编辑 Markdown”，而是保留 Serein 已经反复调好的写作语义，再把它们迁移到一个 Markdown buffer。新架构只能减少状态源，不能借机删除旧行为。
- Markdown 源码是唯一真相。Rich/实时预览只是源码的语义化呈现层，不能偷偷改写 Markdown、另存一份结构、维护第二套 undo 或让 widget 成为独立真相。
- 所有派生 UI 必须服从编辑器即时 state：正文、语言控件、大纲、保存状态、selection 和 history 不能各自缓存坐标或 Markdown 快照。
- 用户希望 `Ctrl+A` 是统一的两级语义选择，而不是代码块特例：
  - 代码块第一次选代码内容，不含 opening/closing fence 和 list/quote container；第二次全文。
  - ATX 标题第一次选可见标题内容，保留隐藏的 `# ` 结构；第二次全文。
  - Setext 标题、普通段落行、列表项正文、引用正文和空行遵守同一规则。
  - 替换首次选区后应保留标题、列表、引用和代码块结构。
- 用户反复调整过的代码块设计属于产品契约：块感、代码字体、内容内缩、上下留白、quote 边界、右下角语言控件、候选 `bash`、任意大小写/未知语言保留、ArrowDown 进入和退出。
- Markdown marker 的身份也属于设计：`-`、`*`、`+` 不应被新 CSS 全部强制显示成小圆点。Rich 可以隐藏语法，但不能在没有产品依据时改变用户选择的 marker。
- 用户重视高效、精致、Obsidian-like 的工作台，但优先级始终是：数据安全和编辑正确性 > 流畅度 > 功能完整 > UI 美化。
- 用户不接受“只修截图中的一个点”。当截图暴露状态机或架构问题时，应主动检查同类路径：selection、undo、方向键、语言控件、大纲、保存、切文件和大文档性能。
- 用户允许并欢迎技术反驳，但反驳必须给出证据、复现、替代方案和利弊；不能用库默认行为或“标准 Markdown 就这样”否定已经确认的产品设计。
- 用户不希望 AI 删除他已有的特殊设定代码，也不希望为了代码看起来更漂亮而整体重写。应先找稳定基线，再做最小、可回滚、可验证的结构改进。
- 用户对同一问题反复回归非常敏感。每次恢复过的行为都应进入测试、memory 或 skill，不能只留在对话记忆里。

### 从本次错误里学到的最佳实践

- “单编辑器”不能只理解成共享一个 `EditorState`。真正完成条件是：内容、selection、history、语义选择、派生 UI 和保存都围绕同一个即时 state 工作。
- 不要把 React `useDeferredValue(markdown)` 产生的 source offset 直接发给 CodeMirror。语言从空值改为 `bash` 会立刻增加 4 字符，而 deferred outline 仍是旧坐标；用户同一事件周期点击标题时会选中 closing fence 和半截标题。
- 正确的大纲协议是“传标题身份，不传旧坐标”：
  - UI 传 level、text、同名 occurrence 和 fallback index。
  - CodeMirror 在自己的当前 `view.state.doc` 中重新解析并得到 start/end。
  - 重复标题、语言长度变化和 React 延迟更新都不再依赖旧 offset。
- parser、outline 和 widget 不能各写一套 fence/container 规则。应把 opening/closing fence、marker length、list/quote prefix 和 pending fence 语义收敛到共享实现。
- 未闭合的 typed fence 是编辑中的 pending 结构，不应把后续全文和大纲吞掉；只有找到合法 matching close 后，才把中间范围视为完整代码块。
- widget 不能长期相信构造时的 block 坐标。语言提交前要用 opener identity 在当前 state 中重新定位 code block，再执行事务。
- widget 输入应作为正常 history 事务提交，并防止 Enter 后 DOM 重建触发 blur 二次 dispatch。
- 语义选择应由纯函数计算边界，组件只负责 dispatch 和空范围的第二阶段状态。这样标题、列表、引用和代码块不需要各自在 keydown 中堆条件。
- 修改前先写一个能稳定失败的 Playwright 复现脚本。本轮脚本一次性证明了三件事：标题首次直接全文、marker 被强制为 `•`、语言提交后大纲使用旧 offset。修改后用同一脚本验证输出反转，比人工“看起来好了”可靠。
- 真实视觉要截图检查。DOM 结构正确不等于设计正确；本轮第一次恢复 quote border 后，背景仍从顶层起点铺开，视觉检查才发现容器边界和背景不一致。
- CodeMirror 可编辑行不要使用 margin 做层级和间距。使用参与测量的 padding，以及不遮挡内容的伪元素表达 quote 背景/边界。
- 长文档 undo 的 UI 测试若把目标放在文档绝对 EOF，浏览器可能因达到最大 `scrollTop` 而无法把光标几何居中；严格验证居中时应在目标后保留足够内容，EOF 场景则验证光标已回到可见区域且没有贴在顶部，避免把滚动边界误判成产品回归。
- 先在隔离 worktree 恢复是正确的，但验证通过不等于主工作区已经修好。本轮 Windows 仍报 `hiddenPrefixText`，根因就是候选没有回迁。结束前必须在用户实际工作区重新跑 typecheck/test/build。
- 工作区有大量 WIP 时，正确回迁方式是：先备份将触碰文件；完整替换只属于实验引擎自身的未跟踪文件；App/CSS/tests 按 hunk 合并；禁止 reset/restore 覆盖用户工作。
- 测试编译使用 Node ESM 直接运行 `.test-dist`。新增运行时模块的相对 import 必须保留 `.js` 后缀；不要为一个抽象顺手升级 tsconfig、Node target 或测试体系。
- 不要把“优化整个代码”理解成全仓重构。应找出导致用户问题的重复真相并合并：本轮只收敛了 selection、heading/fence identity、language transaction 和 container presentation。
- 验证矩阵至少需要四层：纯函数单测、生产 build/typecheck、Playwright 真实操作、真实长文档和截图。Windows release 仍是最终平台验证，Linux/Vite 不能替代。

### 本项目当前关键约束和坑

- 正式应用是 `apps/serein-desktop/`；旧原型和 archive 默认禁止修改。
- 当前 Git HEAD 是 `b6fe725`，但用户认可的稳定行为参考是 `93590e3`。代码基线和行为基线不同，不能直接把整个仓库 checkout 到旧 commit。
- 工作区有大量既有修改和未跟踪文件。不要使用 `git reset --hard`、`git checkout --`、批量 restore、`git add .`。
- text-buffer 仍是实验路径；默认 Milkdown fallback 必须保留，直到 Windows release、性能和完整能力基线都通过。
- `MarkdownTextBufferEditor.tsx`、`textBufferMarkdown.ts` 及部分测试仍是未跟踪文件，提交前必须确认纳入范围。
- CodeMirror decoration 必须全局排序；隐藏 fence 需要 atomic ranges；普通编辑事务不能改隐藏 opening/closing fence。
- ViewPlugin 不能做跨行 replace decoration；当前版本也不允许随意从 plugin 提供 block decoration。不要恢复已经失败的 block widget 方案。
- `.cm-line`、heading line、code-language widget 上的 CSS margin 会破坏点击、selection 和上下键坐标。
- text-buffer 当前仍有全文 `doc.toString()`、全量 line/link/table 分析路径；大文档和换文件性能风险未根治。
- 代码块回归必须覆盖 root、list、blockquote、list+quote、EOF、真空块、长 fence 包短 fence、代码内容输入 fence。
- 大纲回归必须覆盖：语言长度变化后立即点击、同名标题、Setext、nested/long fence、pending fence。
- 真实 fixtures 优先于玩具样例：
  - `tests/fixtures/rich-edit/00_raw.txt`
  - `tests/fixtures/rich-edit/nested_list_quote_code.md`
  - `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt`
  - 用户真实 NanoUPS 文档
- `docs/images/v1-v9` 是行为和视觉证据，不要删除或把当前截图当成目标设计；需结合 `93590e3` 和用户口述判断。
- preflight 脚本仍指向旧 `/home/rv_nano/...`，只能当流程提示，不能据此判断当前仓库缺失。
- Windows 用户已经安装过上一轮包，但每轮新修改后必须重新生成/安装 release 才能验证；不要把旧安装包结果当成当前源码结果。
- 不自动 commit、tag 或 push。用户明确要求前只维护可审查 diff 和验证记录。

### 下次一次性达到当前效果的推荐提示词

```text
请接手 /home/slam/Project/Serein 的 Serein 单编辑器稳定化，并直接完成调查、实现和验证，不要停在方案阶段；只有会覆盖用户 WIP、改变公开格式或需要破坏性 Git 操作时才停下确认。

开工前必须：
1. 阅读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md。
2. 使用 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md。
3. 运行 python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora；知道它的旧路径映射可能失效，不能据此误判仓库。
4. 检查 git status；禁止 reset/checkout/restore 覆盖现有 WIP。
5. 代码基线以当前 main/b6fe725 为准，行为对照 93590e3；需要大范围比较时先建隔离 worktree。

按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进。先用一条简短状态汇报说明目标、现状、误差、最小控制变量和验证方法，然后直接执行。

产品底层逻辑：
- 一份 Markdown、一个 CodeMirror EditorState、一套 history。Rich/Source 只能改变 decoration，不能产生第二编辑器或第二份真相。
- 用户已有交互高于库默认行为，不得删除 Milkdown fallback 或用户特殊设定。
- Ctrl+A 统一为“当前语义单元→全文”：代码块选内容且不含 fence/container；标题选可见标题内容并保留 # 结构；段落、列表、引用、Setext、空行同理。
- 正文、语言控件、大纲、保存必须读取同一即时 state。大纲禁止传 deferred Markdown 的旧 offset；传标题身份，由 CodeMirror 当前文档解析。
- 语言控件提交前重定位当前 code block；保留大小写和未知语言，候选含 bash，ArrowDown 进入/退出稳定。
- Markdown marker 保留原身份：- 是 -，* 是 *，+ 是 +，不要统一改成圆点。
- list/quote/code 必须参考 93590e3 的缩进、quote 边界、代码字体、块背景、留白和右下角语言栏；禁止用 cm-line margin 造视觉。
- 代码块内输入 ``` 是代码内容，不能吞后续标题；必要时升级外层 fence。
- undo/redo 的 history 管内容和 selection，滚动层只管视口。

实现要求：
- 先写或运行能稳定失败的纯函数/Playwright 复现，再改代码。
- 消除重复状态源和重复 parser 规则，不要继续堆 if patch；但也不要扩大成全仓重构。
- 保护 Vault IO、保存、链接、表格、图片和默认 Milkdown 路径。
- 真实测试至少覆盖 00_raw.txt、nested_list_quote_code.md、Project_03_vibe-keyboard.txt、NanoUPS 和 docs/images/v7-v9。

完成前必须运行：
cd apps/serein-desktop
npm run test
npm run build
cd ../..
git -c safe.directory=/home/slam/Project/Serein diff --check

UI 必须用干净 production preview/Playwright 验证：
1. 标题第一次 Ctrl+A 只选标题，第二次全文。
2. 代码块第一次 Ctrl+A 只选代码内容，替换/undo 后容器仍合法。
3. 输入或修改 bash 后同一事件周期点击后方大纲，必须准确跳转。
4. -/*/+ 显示原 marker；list/quote/code 的边界和背景与旧设计一致。
5. EOF/空行 Enter/ArrowDown、语言控件、Milkdown fallback 无回归。

最终回复列出：修改文件、行为结果、执行过的命令、Playwright 证据、未验证风险。不要 commit/push。Windows release 未实测必须明确说明，并给出 .\scripts\build_windows.ps1 -SkipInstall。
```

### 本轮 skill 沉淀

- 继续使用并增强现有 skill：
  - `docs/runbooks/skills/serein-text-buffer-stability/SKILL.md`
- 不新建重复的“single-editor”skill，因为选择、大纲、语言控件、代码块退出和性能本质上属于同一个 text-buffer 稳定性闭环。
- skill 新增重点：
  - 当前代码基线与稳定行为基线的区分。
  - 隔离 worktree 恢复与安全回迁。
  - 所有内容的两级语义选择。
  - 标题 identity/current-state 大纲协议。
  - 原始 list marker 和 list/quote/code 视觉契约。
  - 修改前失败复现、修改后同脚本反证。
  - Node ESM `.js` import、CodeMirror decoration/layout 等工程坑。
- skill 的未来评估用例保存到：
  - `docs/runbooks/skills/serein-text-buffer-stability/evals/evals.json`

## 2026-07-13 v13-v15 大纲滚动、pending fence、紧凑快捷键合作沉淀

### 用户偏好（本轮再次确认）

- 用户要求先真正复现，再修复。没有复现用户描述的现象时，不应继续用静态检查或“理论上应该”宣称修好。
- 用户接受技术反驳，但反驳必须有截图、视频时间轴、运行日志、DOM/selection/scroll 数据或历史代码证据；不能用库默认行为代替产品判断。
- 用户反复调过的体验属于产品资产：大纲连续点击、Rich/Source 行号、代码块视觉与退出、语言控件、标题间距、caret、快捷键密度都不能被新架构顺手替换。
- UI 偏好是紧凑、克制、桌面工具感。快捷键一项应保持单行，不接受“命令、按键、启用、默认”拆成四行占满页面。
- 编辑输入必须稳定：用户键入的字符不能视觉消失，光标所在行不能突然变 0 高度，输入框不能因 decoration 重解释而弹跳。
- 用户明确要求测试隔离：后续不得读取、复制或修改其真实文档；应创建完全虚构的 Markdown 测试文件。当前样本位于 `out/outline-repro/`。
- 用户没有授权时，不要操作 Windows 进程或启动其桌面实例。即使只关闭 AI 自己启动的测试进程，也要先确认权限边界。
- 用户希望长任务结束时主动清理无效代码，并把失败方案写清楚；不能只留下最终修法，让下一轮再次走错路。
- 用户希望 `HANDOFF.md` 真正做到 3 天后 30 秒接上，因此交接文件应短、当前、可执行，不应继续累积成历史长文。

### 从错误里学到的最佳实践

#### 1. 先证明现象，复现不了就没有资格宣称修复

- v15 视频明确显示：点击 `Serein` 后正文仍停在 `Typora`，连续点击时旧章节持续可见，之后某次点击又偶然成功。
- 这排除了“用户点错”和“只在重复标题发生”的解释；唯一标题也会失败，说明是 viewport 提交问题。
- Linux Chromium 通过不能替代 Windows WebView2。前一轮只调整 focus 顺序，本地通过但用户仍失败，说明测试只覆盖了一个假设。

#### 2. 调试滚动先找真正的滚动所有者

- 当前 CSS 是：`.cm-scroller { overflow: visible; }`，`.editor-surface { overflow: auto; }`。
- 日志曾出现 `cm-scroller.scrollTop = 0`、DOM top 为负值。这已经证明 CodeMirror scroller 没有滚，实际滚动发生在外层；当时没有及时抓住这条证据，是判断错误。
- selection 属于 CodeMirror，但 viewport 属于 `.editor-surface`。使用 `EditorView.scrollIntoView` 跨层滚动，会依赖异步测量和浏览器祖先滚动传播，连续点击时容易丢失或被覆盖。
- 正确边界：CodeMirror transaction 只提交 selection；通过 `lineBlockAt()`、`documentTop` 和 surface rect 计算位置，直接设置 `.editor-surface.scrollTop`。
- 连续命令使用同一个 measure key，只保留最后一次滚动，避免旧目标覆盖新目标。
- 验证不能只看标题是否最终可见，还要记录真实 scroll owner 的 `scrollTop`。本轮正确证据是 `.editor-surface.scrollTop` 随目标变化，而 `.cm-scroller.scrollTop` 始终为 0。

#### 3. parser 结构不等于用户正在表达的编辑意图

- 输入第三个反引号后，源码没有丢；是 pending fence 被 Rich decoration 隐藏并压成 0 高度，造成视觉消失和输入框弹跳。
- 如果文档后方已有 closing fence，新输入的裸 opener 会按 Markdown 规则与远端 closer 配对，导致中间标题被当成代码。
- 对已保存文档，parser 结构是事实；对用户刚键入的 ` ``` `，它首先是未确认编辑状态，不能立刻重组后续文档。
- 正确状态机：
  - 第三个反引号后建立持久 `typedPendingFenceLines` 状态。
  - pending marker 保持可见、保持普通行高，不参与远端 closer 配对。
  - 光标离开后 pending 状态仍保留，不能只用“当前 selection 在 opener 行”临时兜底。
  - 按 Enter 才在当前位置生成 local opening/blank/closing，并把光标放到空代码行。
- 同一行普通 InlineCode 与多行深缩进 fence 必须区分。不能简单禁止所有 Lezer `InlineCode` 进入兼容路径；只排除 opener/closer 在同一行的普通 inline code，多行兼容仍保留。

#### 4. 长期 HMR 进程可能制造假失败

- 旧 5182 Vite 进程没有加载最新 text-buffer 模块，导致 pending fence 修复看起来完全无效。
- 判断依据：连最基础的“pending 行不再 hidden”都没有变化，说明不是状态机边界错，而是运行代码不是当前源码。
- 编辑器核心回归必须使用干净端口冷启动；不要在长期 HMR 实例上反复判断成败。
- 如果代码、类型检查和运行 DOM 完全矛盾，先验证 bundle/module 是否新鲜，再继续改代码。

#### 5. 清理必须基于反证，不要凭感觉删

- `typedPendingFenceLines` 经过“光标移出 opener”验证：pending 行仍为 26px，标题仍为 H1，后方代码块独立，因此它是必要状态，不能删。
- 因旧 HMR 假失败临时加入的“selection 位于 fence 行就强制 pending”兜底，在持久字段有效后属于重复真相，还可能误判合法 fence，已删除。
- `.editor-surface` 缺失时回退旧 `EditorView.scrollIntoView` 的分支在正式组件结构中不会使用，还会重新引入错误滚动所有权，已删除。
- 删除后必须用同一 fence/persistence/outline 脚本冷启动重跑；本轮全部通过后才确认清理安全。

#### 6. 响应式 UI 要验证真实窗口宽度

- 快捷键四行不是 React 内容问题，而是 `<1180px` media query 把 `.shortcut-row` 强制设成 `grid-template-columns: 1fr`。
- 正确做法是保持四个功能单元同一行，命令元数据同行显示并省略，不让窄窗口退化为四行卡片。
- 本轮在 1100px 视口验证：前 8 行高度均为 40px，四单元纵向中心差 0px。

### 本项目关键约束和坑

- 正式应用是 `apps/serein-desktop/`；默认 Milkdown fallback 仍必须保留，text-buffer 不能因本轮局部通过就提升为默认。
- 当前 HEAD 仍是 `b6fe725`，工作区有大量未提交和未跟踪 WIP。禁止 reset/checkout/restore 覆盖用户改动，禁止 `git add .`。
- `MarkdownTextBufferEditor.tsx`、`textBufferMarkdown.ts` 等核心 text-buffer 文件仍可能未跟踪；提交前必须逐文件审查。
- 大纲协议仍是 heading identity：level + text + occurrence + fallback index；不能恢复 deferred Markdown offset。
- 大纲的 scroll owner 是 `.editor-surface`，不是 `.cm-scroller`。后续布局修改若改变 overflow，必须同步重审滚动协议。
- Source gutter 依赖稳定 decoration StateField；不要切模式时创建新的 field，也不要重新加无目标的 requestMeasure/RAF 补偿。
- pending fence 是编辑状态，不应写成通用 Markdown parser 永久语义。保存/重新打开未闭合 Markdown 时仍需按源码事实处理。
- CodeMirror 可编辑行禁止使用 margin 制造 Typora 间距；margin 会破坏 selection/坐标映射。
- UI 验证要用干净 Vite server；Windows release 仍是最终平台，Linux Chromium 只证明同构逻辑。
- 只使用虚构/仓库内测试文件。除非用户之后明确授权，不再使用 `Project_00_Serein.txt`、用户 Vault 或其他私人文档做自动化。
- 不自动操作 Windows 进程、安装包、commit、tag 或 push。

### 下次想一次性达到本轮效果的推荐提示词

```text
请接手 /home/slam/Project/Serein 的 Serein text-buffer 编辑器稳定化。先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，并使用 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md；运行 typora preflight，但不要被旧 /home/rv_nano 路径误导。

目标：修复大纲连续点击、Rich/Source gutter、正在键入的 Markdown fence 和紧凑设置 UI。先复现再修改，不能用 typecheck 或 Linux Chromium 通过替代 Windows 用户现象。

硬约束：
1. 只使用你自己创建的完全虚构 Markdown 文件，不读取、复制或修改我的真实文档/Vault。
2. 不操作 Windows 进程、不启动桌面实例，除非我单独授权。
3. 工作区有大量 WIP，禁止 reset/checkout/restore，禁止 git add .，不要删除 Milkdown fallback。
4. 改动必须最小；无效方案要删除并记录原因，不要继续堆延时、RAF、requestMeasure 或 offset 补偿。

排查要求：
1. 大纲跳转同时记录 selection、最终可见标题、真正滚动容器及其 scrollTop。先检查谁拥有 overflow；如果 cm-scroller 是 overflow: visible、editor-surface 是 overflow: auto，就不能只调用 EditorView.scrollIntoView。
2. 连续点击必须覆盖不同 H1 下的同名 H2/H3，至少 Rich/Source 各 12 次定点和 60 次快速点击；最终目标必须等于最后一次点击。
3. fence 必须逐字符测 1/2/3 个反引号；覆盖 EOF、标题上方、后方已有 bash fence、光标移出 opener、Enter 本地闭合。第三个反引号不能消失或让行高变 0，标题不能被远端 closer 吞掉。
4. 快捷键设置在 1100px 窗口下保持单行，测行高和四个单元中心，不只看 CSS 源码。
5. UI 回归必须使用干净 Vite 端口冷启动；运行 DOM 与源码矛盾时先排除旧 HMR 模块。

完成前运行 npm run typecheck、npm run test、npm run build、git diff --check；重跑同一失败脚本证明结果反转。最后更新 HANDOFF、PROJECT_MEMORY、KNOWN_FAILURES 和现有 text-buffer skill，列出 Windows release 未验证项。不要 commit/push。
```

### 本轮 skill 沉淀方向

- 继续增强现有 `docs/runbooks/skills/serein-text-buffer-stability/SKILL.md`，不创建重复 skill。
- 新增触发范围：v13-v15、大纲看似跳动但停在旧标题、Source gutter 点击后才恢复、第三个反引号消失、pending fence 吞标题、快捷键四行、长期 HMR 假失败。
- 新增核心流程：真实 scroll owner 诊断、虚构文件优先、pending fence 编辑状态机、冷启动反证、删除无效补偿。
- 新增 eval：大纲外层滚动所有权；pending fence + 紧凑快捷键联合回归。
