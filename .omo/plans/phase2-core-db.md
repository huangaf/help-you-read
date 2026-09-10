# phase2-core-db — Work Plan

## TL;DR

**What:** 构建 `@hyr/core/db` — SQLite 双库（main.db + local.db）数据层：schema DDL → dual DB init → migrations → 9 repositories（每实体一文件）。
**Why:** Phase1 engine 已交付 EPUB 渲染能力，Phase2 提供持久化层——所有上层功能（RIA、SuperMemo、AI对话）的数据存取都依赖此模块。
**NOT do:** 不实现 ai/（Phase3）、skill/（Phase4）、tts/（Phase5）；不做 WebDAV 同步（v2+）；不暴露 local.db 给同步层。
**Effort:** Medium（9 repositories 模式统一，可并行）
**Risk:** Low — DDL 已在技术方案锁定，repository 模式简单（CRUD + entity-specific）

## Scope

### Must have
- `better-sqlite3` 作为 SQLite driver（同步 API，Tauri Node.js backend）
- `db/schema.ts` — 11 表 DDL（9 main + 2 local）+ Entity TypeScript types
- `db/index.ts` — Database 类（双库管理：main.db + local.db，WAL mode, foreign_keys ON）
- `db/migrations.ts` — MigrationRunner（schema_migrations 表 + 幂等 apply）
- `db/repositories/` — 9 个 repository（每实体一文件，CRUD + entity-specific methods）
- `db/types.ts` — Entity 接口定义（Book, Annotation, Note, Thread, Message, Skill, ReadingSession, MethodArtifact, ReviewItem）
- Barrel export：`core/src/index.ts` 导出 db 模块公共 API

### Must NOT have
- 不实现 ai/skill/tts（Phase3-5）
- local.db repository 逻辑留 Phase3（仅建 schema，不暴露 CRUD）
- 不做 WebDAV/同步增强（v2+）
- 不引入 `any` / `as any` / `@ts-ignore`（AGENTS.md §7）
- 不删除/跳过失败测试

## Verification strategy
- TDD：每模块先写 RED 测试再实现 GREEN
- 单测用 in-memory SQLite（`:memory:`）避免文件 I/O，加速测试
- 双库隔离验证：local.db 不暴露给同步层（无 sync 相关 API）
- typecheck：`tsc --noEmit` 全程零错

## Execution waves
- **Wave 0（基建）**: T0 — better-sqlite3 dep + vitest config
- **Wave 1（schema + init）**: T1 (schema DDL + types), T2 (Database class) — 可并行
- **Wave 2（migrations + repositories）**: T3 (MigrationRunner), T4-T12 (9 repositories) — T3 先，repos 可并行
- **Wave 3（barrel + verification）**: T13 (index.ts barrel), F1-F3

## Task breakdown

### T0: Infrastructure
- 添加 `better-sqlite3` + `@types/better-sqlite3` 到 core package.json dependencies/devDependencies
- 添加 vitest 到 devDependencies（如未有）
- 创建 `vitest.config.ts`（jsdom 不需要，node env）

### T1: Schema DDL + Entity Types
- `db/types.ts` — 9 main entity interfaces + 2 local entity interfaces（从 DDL 字段推导）
- `db/schema.ts` — 11 CREATE TABLE statements（从技术方案 §4 DDL 直接转写）+ schema_migrations 表

### T2: Database class（双库管理）
- `db/index.ts` — `Database` 类：
  - `open(options: { mainDbPath, localDbPath })` — 打开双库，设 WAL + foreign_keys
  - `mainDb: Database.Database` / `localDb: Database.Database`（better-sqlite3 实例）
  - `close()` — 关闭双库
  - `migrate()` — 调用 MigrationRunner 确保 schema 最新

### T3: Migration system
- `db/migrations.ts` — `MigrationRunner`:
  - `run(db, migrations: Migration[])` — 幂等 apply（检查 schema_migrations，仅执行未应用的）
  - v1 initial migration: 全部 11 表 CREATE TABLE IF NOT EXISTS

### T4-T12: Repositories（每实体一文件）
- `db/repositories/books.ts` — BooksRepository: create/get/update/delete + getByTitle/findByTags
- `db/repositories/annotations.ts` — AnnotationsRepository: create/get/update/delete + findByBookId
- `db/repositories/notes.ts` — NotesRepository: create/get/update/delete + findByBookId
- `db/repositories/threads.ts` — ThreadsRepository: create/get/update/delete + findByBookId
- `db/repositories/messages.ts` — MessagesRepository: create/get/update/delete + findByThreadId
- `db/repositories/skills.ts` — SkillsRepository: create/get/update/delete + getByName
- `db/repositories/reading_sessions.ts` — ReadingSessionsRepository: create/get/update/delete + activeForBook
- `db/repositories/method_artifact.ts` — MethodArtifactRepository: create/get/update/delete + findByBookAndMethod
- `db/repositories/review_items.ts` — ReviewItemsRepository: create/get/update/delete + dueForBook

