import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Chunk } from '../types.js';
import { ChunksRepository } from './chunks.js';

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
    return {
        id: 'c1',
        bookId: 'b1',
        content: '测试内容',
        updatedAt: 1000,
        ...overrides,
    };
}

describe('ChunksRepository', () => {
    let db: Database;
    let repo: ChunksRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:', localDbPath: ':memory:' });
        migrateAll(db);
        // 建 book（FK 依赖）
        db.mainDb.exec("INSERT INTO books(id, file_path, format, title, tags, progress, added_at, updated_at) VALUES ('b1', '/test.epub', 'epub', '测试书', '[]', 0, 1000, 1000)");
        repo = new ChunksRepository(db.localDb!);
    });

    it('create + get', () => {
        repo.create(makeChunk({ chapterIndex: 0, tokenCount: 100 }));
        const fetched = repo.get('c1');
        expect(fetched).not.toBeNull();
        expect(fetched!.content).toBe('测试内容');
        expect(fetched!.chapterIndex).toBe(0);
    });

    it('get: 不存在 → null', () => {
        expect(repo.get('nope')).toBeNull();
    });

    it('update 部分字段', () => {
        repo.create(makeChunk());
        repo.update('c1', { content: '更新后' });
        expect(repo.get('c1')!.content).toBe('更新后');
    });

    it('delete', () => {
        repo.create(makeChunk());
        repo.delete('c1');
        expect(repo.get('c1')).toBeNull();
    });

    it('findByBookId', () => {
        repo.create(makeChunk({ id: 'c1' }));
        repo.create(makeChunk({ id: 'c2', bookId: 'b1' }));
        repo.create(makeChunk({ id: 'c3', bookId: 'b2' }));
        const results = repo.findByBookId('b1');
        expect(results).toHaveLength(2);
    });

    it('deleteByBookId（级联）', () => {
        repo.create(makeChunk({ id: 'c1' }));
        repo.create(makeChunk({ id: 'c2', bookId: 'b1' }));
        repo.deleteByBookId('b1');
        expect(repo.get('c1')).toBeNull();
        expect(repo.get('c2')).toBeNull();
    });

    it('embedding BLOB 存取', () => {
        const vec = new Float32Array([0.1, 0.2, 0.3]);
        repo.create(makeChunk({ embedding: vec }));
        const fetched = repo.get('c1');
        expect(fetched!.embedding).toBeInstanceOf(Uint8Array);
    });
});
