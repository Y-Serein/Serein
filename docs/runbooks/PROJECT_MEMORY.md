# Serein Project Memory

最后更新：2026-07-22 11:38

## 用户偏好

- 默认中文沟通，表达直接、具体、以结果为导向。
- 用户说“提交 / commit”且未另行指定范围时，默认提交当前任务相关的源码、测试和 README；不默认纳入 HANDOFF、PROJECT_MEMORY、截图、构建产物或其他过程文档。
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

## 2026-07-15 大文本 paste、可视区 decoration 与表格闭环沉淀

### 本轮结果

- 原生纯文本 paste 不再交给 `contenteditable` DOM mutation/readChange 路径，改为单个 CodeMirror transaction；图片 paste 仍走附件导入。
- 约 541 KB、5000 行虚构 Markdown 多次冷启动实测：paste dispatch 约 295-306 ms，完整 UI 反馈约 1.6-1.85 秒；旧基线约 124.8 秒。
- 50 次页面内 ArrowUp 约 184-254 ms；纯 parser 不是主要瓶颈，不应先重写 Markdown 分析器。
- decoration 分成三层：全文跨行结构、当前代码块/语言控件、`visibleRanges` 行内链接/Wiki/强调/图片。
- Rich 表格补齐增删/移动行列、列对齐、Tab/Shift+Tab、Enter 新增行、ArrowDown/Escape 退出、焦点与横向滚动恢复。
- `npm run test`、`npm run typecheck`、`npm run build`、`git diff --check` 和两组干净端口 Playwright 回归通过；Windows release 未验证。

### 可复用判断

- 大粘贴慢时必须先区分 DOM 输入路径、CodeMirror transaction、parser 和 React 状态同步；不要看到全文分析就直接归因 parser。
- 用户真实 paste 事件中的 `event.clipboardData` 是允许的桌面事件数据。优先拦截 `text/plain` 并直接 dispatch；菜单 paste 和原生 paste 应落到同一类 transaction 语义。
- 行内 decoration 适合 `ViewPlugin + visibleRanges`；跨行 replace、block widget、表格和代码块结构继续留在 StateField。不要把 block widget 强塞进 ViewPlugin。
- selection 相关 UI 不应迫使全文基础装饰重建。当前代码块 active decoration 单独构建，行内 selection 展开只重建可视区。
- 表格 widget 可以保存“待恢复焦点/scrollLeft”这种短生命周期 UI 状态，但表格内容、对齐和结构必须立即序列化回 Markdown buffer，不能成为第二份真相。
- widget dispatch 前要抑制旧 DOM 的 blur 二次提交；否则未提交单元格内容加结构按钮可能触发重复 transaction 或 update-in-progress 错误。
- 性能自动化不能把 Playwright 逐次协议往返计入编辑器耗时。高频键盘基准应在页面内连续派发，再单独保留真实用户键盘功能回归。

## 2026-07-16 结构块退出、空块删除与系统剪贴板合作沉淀

### 用户偏好（本轮再次确认）

- 用户要求编辑器问题必须实际逐字符输入复现，不能把整段 Markdown 复制进去后只看最终 DOM；输入过程中的 keymap、自动续行、selection 和 decoration 才是问题本体。
- 用户不接受“只修代码块”。发现结构块退出异常后，应同步覆盖引用、无序列表、有序列表和嵌套 list/quote 等同类路径。
- 用户把 Serein 定义为桌面写作工具：`Ctrl+C/Ctrl+X` 必须进入系统剪贴板，不能只在 WebView/浏览器内部看起来成功。
- 用户会区分菜单与快捷键路径，并用“顶部菜单正常、Ctrl+C 失败”帮助缩小根因；后续应主动比较同一命令的所有入口。
- 用户愿意配合 Windows release 实测，但 AI 必须先用虚构文档和可控 mock 把同构逻辑验证到位，不能把所有验证工作推给用户。
- 用户偏好一次性收敛：修复后主动走普通文本、代码块、引用、列表、嵌套结构、菜单和快捷键相邻路径，避免下一张截图才发现同类问题。

### 从错误里学到的最佳实践

- “结构为空”与“parser 认为没有内容行”不是一回事。自动生成的 fenced block 通常是 ```` ```lang\n\n``` ````，含一个空内容行；删除语义应检查实际 content range 的空白，而不是只看 opening/closing fence 是否紧邻。
- 先确认 keymap 优先级再改 Enter 逻辑。项目 handler 即使已经存在，也可能被 `@codemirror/lang-markdown` 的高优先级 `markdownKeymap` 抢先执行；结构块退出必须放在 `Prec.highest`，否则会出现 `>` 阶梯和多按一次 Enter。
- 空结构退出应是共享产品语义：在结构块最后一行且内容为空时，Enter 删除当前 marker/container prefix 并退出；不要为 quote、list、code 各堆一套互不一致的补丁。
- 隐藏 fence 保护会影响删除。普通 Backspace 事务被 `protectRichCodeFenceLines()` 拦截时，应提供一个显式标注的整块转换事务，把空白代码块变为容器前缀/普通段落，而不是放开所有 hidden fence 修改。
- 浏览器 `navigator.clipboard` 成功不能证明 Windows WebView2 系统剪贴板成功。桌面复制验证必须捕获 Tauri `desktop_write_clipboard_text` 调用及参数，并最终由 Windows release 粘贴到外部程序确认。
- ClipboardEvent 的 `event.clipboardData` 仍应保留为浏览器/测试 fallback；Tauri 运行时再并行写原生剪贴板。不要为了桌面路径删除标准事件数据。
- 剪切必须满足“先复制成功，再删除”。原生剪贴板是异步的；Promise 完成前保持选区内容，并在完成后复核 selection 和文本没有变化，避免用户继续操作后删错位置，也避免写入失败导致数据丢失。
- 菜单、快捷键和 DOM `copy/cut` 应收敛到同一个 clipboard service。`writeDesktopClipboardText()` 必须返回可等待的成功状态，不能 fire-and-forget 后静默吞错却让上层误以为已完成。
- UI 自动化失败要区分产品失败与测试失败。本轮先后遇到 Playwright 模块路径缺失和菜单定位超时；应先修测试环境/做页面侦察，再判断业务行为，不能把 harness 故障包装成应用 bug。
- 编辑器核心模块、keymap 或 decoration 改动后使用干净 Vite 端口冷启动；真实逐键脚本应记录 Markdown、selection、active element、行 class 和 pageerror。

### 项目关键约束和坑

