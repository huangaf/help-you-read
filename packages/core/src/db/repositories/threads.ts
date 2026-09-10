import type { SqliteDb } from '../sqlite.js';
import type { Thread } from '../types.js';

export class ThreadsRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(t: Thread): void {
        this.#db.prepare(
            `INSERT INTO threads (id, book_id, title, memory_summary, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(t.id, t.bookId ?? null, t.title ?? null, t.memorySummary ?? null, t.createdAt, t.updatedAt);
    }

    get(id: string): Thread | null {
        const row = this.#db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Thread>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.title !== undefined) { sets.push('title = ?'); values.push(partial.title); }
        if (partial.memorySummary !== undefined) { sets.push('memory_summary = ?'); values.push(partial.memorySummary); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM threads WHERE id = ?').run(id); }

    findByBookId(bookId: string): Thread[] {
        const rows = this.#db.prepare('SELECT * FROM threads WHERE book_id = ?').all(bookId) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): Thread {
        return {
            id: row.id as string,
            bookId: (row.book_id as string) ?? undefined,
            title: (row.title as string) ?? undefined,
            memorySummary: (row.memory_summary as string) ?? undefined,
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
