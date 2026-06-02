# HANDOFF.md

最后更新：2026-06-02 10:32
当前分支：serein-vault
当前任务：项目已重命名为 Serein，准备提交并推送到新仓库

## 当前在做什么

本轮目标是把当前仓库面向用户和发布的项目命名收敛为 Serein，并把完整 Git 历史推送到 `https://github.com/Y-Serein/Serein`。

已完成的主要改动：

- 正式桌面应用目录已调整为 `D_deliverables/serein-desktop/`。
- 旧 HTML 原型目录已调整为 `D_deliverables/serein-prototype/`。
- 构建脚本、README、用户手册、release skill、project memory 的路径和产品定位已同步到 Serein。
- 源码里的开发演示入口改为 `demoVault=serein`，内部 workspace 类型改为 Serein 命名。
- 删除未使用的旧竞品配置响应字段，避免 API 继续暴露旧品牌词。
- 示例 Vault 中旧参考笔记已改为 `Serein Writing Flow` 和 `Serein Vault Model`，相关 wiki 链接和标签已同步。

## 已经试过的方案和结果（含失败的）

- 已运行项目 preflight；脚本可执行，但内部仍硬编码 `/home/rv_nano/Sipeed`，路径检查不可直接采信。
- `git mv` 因沙箱不能写 `.git/index.lock` 失败；改用普通 `mv` 移动文件，后续由 `git add -A` 识别重命名。
- 整目录移动正式应用时被忽略的构建缓存阻塞；已只移动 Git 跟踪文件，并把 `node_modules/dist/.test-dist/test-results` 迁到新目录用于本地验证。
- 旧路径下的 Rust `target/` 缓存未移动成功，但它是忽略的生成物，不会进入提交。
- 仓库里有一个既有未跟踪文件 `D_deliverables/serein-complex-vault/References/mission.md`，本轮未纳入提交。

## 下一步计划（3-5条actionable)

1. 执行 `git add -A`，确认暂存区只包含本次重命名和命名清理。
2. 提交 commit，建议信息：`Rename project to Serein`。
3. 将 `origin` 从旧仓库地址切换到 `https://github.com/Y-Serein/Serein.git`。
4. 推送当前 `serein-vault` 分支到新仓库，并保留完整历史。
5. 如需要默认分支为 `main`，推送后再按用户要求处理分支命名或 GitHub 默认分支设置。

## 关键文件路径（相对路径，一行一个）

D_deliverables/serein-desktop/
D_deliverables/serein-prototype/
D_deliverables/serein-complex-vault/
T_tools/build_windows.ps1
README.md
C_context/PROJECT_MEMORY.md
C_context/skills/serein-release-control/SKILL.md
HANDOFF.md

## 当前验证状态

- 已运行：`npm run test`
- 结果：通过。
- 已运行：`npm run build`
- 结果：通过。
- 已运行：`CARGO_TARGET_DIR=/tmp/serein-tauri-target /home/slam/.cargo/bin/cargo check`
- 结果：通过。
- 已运行：应用/脚本/README/示例 Vault/tracked memory 的旧品牌词扫描。
- 结果：可提交范围未发现旧品牌词命中。

## 还没搞清楚的问题

- 尚未推送到新远程；推送需要网络和 GitHub 权限。
- 本地被忽略的历史草稿、日志、AGENTS 本地规则里仍可能包含旧项目资料；这些不会进入新仓库提交。
- 本地 checkout 根目录名仍是历史名称，这是工作区文件夹名，不属于 Git 提交内容。
