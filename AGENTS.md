# AGENTS.md — help-you-read 协作者上下文契约

> 本文件是 AI 协作者（OpenCode / Claude Code 等）进入本仓库的**第一读物**。
> 读完应能理解：项目是什么、技术栈、架构边界、关键约定。深度细节见 `docs/` 规格文档（§11）。
> 全局规则继承自 `~/.config/opencode/AGENTS.md`；此处只补充**项目特定**约定，并重申关键不变量（MUST / NEVER）。

## 1. 项目定位
AI 辅助电子书阅读器（桌面优先，Tauri）：导入 EPUB → 三栏阅读（原文 / 批注 / AI对话）→ AI 全流程辅助（读前导览 · 读中注入 · 读后总结）→ 按 9 种读书方法沉淀笔记 → SuperMemo 间隔复习。
**核心立场（MUST）**：local-first（数据默认本地）+ AI 全流程 + YAGNI。

## 2. 技术栈（已锁定，勿擅改）
- 语言：TypeScript（strict，全栈）
- UI：React 18 + Vite；桌面壳 Tauri 2
- 数据：SQLite（双库）；向量检索 sqlite-vec / sqlite-vss
- EPUB 引擎：**vendor foliate-js（from main）+ own patch layer**（不走 npm@1.0.1，理由见 §4-D1）
- 工作区：pnpm workspace（monorepo）
- 测试：vitest（单测）+ Playwright（e2e）

## 3. Monorepo 结构 + 边界
```
packages/
  engine   # @hyr/engine —— vendored foliate-js（引擎核心，原样）+ patch + Engine.ts 门面
  core     # @hyr/core —— 共享核心（db / ai / skill / tts），零 UI 依赖
  app      # @hyr/app —— React UI（Tauri 桌面）
  (v2+)    # sync（WebDAV）/ knowledge（跨书图谱）
```
**边界规则（MUST）**：
- `core` 零 UI 依赖（可被桌面 / 移动 / Web 复用）
- `engine` 只暴露门面 `Engine.ts`，patch 细节不外泄
- repositories 每实体一文件（单一职责）

## 4. 关键设计决策（已锁定；细节见 docs/技术方案.md）
- **D1 引擎**：foliate-js vendor-from-main + patch（npm@1.0.1 冻结，缺 transformSource / textWalker）
- **D2 AI**：AIProvider 抽象（本地默认 / 外部可选）+ Hybrid FTS5 + 向量 RRF 检索
- **D3 数据模型**：多态 `method_artifact`（8 法）+ 独立 `review_items`（SuperMemo / SM-2）
- **D4 同步**：WebDAV 双库 + tombstone + monotonic version（可选，默认关）
- **D5 技能系统**：kind = prompt / agent / script + Capability Catalog + access 分级（none / read / write / full）

## 5. 数据模型（v1：双库，main 9 表 + local 2 表）
- **main.db（可同步）**：9 数据表 = books / annotations[含 context] / notes / threads / messages / skills / reading_sessions / method_artifact / review_items；+ `schema_migrations`（迁移追踪）
- **local.db（不同步）**：2 表 = chunks[FTS5 + 向量] / vector_index_provenance
- **MUST**：同步只走 main.db；向量 / FTS 永不上传（隐私 + 体积）

## 6. v1 范围（最小闭环）
- **IN**：#1 RIA 便签 + #6 SuperMemo 间隔复习 + 支撑（书库 / 三栏阅读 / AI对话+RAG / TTS本地 / 技能系统）
- **OUT（→ v2+）**：其余 7 读书方法、跨书知识图谱、WebDAV 同步增强、FSRS、PDF / MOBI / DOCX
- **MUST**：v1 完成 Phase6 验收前，不启动 v2+（YAGNI）

## 7. 编码约定（MUST）
- TypeScript strict：禁 `any` / `as any` / `@ts-ignore` / `@ts-expect-error`
- parse-don't-validate：外部数据用 schema 校验（推荐 zod）解析成 branded type，不逐字段手写校验
- typed errors：自定义错误类型（带 code），不吞异常、不留空 catch
- 函数短小；单文件 ~250 LOC 上限，超了拆模块

## 8. 测试约定（TDD）
- **MUST**：先写失败测试，再实现（superpowers TDD 纪律）
- vitest 单测 + Playwright e2e
- EPUB 回归语料：`books/*.epub`（**不入库**；合成 fixture 由 `node scripts/make-fixture.mjs` 重建，输出到 `books/` 与 `packages/engine/public/books/`）+ 合成 EPUB fixture（fixed-layout / nav-hidden / reflow）
- 完成定义：lsp_diagnostics 干净 + build / test 通过

## 9. Git 规则（继承全局，重申）
- **NEVER**：未获用户明确同意就 commit / push / merge / 建 PR
- `git add` 可自由用；commit / push 必须先征得同意

## 10. 文档同步规则（继承全局，项目化）
- 任何代码 / 配置 / 技能改动 → **同步**对应方案文档（`.omo/plans|drafts/` 或 `docs/`）
- 方案文档路径：交付 → `help-you-read/docs/`；过程 → `.omo/plans|drafts/`
- 保持真实：文件结构、命令输出必须与实际一致，不写未发生的变更

## 11. 详细规格文档（指针）
- `docs/需求文档.md`：要什么（9 方法 → 读前 / 中 / 后 / 复习，v1 范围）
- `docs/技术方案.md`：怎么搭（架构 / 模块 / 接口 / schema DDL / 分阶段路线）
- `docs/读书工具研究报告.md`：为什么（四项目调研综合 + 竞品分析）
- `docs/持久数据模型对比.md`：四项目数据模型对比 + v1 schema 依据
- `.omo/ulw-research/<run>/PLAN.md`：研究过程工作日志（EXPAND loop 记录）

## 12. 语言规则（继承全局，重申）
- 代码注释 / UI 文本 / 文档：简体中文
- 技术术语：英文原词 + 首次中文解释
- 代码标识符（变量 / 函数 / API）：保持英文

---
**速查**：改引擎 → §3 / §4(D1)；改数据 → §5；加功能 → 先确认在 v1 范围(§6)再 TDD(§8)；任何改动 → 同步文档(§10) + git 须确认(§9)。
