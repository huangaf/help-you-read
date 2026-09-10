import type { SqliteDb } from '../sqlite.js';
import type { ReadingSession } from '../types.js';

export class ReadingSessionsRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(s: ReadingSession): void {
        this.#db.prepare(
            `INSERT INTO reading_sessions (id, book_id, started_at, ended_at, total_active_time, pages_read, state, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(s.id, s.bookId, s.startedAt, s.endedAt ?? null, s.totalActiveTime, s.pagesRead, s.state, s.updatedAt);
    }

    get(id: string): ReadingSession | null {
        const row = this.#db.prepare('SELECT * FROM reading_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<ReadingSession>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.startedAt !== undefined) { sets.push('started_at = ?'); values.push(partial.startedAt); }
        if (partial.endedAt !== undefined) { sets.push('ended_at = ?'); values.push(partial.endedAt); }
        if (partial.totalActiveTime !== undefined) { sets.push('total_active_time = ?'); values.push(partial.totalActiveTime); }
        if (partial.pagesRead !== undefined) { sets.push('pages_read = ?'); values.push(partial.pagesRead); }
        if (partial.state !== undefined) { sets.push('state = ?'); values.push(partial.state); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE reading_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM reading_sessions WHERE id = ?').run(id); }

    activeForBook(bookId: string): ReadingSession | null {
        const row = this.#db.prepare("SELECT * FROM reading_sessions WHERE book_id = ? AND state = 'active'").get(bookId) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    #toEntity(row: Record<string, unknown>): ReadingSession {
        return {
            id: row.id as string, bookId: row.book_id as string,
            startedAt: row.started_at as number,
            endedAt: (row.ended_at as number) ?? undefined,
            totalActiveTime: row.total_active_time as number,
            pagesRead: row.pages_read as number,
            state: row.state as string,
            updatedAt: row.updated_at as number,
        };
    }
}