- Text Buffer 和默认 Milkdown 两条编辑路径仍同时存在。剪贴板这类桌面基础能力必须两条路径都覆盖；不能因为实验路径通过就删除 fallback。
- 主动系统剪贴板入口是 `apps/serein-desktop/src/services/clipboard.ts` 和 Rust `desktop_write_clipboard_text`；不要重新引入 `navigator.clipboard.writeText()` 作为桌面主路径。
- 顶部菜单能工作但快捷键失败，通常说明 Rust command/权限不是主因，应优先检查 DOM ClipboardEvent、CodeMirror/ProseMirror handler 和快捷键分发差异。
- 结构键回归必须覆盖逐键过程：`> first` 后两次 Enter、`- first` 后空 item Enter、`- > first` 嵌套退出、```` ```bash ```` 自动空内容行 Backspace。
- 只使用完全虚构的测试文本；不读取、复制或修改用户真实文档/Vault，也不操作 Windows 进程，除非用户另行明确授权。
- preflight 仍错误映射到 `/home/rv_nano/...`。它能提示流程，但不能据此判断 `/home/slam/Project/Serein` 不存在。
- Windows release 是系统剪贴板、IME、WebView2 键盘事件和真实文件保存的最终验证面；Linux Chromium + Tauri mock 只能证明同构逻辑。
- 当前 HEAD `4b07999`，main 相对 origin/main ahead 5，工作区同时包含性能、decoration、表格和本轮编辑器修复；提交前必须逐文件/逐 hunk 审查，禁止 `git add .`。

### 下次一次性达到这次效果的推荐提示词

```text
请接手 /home/slam/Project/Serein 的 Serein Markdown 编辑器交互回归。先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，并使用 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md；运行 typora preflight，但知道它的 /home/rv_nano 旧路径会误报。

目标：一次性复现、定位并修复代码块/引用/列表的空结构删除与退出，以及 Ctrl+C/Ctrl+X 系统剪贴板一致性。请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进，不要停在静态分析。

硬约束：
1. 只创建完全虚构文档；不要读取/复制我的真实文档或 Vault，不操作 Windows 进程。
2. 必须用 Playwright 逐字符输入和真实按键，不能用 fill/paste 最终 Markdown 代替输入过程。
3. 同时覆盖 Text Buffer 与默认 Milkdown；不删除 fallback，不做无关重构。
4. 工作区可能有大量 WIP，禁止 reset/checkout/restore，禁止 git add .。

复现矩阵：
- 输入 ```bash + Enter，删除代码内容后 Backspace，空代码块应一次删除为普通空段落。
- 输入 > first，第一次 Enter 续引用，第二次 Enter 退出；不得出现 >、>   > 的阶梯。
- 对 -、*、+、1. 和 - > 嵌套结构重复同类测试。
- 分别测试快捷键 Ctrl+C/Ctrl+X、顶部菜单复制/剪切、浏览器 fallback 和 Tauri 原生 clipboard command。
- Ctrl+X 必须验证原生写入 Promise 完成前原文不删除，成功后才删除；selection 变化时不得删错。

根因判断优先级：
- 先查 CodeMirror/Markdown keymap precedence，再判断 Enter handler 是否根本没执行。
- 区分 code block empty 与 blank content line；不要只用 fence 是否紧邻判断。
- 菜单正常、快捷键失败时先比较事件/命令入口，不要怀疑已经工作的 Rust command。
- Chromium navigator.clipboard 通过不等于 Windows 系统剪贴板通过；用 Tauri invoke mock 捕获 desktop_write_clipboard_text，最终明确 Windows release 未验证。

完成前运行 npm run test、npm run build、git diff --check；用干净 Vite 端口重跑逐键脚本和既有 decoration/editor regression。最终列出真实行为结果、根因、修改文件、验证证据、Windows 未验证项和 Git 状态。不要 commit/push，除非我明确要求。
```

### 本轮 skill 沉淀

- 继续增强 `docs/runbooks/skills/serein-text-buffer-stability/SKILL.md`，不创建重复 skill。
- 新增触发：空代码块删不掉、引用/列表 Enter 产生 `>` 阶梯、菜单复制正常但 `Ctrl+C` 不进系统剪贴板、要求真实逐字输入复现。
- 新增流程：keymap precedence、blank-vs-empty、显式结构事务、Tauri clipboard mock、异步剪切数据安全、测试 harness 故障分流。
- 新增评估用例：结构块逐键退出与系统剪贴板双路径回归。

## 2026-07-16 Rich 表格幽灵行沉淀

- 视频 `docs/images/v18.mp4` 显示：光标看似在表格外，下一次输入却把表格拆成前半表格和后半裸 Markdown。
- 虚构表格复现确认：表格 widget 只占 header 行，隐藏的后续 Markdown 行仍各保留约 `25.6px` 行高；视觉空白实际是可点击的表格源码。
- 修复不能只依赖 CSS 压高度，因为键盘 selection 仍可能进入隐藏换行。正确边界是在全文 StateField 中用整段原子 block replacement 覆盖完整 table source range。
- 修复后 Rich DOM 布局行从 12 降为 5；点击表格下方并按 Enter 不再拆表。单元格编辑、增删行、对齐、焦点恢复、ArrowDown 退出和 Source 保真仍通过。
- 本轮未验证 Windows release `.exe`；默认 Milkdown fallback 和实验开关保持不变。

## 2026-07-17 Rich 局部代码复制/剪切与隐藏 fence 沉淀

