# HANDOFF.md

最后更新：2026-07-02 10:59
当前分支：main，HEAD `45979ad`
当前任务：将 Serein 从旧 CDTR/D_deliverables 布局迁到常见项目结构；应用源码逻辑未做产品行为修改

## 当前在做什么

本轮目录结构已经迁到新布局：

- 正式应用：`apps/serein-desktop/`
- Windows 打包脚本：`scripts/build_windows.ps1`
- 复杂 Vault 示例：`examples/complex-vault/`
- 旧 HTML 原型：`examples/serein-prototype/`
- 历史旧应用目录：`archive/ys-writer-desktop/`
- 正式文档：`docs/`
- runbook / 项目记忆 / 已知失败：`docs/runbooks/`
- Rich Edit 回归样本：`tests/fixtures/rich-edit/`
- 临时输出和旧安装包：`out/`

已同步主动文档中的当前路径，包括 `README.md`、`AGENTS.md`、用户指南、回归清单、部分设计文档和 `PROJECT_MEMORY.md`。

## 已经试过的方案和结果（含失败的）

- 已运行 preflight：

```bash
python3 /home/slam/Sipeed/T_tools/agent_preflight.py --project typora
```

结果：脚本可执行，但脚本内部仍指向旧 `/home/rv_nano/Sipeed/...`，会报告目标路径缺失；这不是当前仓库不存在。

- 已把测试 fixture 的真实读取路径从旧 `C_context/test/new.md` 改为 `tests/fixtures/rich-edit/new.md`。
- 已把 JS/Rust 测试中的样例相对路径从旧 `C_context/test/new.md` 改成 `tests/fixtures/rich-edit/new.md`，只改测试用例和断言，没有改索引源码逻辑。
- 尝试把残留 `D_deliverables/serein-desktop/src-tauri/target` 移到 `out/legacy-build-cache/`，沙箱内和非沙箱 `mv` 都失败：`Permission denied`。
- `stat -f` 显示该目录位于 `v9fs`，里面是旧 Windows/Tauri 构建缓存和 `.exe/.dll/.pdb` 文件，约 4.5G；很可能受 Windows/WSL 挂载或文件锁影响。

## 下一步计划（3-5条actionable)

1. 如需让 Git 识别为 rename/move，先 review 当前大规模删除/新增，再用 `git add -A` 暂存后检查 rename 识别结果。
2. 手动清理或解锁旧 `D_deliverables/serein-desktop/src-tauri/target` 后，再删除空的 `D_deliverables/` 目录。
3. 如果要发布新版本，先在 Windows PowerShell 运行 `.\scripts\build_windows.ps1 -SkipInstall` 生成新安装包。
4. 提交前再次运行 `npm run test`、`npm run typecheck`、Rust 测试或 `cargo check`，并确认不把 `out/`、旧 target、安装包误加入提交。
5. 如需让 GitHub 显示版本，创建 tag 后 push 分支和 tag；本轮没有 commit、tag 或 push。

## 关键文件路径（相对路径，一行一个）

AGENTS.md
README.md
apps/serein-desktop/
apps/serein-desktop/tests/vault.test.mjs
apps/serein-desktop/src-tauri/src/vault.rs
scripts/build_windows.ps1
docs/runbooks/KNOWN_FAILURES.md
docs/runbooks/PROJECT_MEMORY.md
docs/runbooks/editor_regression_checklist.md
tests/fixtures/rich-edit/
examples/complex-vault/
examples/serein-prototype/
archive/ys-writer-desktop/
out/

## 当前验证状态

- 已运行：`npm run test`
- 结果：通过，2 个 Node test 文件通过。
- 已运行：`npm run typecheck`
- 结果：通过。
- 已运行：`env CARGO_TARGET_DIR=/tmp/serein-tauri-target /home/slam/.cargo/bin/cargo test`
- 结果：通过，Rust 10 个单元测试通过。
- 已运行：`git -c safe.directory=/home/slam/Project/Serein diff --check`
- 结果：通过；仅提示 `.gitignore` 下次 Git touch 时 CRLF 会转 LF。
- 未验证：Windows release `.exe` 打包和 GUI 手测。

## 还没搞清楚的问题

- `D_deliverables/serein-desktop/src-tauri/target` 仍因 v9fs/权限或锁定问题无法移动；它不是当前源码入口，但会让顶层仍看到旧目录。
- `docs/release/release_audit_2026-05-21.md` 和 `docs/reference/QA_Log.md` 仍保留历史旧路径，这是历史记录，不建议为“清爽”改写。
- `tests/fixtures/rich-edit/Project_03_vibe-keyboard.txt` 内部文字包含外部项目的旧 `C_context` 路径，它是用户原始样本内容，不应为了路径扫描而篡改。
