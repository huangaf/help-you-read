import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Thread, Book } from '../types.js';
import { ThreadsRepository } from './threads.js';
import { BooksRepository } from './books.js';

describe('ThreadsRepository', () => {
    let db: Database;
    let repo: ThreadsRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new ThreadsRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeThread(overrides: Partial<Thread> = {}): Thread {
        return { id: 't1', bookId: 'b1', title: '对话一', createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeThread({ memorySummary: '摘要' }));
        const fetched = repo.get('t1');
        expect(fetched).not.toBeNull();
        expect(fetched!.title).toBe('对话一');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeThread());
        repo.update('t1', { title: '新标题' });
        expect(repo.get('t1')!.title).toBe('新标题');
    });

    it('delete', () => { repo.create(makeThread()); repo.delete('t1'); expect(repo.get('t1')).toBeNull(); });

    it('findByBookId', () => {
        repo.create(makeThread({ id: 't1' }));
        repo.create(makeThread({ id: 't2', title: '对话二' }));
        const results = repo.findByBookId('b1');
        expect(results).toHaveLength(2);
    });

    it('删 book → thread.bookId 变 null（ON DELETE SET NULL）', () => {
        repo.create(makeThread());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        const fetched = repo.get('t1')!; // thread 仍存在（SET NULL，非 CASCADE）
        expect(fetched.bookId).toBeUndefined(); // bookId 被置空
    });
});
