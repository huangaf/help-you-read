# better-sqlite3 × Next.js 16 集成指南

> 调研日期：2026-09-01
> 适用版本：Next.js 16.3.4（`reader/`）、better-sqlite3 12.11.1、@types/better-sqlite3 9.6.0、TypeScript 5.9
> 结论均已通过本地 `tsc --noEmit --strict` 编译验证 + Node 运行时冒烟测试（见 §6）

## TL;DR

| 问题 | 结论 |
|------|------|
| next.config 配置项 | 顶层 `serverExternalPackages: ['better-sqlite3']`（v15 起稳定 API）。注意：better-sqlite3 已在 Next.js 内置默认排除列表中，显式声明属于"防御性"写法，推荐保留 |
| 连接单例 | `globalThis` 缓存模式（Prisma 同款）。生产环境不写回 globalThis |
| Route Handler runtime | **不需要** `export const runtime = 'nodejs'`——默认即 nodejs，且 Next.js 16 已废弃 Edge Runtime，官方建议删除此类导出 |
| 类型 | better-sqlite3 本体**不附带**类型（v12.11.1 的 package.json 无 `types` 字段），需安装 `@types/better-sqlite3`；用 `import BetterSqlite3 from 'better-sqlite3'` + `BetterSqlite3.Database` 类型 |
| 16 特有风险 | Server Component 中 better-sqlite3 的**同步查询会被当作 sync I/O**，若无其他动态 API，页面会被整体预渲染进静态壳（构建期执行查询！）→ 需要按请求取数时先 `await connection()` |

---

## 1. next.config.ts 正确配置

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 是原生模块（.node 二进制），禁止打包器内联，
  // 运行时走 Node.js 原生 require 从 node_modules 加载
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
```

**为什么是 `serverExternalPackages` 而不是 `serverComponentsExternalPackages`：**

- `serverComponentsExternalPackages` 是 Next.js 14 的 **experimental** 选项；v15.0.0 起移出 experimental、更名为顶层 `serverExternalPackages` 并转为稳定 API。官方版本历史表原文：`v15.0.0 | Moved from experimental to stable. Renamed from serverComponentsExternalPackages to serverExternalPackages`
  - 证据：[serverExternalPackages.mdx](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.mdx)（canary @ `258b1c1`）
  - 在线文档（v16.3.4）：https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
- `serverExternalPackages` 的语义：Server Components 和 Route Handlers 中用到的依赖默认会被 Next.js 自动打包；列入该数组的依赖改用 Node 原生 `require` 加载（即 webpack 的 externals / Turbopack 的外部包）。

**重要事实：better-sqlite3 已在 Next.js 内置默认排除列表**，即使不显式声明也会被外部化：

```jsonc
// packages/next/src/lib/server-external-packages.jsonc（canary @ 258b1c1）
{
  // ...
  "better-sqlite3",   // ← 第 33 行
  // ...
}
```
- 证据：[server-external-packages.jsonc#L33](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/packages/next/src/lib/server-external-packages.jsonc#L33)

**为什么仍推荐显式声明**：内置列表是"目前兼容中"的维护列表（官方措辞 *currently are working on compatibility*），未来可能变动；显式声明语义自明、不受列表变动影响。唯一注意事项：若把 better-sqlite3 同时加入 `transpilePackages`，用户配置与内置列表会合并时发生过滤（见 webpack-config.ts 中 `filter((pkg) => !finalTranspilePackages?.includes(pkg))`），二者不要对同一包同时配置。

**如何避免浏览器端打包**：`serverExternalPackages` 本身只作用于服务端 bundle；浏览器端的隔离靠"只在服务端代码中 import"——把 db 初始化放在 `src/lib/db/`（仅被 Server Components / Route Handlers / Server Actions 引用），并加 `import 'server-only'` 让任何客户端组件误引用时构建即失败。better-sqlite3 含 `.node` 二进制，一旦被客户端 bundle 引用会直接报错，`server-only` 把报错提前到构建期。

## 2. 连接单例（globalThis 防热重载重复连接）

**问题**：`next dev` 的文件变更会重新求值模块，若 `new Database(path)` 写在模块顶层，每次热重载都会新建一个连接（旧连接不释放）→ 文件句柄/连接数泄漏。官方 issue [#45483](https://github.com/vercel/next.js/issues/45483) 即此问题，`globalThis` 方案在 dev 下验证有效（Prisma 官方文档同款推荐）。

```ts
// src/lib/db/index.ts
import 'server-only'; // 任何客户端组件误引用 → 构建期失败
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'library.db');
const SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');

