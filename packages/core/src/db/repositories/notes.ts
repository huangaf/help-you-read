import type { SqliteDb } from '../sqlite.js';
import type { Note } from '../types.js';

export class NotesRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(n: Note): void {
        this.#db.prepare(
            `INSERT INTO notes (id, book_id, highlight_id, cfi, title, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(n.id, n.bookId, n.highlightId ?? null, n.cfi ?? null, n.title, n.content, n.createdAt, n.updatedAt);
    }

    get(id: string): Note | null {
        const row = this.#db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Note>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.highlightId !== undefined) { sets.push('highlight_id = ?'); values.push(partial.highlightId); }
        if (partial.cfi !== undefined) { sets.push('cfi = ?'); values.push(partial.cfi); }
        if (partial.title !== undefined) { sets.push('title = ?'); values.push(partial.title); }
        if (partial.content !== undefined) { sets.push('content = ?'); values.push(partial.content); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM notes WHERE id = ?').run(id); }

    findByBookId(bookId: string): Note[] {
        const rows = this.#db.prepare('SELECT * FROM notes WHERE book_id = ?').all(bookId) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): Note {
        return {
            id: row.id as string, bookId: row.book_id as string,
            highlightId: (row.highlight_id as string) ?? undefined,
            cfi: (row.cfi as string) ?? undefined,
            title: row.title as string, content: row.content as string,
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
