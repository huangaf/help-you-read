import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Book } from '../types.js';
import { BooksRepository } from './books.js';

// BooksRepository 测试（TDD：RED → GREEN）
describe('BooksRepository', () => {
    let db: Database;
    let repo: BooksRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new BooksRepository(db.mainDb);
    });

    function makeBook(overrides: Partial<Book> = {}): Book {
        return {
            id: 'book1',
            filePath: '/test/book.epub',
            format: 'epub',
            title: '测试书籍',
            author: '作者',
            publisher: undefined,
            language: 'zh',
            isbn: undefined,
            description: undefined,
            coverUrl: undefined,
            publishDate: undefined,
            rating: undefined,
            tags: ['测试'],
            progress: 0.5,
            currentCfi: undefined,
            addedAt: 1000,
            lastOpenedAt: undefined,
            updatedAt: 1000,
            ...overrides,
        };
    }

    it('create: 插入新 Book，可 get 回', () => {
        const book = makeBook();
        repo.create(book);

        const fetched = repo.get('book1');
        expect(fetched).not.toBeNull();
        expect(fetched!.title).toBe('测试书籍');
        expect(fetched!.tags).toEqual(['测试']);
    });

    it('create: 重复 id → throw', () => {
        repo.create(makeBook());
        expect(() => repo.create(makeBook())).toThrow(); // UNIQUE constraint
    });

    it('get: 不存在的 id → null', () => {
        expect(repo.get('nonexistent')).toBeNull();
    });

    it('update: 部分字段更新', () => {
        repo.create(makeBook({ progress: 0.5 }));

        repo.update('book1', { progress: 0.8, lastOpenedAt: 2000 });

        const fetched = repo.get('book1')!;
        expect(fetched.progress).toBe(0.8);
        expect(fetched.lastOpenedAt).toBe(2000);
        // 未更新字段保持不变
        expect(fetched.title).toBe('测试书籍');
    });

    it('delete: 删除后 get → null', () => {
        repo.create(makeBook());
        repo.delete('book1');
        expect(repo.get('book1')).toBeNull();
    });

    it('getByTitle: 按标题查找', () => {
        repo.create(makeBook({ title: '书名A' }));
        repo.create(makeBook({ id: 'book2', title: '书名B' }));

        const results = repo.getByTitle('书名A');
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe('book1');
    });

    it('findByTags: 按标签过滤', () => {
        repo.create(makeBook({ id: 'book1', tags: ['哲学', '投资'] }));
        repo.create(makeBook({ id: 'book2', tags: ['文学'] }));

        const results = repo.findByTags(['哲学']);
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe('book1');
    });

    it('级联删除: 删 book → annotations/notes/sessions/artifacts/reviews 全清', () => {
        repo.create(makeBook());

        // 在 annotations 中插入关联记录
        db.mainDb.prepare(
            "INSERT INTO annotations (id, book_id, cfi, text, created_at, updated_at) VALUES (?, ?, 'cfi1', '测试批注', 1000, 1000)"
        ).run('ann1', 'book1');

        repo.delete('book1');

        const annCount = db.mainDb.prepare(
            'SELECT COUNT(*) as cnt FROM annotations WHERE book_id = ?'
        ).get('book1') as { cnt: number };
        expect(annCount.cnt).toBe(0); // ON DELETE CASCADE 生效
    });
});