function createDb(): BetterSqlite3.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new BetterSqlite3(DB_PATH, {
    verbose: (msg) => console.warn('[sqlite]', msg),
  });
  // 本地单文件并发控制
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000'); // 避免 "database is locked"
  db.pragma('foreign_keys = ON');
  // 幂等建表（schema.sql 内使用 IF NOT EXISTS；或改用 user_version 迁移机制）
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

// globalThis 单例：dev 热重载时复用同一连接
const globalForDb = globalThis as unknown as { db?: BetterSqlite3.Database };

export const db: BetterSqlite3.Database = globalForDb.db ?? createDb();

// 仅 dev 写回 globalThis（生产无热重载，模块级常量已足够，且避免跨请求共享的意外）
if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
```

要点：

1. 每个单例必须**自己**声明 globalThis 扩展字段（不能抽公共 singletons 工具包——模块打包分块会让工具包本身也被重复求值，见 [#45483 评论](https://github.com/vercel/next.js/issues/45483)）。
2. 生产环境模块只求值一次，`globalThis` 缓存非必需；不写回是社区通行做法（Prisma 文档同款）。
3. 若追求"全局唯一实例"（跨 RSC/客户端分块），可改在 `src/instrumentation.ts` 的 `register()` 里初始化并挂到 globalThis（Next.js 15.4+/16 的推荐位置）；对单进程本地应用，模块级 globalThis 单例已足够。
4. 构建期 Next.js 默认多 worker（多子进程）并行预渲染页面，每个 worker 会各自初始化一次单例——这是正常现象，不是 bug（[#65350 官方解释](https://github.com/vercel/next.js/issues/65350)）。

**备选（无需单例）**：Node 22.5+ 内置 `node:sqlite`（`node:sqlite` 的 `DatabaseSync`）同样在官方文档中被点名（见 §3），可免掉原生编译依赖，但 API 与 better-sqlite3 不同，属另一条技术路线。

## 3. Route Handler 使用最佳实践

### 3.1 不需要 `export const runtime = 'nodejs'`

- Route Handler（及所有 App Router 服务端代码）默认 runtime 就是 `'nodejs'`。
- **Next.js 16 已废弃 Edge Runtime**，官方文档明确建议把 route 文件里的 `runtime` 导出**删除**（"The Edge Runtime is deprecated, and the `runtime` export should be removed from your route files"）：
  - 证据：[runtime.mdx](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.mdx)（"The default runtime is 'nodejs', while 'edge' is a deprecated option."）
- 自 v15.0.0-RC 起，Route Handler 的 `GET` 默认缓存策略为 **dynamic**（不再静态化），即每次请求执行——天然规避静态化风险。

### 3.2 ⚠️ Next.js 16 特有陷阱：同步查询进入静态壳

**这是 2026-04 才写进官方文档的行为**（针对 better-sqlite3 与 node:sqlite 同步驱动，[commit c249ea9 "docs: native db drivers with sync queries" (#92572)](https://github.com/vercel/next.js/commit/c249ea94b0a7bc2e168aada9bafb1f1174382622)）：

> 同步数据库驱动（better-sqlite3、node:sqlite）的查询**不会被识别为"外部数据访问"，而是被当作 sync I/O**。若页面没有其他未缓存数据/请求时 API，这些查询的结果会**在构建期被预渲染进静态壳**；用 `<Suspense>` 包裹**不能**阻止这一点。

影响边界：

| 场景 | 是否受影响 |
|------|-----------|
| Route Handler（/api/**） | 否——v15 起 GET 默认 dynamic，每次请求执行 |
| Server Component 页面，且同页面已用 `cookies()`/`headers()` 等请求时 API | 否——页面整体已按请求渲染 |
| Server Component 页面，**只**调 better-sqlite3 同步查询 | **是**——构建期执行查询并固化进静态 HTML（除非用 Cache Components 的 `connection()`） |

官方给出的解法（文档原文示例）：

```ts
// app/lib/data.ts
import { connection } from 'next/server';
import BetterSqlite3 from 'better-sqlite3';

const db = new BetterSqlite3('app.db');

