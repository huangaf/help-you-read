import type { SqliteDb } from '../sqlite.js';
import type { VectorIndexProvenance } from '../types.js';

export class ProvenanceRepository {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    create(entity: VectorIndexProvenance): void {
        this.#db.prepare(
            'INSERT INTO vector_index_provenance (book_id, model_kind, model_id, endpoint, dimensions, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
            entity.bookId,
            entity.modelKind,
            entity.modelId,
            entity.endpoint ?? null,
            entity.dimensions,
            entity.createdAt,
        );
    }

    upsert(entity: VectorIndexProvenance): void {
        this.#db.prepare(
            `INSERT INTO vector_index_provenance (book_id, model_kind, model_id, endpoint, dimensions, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(book_id) DO UPDATE SET model_kind=excluded.model_kind, model_id=excluded.model_id, endpoint=excluded.endpoint, dimensions=excluded.dimensions, created_at=excluded.created_at`
        ).run(
            entity.bookId,
            entity.modelKind,
            entity.modelId,
            entity.endpoint ?? null,
            entity.dimensions,
            entity.createdAt,
        );
    }

    get(bookId: string): VectorIndexProvenance | null {
        const row = this.#db.prepare('SELECT * FROM vector_index_provenance WHERE book_id = ?').get(bookId) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    delete(bookId: string): void {
        this.#db.prepare('DELETE FROM vector_index_provenance WHERE book_id = ?').run(bookId);
    }

    getByBookId(bookId: string): VectorIndexProvenance | null {
        return this.get(bookId);
    }

    isStale(bookId: string, current: { modelId: string }): boolean {
        const existing = this.get(bookId);
        if (!existing) return true;
        return existing.modelId !== current.modelId;
    }

    #toEntity(row: Record<string, unknown>): VectorIndexProvenance {
        return {
            bookId: row.book_id as string,
            modelKind: row.model_kind as string,
            modelId: row.model_id as string,
            endpoint: (row.endpoint as string | null) ?? undefined,
            dimensions: row.dimensions as number,
            createdAt: row.created_at as number,
        };
    }
}