- `docs/images/v19.png` 对应的复制末尾多出 ```、`Ctrl+X` 失效、继续输入恢复不干净是同一个 selection 映射问题，不是三个独立快捷键 bug。
- Rich DOM selection 会隐藏 closing fence，但 CodeMirror source range 在拖选终点落到块后空白/正文时仍包含该 fence。clipboard 必须基于“可见源码片段”，不能直接 slice 原始 selection。
- `protectRichCodeFenceLines()` 拒绝普通 cut 修改部分 fence 是正确的数据保护；修复应剔除未配对 fence 并让 cut 删除同一批可见 ranges，不能放松保护。
- cut 删除到 closer 前时必须保留一个结构换行，否则 selection 落在受保护 fence 边界，下一次输入仍会被拒绝。
- 五种拖选终点、Tauri clipboard mock、顶部菜单、继续输入和首/中/末字符点击均已用虚构文档验证；Windows release 仍未验证。
- 语言控件显示的 `plain` 是无语言代码块的 placeholder，不会自动写入 Markdown。

## 2026-07-17 Rich 表格下方坐标错位补充

- 整段原子 table replacement 解决了源码幽灵行，但 `.serein-buffer-table-block { margin-bottom: 22px; }` 仍让 DOM 空白行比 CodeMirror 测量位置低 22px；点击真实空白行会写到后续正文。
- 把 margin 改成 padding 只修测量，不修交互：表格本体下方 22px 变成 widget 内不可编辑区域，点击被吞。
- 最终边界是跨行可编辑 widget 不使用外部 margin，也不伪造上下 padding；Markdown 真实空行负责视觉间距和 selection。
- 坐标回归必须以 HTML 表格本体底边为基准，不只测 widget 外框；逐点输入确认空白行和正文的切换边界。

## 2026-07-20 本次合作总复盘

### 用户偏好（反复调整后的稳定结论）

- 默认中文，直接、具体、以可见结果为导向；允许技术反驳，但必须给出证据、可复现过程、备选方案和利弊。
- 编辑器 bug 必须先真实复现，再修改；修改后用同一脚本反证，不接受只有 typecheck/build 或“理论上已修好”。
- 不只修截图中的一个点；应主动检查相邻高频路径，例如点击、拖选、键盘、顶部菜单、剪贴板、继续输入、Rich/Source 保真和保存。
- 用户已确认的 Typora-like 交互高于编辑器库默认行为；数据安全、Markdown 保真、selection/history 和可继续编辑性高于局部视觉补丁。
- UI 自动化只使用完全虚构文档，不读取、复制或修改用户真实 Vault；未单独授权时不操作 Windows 进程。
- Linux/Chromium/Tauri mock 用于前置反证，Windows release `.exe` 才是 WebView2、IME、系统剪贴板和真实 Vault 保存的最终验收面。

### 从错误中得到的最佳实践

- 视觉 DOM 与源码 selection 是两层事实。排查 Rich 错位/剪贴时同时记录 DOM 布局、`selection.from/to/text`、Markdown source、clipboard payload 和 page errors。
- CodeMirror 可编辑行或跨行 widget 不能用 CSS margin 伪造间距；margin 不进入测量，padding 又会制造不可编辑假空白。间距应尽量由真实 Markdown 空行承担。
- 多行 Rich 表格必须用覆盖完整 source range 的原子 block replacement；“首行 widget + 逐行隐藏文字”会留下幽灵行高和可点击坐标。
- Rich copy/cut 必须先把 source selection 映射为可见源码范围；部分选择剔除未配对隐藏 fence，完整代码块/全文则保留成对 fence。cut 删除范围必须与 clipboard 一致，不能放松 fence 保护。
- 大文本 paste 先查浏览器 `contenteditable` DOM mutation 路径，不要先重写 parser。原生纯文本 paste 应阻止默认 DOM 改动，一次 dispatch CodeMirror transaction。
- 结构块输入要逐字符/逐按键复现，并先查 keymap precedence。`fill()` 或直接 paste 最终 Markdown 会绕过 pending fence、自动续行和中间 selection。
- 每轮 UI 反证使用干净 Vite 端口；长期 HMR 可保留旧 StateField/模块，制造“修复无效”假结论。自动化找不到菜单/模块时先判定 harness 故障。
- 系统剪贴板必须验证 Tauri command 名和 payload；`navigator.clipboard` 成功不等于 Windows 外部程序可粘贴。剪切必须在原生写入成功且 selection 未漂移后才删除。

### 项目关键约束和坑

- 正式交付物只在 `apps/serein-desktop/`；旧原型/归档默认不改。text-buffer 仍是实验开关，默认 Milkdown fallback 不能删除。
- Markdown buffer 应是内容、selection、history、outline、widget 和保存的唯一真相；禁止用 deferred React 坐标、DOM 文本或 widget 缓存制造并行真相。
- 隐藏 fence 保护是数据安全边界，不能为了让 cut/输入通过而削弱；明确结构改写必须使用显式 transaction annotation。
- 工作区有大量 WIP，禁止 reset/checkout/restore 和 `git add .`；未明确要求不 commit/tag/push，`docs/images/` 不默认纳入。
- 工作区树必须懒加载并屏蔽重目录，不能恢复整树递归扫描。
- typora preflight 当前仍指向 `/home/slam/Sipeed/Serein/Typora`，会误报项目根缺失；实际仓库是 `/home/slam/Project/Serein`，不能根据该误报否定当前工作区。

### 下次一次性达到本次效果的提示词

```text
请接手 /home/slam/Project/Serein 的 Serein Markdown 编辑器交互回归。先完整阅读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md 和 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md，然后运行 python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora。preflight 可能仍指向旧目录，当前真实仓库以 /home/slam/Project/Serein 为准。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进。先真实复现，再改最小控制变量；修改后必须用同一脚本反证。不要用 typecheck/build 或“理论上”代替用户可见行为。

测试只创建完全虚构的 Markdown 文档，不读取、复制或修改我的真实 Vault；未单独授权时不操作 Windows 进程。UI 脚本使用干净 Vite 端口，逐字符输入和真实键盘/鼠标事件，不用 fill/paste 最终 Markdown 绕过中间态。

复现时同时采集：CodeMirror selection from/to/text、Rich DOM 布局/坐标、Markdown source、clipboard command/payload、保存前后内容和 page errors。表格问题要测 HTML 表格本体底边下方逐点点击；代码块要覆盖局部拖选、隐藏 opening/closing fence、Ctrl+C、Ctrl+X、顶部菜单、剪切后继续输入和 Rich/Source 保真。

主动检查相邻高频路径，但不做无关重构。保护默认 Milkdown fallback、Vault IO、保存、history/selection、链接、代码块、表格和图片。工作区可能有大量 WIP，禁止 reset/checkout/restore、禁止 git add .，不 commit/tag/push，除非我明确要求。