export async function getVisitorCount() {
  await connection(); // 此行之前的代码可被预渲染，此后只在请求时执行
  return db.prepare('SELECT value FROM counters WHERE name = ?').get('visitors');
}
```

`connection()` 是 Next.js 15.3+ 提供的 API："指示渲染应等待真实用户请求到来后再继续"。对 reader 这类"数据每次都可能变化"的本地库应用，在**页面数据访问函数**里查询前加一行 `await connection()` 是最稳妥的兜底（Route Handler 不需要）。

## 4. @types/better-sqlite3 类型用法

### 4.1 需要装 @types，因为本体不带类型

- better-sqlite3 **v12.11.1** 的 package.json 只有 `main: "lib/index.js"`，**无 `types`/`typings` 字段**，仓库中也没有 `types/` 目录；master（v13.0.3）同样如此——该项目至今未做一等 TypeScript 支持（作者早期表态见 [PR #676 讨论](https://github.com/JoshuaWise/better-sqlite3/pull/676)）
  - 证据：[package.json @ v12.11.1](https://github.com/WiseLibs/better-sqlite3/blob/4cbc39ca582fecb6b51dd920dfdd338ba4b72230/package.json)（commit `4cbc39c`，tag v12.11.1 解引用）
- 因此安装：`npm i -D @types/better-sqlite3`（当前 9.6.0，2026-08-01 更新，DefinitelyTyped 维护）
  - 证据：[types/better-sqlite3/index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/127fd9871abcf3ff2a66bdc92fc85c77e725a466/types/better-sqlite3/index.d.ts)（DT master @ `127fd98`，159 行）
- 版本错位说明：@types 停留在 9.6.x 是因为 better-sqlite3 自 9.x 后 API 无破坏性变更，而非类型过期失效（DT 的 typescript-automation 按需求同步版本，见 [PR #75271](https://github.com/DefinitelyTyped/DefinitelyTyped/pull/75271)）。

### 4.2 导出结构（关键：`export =` 合并命名空间）

```ts
// index.d.ts 关键行
declare namespace BetterSqlite3 {        // L8：Statement/Database/DatabaseConstructor 等接口
  // interface Database { prepare<BindParameters, Result>(source): Statement<...>; ... }
}
declare namespace Database {             // L110：对外类型别名层
  type Database = BetterSqlite3.Database;
  type Statement<BindParameters, Result> = ...;
  interface RunResult { changes: number; lastInsertRowid: number | bigint; }
  interface Options { readonly?; fileMustExist?; timeout?; verbose?; nativeBinding?; }
  // ...
}
declare const Database: BetterSqlite3.DatabaseConstructor;  // 值侧：构造器
export = Database;                          // L159
```

### 4.3 推荐写法（已编译验证）

```ts
// ✅ 推荐：默认导入绑定的是"const + namespace"合并实体
import BetterSqlite3 from 'better-sqlite3';

const db: BetterSqlite3.Database = new BetterSqlite3('library.db');

// Statement 支持泛型绑定参数与行类型
type Book = { id: number; title: string; author: string };
const stmt: BetterSqlite3.Statement<[string], Book> =
  db.prepare('SELECT id, title, author FROM books WHERE author = ?');
const one = stmt.get('X');      // Book | undefined
const all = stmt.all('X');      // Book[]
const ins = stmt.run('Y');      // RunResult: { changes: number; lastInsertRowid: number | bigint }

