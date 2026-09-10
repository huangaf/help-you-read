import type { SqliteDb } from '../sqlite.js';
import type { MethodArtifact } from '../types.js';

export class MethodArtifactRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(a: MethodArtifact): void {
        this.#db.prepare(
            `INSERT INTO method_artifact (id, book_id, method, content, idempotency_key, helpful, dismissed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(a.id, a.bookId, a.method, a.content, a.idempotencyKey ?? null, a.helpful ? 1 : 0, a.dismissed ? 1 : 0, a.createdAt, a.updatedAt);
    }

    get(id: string): MethodArtifact | null {
        const row = this.#db.prepare('SELECT * FROM method_artifact WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<MethodArtifact>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.method !== undefined) { sets.push('method = ?'); values.push(partial.method); }
        if (partial.content !== undefined) { sets.push('content = ?'); values.push(partial.content); }
        if (partial.idempotencyKey !== undefined) { sets.push('idempotency_key = ?'); values.push(partial.idempotencyKey); }
        if (partial.helpful !== undefined) { sets.push('helpful = ?'); values.push(partial.helpful ? 1 : 0); }
        if (partial.dismissed !== undefined) { sets.push('dismissed = ?'); values.push(partial.dismissed ? 1 : 0); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE method_artifact SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM method_artifact WHERE id = ?').run(id); }

    findByBookAndMethod(bookId: string, method: string): MethodArtifact[] {
        const rows = this.#db.prepare('SELECT * FROM method_artifact WHERE book_id = ? AND method = ?').all(bookId, method) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): MethodArtifact {
        return {
            id: row.id as string, bookId: row.book_id as string, method: row.method as string,
            content: row.content as string,
            idempotencyKey: (row.idempotency_key as string) ?? undefined,
            helpful: (row.helpful as number) === 1,
            dismissed: (row.dismissed as number) === 1,
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
