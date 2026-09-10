import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { MethodArtifact, Book } from '../types.js';
import { MethodArtifactRepository } from './method_artifact.js';
import { BooksRepository } from './books.js';

describe('MethodArtifactRepository', () => {
    let db: Database;
    let repo: MethodArtifactRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new MethodArtifactRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeArtifact(overrides: Partial<MethodArtifact> = {}): MethodArtifact {
        return { id: 'ma1', bookId: 'b1', method: 'ria_note', content: '{"R":"读","I":"述","A":"用"}', helpful: false, dismissed: false, createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeArtifact({ idempotencyKey: 'key1' }));
        const fetched = repo.get('ma1');
        expect(fetched).not.toBeNull();
        expect(fetched!.method).toBe('ria_note');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeArtifact());
        repo.update('ma1', { helpful: true });
        expect(repo.get('ma1')!.helpful).toBe(true);
    });

    it('delete', () => { repo.create(makeArtifact()); repo.delete('ma1'); expect(repo.get('ma1')).toBeNull(); });

    it('findByBookAndMethod', () => {
        repo.create(makeArtifact({ id: 'ma1', method: 'ria_note' }));
        repo.create(makeArtifact({ id: 'ma2', method: 'four_level' }));
        const results = repo.findByBookAndMethod('b1', 'ria_note');
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe('ma1');
    });

    it('级联删除: 删 book → artifacts 全清', () => {
        repo.create(makeArtifact());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        expect(repo.get('ma1')).toBeNull(); // ON DELETE CASCADE
    });

    it('helpful/dismissed 布尔转换（DB 存 0/1）', () => {
        repo.create(makeArtifact({ helpful: true, dismissed: false }));
        const fetched = repo.get('ma1')!;
        expect(fetched.helpful).toBe(true);
        expect(fetched.dismissed).toBe(false);
    });
});