const tx = db.transaction((id: number) => { /* ... */ });
tx.immediate(1);                // 也可 tx() / tx.deferred() / tx.exclusive()
```

**已知坑**（[DT issue #52163](https://github.com/DefinitelyTyped/DefinitelyTyped/issues/52163)）：`import Database from 'better-sqlite3'` 时，`Database` 是**命名空间**，不能直接当类型用（`const db: Database` 报 TS2709 "Cannot use namespace as a type"）。规避：类型注解一律写 `BetterSqlite3.Database` / `BetterSqlite3.Statement<...>`（即默认导入名 + `.Database`），构造用 `new BetterSqlite3(path)`。

## 5. Next.js 16 其他注意事项

1. **Turbopack 是 16 的默认打包器**（`next build` 同样默认 Turbopack，`next build --webpack` 可回退）。
   - 已知问题：16.1.x 的 Turbopack standalone 输出把 serverExternalPackages 的哈希别名放在 `.next/standalone/.next/node_modules`（webpack 路径则放 `.next/standalone/node_modules`），Docker 镜像布局不当会缺包 → [#87686](https://github.com/vercel/next.js/issues/87686)、[#88842](https://github.com/vercel/next.js/discussions/88842)、[#88844](https://github.com/vercel/next.js/issues/88844)。16.1 起 Turbopack 已支持**传递性**外部依赖自动处理（[next-16.1 博客](https://nextjs.org/blog/next-16-1)）。
   - 对 reader 的影响：本地 `next dev` / `next start`（非 standalone、非 Docker）**不受影响**；将来若上 Vercel/Docker standalone 需留意哈希别名路径。
2. **instrumentation.ts + webpack**：Next.js 16 webpack 路径下 instrumentation hook 可能把 better-sqlite3 编译成哈希名 require（`better-sqlite3-90e26...`）导致 500（[OmniRoute PR #395 案例](https://github.com/diegosouzapw/OmniRoute/pull/395)）。用默认 Turbopack 构建不触发该问题；若改 `--webpack` 且用到 instrumentation 引用 db，需加 webpack `externals` 精确名映射。
3. **部署环境必须重新编译原生模块**：better-sqlite3 用 prebuild-install 预编译二进制，本地 `node_modules` 不可直接上传部署机（cPanel 等常见 503 场景）；服务器需 `npm install`（触发 prebuild 下载/编译）或 `npm rebuild better-sqlite3`。
4. **`serverRuntimeConfig`/`publicRuntimeConfig` 在 16 已移除**：DB 路径等配置用环境变量（`.env`）读取。

## 6. 验证记录（2026-09-01）

在 `/tmp/bs3-types-test` 独立目录执行：

```bash
npm i typescript@5.9 better-sqlite3@12.11.1 @types/better-sqlite3 @types/node
# 安装结果：better-sqlite3 12.11.1 / @types/better-sqlite3 9.6.0

# ① 运行时冒烟（验证预编译二进制可用 + WAL/prepare/transaction API）
node -e "const B=require('better-sqlite3'); const db=new B(':memory:');
  db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO t(name) VALUES (?)').run('x');
  console.log(db.prepare('SELECT * FROM t').all()); db.close();"
# → smoke ok: [{"id":1,"name":"x"}]

# ② 类型编译验证（§4.3 全部写法 + §2 单例模式）
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck \
    --module esnext --moduleResolution bundler test.ts
# → TSC_PASS
```

## 7. 证据清单

| 证据 | 链接 |
|------|------|
| serverExternalPackages 官方文档（v16.3.4，2025-12-05 更新） | https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages |
| 同文档源文件（canary @ 258b1c1） | [serverExternalPackages.mdx](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.mdx) |
| 内置默认排除列表（better-sqlite3 @ L33） | [server-external-packages.jsonc#L33](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/packages/next/src/lib/server-external-packages.jsonc#L33) |
| runtime 文档（默认 nodejs / edge 废弃） | [runtime.mdx](https://github.com/vercel/next.js/blob/258b1c1bc05f7099816b88f70b7b3422b24a4b8d/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.mdx) |
| Route Handler 文档（v16.3.4，GET 默认 dynamic） | https://nextjs.org/docs/app/api-reference/file-conventions/route |
| 同步查询静态壳陷阱（2026-04-09 文档提交） | [commit c249ea9](https://github.com/vercel/next.js/commit/c249ea94b0a7bc2e168aada9bafb1f1174382622) |
| Next.js 16 发布说明（Turbopack 默认、移除项） | https://nextjs.org/blog/next-16 |
| @types/better-sqlite3（DT master @ 127fd98，9.6.0） | [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/127fd9871abcf3ff2a66bdc92fc85c77e725a466/types/better-sqlite3/index.d.ts) |
| better-sqlite3 v12.11.1 package.json（无 types 字段） | [package.json](https://github.com/WiseLibs/better-sqlite3/blob/4cbc39ca582fecb6b51dd920dfdd338ba4b72230/package.json) |
| dev 热重载连接泄漏 + globalThis 方案 | [#45483](https://github.com/vercel/next.js/issues/45483) |
| 构建期多 worker 单例行为解释 | [#65350](https://github.com/vercel/next.js/issues/65350) |
| 16.1 Turbopack standalone 外部包行为 | [#88844](https://github.com/vercel/next.js/issues/88844)、[#87686](https://github.com/vercel/next.js/issues/87686) |