完成前运行最小相关单测、npm run typecheck、npm run test、npm run build、git -c safe.directory=/home/slam/Project/Serein diff --check，并用修改前的同一 Playwright 脚本证明失败转为通过。最终列出用户可见结果、根因、修改文件、命令/自动化证据、Git 状态和未验证风险。Windows release .exe 仍需通过 PowerShell 构建后，在记事本/真实 WebView2/IME/Vault 中做最终验收。
```

### 可复用 skill

- 不创建第二套重复 skill；本次继续增强 `docs/runbooks/skills/serein-text-buffer-stability/SKILL.md`。
- 该 skill 已覆盖：先复现/同脚本反证、虚构文档、干净 Vite、selection/DOM/source/clipboard 联合取证、表格原子 replacement、隐藏 fence copy/cut 映射、系统剪贴板、Windows release 终验和 dirty worktree 保护。
- 下次直接在提示词中点名该 skill 即可；若未来要评估触发率或对比新旧版本，再补 eval/benchmark，本轮不为了形式扩大范围。

## 2026-07-21 表格交互与单编辑器接手沉淀

### 用户偏好（本轮反复确认后的结论）

- 表格工具栏要线性、简约、低噪声：`[网格行列选择] [左对齐] [居中] [右对齐] [⋯] [删除]`。不要把“更多操作”和 `⋯` 做成两个入口，也不要用 `+↕ / −↕ / +↔ / −↔` 这类低级符号。
- 网格是“调整表格行列尺寸”的轻量选择器：上方鼠标悬停预览、单击确认；下方可以输入行数和列数。它不是复杂的多单元格 selection。
- Markdown 表格对齐必须按列，而不是按当前选中的多个单元格；对齐按钮只影响当前表格，并作用于当前光标所在列，写回标准分隔行 `:---`、`:---:`、`---:`。
- 表格左侧负责行列和对齐，右侧只放 `⋯` 与删除；视觉上要有清晰的左右分工，不能做成厚重卡片或堆满文字的工具条。
- 不要为了架构清理删除已经稳定的 Frontmatter CSS、`tags/aliases/status` 语义或其他已确认样式；如果误删，应恢复原有行为，再做局部优化。
- 用户要求“先确认”时，必须停留在诊断阶段；先回答现象是什么、原因是什么、修复方案和利弊，再等待同意，不可把诊断问题顺手改成代码。

### 从本轮错误中得到的最佳实践

- CodeMirror 语法树能识别，不代表 Rich 编辑器能识别。必须沿实际运行路径检查：输入事件 → Rich 自定义扫描器/补全 → table widget → Markdown 写回；不能只看 Lezer AST 的结果。
- 处理 `|·1|12|12|` 这类最小表格输入时，必须用逐字符/真实回车复现，分别记录输入前后 Markdown、selection、表格扫描结果和 DOM；不能只把最终 Markdown 直接塞进编辑器。
- 解释“两个东西”前先数实例和 DOM：一个 CodeMirror buffer 可能同时有可视化 Frontmatter 属性条和原始 YAML。视觉重复不等于编辑器实例重复，修复入口应是 active/隐藏判定和布局，而不是恢复/删除编辑器。
- 用户指出 UI“丑”时，先定位截图对应的实际 CSS 盒子、边框、阴影、hover/active 状态和空间测量，再决定改样式还是结构；不能通过删功能控件来制造“简约”。
- 表格对齐要同时验证四层：Markdown delimiter、解析得到的 alignment、`th/td` 的 `text-align`、单元格输入框的 `text-align`。只验证源码变了不够，只验证视觉也不够。
- 当前工作区包含大量未提交架构改动，文档沉淀也属于用户 WIP。更新 HANDOFF/memory/skill 时只编辑目标文档，不回滚、覆盖或顺手格式化源码；验证用 `git -c safe.directory=/home/slam/Project/Serein ...` 绕过环境的 dubious ownership 检查。

### 当前项目约束补充

- 单编辑器的目标模型是 `Markdown text → one CodeMirror EditorState → decorations/widgets/outline/save`。不允许为表格、公式或 Frontmatter 再引入一套内容/selection/history 真相。
- 表格 widget 的结构变更必须立即序列化回 Markdown；临时焦点、滚动和网格 hover 状态可以是 widget 局部状态，但不能延迟提交造成源码与 UI 分叉。
- 标准表格最小闭环至少包含：普通 pipe 行识别、回车补齐 header/separator/blank row、按列对齐、行列调整、`⋯` 菜单、删除、表格外退出、Rich/Source roundtrip。
- 数学公式当前已进入单编辑器 WIP，但公式能力的完成标准还包括行内/块渲染、非法 LaTeX 保底、光标/选择不被 widget 吞掉、保存与 Source 保真、构建产物和 Windows WebView2。
- 当前 release 仍未通过 Windows `.exe`、真实系统剪贴板、IME、真实 Vault 保存的最终验收；Linux/Chromium 结果必须在交付报告中标注为前置证据而非平台结论。

> 架构状态修订（2026-07-21）：更早历史段落中的“text-buffer 仍是实验开关、必须保留 Milkdown fallback”是当时的阶段性约束，不再代表当前决策。用户已确认单编辑器方案可以成为全架构；当前正式路径是 `EditorHost → MarkdownTextBufferEditor`，旧 Milkdown/textarea 源码只通过历史 commit 回滚，不恢复为并行源码。当前仍未完成的是 release、性能和真实平台验收，不是编辑器架构是否单一。

### 本轮推荐提示词（一次性对齐）

```text
请接手 /home/slam/Project/Serein。先读 AGENTS.md、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，以及 docs/runbooks/skills/serein-text-buffer-stability/SKILL.md；再运行项目 preflight，并说明它是否指向了旧目录。默认中文，按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进。

当前目标是维护单一 CodeMirror Markdown 编辑器。先不要改代码：先用完全虚构文档复现并报告根因。若问题涉及表格，必须分别检查 CodeMirror 语法树与 Rich 自定义扫描器，真实逐字符输入 `|1|12|12|` 后回车，验证 header/separator/blank row；表格工具栏固定为网格行列、左/中/右对齐、`⋯`、删除。对齐按标准 Markdown 按列写回，只作用当前表格和当前列，不引入多单元格选区。

同时保护：单一 editor state、selection/history、保存、链接、代码块、Frontmatter tags/aliases/status、图片和已跑通的 Rich/Source 路径。看到截图重复或丑时先定位真实 DOM/CSS 盒子，不要先删控件或恢复第二套编辑器。任何修改都要用最小共享根因完成，并用同一个逐键脚本、源码 roundtrip、DOM/截图和 page errors 反证。

