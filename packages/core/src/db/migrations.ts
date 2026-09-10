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

    // 执行指定迁移列表（幂等）
    run(migrations: ReadonlyArray<Migration>): void {
        this.#ensureMigrationsTable();
        const currentVersion = this.#currentVersion();

        for (const migration of migrations) {
            if (migration.version <= currentVersion) continue; // 已应用，跳过

            this.#db.exec('BEGIN');
            try {
                // 执行 DDL（可能含多条 CREATE TABLE）
                this.#db.exec(migration.sql);
                // 记录迁移已应用
                this.#db.prepare(
                    'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
                ).run(migration.version, migration.description, Date.now());
                this.#db.exec('COMMIT');
            } catch (e) {
                this.#db.exec('ROLLBACK');
                throw new Error(`Migration v${migration.version} failed: ${e}`);
            }
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
