// MigrationRunner：幂等迁移执行器
// 承 ReadAny migrations.ts 模式：schema_migrations(version, description, applied_at)
// 升级 = 仅执行未应用的 migration，已应用则跳过

import type { SqliteDb } from './sqlite.js';
import { SCHEMA_MIGRATIONS_DDL, MAIN_DB_MIGRATIONS, LOCAL_DB_MIGRATIONS } from './schema.js';

export interface Migration {
    readonly version: number;
    readonly description: string;
    readonly sql: string;
}

export class MigrationRunner {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    // 确保 schema_migrations 表存在
    #ensureMigrationsTable(): void {
        this.#db.exec(SCHEMA_MIGRATIONS_DDL);
    }

    // 获取已应用的最大 version（0 = 无迁移记录）
    #currentVersion(): number {
        this.#ensureMigrationsTable();
        const row = this.#db.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as { v: number | null } | undefined;
        return row?.v ?? 0;
    }

    // 执行指定迁移列表（幂等：所有 DDL 使用 IF NOT EXISTS / OR IGNORE）
    run(migrations: ReadonlyArray<Migration>): void {
        this.#ensureMigrationsTable();
        const currentVersion = this.#currentVersion();

        for (const migration of migrations) {
            if (migration.version <= currentVersion) continue;

            try {
                this.#db.exec(migration.sql);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // ADD COLUMN 对已存在列报 duplicate → 幂等忽略（视为已应用）
                if (!msg.includes('duplicate column name')) {
                    throw new Error(`Migration v${migration.version} failed: ${msg}`);
                }
            }
            this.#db.prepare(
                'INSERT OR IGNORE INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
            ).run(migration.version, migration.description, Date.now());
        }
    }

    // 获取当前 schema version
    currentVersion(): number {
        this.#ensureMigrationsTable();
        return this.#currentVersion();
    }
}

// 便捷方法：对 Database 实例执行 main + local 迁移
export function migrateAll(db: import('./index.js').Database): void {
    const mainRunner = new MigrationRunner(db.mainDb);
    mainRunner.run(MAIN_DB_MIGRATIONS);

    if (db.localDb) {
        const localRunner = new MigrationRunner(db.localDb);
        localRunner.run(LOCAL_DB_MIGRATIONS);
    }
}