完成后运行 npm run typecheck、npm run test、npm run build、git -c safe.directory=/home/slam/Project/Serein diff --check；UI 使用干净 Vite 端口。Windows release、WebView2、IME、系统剪贴板和真实 Vault 未验证时必须明确写出。只更新当前任务相关文件，不使用 git add .，不自动 commit/tag/push。
```

### 本轮 skill 决策

- 不创建重复 skill。继续增强 `docs/runbooks/skills/serein-text-buffer-stability/SKILL.md`，因为它已经覆盖单编辑器、结构块、表格 widget、selection/history、Vite 回归和 Windows 终验。
- 新增内容应保持可执行：先确认/再改、表格实际运行路径、按列对齐、Frontmatter 重复诊断、最小表格输入、视觉与源码双重验证、交接沉淀。

## 2026-07-21 表格稳定检查点与数学公式方案 A

### 已形成的稳定边界

- 表格/单编辑器稳定检查点为 `4cc4414 feat(editor): stabilize single-editor table workflow`；当前仅本地 commit，未 tag、未 push。
- 该检查点之后的公式工作保持为独立 WIP，避免把“表格已稳定”和“公式已完成”混成同一个发布结论。
- `/home/slam/Sipeed/T_tools/agent_preflight.py` 的 typora 项目根目录和 git 目录已修正为 `/home/slam/Project/Serein`。此前关于它仍指向旧目录的记录只代表历史状态，不再是当前事实。

### 方案 A 的实现原则

- Markdown source 是公式唯一真相；Rich 模式只通过 CodeMirror decoration/widget 渲染，不为公式创建第二套内容、selection 或 history 状态。
- 编辑器、HTML 导出和 PDF 导出统一复用 `scanMarkdownMath()`，不要各自维护美元正则。否则货币、代码、未闭合块公式会在三个出口产生不同结果。
- `$5 and $10`、空白定界符、转义美元、单/多反引号代码中的美元内容保持普通文本；合法 `$...$` 和闭合非空 `$$...$$` 才进入公式路径。
- 非法 LaTeX 必须安全可见，使用 `.serein-math-error` 回退；不能因为 KaTeX 解析失败而静默丢失用户源码。
- 渲染公式必须可回到源码编辑：widget 携带 source range，普通点击把 selection 放回公式范围并展开，selection 离开后重新折叠。
- PDF 目前是文本型公式导出：只移除合法公式定界符，保留公式内容和货币美元符号；它不是 KaTeX 矢量排版。

### 验证结论和剩余风险

- 公式改动后 `npm run typecheck`、`npm run test`（7/7）、`npm run build`、`git diff --check` 均通过。
- 公式 Chromium smoke 通过：合法/非法行内公式、块公式、货币、代码、点击展开、Rich/Source roundtrip、离开 selection 后重渲染；page errors 0。
- 表格相邻回归通过：单一 CodeMirror、工具栏顺序、当前列对齐写回、DOM/input 对齐、Rich/Source roundtrip；page errors 0。
- 两次 5197 smoke 在编辑器出现前冷启动超时，换干净 5201 端口后完整通过。UI 回归应继续使用干净端口，并把 harness 启动失败与产品断言失败分开报告。
- Windows release、WebView2、IME、真实 Vault 保存、HTML 导出中 KaTeX 相对字体路径仍未验证；Linux/Chromium 只能作为前置证据。

## 2026-07-21 SCI/LaTeX 数学语法纠正

- 用户明确区分“Markdown 数学扩展”和“SCI 论文的标准数学写法”。产品面向科学写作时，不能把 `$...$` / `$$...$$` 描述为标准 SCI 格式。
- Serein 的首选数学语法确定为：`\(...\)` 行内公式、`\[...\]` 块公式。README、示例、后续插入命令和验收样例都应以此为准。
- `$...$` / `$$...$$` 只作为已有 Markdown 文档的兼容读取层保留；不能静默转换、重写或破坏用户原始分隔符。
- `scanMarkdownMath()` 已增加标准 LaTeX 分隔符，支持独占行块和分隔符贴近内容的跨行块；widget 记录准确 content source 位置，点击后光标进入分隔符内部。
- 标准 LaTeX UI smoke、Source/Rich roundtrip、HTML/PDF 导出、非法输入 fallback、货币/代码保护、美元兼容和表格相邻回归均已通过；Windows release 仍需实测。

## 2026-07-21 SCI/LaTeX 公式兼容与 Word 原生导出完整复盘

### 用户偏好（经过本轮反复调整后的稳定结论）

- 用户要的是 SCI/LaTeX 的标准数学输入，不接受把 Markdown 常见的 `$...$` / `$$...$$` 当成首选标准。新文档首选 `\(...\)`、`\[...\]`，并完整覆盖 `equation`、`align`、`aligned`、`split`、`multline`、`gather`、`cases`、矩阵、编号和引用。
- 用户强调“要做就做完整”：不能只支持一个 `equation` 示例或某个生成器输出；应主动生成非线性最小二乘、贝塞尔曲线、信任链、矩阵、分段函数、多行对齐、编号/引用、自定义宏等不同结构的回归样本。
- 用户希望 Serein 这边长什么样，导出到 Word/HTML 就尽量保持相同结构：Markdown `#` 映射一级标题，LaTeX `\section` 等映射对应标题层级，公式保持编号、对齐和引用。
- Word 公式必须是原生可编辑 OMML，不接受截图、SVG 图片、LaTeX 源码占位或“看起来像公式但无法编辑”的方案。
- 完整 LaTeX 外壳不需要在 Rich Edit 中执行：`\documentclass`、`\usepackage`、`\geometry`、`\begin{document}` 等属于文档系统；导出时剥离外壳并转换结构即可。安全的数学宏定义可以提取，但不能引入完整 TeX 执行器。
- 用户会从真实测试文档里指出一个局部现象，例如“这里突然变大”；AI 应把它作为证据继续追根因，不能固守上一轮对 `equation + \bm` 的猜测。
- 用户接受保留 `$...$` / `$$...$$` 兼容，但不要求为了兼容维持第二套渲染器。首选单一 MathJax 语义链，旧语法只是输入边界兼容。
- 用户默认要求真实可见验证：公式是否清晰、字号是否异常、点击后是否能编辑、Word 是否可编辑，不能只靠类型检查或单个 parser 测试。
- 用户说“提交 / commit”且未另行指定范围时，默认提交当前任务相关源码、测试、配置和 README；HANDOFF、PROJECT_MEMORY、截图和构建产物不默认进入源码提交。若用户明确要求沉淀 skill/memory，再单独确认是否做文档提交。

### 从错误里学到的最佳实践

1. 先把问题分成三类，再决定改哪一层：
   - 用户源 LaTeX 本身非法，例如 `\qquadqquad` 应为 `\qquad\qquad`。
   - MathJax/兼容层缺能力，例如 `\bm` 未注册、`\mathcal` 动态字体未加载、preamble 宏没有进入数学上下文。
   - Markdown/Rich 装饰泄漏，例如块公式内部的单独 `=` 把上一行误判为 Setext H1。
   这三类现象都可能表现为“公式报错或突然变大”，但控制变量完全不同。
2. MathJax 4 NewCM SVG 的部分字形是动态模块。出现 SVG `width="NaNex"`、`viewBox` 含 `NaN` 或巨型字形时，先检查对应动态字体模块，不要先用 CSS 限高掩盖。`\mathcal` 的正确修复是加载 `@mathjax/mathjax-newcm-font/mjs/svg/dynamic/calligraphic.js`。
3. 自定义宏必须作为文档级数学上下文处理，不能逐公式做字符串替换。用平衡括号解析 preamble 中的 `\newcommand` / `\renewcommand` / `\providecommand`，作为第一个隐藏 setup 注入 MathJax；setup 必须进入渲染缓存签名，并同步传给 DOCX 语义编译。
4. Rich、HTML、DOCX 应共用同一 `scanMarkdownMath()`、MathJax TeX 配置和语义树。否则会出现编辑器能显示、HTML 报错、Word 又输出源码的三套事实。
5. 对完整 LaTeX 文档采用“安全归一化”而不是“执行”：保留源文件，导出时提取 body、标题层级和数学宏；不执行布局包、任意命令或完整 TeX 引擎。
6. 块公式在源码态仍处于 Markdown 文本缓冲区中。建立 block math ranges，对完全落在范围内的行跳过 heading/list/quote/hidden 等装饰；不能因为存在行内公式而跳过整条普通正文。
7. 不要用一个简单示例判断公式完成。至少验证：标准/兼容分隔符、AMS 外层环境、内部环境、矩阵/分段、`\bm`、`\mathcal`、文档宏、编号/引用、非法源码可见回退、完整 article/report、HTML 和 DOCX。
8. 视觉问题必须用真实组件和真实 CSS 验证。记录公式宿主盒、SVG 属性、字形墨迹尺寸、源码态 class/font-size/line-height、console/page errors；同一脚本在修复前后反证。
9. CodeMirror 会虚拟化离屏内容。自动化找不到第 199 行的公式时，先确认真实滚动所有者和探针 DOM 是否包含 `.editor-surface`，不要把“DOM 暂时不存在”当成产品不支持。
10. harness 失败与产品失败要分开：Python Playwright 缺包、Vite 端口 `EPERM`、`ERR_NETWORK_CHANGED`、旧 HMR 缓存、探针缺滚动容器，都应先修测试环境，不要据此改产品逻辑。
11. DOCX 测试应断言 OMML 结构，不要假设文本连续。`pk_i` 可能被正确拆成多个 `<m:t>` 和上下标节点；测试应验证语义节点、字段、书签和无源码泄漏。
12. 非法公式不能静默丢失。Rich/HTML 用 `.serein-math-error` 显示转义源码，DOCX 使用可见源码回退；这样用户能区分文档错误和渲染器缺陷。

### 项目关键约束和坑

