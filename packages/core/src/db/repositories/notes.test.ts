import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Note, Book } from '../types.js';
import { NotesRepository } from './notes.js';
import { BooksRepository } from './books.js';

describe('NotesRepository', () => {
    let db: Database;
    let repo: NotesRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new NotesRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeNote(overrides: Partial<Note> = {}): Note {
        return { id: 'n1', bookId: 'b1', title: '笔记标题', content: '笔记内容', createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeNote({ cfi: 'cfi://1' }));
        const fetched = repo.get('n1');
        expect(fetched).not.toBeNull();
        expect(fetched!.title).toBe('笔记标题');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeNote());
        repo.update('n1', { content: '更新内容' });
        expect(repo.get('n1')!.content).toBe('更新内容');
    });

    it('delete', () => { repo.create(makeNote()); repo.delete('n1'); expect(repo.get('n1')).toBeNull(); });

    it('findByBookId', () => {
        repo.create(makeNote({ id: 'n1' }));
        repo.create(makeNote({ id: 'n2', title: '第二条' }));
        const results = repo.findByBookId('b1');
        expect(results).toHaveLength(2);
    });

    it('级联删除: 删 book → notes 全清', () => {
        repo.create(makeNote());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        expect(repo.get('n1')).toBeNull(); // ON DELETE CASCADE
    });

    it('pinned: create 时标记长期卡片 → get 往返为 true', () => {
        repo.create(makeNote({ pinned: true }));
        expect(repo.get('n1')!.pinned).toBe(true);
    });

    it('pinned: 未指定时默认 false', () => {
        repo.create(makeNote());
        expect(repo.get('n1')!.pinned).toBe(false);
    });

    it('setPinned: 切换标记并持久化', () => {
        repo.create(makeNote());
        repo.setPinned('n1', true);
        expect(repo.get('n1')!.pinned).toBe(true);
        repo.setPinned('n1', false);
        expect(repo.get('n1')!.pinned).toBe(false);
    });

    it('listPinned: 仅返回已贴墙笔记', () => {
        repo.create(makeNote({ id: 'n1', pinned: true }));
        repo.create(makeNote({ id: 'n2', pinned: false }));
        const pinned = repo.listPinned('b1');
        expect(pinned).toHaveLength(1);
        expect(pinned[0]!.id).toBe('n1');
    });
});
