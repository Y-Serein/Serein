# HANDOFF.md

最后更新：2026-07-01 13:55
当前分支：main，本地领先 origin/main；本轮准备提交 Rich Edit Markdown 链接修复
当前任务：修复 Rich Edit 实时预览/源码展开中 Markdown 链接、autolink 和转义字符状态机不稳定的问题，并沉淀 memory/skill

## 当前在做什么

正式 app 目录是：

```text
D_deliverables/serein-desktop/
```

本轮用户反馈 Rich Edit 链接机制仍不完善，具体例子：

```markdown
## 3. [eez\_studio示例（RT-Thread） - SiFli SDK编程指南 文档](https://docs.sifli.com/projects/sdk/latest/sf32lb55x/example/multimedia/lvgl/lvgl_tools_example/eez_studio/README.html)

* <https://www.cnblogs.com/tianwuyvlianshui/p/18698331>
```

目标行为：

- 默认 Rich Edit 预览态显示链接文本，例如 `eez_studio示例...`，不要显示原始 `[text](url)` 或多余反斜杠。
- 普通 Markdown 链接点击后可稳定展开为源码，方便用户选择/复制/编辑链接。
- autolink `<https://...>` 作为独立 Markdown 源码形态处理，点击展开保持 `<url>`，离开后收回成可点击链接。
- 选区还在展开链接内时保持展开；光标/焦点离开后再收回。
- `Ctrl/Cmd + 左键` 才执行打开链接；普通点击用于编辑/展开。

本轮已修改：

- `D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx`
  - 用扫描式 Markdown link parser 替代脆弱正则，支持目标 URL/文本中出现括号。
  - 普通链接 label 内的 Markdown 转义会归一化，如 `eez\_studio` -> `eez_studio`。
  - link 展开态支持 autolink `<https://...>`，并补齐 autolink range 追踪，避免按下显示、松开消失、再次按下不展开。
  - 移除导致普通点击刚展开又被 `pointerup/click/selectionchange` 收回的刷新路径。
- `D_deliverables/serein-desktop/src/shared/markdown.ts`
  - 新增 `normalizeRichMarkdownEscapes`，用于 Rich Edit 序列化后把 `\[...\]\(...)`、`https\:`、`\_`、`\.<...>` 等恢复成合法 Markdown。
  - 跳过 fenced code block，避免破坏代码块内容。
- `D_deliverables/serein-desktop/src/App.tsx`
  - Rich 模式的 markdown change/baseline 走 `normalizeRichMarkdownEscapes`；Plain 模式仍保持原 wiki link 归一化路径。
- `D_deliverables/serein-desktop/tests/vault.test.mjs`
  - 增加 `NUT(7)`、Improv Wi-Fi 嵌套坏链接、`eez\_studio`、`<https://cnblogs...>` 回归用例。
- `C_context/PROJECT_MEMORY.md`
  - 追加本轮用户偏好、错误经验、项目约束和下次提示词。
- `C_context/KNOWN_FAILURES.md`
  - 追加 Rich Edit Markdown 链接状态机失败路径，防止下次重新用简单 regex 或 `pointerup` 刷新。
- `C_context/skills/serein-rich-edit-markdown-links/SKILL.md`
  - 新增本项目 Rich Edit Markdown 链接专项 skill。

当前工作区有未跟踪安装包：

```text
Serein_1.0.4_x64-setup.exe
```

不要默认加入提交，除非用户明确要求提交安装包。

## 已经试过的方案和结果（含失败的）

- 已读：`AGENTS.md`、`HANDOFF.md`、`C_context/KNOWN_FAILURES.md`、`C_context/PROJECT_MEMORY.md`。
- 已运行 preflight：

```bash
python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora
```

结果：脚本能执行，但内置路径仍指向旧 `/home/rv_nano/Sipeed/...`，报告旧路径缺失；当前真实仓库路径是 `/home/slam/Project/Serein`，正式 app 是 `D_deliverables/serein-desktop/`。

- 第一轮只修 `[NUT(7)](...)` 和反斜杠污染不够完整；用户复测仍失败。
- 失败原因不是单点 regex 漏 `)`，而是两类问题叠加：
  - Markdown link parser 用简单 `[^)]`/regex，遇到括号、嵌套坏链接、转义文本会截断或保留反斜杠。
  - 展开/收回状态机在 `pointerdown` 展开后，又被 `pointerup/click/selectionchange` 下一帧收回，导致“按下显示、松开消失、再次按下不稳定”。
- 第二轮根据用户给出的真实例子补齐：
  - 普通链接 label 转义归一化。
  - Rich 序列化层普通链接、逃逸链接、逃逸 autolink 归一化。
  - autolink `<url>` 展开/收回和 range 追踪。

## 下一步计划（3-5条actionable)

1. 用户在 Windows release 或当前 dev UI 中用这两行真实文本复测 Rich Edit：默认预览、普通点击展开、拖动选择复制、光标离开收回、`Ctrl/Cmd+点击` 打开。
2. 如果仍有问题，先截图/录屏确认失败发生在：解析显示、点击展开、选区保持、收回转换、保存序列化，不能再泛化成“链接不行”。
3. 如需继续自动化验证，安装/启用 Playwright Python 环境后跑真实点击脚本；本轮因缺 `playwright` Python 包未能完成 GUI 自动点击验证。
4. 提交前只 stage 本轮相关源码、测试和沉淀文件；不要 stage `Serein_1.0.4_x64-setup.exe`。
5. 后续若做 release，仍需要 Windows PowerShell 打包和 `.exe` GUI 手测；Linux/WSL 的 build 不能替代 Windows WebView 体验。

## 关键文件路径（相对路径，一行一个）

D_deliverables/serein-desktop/src/App.tsx
D_deliverables/serein-desktop/src/components/MilkdownEditor.tsx
D_deliverables/serein-desktop/src/shared/markdown.ts
D_deliverables/serein-desktop/tests/vault.test.mjs
C_context/PROJECT_MEMORY.md
C_context/KNOWN_FAILURES.md
C_context/skills/serein-rich-edit-markdown-links/SKILL.md

## 当前验证状态

- 已运行：`python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora`
- 结果：可执行；报告旧 `/home/rv_nano/...` 路径缺失，不能作为当前仓库路径判断依据。
- 已运行：`npm run test`
- 结果：通过，含新增 Rich Edit Markdown link/autolink 回归用例。
- 已运行：`npm run typecheck`
- 结果：通过。
- 已运行：`npm run build`
- 结果：通过，Vite production build 完成。
- 已运行：`git -c safe.directory=/home/slam/Project/Serein diff --check`
- 结果：通过。
- 尝试运行：`python3 /home/slam/.codex/skills/webapp-testing/scripts/with_server.py ... Playwright ...`
- 结果：Vite 临时服务能启动并被 helper 停掉；GUI 自动化失败原因是当前环境缺 Python 包 `playwright`。
- 未验证：Windows release `.exe` GUI 手测；真实鼠标拖动选择复制链接。

## 还没搞清楚的问题

- 真实 Windows WebView 下，普通点击展开后拖动选择复制链接是否完全符合用户手感，还需要用户或 Playwright GUI 复测。
- Milkdown serializer 未来可能继续对其他 Markdown 标点做逃逸；当前只针对链接、wiki link、autolink 和代码块保护做了最小归一化，不应扩大成全局反斜杠清洗。
- 当前 AGENTS.md 仍有 `ys-writer-desktop` 旧路径残留；真实工作目录已是 `D_deliverables/serein-desktop/`，后续如要整理规则可单独处理，不要混进功能 bug fix。