- Markdown buffer 是唯一真相。公式 widget 只负责视觉和点击回源码，不创建第二套内容、selection、history 或渲染器。
- 当前长期渲染器是 MathJax 4；KaTeX 路径已删除，不应为某个命令重新恢复两套渲染器。
- `$...$` / `$$...$$` 只兼容读取；不能自动重写用户源文件，也不能破坏货币、转义美元、代码 span/fence 和未闭合定界符。
- `\documentclass`、`\usepackage`、`\geometry`、`\maketitle`、`\begin{document}` 不是公式语法。Rich 不执行它们；HTML/DOCX 导出负责剥离外壳和映射结构。
- `\newcommand` 等只在完整文档 preamble 中安全提取为数学上下文；不把任意 TeX 变成可执行脚本。
- HTML 使用 MathJax SVG；DOCX 使用 MML→OMML；PDF 当前仍是可读 LaTeX 文本，不是排版公式。三个出口的完成度必须分别说明。
- MathJax 动态字体缺失可能产生 `NaNex` 而不是普通 parse error；CSS 缩放不是根因修复。
- Markdown Setext 标题规则会与公式内部独占 `=` 冲突；块公式源码范围必须隔离行装饰。
- `v1.txt` 是重要真实回归样本，但位于 `/home/slam/Project/test/v1.txt`，不能修改或直接纳入仓库。仓库夹具应复制为脱敏、合法、可维护版本；非法 `\qquadqquad` 另做错误回退测试。
- 当前工作区有 24 项 WIP，包含源码、测试、README、DOCX 和文档。禁止 `git add .`、reset、restore、checkout；提交前逐文件/逐 hunk 检查，新文件使用 `git add --chmod=-x`。
- Linux/Chromium 验证不能替代 Windows release、WebView2 和 Microsoft Word。Word 的视觉、字段刷新、公式编辑性和大文档性能仍是最终产品验收。

### 下次一次性达到这次效果的推荐提示词

完整可复制版本见：

`docs/runbooks/skills/serein-sci-latex-math-convergence/references/one-shot-prompt.md`

核心提示词：

```text
请接手 /home/slam/Project/Serein 的 SCI/LaTeX 数学兼容和 Word 原生公式导出。先完整阅读 AGENTS.md、CLAUDE.md（若存在）、HANDOFF.md、docs/runbooks/PROJECT_MEMORY.md、docs/runbooks/KNOWN_FAILURES.md，以及 docs/runbooks/skills/serein-sci-latex-math-convergence/SKILL.md；运行 python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora。

按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进。先汇报当前 HEAD、dirty worktree、现有数学语义链、用户复现文件和最小控制变量；诊断阶段不要先改代码。根因明确后自主做最小修复，不做无关重构，不恢复 KaTeX 或第二套内容/selection/history。

产品标准：新文档首选 \(...\) 行内、\[...\] 块和 AMS 环境；$...$ / $$...$$ 只兼容读取。完整 LaTeX 外壳不在 Rich 中执行，导出时剥离并映射标题；preamble 中安全的 newcommand/renewcommand/providecommand 要贯通 Rich、HTML 和 DOCX。Word 必须输出原生可编辑 OMML，不使用图片或源码占位。

遇到“公式报错/突然变大”时必须分别排查：源 LaTeX 是否非法、MathJax 包/动态字体/宏上下文是否缺失、Markdown heading/list/quote 装饰是否泄漏到块公式。不要用 CSS 限高掩盖 NaN SVG，不要把用户源码错误包装成兼容问题。

请主动生成非线性最小二乘、贝塞尔曲线、信任链、自定义宏、矩阵、cases、align/subequations/label/ref 等回归样本。验证 Rich 点击编辑、Source 保真、HTML、DOCX OMML/字段/书签、非法源码可见回退；视觉问题用真实 MarkdownTextBufferEditor、真实 CSS、干净 Vite 和 Playwright，记录 SVG 尺寸、font-size、selection、page errors。完成前运行 npm run test、npm run typecheck、npm run build、git diff --check，并明确 Windows release/Word 未验证项。

不要修改我的原始复现文档，不要 git add .，不自动 commit/tag/push。若我说 commit，默认只提交当前任务相关源码、测试、配置和 README；HANDOFF、memory、截图和构建产物另行确认。
```

### 本轮沉淀出的项目 skill

- 新增：`docs/runbooks/skills/serein-sci-latex-math-convergence/SKILL.md`。
- skill 覆盖：标准数学语法边界、MathJax 动态字体、`\bm`、preamble 宏上下文、块公式 Markdown 装饰隔离、完整 LaTeX 外壳归一化、Rich/HTML/DOCX 单语义链、非法源码回退、Playwright 视觉证据、Word 终验和 dirty worktree 保护。
- 附带一次性提示词和 4 个 eval 提示。当前是可用草案，尚未运行 with-skill/baseline benchmark；后续如需优化触发率，再按 skill-creator 流程做量化迭代。

## 2026-07-22 SCI 公式与 Word/WPS 排版最终收敛

### 本轮稳定结果

- 公式、MathJax、完整 LaTeX 结构映射和 DOCX 原生公式已经形成稳定提交：`a3ed1fc feat(export): stabilize scientific math and DOCX export`。
- 用户对最终视觉反馈为“现在好很多了”，当前版本应作为稳定基线；没有新的最小复现时，不继续凭主观感受反复调整公式字号、字体或 OMML 结构。
- DOCX 中文论文排版基线：正文中文 SimSun/宋体 12 pt，英文与数字 Times New Roman 12 pt；文档标题 SimHei/黑体 22 pt；一级标题 16 pt；二级标题 14 pt；三级标题 12 pt。
- 公式显式请求 Cambria Math，并保持 Word 原生可编辑 OMML；不使用图片、SVG 截图或可见 LaTeX 源码替代。
- Word/WPS 公式编号使用段落中心/右对齐制表位，不使用无边框表格。该方案优先消除编辑时出现的网格感；复杂 `align` 跨行精确对齐是可接受的次要取舍。
- `\sum`、`\prod`、`\int` 等大运算符必须拥有非空 OMML `m:nary/m:e` 主体；空 `<m:e/>` 会被 WPS 显示为虚线占位框。
- 编辑器公式只做轻微相对字号调整：`1.04em`。140% 场景下实测约 16.64 px，无 MathJax、console 或 page error；不使用描边、滤镜、强制锐化或 CSS 限高。

### 用户偏好（本轮反复调整后的稳定结论）

- Word 和 WPS 要尽量获得同等效果，但用户接受二者不是同一排版引擎，目标是结构、字体意图、字号、公式编辑性和编号布局一致，不承诺像素级相同。
- 中文论文默认排版不是浏览器通用字体：正文宋体小四；英文/数字 Times New Roman；标题黑体并按中文论文常用层级设置。
- 用户在视觉验收时使用 140% 缩放。公式清晰度、正文行高、块公式高度和点击编辑必须在该场景验证，而不是只测 100%。
- 用户对公式中的虚线框、表格格子、异常放大和字体发糊非常敏感；这些不是“能导出就算完成”，必须追到 XML 结构、字体选择或渲染缩放根因。
- 用户会先接受“至少能用”的稳定点，但明确要求不要在已明显改善后乱改；后续变更必须基于截图、软件版本和最小复现。
- 用户说“提交 / commit”时，默认只提交当前任务相关源码、测试、配置和 README。本轮稳定提交严格排除了 HANDOFF、PROJECT_MEMORY、截图、参考 DOCX、skill 和构建产物。
- Git 仓库无用户身份时，允许按项目规则对单次 commit 使用 `Y-Serein <2034755070@qq.com>`；不要修改全局 Git 配置。