### T13: Barrel export
- 更新 `core/src/index.ts` — export { Database, MigrationRunner, *Repository classes, entity types }

### F1-F3: Final verification
- F1: 全量 vitest 通过（所有 repository 单测）
- F2: tsc --noEmit 零错
- F3: 双库隔离验证（local.db 无 sync API 暴露）

## Commit strategy
- T0: `chore(core): add node:sqlite wrapper + vitest infrastructure`
- T1: `feat(core/db): schema DDL (11 tables) + entity types`
- T2: `feat(core/db): Database class (dual DB, WAL, foreign_keys)`
- T3: `feat(core/db): MigrationRunner (idempotent schema_migrations)`
- T4-T12: `feat(core/db): <entity>Repository` (×9)
- T13: `feat(core/db): barrel export + index.ts`

## 改动记录（2026-09-11）

### 关键决策变更
| 原计划 | 实际采用 | 原因 |
|--------|---------|------|
| better-sqlite3（外部 npm 包） | node:sqlite（Node.js 24 内置） | better-sqlite3 编译失败：Node 24 要求 C++20，系统 g++ (GCC 13.3) 默认 -std=c++17，无法生成 ABI 兼容的 .node 文件。node:sqlite 零编译、零外部依赖，API 等价（同步 .prepare/.run/.get） |
| Database.Database（better-sqlite3 类型） | SqliteDb（node:sqlite 实例类型别名） | node:sqlite 导出 DatabaseSync class；用 `typeof` 区分构造器/实例类型 |

### exactOptionalPropertyTypes 适配
tsconfig.base.json 启用 `exactOptionalPropertyTypes: true`，所有 entity interface 的可选属性需显式标注 `| undefined`（如 `readonly tags?: string[] | undefined`）。已通过 sed 批量修复 types.ts + schema.ts。

### node:sqlite boolean 不兼容
node:sqlite `.run()` 参数类型 `SQLInputValue` = `string | number | null | Uint8Array`，**不接受 boolean**。解决方案：repository update 方法中布尔字段（helpful/dismissed/enabled）统一转换为 0/1 整数再传入 `.run()`。values 数组类型收窄为 `(string | number | null)[]`。

### sqlite.ts 双导出模式
```ts
// 值导出：构造器（consumer 用 new DatabaseSync(path)）
export const DatabaseSync: typeof import('node:sqlite').DatabaseSync = ...;
// 类型别名：实例类型（consumer 用 import type { SqliteDb }）
export type SqliteDb = import('node:sqlite').DatabaseSync;
```
TypeScript 不允许同名 value + type export，故用不同名（DatabaseSync = 值，SqliteDb = 类型）。

### Vite 兼容性
Vite ESM bundler 无法处理 `node:` 前缀 import。解决方案：`createRequire(import.meta.url)` 在运行时加载（SSR/测试环境均为 Node.js，安全）。type-only re-export 不受影响（Vite 不处理 type import）。

## 验收结果
- ✅ F1: vitest 59/59 tests passed（9 test files）
- ✅ F2: tsc --noEmit 零错误
- ✅ F3: 双库隔离确认（grep repositories/ 无 localDb/chunks/vector 引用）

## 文件清单
```
packages/core/src/db/sqlite.ts          # node:sqlite 兼容层（双导出）
packages/core/src/db/types.ts           # 11 entity interfaces
packages/core/src/db/schema.ts          # DDL migrations（9 main + 2 local）
packages/core/src/db/index.ts           # Database class（双库管理）
packages/core/src/db/migrations.ts      # MigrationRunner + migrateAll
packages/core/src/db/repositories/       # 9 repositories（每实体一文件）
  books.ts / annotations.ts / notes.ts / threads.ts / messages.ts
  skills.ts / reading_sessions.ts / method_artifact.ts / review_items.ts
packages/core/src/index.ts              # barrel export（db 模块公共 API）
packages/core/vitest.config.ts          # vitest config（node env, node:sqlite external）
packages/core/package.json              # deps 更新（移除 better-sqlite3，无 runtime deps）
```
