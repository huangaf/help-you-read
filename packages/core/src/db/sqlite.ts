// node:sqlite 兼容层 — Vite 无法打包 node: 前缀模块，
// 通过 createRequire 在运行时加载（SSR/测试环境均为 Node.js，安全）
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 值导出：构造函数（consumer 用 `new DatabaseSync(path)` 建库）
export const DatabaseSync: typeof import('node:sqlite').DatabaseSync = require('node:sqlite').DatabaseSync;

// 类型别名：实例类型（consumer 用 `import type { SqliteDb }` 做注解）
export type SqliteDb = import('node:sqlite').DatabaseSync;
