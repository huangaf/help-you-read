import type { SqliteDb } from '../sqlite.js';
import type { Annotation } from '../types.js';

export class AnnotationsRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(a: Annotation): void {
        this.#db.prepare(
            `INSERT INTO annotations (id, book_id, cfi, text, context_before, context_after, color, style, type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(a.id, a.bookId, a.cfi, a.text, a.contextBefore ?? null, a.contextAfter ?? null, a.color, a.style, a.type, a.createdAt, a.updatedAt);
    }

    get(id: string): Annotation | null {
        const row = this.#db.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Annotation>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.cfi !== undefined) { sets.push('cfi = ?'); values.push(partial.cfi); }
        if (partial.text !== undefined) { sets.push('text = ?'); values.push(partial.text); }
        if (partial.contextBefore !== undefined) { sets.push('context_before = ?'); values.push(partial.contextBefore); }
        if (partial.contextAfter !== undefined) { sets.push('context_after = ?'); values.push(partial.contextAfter); }
        if (partial.color !== undefined) { sets.push('color = ?'); values.push(partial.color); }
        if (partial.style !== undefined) { sets.push('style = ?'); values.push(partial.style); }
        if (partial.type !== undefined) { sets.push('type = ?'); values.push(partial.type); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM annotations WHERE id = ?').run(id); }

    findByBookId(bookId: string): Annotation[] {
        const rows = this.#db.prepare('SELECT * FROM annotations WHERE book_id = ?').all(bookId) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): Annotation {
        return {
            id: row.id as string, bookId: row.book_id as string, cfi: row.cfi as string,
            text: row.text as string,
            contextBefore: (row.context_before as string) ?? undefined,
            contextAfter: (row.context_after as string) ?? undefined,
            color: row.color as string, style: row.style as string, type: row.type as string,
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
