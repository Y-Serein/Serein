# Serein Project Memory

最后更新：2026-06-08 16:18

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
- 复杂测试数据很有价值。`D_deliverables/serein-complex-vault/` 比简单 demo 更能发现发布前问题。
- 当空格、回车、删除、剪切、跨行选择一起表现为“光标偏移”时，不要继续修单个快捷键；优先怀疑底层坐标系、不可见字符、行尾、编码和编辑器模型映射。
- 真实输入文件比复现脚本更重要。`Project_00_Serein.txt` 是 CRLF，浏览器 textarea/Playwright `.fill()` 可能自动规范成 LF，从而掩盖真实 Windows 文件路径的问题。
- CodeMirror 与 ProseMirror 共存时，必须保证内部文档文本的行尾一致。CodeMirror 按 LF 计位，ProseMirror 若保留 CRLF，会在第二行后出现 offset 漂移。
- 修数据入口通常优于修事件出口。本次不要再只补 `Ctrl+X`、DOM selection 或右键剪切；应在打开文件时规范化编辑器内部行尾，并在保存时保留原文件行尾。
- 修改文本规范化必须同时考虑数据安全：不能为了修编辑器坐标，把用户 CRLF 文件无提示改成 LF；应记录原行尾并保存时写回。

## 项目关键约束

- 正式交付物在 `D_deliverables/serein-desktop/`。
- 旧原型 `D_deliverables/serein-prototype/` 默认不要修改。
- 技术栈：Tauri 2 + Rust + React 18 + TypeScript + Vite + Milkdown。
- Windows `.exe` 推荐打包入口：

```powershell
.\T_tools\build_windows.ps1
```

- `-SkipInstall` 是快速路径，不是不可以；发给别人前更推荐不加 `-SkipInstall`。
- 当前测试命令：

```bash
cd D_deliverables/serein-desktop
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
D_deliverables/serein-complex-vault/
```

- 代码块编辑器关键路径：
  - `D_deliverables/serein-desktop/src/components/sereinCodeBlockView.ts`
  - `D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx`
  - `D_deliverables/serein-desktop/src/vault/workspace.ts`
  - `D_deliverables/serein-desktop/src/App.tsx`
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

- 正式目录是 `D_deliverables/serein-desktop/`。当前 `D_deliverables/ys-writer-desktop/` 是旧规则里残留的历史路径，实际工作要以当前目录为准。
- `Serein_1.0.1_x64-setup.exe` 可能作为未跟踪安装包出现在仓库根目录；不要默认加入提交。
- 当前没有 `C_context/KNOWN_FAILURES.md`。遇到重复问题时优先查 `C_context/PROJECT_MEMORY.md`、`HANDOFF.md` 和 `C_context/skills/`。
- Windows 打包是关键验证面。WSL 的 `npm run build`、Linux `cargo check` 和源码搜索只能证明一部分，不能替代 `T_tools\build_windows.ps1` 和 release `.exe` 手测。
- Rich Edit 中 Tab/Shift+Tab、Ctrl+A、Ctrl+Z、粘贴、代码块内编辑都容易被浏览器默认行为、ProseMirror selection、CodeMirror selection 三套模型互相影响；修复时必须统一成编辑器语义。
- Ctrl+Z 滚动修复不能在滚动层擅自改 ProseMirror selection。上一轮用“撤销后 selection 靠近文首就 restore 到撤销前位置”的补偿逻辑导致真实环境里无论在哪里撤销都跳文首；正确边界是 history 负责 selection，滚动层只判断当前 selection 是否可见并按需滚动。
- Vault 标签索引语义：启用状态来自 frontmatter `status: active` / `status: inactive`。未启用标签不应被搜索命中；标签不应只因当前文件打开而被索引。
- Vault 全库索引不能因单个不可读目录、条目或 metadata 读取失败而整体失败；应跳过并计入 skipped，否则搜索会退化成“只有打开过的文件靠 upsert/draft 能搜到”。

### 下次一次性达到这个效果的提示词

```text
你是 Serein 桌面编辑器回归修复负责人。请先读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md 和 C_context/skills/serein-editor-regression-control/SKILL.md；如果项目有 preflight 就先跑。不要先猜，不要只修我指出的一个按钮。

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
C_context/skills/serein-editor-regression-control/SKILL.md
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
- `tests/vault.test.mjs` 已有真实 `../../C_context/test/new.md` 未打开文件 `@remark` fixture，但 Tauri release 中“搜索面板触发索引”仍需 Windows 手测确认。

## 下次一次性达到类似效果的提示词

```text
你是这个项目的发布审核者和工程控制论式接手者。请先阅读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md、C_context/KNOWN_FAILURES.md（如存在），运行项目 preflight。目标是判断 Serein 是否能发内测，不要急着改代码。

