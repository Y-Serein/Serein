# Serein Project Memory

最后更新：2026-05-29 15:11

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
