import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Message, Thread, Book } from '../types.js';
import { MessagesRepository } from './messages.js';
import { ThreadsRepository } from './threads.js';
import { BooksRepository } from './books.js';

describe('MessagesRepository', () => {
    let db: Database;
    let repo: MessagesRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new MessagesRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
        const threadsRepo = new ThreadsRepository(db.mainDb);
        threadsRepo.create({ id: 't1', bookId: 'b1', title: '对话一', createdAt: 1000, updatedAt: 1000 });
    });

    function makeMsg(overrides: Partial<Message> = {}): Message {
        return { id: 'm1', threadId: 't1', role: 'user', content: '你好', citations: [], toolCalls: [], partsOrder: 0, createdAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeMsg({ citations: [{ cfi: 'cfi://1', text: '引用' }] }));
        const fetched = repo.get('m1');
        expect(fetched).not.toBeNull();
        expect(fetched!.content).toBe('你好');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeMsg());
        repo.update('m1', { content: '更新内容' });
        expect(repo.get('m1')!.content).toBe('更新内容');
    });

    it('delete', () => { repo.create(makeMsg()); repo.delete('m1'); expect(repo.get('m1')).toBeNull(); });

    it('findByThreadId（按 partsOrder 排序）', () => {
        repo.create(makeMsg({ id: 'm1', partsOrder: 2 }));
        repo.create(makeMsg({ id: 'm2', partsOrder: 1, role: 'assistant' }));
        const results = repo.findByThreadId('t1');
        expect(results).toHaveLength(2);
        expect(results[0]!.partsOrder).toBe(1); // 排序正确
    });

    it('级联删除: 删 thread → messages 全清', () => {
        repo.create(makeMsg());
        const threadsRepo = new ThreadsRepository(db.mainDb);
        threadsRepo.delete('t1');
        expect(repo.get('m1')).toBeNull(); // ON DELETE CASCADE
    });
});
