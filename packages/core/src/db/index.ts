// Database：双库管理器（main.db + local.db）
// 职责：打开/关闭双库、设 PRAGMA、提供底层 DatabaseSync 实例
// 零 UI 依赖，可被桌面/移动/Web 复用

import { DatabaseSync } from './sqlite.js';
import type { SqliteDb } from './sqlite.js';

export interface DatabaseOptions {
    readonly mainDbPath: string;
    readonly localDbPath?: string | undefined; // 可选：无向量需求时可不建 local.db
}

export class Database {
    readonly mainDb: SqliteDb;
    readonly localDb?: SqliteDb | undefined;

    constructor(options: DatabaseOptions) {
        this.mainDb = new DatabaseSync(options.mainDbPath);
        this.mainDb.exec('PRAGMA journal_mode=WAL');
        this.mainDb.exec('PRAGMA foreign_keys=ON');

        if (options.localDbPath) {
            const local = new DatabaseSync(options.localDbPath);
            local.exec('PRAGMA journal_mode=WAL');
            local.exec('PRAGMA foreign_keys=ON');
            this.localDb = local;
        }
    }

    // 事务：在 mainDb 上执行 fn，自动 COMMIT/ROLLBACK
    transaction<T>(fn: () => T): T {
        this.mainDb.exec('BEGIN');
        try {
            const result = fn();
            this.mainDb.exec('COMMIT');
            return result;
        } catch (e) {
            this.mainDb.exec('ROLLBACK');
            throw e;
        }
    }

    close(): void {
        this.mainDb.close();
        if (this.localDb) {
            this.localDb.close();
        }
    }
}