### 从错误里学到的最佳实践

1. DOCX 视觉异常要先看 OOXML/OMML 结构，不要只看截图猜 CSS。WPS 的虚线框最终不是字体问题，而是大运算符 `<m:e/>` 为空。
2. `m:nary` 的主体不是可选装饰。把求和/积分号单独映射成 OMML 运算符但遗漏后续被积/求和表达式，会生成可编辑却不完整的公式结构。
3. 收集大运算符主体时要基于 MathJax 语义兄弟节点，并设置合理边界：顶层加减、关系符号、逗号/分号可以结束主体；括号内部的同类符号不能提前截断。
4. 公式编号不要用表格模拟版式。即使表格边框设为 none，Word/WPS 编辑态仍可能暴露单元格网格；正文宽度中点的 center tab 加右边界 right tab 更符合用户预期。
5. DOCX 字体要区分字体槽位：正文 `ascii/hAnsi/cs` 使用 Times New Roman，`eastAsia` 使用 SimSun；标题 `eastAsia` 使用 SimHei；只设置一个 `font` 字符串不足以保证中英文分别选字体。
6. Office Math 字体要在 `settings.xml` 的 `m:mathPr` 中显式写入 `<m:mathFont m:val="Cambria Math"/>`，不能依赖正文样式或 Office/WPS 自行猜测。
7. 使用 `docx` 库覆盖内置标题时，优先使用 `styles.default.title/heading1/...`。同时再定义同名 paragraph style 可能生成重复 styleId，导致不同 Office 实现取值不一致。
8. DOCX 回归测试要验证结构而不是“肉眼打开一次”：默认字体槽位和半点字号、标题 styleId 唯一、Cambria Math、center/right tab、无公式布局表格、大运算符 `m:e` 非空、SEQ/REF/bookmark 都应自动断言。
9. 140% 清晰度不能用 `deviceScaleFactor` 结果冒充 Windows WebView2 最终结论；它是前置证据。最终仍要记录 Windows 显示缩放、应用版本、截图和字体是否安装。
10. 公式看起来发糊时不要上 `text-shadow`、stroke、filter、`crispEdges` 或任意 transform scale。这些会让部分字形更糟，并掩盖字体缺失、分数像素或 SVG viewBox 问题。
11. 稳定提交前必须逐路径暂存。工作区存在 HANDOFF、memory、截图、skill、参考 DOCX 时，`git add .` 会污染源码提交；本轮用显式文件列表成功隔离 22 个源码/测试/README 路径。
12. Git commit 失败不等于暂存丢失。身份缺失时先确认 staged 状态，再用单次 `-c user.name/-c user.email` 提交，不能顺手修改全局配置。

### 项目关键约束和坑

- 当前稳定基线是本地 `main` 上的 `a3ed1fc`，尚未 push；GitHub 不可见。
- `apps/serein-desktop/src/export/docxExport.ts` 是 Word/WPS 字体、OMML、公式编号、字段和书签的核心实现，不要另建平行 exporter。
- A4 页面宽 11906 DXA、左右各 1440 DXA 时正文宽度为 9026 DXA；公式 center tab 为 4513，编号 right tab 为 9026。若以后改页面或边距，这两个值必须由正文宽度计算，不能写死与页面脱节。
- `align` 当前按行生成独立段落，消除了网格，但牺牲部分跨行精确对齐。除非有明确失败样本，不要为了对齐重新使用 Word 表格。
- Word/WPS 字体一致依赖目标机器安装 SimSun、SimHei、Times New Roman、Cambria Math。缺字体时必须报告回退，不要把回退结果误判为导出代码完全失效。
- Word/WPS 可能不自动刷新 `SEQ/REF` 字段；文档设置了 update fields，仍应提供“全选后按 F9”的验收步骤。
- DOCX skill 的 schema validator 当前因缺少 `defusedxml` 未运行，LibreOffice 渲染因无 `soffice` 未运行；已完成 ZIP/XML 和自动化结构断言，但这两项不能伪装成已验证。
- 用户原始 `tests/fixtures/rich-edit/Latex/*.docx`、`docs/images/`、`out/` 生成文档默认不进入源码 commit。
- PDF 仍输出可读 LaTeX 文本，不是 MathJax/OMML 等价排版；不要把 DOCX 完成状态外推到 PDF。

### 下次一次性达到这个效果

- 完整提示词维护在：`docs/runbooks/skills/serein-sci-latex-math-convergence/references/one-shot-prompt.md`。
- 公式收敛流程维护在：`docs/runbooks/skills/serein-sci-latex-math-convergence/SKILL.md`。
- 评估样例维护在：`docs/runbooks/skills/serein-sci-latex-math-convergence/evals/evals.json`。
- 下次只需替换复现文件、截图、参考 DOCX、Word/WPS 版本和 Windows 缩放比例，不要重新描述整套历史。
- 当前 skill 是可直接使用的项目本地流程，已补充 Word/WPS typography、OMML n-ary、无表格编号和 140% 验收；尚未跑 with-skill/baseline benchmark，因此称为“可用稳定草案”，不称为量化最优版本。

## 2026-07-24 Mermaid / 思维导图自适应渲染收敛

### 本轮稳定结果

- Serein Rich Edit 已能渲染 Mermaid 流程图、时序图和 mindmap；用户覆盖安装最终 Windows 包后反馈“可以了”，当前结果是稳定基线。
- 最终显示语义不是固定尺寸，也不是短图/长图分类，而是：内容需要多少空间就占多少；文字保持正常；编辑区宽度不足时才等比缩小；容器高度和后续正文位置由真实内容自然决定。
- Mermaid 11 在 Windows WebView2 中曾为普通流程图生成约 `2063 × 2064` 的异常 viewBox，而 SVG 实际内容约 `836 × 120`。共享渲染层根据 `getBBox()` 只修复明显过大的坐标系，最终约为 `852 × 136`。
- mindmap 的第二个独立根因不是 viewBox，而是默认 `cose-bilkent` 力导布局将 10 个节点扩散到约 `2335 × 2387`。显式使用 Mermaid 已注册的 `dagre` 后收敛到约 `697 × 204`。
- Mermaid SVG 字符串归一化使用同步布局测量，不等待 `requestAnimationFrame`，避免应用隐藏或最小化时 HTML/PDF 导出一直挂起。
- Windows 安装包 `Serein_1.0.4_x64-setup.exe` 于 2026-07-24 10:17 生成；SHA-256 为 `4ee157173e488e72042950fdb1958605f94c93a5decc7f59e53fb0bc49372206`。用户已安装并确认效果。

