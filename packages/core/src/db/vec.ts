// sqlite-vec 扩展加载 + chunks_vec 虚拟表管理（local.db 向量检索）
// 需 localDb 以 allowExtension:true 打开（见 Database）

import { load as loadSqliteVec } from 'sqlite-vec';
import type { SqliteDb } from './sqlite.js';

const loadedDbs = new WeakSet<object>();

export function loadVecExtension(db: SqliteDb): void {
    if (loadedDbs.has(db)) return;
    loadSqliteVec(db);
    loadedDbs.add(db);
}

export function ensureChunksVecTable(db: SqliteDb, dimension: number): void {
    const existing = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chunks_vec'"
    ).get() as { sql: string | null } | undefined;

    if (existing?.sql) {
        if (existing.sql.includes(`float[${dimension}]`)) return;
        db.exec('DROP TABLE chunks_vec');
    }

    db.exec(`CREATE VIRTUAL TABLE chunks_vec USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[${dimension}])`);
}
