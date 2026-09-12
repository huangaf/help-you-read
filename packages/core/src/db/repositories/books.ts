// BooksRepository — books 表 CRUD + entity-specific queries

import type { SqliteDb } from '../sqlite.js';
import type { Book } from '../types.js';

export class BooksRepository {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    create(book: Book): void {
        this.#db.prepare(
            `INSERT INTO books (id, file_path, format, title, author, publisher, language, isbn, description, cover_url, publish_date, rating, tags, progress, current_cfi, added_at, last_opened_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            book.id, book.filePath, book.format, book.title,
            book.author ?? null, book.publisher ?? null, book.language ?? null,
            book.isbn ?? null, book.description ?? null, book.coverUrl ?? null,
            book.publishDate ?? null, book.rating ?? null,
            JSON.stringify(book.tags), book.progress,
            book.currentCfi ?? null, book.addedAt, book.lastOpenedAt ?? null,
            book.updatedAt
        );
    }

    get(id: string): Book | null {
        const row = this.#db.prepare('SELECT * FROM books WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Book>): void {
        const sets: string[] = [];
        const values: (string | number | null)[] = [];

        if (partial.filePath !== undefined) { sets.push('file_path = ?'); values.push(partial.filePath); }
        if (partial.format !== undefined) { sets.push('format = ?'); values.push(partial.format); }
        if (partial.title !== undefined) { sets.push('title = ?'); values.push(partial.title); }
        if (partial.author !== undefined) { sets.push('author = ?'); values.push(partial.author); }
        if (partial.publisher !== undefined) { sets.push('publisher = ?'); values.push(partial.publisher); }
        if (partial.language !== undefined) { sets.push('language = ?'); values.push(partial.language); }
        if (partial.isbn !== undefined) { sets.push('isbn = ?'); values.push(partial.isbn); }
        if (partial.description !== undefined) { sets.push('description = ?'); values.push(partial.description); }
        if (partial.coverUrl !== undefined) { sets.push('cover_url = ?'); values.push(partial.coverUrl); }
        if (partial.publishDate !== undefined) { sets.push('publish_date = ?'); values.push(partial.publishDate); }
        if (partial.rating !== undefined) { sets.push('rating = ?'); values.push(partial.rating); }
        if (partial.tags !== undefined) { sets.push('tags = ?'); values.push(JSON.stringify(partial.tags)); }
        if (partial.progress !== undefined) { sets.push('progress = ?'); values.push(partial.progress); }
        if (partial.currentCfi !== undefined) { sets.push('current_cfi = ?'); values.push(partial.currentCfi); }
        if (partial.lastOpenedAt !== undefined) { sets.push('last_opened_at = ?'); values.push(partial.lastOpenedAt); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }

        if (!sets.length) return;
        this.#db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void {
        this.#db.prepare('DELETE FROM books WHERE id = ?').run(id);
    }

    list(): Book[] {
        const rows = this.#db.prepare('SELECT * FROM books ORDER BY added_at DESC').all() as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    // entity-specific: 按标题查找
    getByTitle(title: string): Book[] {
        const rows = this.#db.prepare('SELECT * FROM books WHERE title = ?').all(title) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    // entity-specific: 按标签过滤（JSON 数组包含匹配）
    findByTags(tags: string[]): Book[] {
        // SQLite: 用 EXISTS + json_each 做 JSON 数组包含查询
        const rows = this.#db.prepare(`
            SELECT b.* FROM books b
            WHERE EXISTS (
                SELECT 1 FROM json_each(b.tags) je
                WHERE je.value IN (${tags.map(() => '?').join(', ')})
            )
        `).all(...tags) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    // 行 → Entity（snake_case → camelCase）
    #toEntity(row: Record<string, unknown>): Book {
        return {
            id: row.id as string,
            filePath: row.file_path as string,
            format: row.format as string,
            title: row.title as string,
            author: (row.author as string) ?? undefined,
            publisher: (row.publisher as string) ?? undefined,
            language: (row.language as string) ?? undefined,
            isbn: (row.isbn as string) ?? undefined,
            description: (row.description as string) ?? undefined,
            coverUrl: (row.cover_url as string) ?? undefined,
            publishDate: (row.publish_date as string) ?? undefined,
            rating: row.rating != null ? row.rating as number : undefined,
            tags: JSON.parse(row.tags as string),
            progress: row.progress as number,
            currentCfi: (row.current_cfi as string) ?? undefined,
            addedAt: row.added_at as number,
            lastOpenedAt: (row.last_opened_at as number) ?? undefined,
            updatedAt: row.updated_at as number,
        };
    }
}
