import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { ReviewItem, Book } from '../types.js';
import { ReviewItemsRepository } from './review_items.js';
import { BooksRepository } from './books.js';
import { MethodArtifactRepository } from './method_artifact.js';

describe('ReviewItemsRepository', () => {
    let db: Database;
    let repo: ReviewItemsRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new ReviewItemsRepository(db.mainDb);
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.create({ id: 'b1', filePath: '/test.epub', format: 'epub', title: '测试书', tags: [], progress: 0, addedAt: 1000, updatedAt: 1000 });
    });

    function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
        return { id: 'ri1', bookId: 'b1', question: '问题？', answer: '答案', dueDate: 5000, intervalDays: 1, easeFactor: 2.5, lapses: 0, retrievalCount: 0, createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeItem({ context: '上下文' }));
        const fetched = repo.get('ri1');
        expect(fetched).not.toBeNull();
        expect(fetched!.question).toBe('问题？');
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段（SM-2 参数）', () => {
        repo.create(makeItem());
        repo.update('ri1', { easeFactor: 2.8, intervalDays: 5, lapses: 1 });
        const fetched = repo.get('ri1')!;
        expect(fetched.easeFactor).toBe(2.8);
        expect(fetched.intervalDays).toBe(5);
        expect(fetched.lapses).toBe(1);
    });

    it('delete', () => { repo.create(makeItem()); repo.delete('ri1'); expect(repo.get('ri1')).toBeNull(); });

    it('dueForBook: 返回到期项（按 dueDate 排序）', () => {
        repo.create(makeItem({ id: 'ri1', dueDate: 5000 }));
        repo.create(makeItem({ id: 'ri2', dueDate: 3000 }));
        repo.create(makeItem({ id: 'ri3', dueDate: 9000 })); // 未到期
        const due = repo.dueForBook('b1', 6000); // asOf=6000，ri3(9000) 不应出现
        expect(due).toHaveLength(2);
        expect(due[0]!.id).toBe('ri2'); // 排序：最早到期在前
    });

    it('级联删除: 删 book → review_items 全清', () => {
        repo.create(makeItem());
        const booksRepo = new BooksRepository(db.mainDb);
        booksRepo.delete('b1');
        expect(repo.get('ri1')).toBeNull(); // ON DELETE CASCADE
    });

    it('sourceArtifactId 可空（无需关联 artifact）', () => {
        repo.create(makeItem({ id: 'ri1' })); // 无 sourceArtifactId
        expect(repo.get('ri1')!.sourceArtifactId).toBeUndefined();

        // 先建 artifact，再关联（验证 FK 约束）
        const maRepo = new MethodArtifactRepository(db.mainDb);
        maRepo.create({ id: 'ma1', bookId: 'b1', method: 'ria_note', content: '{}', helpful: false, dismissed: false, createdAt: 1000, updatedAt: 1000 });
        repo.create(makeItem({ id: 'ri2', sourceArtifactId: 'ma1' }));
        expect(repo.get('ri2')!.sourceArtifactId).toBe('ma1'); // FK 关联成功
    });
});