### 用户偏好（本轮反复调整后的稳定结论）

- 用户说“你要多少内容就给多少内容，并且显示正常”时，核心不是简单 `width: 100%`，而是图的可见墨迹、坐标系、容器尺寸和后续正文位置共同贴合内容。
- 用户明确反对按“短图/长图”写分支，也反对固定 `600px`、固定最小高度、巨大边框或预留画布。自适应必须来自真实内容尺寸，不是更多 magic number。
- 用户对“小小字体＋长长页面”“图显示不全”“空间占用没变”非常敏感。只要视觉结果仍相同，就不能用“代码已经改了”作为完成结论。
- 用户希望先看 Typora、Obsidian、GitHub/Markdown 和开源实现的真实行为，再决定产品模型；不接受脱离行业实现的凭空设计。
- 用户允许 AI 直接反驳，但要求证据、可复现指标和方案利弊。反驳用户截图或体感之前，必须先证明运行版本、坐标和安装包一致。
- 用户不满意为了让测试通过而刻意写“合规样本”。测试文件应包含中文、长标签、大小写语言名、错误语法、未闭合 fence 等真实脏输入。
- 用户要求修 Mermaid 时不能破坏保存、Rich/Plain Edit、链接、代码块、表格、图片和 Vault。UI 功能必须以相邻写作路径不回归为前提。
- 用户把 Windows 安装版反馈视为最终真相。Linux 类型检查、Chromium、Vite HMR、debug WebView2 都只能作为前置证据。
- 用户宁愿听到“还没解决”也不接受过早宣布完成。最终结论必须等最新安装包、同一测试文件和真实截图/反馈闭环。
- 长任务结束时，用户希望 HANDOFF、PROJECT_MEMORY 和 skill 一起沉淀，下次不重新解释几十轮失败历史。

### 从错误里学到的最佳实践

1. 先把 Mermaid 视觉问题拆成五层：Markdown fence/语言识别、Mermaid 语法与渲染、SVG 内容边界与 viewBox、布局算法、CSS 容器与 release 交付链。不要把所有现象都当成 CSS。
2. 诊断 SVG 时同时记录：`viewBox`、`getBBox()`、`getBoundingClientRect()`、figure/diagram 尺寸、实际节点文字尺寸和图后正文间距。只看 `width/height` 属性容易误判。
3. 如果 viewBox 远大于 `getBBox()`，CSS 缩放只会把错误画布和内容一起缩小。应先修内部坐标系，再讨论响应式宽度。
4. viewBox 自动裁正必须有异常阈值，只处理宽高/面积比例明显过大的输出；正常 Mermaid viewBox 必须保持，避免裁掉箭头、marker、阴影和标签。
5. `getBBox()` 正常并不代表图就正常。mindmap 本轮 viewBox 与 bbox 一致，但节点坐标已经被布局算法扩散；第二步必须检查 node transform 和布局算法。
6. Mermaid 图类型可以有不同的正确布局算法，但不能按最终像素高度猜“长图/短图”。本轮 mindmap 使用 `dagre` 是语义布局选择，不是尺寸补丁。
7. 隐藏 DOM 测量可以同步触发布局。不要无条件等待 `requestAnimationFrame`，因为桌面应用最小化/隐藏时 rAF 可能暂停，导出 Promise 会挂住。
8. UI HMR 成功和安装版成功是两个不同闭环。本轮真实修复源码时间为 09:54，而用户先安装的是 09:10 的包；必须比较源码、dist、release、installer 和 installed exe 的时间与哈希。
9. 不要让旧正式进程、debug 进程、Vite server 和新 release 混在一起。识别每个 PID/可执行路径，只关闭自己启动的临时调试实例，保护用户正式进程和未保存文档。
10. 回归样本必须同时覆盖：普通流程图、长中文/英文节点、时序图、mindmap、大小写 `MERMAID`、非法图类型、未闭合 fence、普通链接和表格。
11. 错误语法的验收目标是“用户看得懂并能回源码修”，不是强制内部一定生成某一种错误 DOM。测试用户可见结果，不要硬编码错误容器数量。
12. 只有最新 Windows 安装包在同一测试文件上得到用户确认，才能把视觉问题标记为完成。静态检查、自动化指标和 debug 截图不能替代这一条。

### 项目关键约束和坑

- Mermaid 主共享实现位于 `apps/serein-desktop/src/shared/mermaid.ts`。Rich Edit、HTML、PDF 应复用同一 SVG 语义，不能各自创建渲染器和尺寸规则。
- Rich Edit Mermaid widget 位于 `apps/serein-desktop/src/components/MarkdownTextBufferEditor.tsx`。它只是原子视觉替换；Markdown fence 源码仍是保存、history、selection、Source/Rich roundtrip 的唯一真相。
- 当前 Mermaid 容器不得恢复固定 height/min-height（loading/error 状态除外）、固定 600px、按短图/长图分类或大边框卡片。
- 宽图当前按 `min(naturalWidth, availableEditorWidth)` 显示，空间不足时等比缩小；SVG 高度由 viewBox 宽高比自然产生。
- mindmap 当前显式 `layout: "dagre"` 是安装版验收过的稳定取舍。若以后要自由放射布局，必须单独设计并用 Windows WebView2 证明，不要直接恢复本次失败的默认 `cose-bilkent`。
- `securityLevel: "strict"`、渲染串行队列和可见错误回退属于安全/稳定边界；不要为了示例图交互随意放宽。
- HTML/PDF 已接入 Mermaid SVG，但本轮用户最终验收针对 Windows 编辑器。导出视觉仍需分别记录；DOCX Mermaid 不在本轮完成范围。
- `tests/fixtures/rich-edit/mermaid_messy_test.md` 是本轮真实脏输入回归样本。不要把它清洗成只包含合法、短标签、理想格式的教程文件。
- Windows installer 是最终交付层。`scripts/build_windows.ps1 -SkipInstall` 会重建前端、release exe 和 NSIS；构建时间必须晚于源码修复。
- 根目录 `Serein_1.0.4_x64-setup.exe` 是未跟踪交付物，不默认进入源码 commit。
- 当前工作区包含 Mermaid 和其他历史 WIP；禁止 `git add .`、reset、restore、checkout。若提交必须逐文件检查。
- 最新 Mermaid 工作仍未 commit/tag/push；GitHub 当前不可见，不能把“安装包已生成”说成“版本已发布”。

### 下次一次性达到这次效果

- 主流程：`docs/runbooks/skills/serein-mermaid-rendering-convergence/SKILL.md`。
- 完整可复制提示词：`docs/runbooks/skills/serein-mermaid-rendering-convergence/references/one-shot-prompt.md`。
- 回归提示草案：`docs/runbooks/skills/serein-mermaid-rendering-convergence/evals/evals.json`。
- 下次只需提供新的截图、复现 Markdown、当前安装包时间和期望对标软件；不要重新尝试固定尺寸、CSS 盲调或只验证 HMR。
- 当前 skill 是“用户安装版验收过的可用稳定草案”；尚未运行 with-skill/baseline benchmark，不称为量化最优版本。
