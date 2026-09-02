# AGENTS.md

## 项目性质

**`help-you-read` 是文档型/知识管理项目，无任何源代码**。不存在构建、测试、lint、typecheck 命令，不要尝试运行代码工具、查找入口文件或安装依赖。

## 目录与约定

| 路径 | 说明 |
|------|------|
| `docs/` | 项目文档（如 `读书方法总结.md`）。**新文档保存到此处**，不使用全局默认 `${HERMES_DIR}/docs`（用户明确指定过项目根目录） |
| `.omo/plans/help-you-read.md` | 项目方案文档。任何文件改动后需在该文档追加「变更记录」章节 |
| `.omo/run-continuation/` | opencode 会话延续机制状态文件（JSON），勿手动修改 |
| `.codegraph/` | 本地 CodeGraph 索引（软链接到 `~/.omo/codegraph/projects/help-you-read-b5cbd8d629faa84c`），不入 git，勿修改 |

## 已知遗留（不要"修复"）

- `.codegraph/source.json` 的 `sourceDir` 仍指向旧路径 `your-intell-radar`——这是 2026-09-01 项目重命名的历史遗留，daemon 已按新路径正常工作，属正常现象
- 项目当前**不是 git 仓库**（`git status` 等操作会失败，属预期）

## 历史背景

项目于 2026-09-01 由 `your-intell-radar` 重命名为 `help-you-read`（索引目录、daemon 均已迁移），完整决策记录见 `.omo/plans/help-you-read.md`。

## 语言

文档与交流使用简体中文（项目内所有文件均为中文）。