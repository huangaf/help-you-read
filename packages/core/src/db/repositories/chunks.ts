import type { SqliteDb } from '../sqlite.js';
import type { Chunk } from '../types.js';

export class ChunksRepository {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    create(entity: Chunk): void {
        const segmentCfis = JSON.stringify(entity.segmentCfis ?? []);
        this.#db.prepare(
            `INSERT INTO chunks (id, book_id, chapter_index, chapter_title, content, token_count, start_cfi, end_cfi, segment_cfis, embedding, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            entity.id,
            entity.bookId,
            entity.chapterIndex ?? null,
            entity.chapterTitle ?? null,
            entity.content,
            entity.tokenCount ?? null,
            entity.startCfi ?? null,
            entity.endCfi ?? null,
            segmentCfis,
            entity.embedding ? Buffer.from(entity.embedding.buffer) : null,
            entity.updatedAt,
        );
    }

    #toBlob(entity: Chunk): Buffer | null {
        return entity.embedding ? Buffer.from(entity.embedding.buffer) : null;
    }

    get(id: string): Chunk | null {
        const row = this.#db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Chunk>): void {
        const sets: string[] = [];
        const values: (string | number | null | Buffer)[] = [];

        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.chapterIndex !== undefined) { sets.push('chapter_index = ?'); values.push(partial.chapterIndex); }
        if (partial.chapterTitle !== undefined) { sets.push('chapter_title = ?'); values.push(partial.chapterTitle); }
        if (partial.content !== undefined) { sets.push('content = ?'); values.push(partial.content); }
        if (partial.tokenCount !== undefined) { sets.push('token_count = ?'); values.push(partial.tokenCount); }
        if (partial.startCfi !== undefined) { sets.push('start_cfi = ?'); values.push(partial.startCfi); }
        if (partial.endCfi !== undefined) { sets.push('end_cfi = ?'); values.push(partial.endCfi); }
        if (partial.segmentCfis !== undefined) { sets.push('segment_cfis = ?'); values.push(JSON.stringify(partial.segmentCfis)); }
        if (partial.embedding !== undefined) { sets.push('embedding = ?'); values.push( Buffer.from(partial.embedding.buffer)); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }

        if (!sets.length) return;
        this.#db.prepare(`UPDATE chunks SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void {
        this.#db.prepare('DELETE FROM chunks WHERE id = ?').run(id);
    }

    findByBookId(bookId: string): Chunk[] {
        const rows = this.#db.prepare('SELECT * FROM chunks WHERE book_id = ?').all(bookId) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    deleteByBookId(bookId: string): void {
        this.#db.prepare('DELETE FROM chunks WHERE book_id = ?').run(bookId);
    }

    #toEntity(row: Record<string, unknown>): Chunk {
        return {
            id: row.id as string,
            bookId: row.book_id as string,
            chapterIndex: (row.chapter_index as number | null) ?? undefined,
            chapterTitle: (row.chapter_title as string | null) ?? undefined,
            content: row.content as string,
            tokenCount: (row.token_count as number | null) ?? undefined,
            startCfi: (row.start_cfi as string | null) ?? undefined,
            endCfi: (row.end_cfi as string | null) ?? undefined,
            segmentCfis: JSON.parse((row.segment_cfis as string | null) ?? '[]'),
            embedding: row.embedding ? new Uint8Array(row.embedding as ArrayBuffer) : undefined,
            updatedAt: row.updated_at as number,
        };
    }
}