我的优先级是：沉浸式写作体验第一，Vault/知识工作流第二；数据安全不能妥协；UI 简洁，不要重复入口；必须以 Windows release .exe 体验为准。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进：
1. 先给发布状态和风险清单。
2. 如果发现阻断内测的问题，做最小可回滚修复。
3. 每个修复必须说明验证命令或无法验证原因。
4. 对 Vault/链接/保存/导出/窗口控制要优先保护真实用户数据。
5. 不要修改旧原型 `D_deliverables/serein-prototype/`。
6. 完成后更新 HANDOFF 和项目 memory，并给我可执行的 Windows 手测清单。
```

### 针对 Rich Edit / 代码块偏移的更强提示词

```text
你是 Serein Rich Edit 编辑器问题排查者。请先读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md，运行 preflight。我的问题发生在 Windows release .exe，不要只用浏览器 dev server 结论替代。

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

- 通用设计方法论：`C_context/PROJECT_DESIGN_PLAYBOOK.md`
- 可复制到新项目的通用 skill：`C_context/skills/product-control-design/SKILL.md`
- Serein release/bug triage skill：`C_context/skills/serein-release-control/SKILL.md`
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

- 当前正式目录是 `D_deliverables/serein-desktop/`，不是旧规则里的 `ys-writer-desktop`。
- 2026-06-18 起当前仓库已有 `C_context/KNOWN_FAILURES.md`；重复问题必须先查该文件，再查 `HANDOFF.md`、`C_context/PROJECT_MEMORY.md` 和 `C_context/skills/`。
- `python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora` 可运行，但脚本内置路径仍指向 `/home/rv_nano/Sipeed/...`，会报告目标路径缺失；不要把这个误判为当前仓库不存在。
- `rg` 在当前环境可能不可用；按全局习惯优先 `rg`，失败后直接退到 `grep/find`，不要卡住。
- 代码块相关关键路径：
  - `D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx`
  - `D_deliverables/serein-desktop/src/components/sereinCodeBlockView.ts`
  - `D_deliverables/serein-desktop/src/components/codeBlockConfig.ts`
  - `D_deliverables/serein-desktop/src/styles.css`
- 顶部菜单栏关键路径：
  - `D_deliverables/serein-desktop/src/features/window-chrome/WindowChrome.tsx`
  - `D_deliverables/serein-desktop/src/App.tsx` 中的 `isWindowDragBlockedTarget` / `handleChromeDragMouseDown`
  - `D_deliverables/serein-desktop/src/styles.css` 中的 `.menu-popover` / `.command-bar`
- 侧栏/简洁 UI 关键路径：
  - `D_deliverables/serein-desktop/src/features/vault-sidebar/VaultSidebar.tsx`
  - `D_deliverables/serein-desktop/src/features/shell/WorkspaceRibbon.tsx`
  - `D_deliverables/serein-desktop/src/styles.css`
- 当前发布状态：`v1.0.3` 是本地 commit + 本地 tag；GitHub 可见需要 push 分支和 tag。

### 下次一次性达到这轮效果的提示词

```text
你是 Serein 桌面编辑器和发布回归负责人。请先读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md，以及 C_context/skills/serein-editor-regression-control/SKILL.md；如果 preflight 可运行就跑，但不要被旧路径误导。请默认中文、直接、以结果为导向。

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
C_context/skills/serein-editor-regression-control/SKILL.md
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

- 先读 `C_context/KNOWN_FAILURES.md`，其中已经记录禁止恢复的标识和失败路径。
- 继续优化 `Alt+W` 时先测 Windows release 包真实耗时，再决定是否减小 quick-note bundle、推迟设置读取或减少同步工作。
- 不要把“启动速度优化”和“便签 UI 样式/位置优化”混在同一轮里改；否则很难判断卡顿来自窗口创建、前端加载、焦点切换还是样式/布局。
- Linux/WSL 的 `cargo check` 不能覆盖 Windows-only Rust 模块；改 `#[cfg(target_os = "windows")]` 代码后必须让 Windows 打包验证。

## 2026-07-01 Rich Edit Markdown 链接状态机沉淀

### 本轮结果状态

- 本轮修复 Rich Edit 中 Markdown link、escaped link、nested-bad link、autolink 的预览/展开/收回不一致问题。
- 当前正式 app 目录仍是 `D_deliverables/serein-desktop/`。
- 本轮涉及文件：
  - `D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx`
  - `D_deliverables/serein-desktop/src/shared/markdown.ts`
  - `D_deliverables/serein-desktop/src/App.tsx`
  - `D_deliverables/serein-desktop/tests/vault.test.mjs`
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
你是 Serein Rich Edit Markdown 链接状态机修复负责人。请先读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md、C_context/KNOWN_FAILURES.md，以及 C_context/skills/serein-rich-edit-markdown-links/SKILL.md；运行 preflight，但不要被旧 /home/rv_nano 路径误导。默认中文，直接、以结果为导向。

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
C_context/skills/serein-rich-edit-markdown-links/SKILL.md
```

下次以下场景应触发该 skill：

- Rich Edit 链接默认预览显示了 `[text](url)` 源码或半截链接。
- 标题链接、普通链接、URL autolink、带转义字符的链接显示不一致。
- 用户点击链接时“按下显示、松开消失”或无法拖选复制链接。
- Rich Edit 保存后出现多余反斜杠，如 `\[...\]\(...)`、`https\:`、`\_`、`\<https...\>`。
- 链接普通点击/编辑和 Ctrl/Cmd 跳转边界不清。
