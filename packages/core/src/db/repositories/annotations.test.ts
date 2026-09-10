import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Annotation, Book } from '../types.js';
import { AnnotationsRepository } from './annotations.js';
import { BooksRepository } from './books.js';

describe('AnnotationsRepository', () => {
    let db: Database;
    let repo: AnnotationsRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new AnnotationsRepository(db.mainDb);
        // 先建 book（外键依赖）
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeAnn(overrides: Partial<Annotation> = {}): Annotation {
        return { id: 'a1', bookId: 'b1', cfi: 'cfi://1', text: '测试批注', color: 'yellow', style: 'highlight', type: 'annotation', createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeAnn({ contextBefore: '前文', contextAfter: '后文' }));
        const fetched = repo.get('a1');
        expect(fetched).not.toBeNull();
        expect(fetched!.text).toBe('测试批注');
        expect(fetched!.contextBefore).toBe('前文');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeAnn());
        repo.update('a1', { color: 'green' });
        expect(repo.get('a1')!.color).toBe('green');
    });

    it('delete', () => { repo.create(makeAnn()); repo.delete('a1'); expect(repo.get('a1')).toBeNull(); });

    it('findByBookId', () => {
        repo.create(makeAnn({ id: 'a1' }));
        repo.create(makeAnn({ id: 'a2', text: '第二条' }));
        const results = repo.findByBookId('b1');
        expect(results).toHaveLength(2);
    });

    it('级联删除: 删 book → annotations 全清', () => {
        repo.create(makeAnn());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        expect(repo.get('a1')).toBeNull(); // ON DELETE CASCADE
    });
});
