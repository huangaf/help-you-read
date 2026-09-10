import type { SqliteDb } from '../sqlite.js';
import type { ReviewItem } from '../types.js';

export class ReviewItemsRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(item: ReviewItem): void {
        this.#db.prepare(
            `INSERT INTO review_items (id, book_id, source_artifact_id, question, answer, context, due_date, interval_days, ease_factor, lapses, retrieval_count, last_reviewed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(item.id, item.bookId, item.sourceArtifactId ?? null, item.question, item.answer, item.context ?? null, item.dueDate, item.intervalDays, item.easeFactor, item.lapses, item.retrievalCount, item.lastReviewedAt ?? null, item.createdAt, item.updatedAt);
    }

    get(id: string): ReviewItem | null {
        const row = this.#db.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<ReviewItem>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.bookId !== undefined) { sets.push('book_id = ?'); values.push(partial.bookId); }
        if (partial.sourceArtifactId !== undefined) { sets.push('source_artifact_id = ?'); values.push(partial.sourceArtifactId); }
        if (partial.question !== undefined) { sets.push('question = ?'); values.push(partial.question); }
        if (partial.answer !== undefined) { sets.push('answer = ?'); values.push(partial.answer); }
        if (partial.context !== undefined) { sets.push('context = ?'); values.push(partial.context); }
        if (partial.dueDate !== undefined) { sets.push('due_date = ?'); values.push(partial.dueDate); }
        if (partial.intervalDays !== undefined) { sets.push('interval_days = ?'); values.push(partial.intervalDays); }
        if (partial.easeFactor !== undefined) { sets.push('ease_factor = ?'); values.push(partial.easeFactor); }
        if (partial.lapses !== undefined) { sets.push('lapses = ?'); values.push(partial.lapses); }
        if (partial.retrievalCount !== undefined) { sets.push('retrieval_count = ?'); values.push(partial.retrievalCount); }
        if (partial.lastReviewedAt !== undefined) { sets.push('last_reviewed_at = ?'); values.push(partial.lastReviewedAt); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE review_items SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM review_items WHERE id = ?').run(id); }

    dueForBook(bookId: string, asOf: number): ReviewItem[] {
        const rows = this.#db.prepare('SELECT * FROM review_items WHERE book_id = ? AND due_date <= ? ORDER BY due_date').all(bookId, asOf) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): ReviewItem {
        return {
            id: row.id as string, bookId: row.book_id as string,
            sourceArtifactId: (row.source_artifact_id as string) ?? undefined,
            question: row.question as string, answer: row.answer as string,
            context: (row.context as string) ?? undefined,
            dueDate: row.due_date as number, intervalDays: row.interval_days as number,
            easeFactor: row.ease_factor as number, lapses: row.lapses as number,
            retrievalCount: row.retrieval_count as number,
            lastReviewedAt: (row.last_reviewed_at as number) ?? undefined,
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
