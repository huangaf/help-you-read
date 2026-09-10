import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { ReadingSession, Book } from '../types.js';
import { ReadingSessionsRepository } from './reading_sessions.js';
import { BooksRepository } from './books.js';

describe('ReadingSessionsRepository', () => {
    let db: Database;
    let repo: ReadingSessionsRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new ReadingSessionsRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeSession(overrides: Partial<ReadingSession> = {}): ReadingSession {
        return { id: 'rs1', bookId: 'b1', startedAt: 1000, totalActiveTime: 3600000, pagesRead: 5, state: 'active', updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeSession({ endedAt: 2000, state: 'ended' }));
        const fetched = repo.get('rs1');
        expect(fetched).not.toBeNull();
        expect(fetched!.totalActiveTime).toBe(3600000);
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeSession());
        repo.update('rs1', { pagesRead: 10, state: 'paused' });
        const fetched = repo.get('rs1')!;
        expect(fetched.pagesRead).toBe(10);
        expect(fetched.state).toBe('paused');
    });

    it('delete', () => { repo.create(makeSession()); repo.delete('rs1'); expect(repo.get('rs1')).toBeNull(); });

    it('activeForBook: 返回 state=active 的会话', () => {
        repo.create(makeSession({ id: 'rs1', state: 'active' }));
        repo.create(makeSession({ id: 'rs2', state: 'ended' }));
        const active = repo.activeForBook('b1');
        expect(active).not.toBeNull();
        expect(active!.id).toBe('rs1');
    });

    it('activeForBook: 无 active 会话 → null', () => {
        repo.create(makeSession({ state: 'ended' }));
        expect(repo.activeForBook('b1')).toBeNull();
    });

    it('级联删除: 删 book → sessions 全清', () => {
        repo.create(makeSession());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        expect(repo.get('rs1')).toBeNull(); // ON DELETE CASCADE
    });
});
