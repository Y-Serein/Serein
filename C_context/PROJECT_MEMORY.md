# Serein Typora Project Memory

最后更新：2026-05-26 10:15

## 用户偏好

- 默认中文沟通，表达直接、具体、以结果为导向。
- 用户接受反驳，但反驳必须给出原因、替代方案、利弊和下一步动作。
- 用户喜欢“工程控制论”闭环：目标 → 状态 → 误差 → 控制动作 → 反馈 → 修正 → 验证 → 沉淀。
- 用户反复强调：主矛盾优先，不要被零散小 bug 拖偏；但高频路径的小 bug 如果影响真实体验，也要一起修。
- 用户更喜欢简洁风格，UI 不要堆太多重复入口。搜索入口过多就是用户明确反感的例子。
- 用户对数据安全极敏感，不能接受真实文档数据或链接被破坏。
- 用户愿意做 Windows release 实测，也愿意提供干净 Windows 机器。
- 用户偏好：Typora 写作体验优先级第一，Obsidian/Vault 功能第二优先但仍重要。
- 用户要的是内测可用，不是为了“看起来完成”而隐藏风险。

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

## 项目关键约束

- 正式交付物在 `D_deliverables/ys-writer-desktop/`。
- 旧原型 `D_deliverables/ys_typora_app/` 默认不要修改。
- 技术栈：Tauri 2 + Rust + React 18 + TypeScript + Vite + Milkdown。
- Windows `.exe` 推荐打包入口：

```powershell
.\T_tools\build_windows.ps1
```

- `-SkipInstall` 是快速路径，不是不可以；发给别人前更推荐不加 `-SkipInstall`。
- 当前测试命令：

```bash
cd D_deliverables/ys-writer-desktop
npm run test
npm run typecheck
npm run build
cd src-tauri
env CARGO_TARGET_DIR=/tmp/ys-writer-tauri-target /home/slam/.cargo/bin/cargo check
```

- 常见 warning：
  - `MilkdownEditor` chunk 超过 500 kB。
  - `git diff --check` 可能提示未改动 `LICENSE` CRLF。
- 复杂内测 Vault：

```text
D_deliverables/serein-complex-vault/
```

## 项目关键坑

- 大目录不能递归扫描；Vault 文件树必须懒加载，并避开 `.git/node_modules/target/dist/build/images/logs/tmp` 等重目录。
- 工作区索引、图谱、未链接提及对大 Vault 有潜在性能风险，需要真实压力测试。
- Rich Edit 与 Plain Edit 都是主路径，不能只修一个。
- 标准 Markdown link 和 wiki link 的点击/编辑模型不同：Markdown link 普通点击用于编辑，wiki 内链用户期望单击跳转。
- `[[A#标题|显示文字]]` 要保留 alias 和 heading；`# test|显示文字` 这种用户写法要能跳到 `test`。
- 重命名链接同步当前是确认式批量更新，不是完整 diff 预览；正式发布前最好补预览/回滚。
- 未签名 Windows 包会触发 SmartScreen，内测可以接受，正式发布不能忽略。
- 版本号仍是 `0.0.1`；频繁内测发包时要提醒测试者卸载旧版或确认安装的是新包。

## 下次一次性达到类似效果的提示词

```text
你是这个项目的发布审核者和工程控制论式接手者。请先阅读 AGENTS.md、HANDOFF.md、C_context/PROJECT_MEMORY.md、C_context/KNOWN_FAILURES.md（如存在），运行项目 preflight。目标是判断 Serein/Typora 是否能发内测，不要急着改代码。

我的优先级是：Typora 写作体验第一，Obsidian/Vault 第二；数据安全不能妥协；UI 简洁，不要重复入口；必须以 Windows release .exe 体验为准。

请按“目标→状态→误差→控制动作→反馈→修正→验证→沉淀”闭环推进：
1. 先给发布状态和风险清单。
2. 如果发现阻断内测的问题，做最小可回滚修复。
3. 每个修复必须说明验证命令或无法验证原因。
4. 对 Vault/链接/保存/导出/窗口控制要优先保护真实用户数据。
5. 不要修改旧原型 ys_typora_app。
6. 完成后更新 HANDOFF 和项目 memory，并给我可执行的 Windows 手测清单。
```

## 当前发布判定

- 当前可以发内测。
- 不建议正式公开发布。
- 内测用户应先用复制出来的 Vault 测试，不要直接打开唯一的重要文档。
- 等内测反馈后，按 bug 严重度和高频路径优先修补。
