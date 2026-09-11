import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../db/index.js';
import { migrateAll } from '../db/migrations.js';
import { load as loadSqliteVec, getLoadablePath } from 'sqlite-vec';
import type { Chunk } from '../db/types.js';
import type { RetrievalHit, SearchContext } from './types.js';
import { HybridRetriever } from './retrieval.js';

function makeChunk(overrides: Partial<Chunk> = {}): Chunk {
    return {
        id: 'c1',
        bookId: 'b1',
        content: '测试内容',
        updatedAt: 1000,
        ...overrides,
    };
}

describe('HybridRetriever', () => {
    let db: Database;
    let retriever: HybridRetriever;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:', localDbPath: ':memory:' });
        migrateAll(db);
        db.mainDb.exec("INSERT INTO books(id, file_path, format, title, tags, progress, added_at, updated_at) VALUES ('b1', '/test.epub', 'epub', '测试书', '[]', 0, 1000, 1000)");

        // 加载 sqlite-vec 扩展（vec0 模块）
        loadSqliteVec(db.localDb!);

        // vec0 虚拟表（向量 KNN）
        db.localDb!.exec("CREATE VIRTUAL TABLE chunks_vec USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[4])");

        // 插入 chunks（含 embedding BLOB）+ FTS5
        const vectors = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, 1, 0])];
        const contents = ['投资哲学与价值评估', '芒格的投资原则', '文学创作技巧'];

        for (let i = 0; i < 3; i++) {
            const vec = vectors[i]!;
            db.localDb!.prepare('INSERT INTO chunks (id, book_id, content, embedding, updated_at) VALUES (?, ?, ?, ?, ?)').run(`c${i + 1}`, 'b1', contents[i]!, Buffer.from(vec.buffer), 1000);
        }

        // vec0 子查询同步（从 chunks.embedding BLOB → vec0）
        db.localDb!.exec('INSERT INTO chunks_vec(chunk_id, embedding) SELECT id, embedding FROM chunks');

        retriever = new HybridRetriever(db.localDb!);
    });

    it('S4: FTS5 + vec0 KNN → RRF 融合', async () => {
        const queryVec = [1, 0, 0, 0]; // 与 c1 向量相同
        const results = await retriever.search('投资', { bookId: 'b1', topK: 3 }, queryVec);

        expect(results.length).toBeGreaterThanOrEqual(1);
        // c1 在两个源中排名都最高 → RRF 分数最高
        expect(results[0]!.cfi).toBe('c1');
    });

    it('S7: 无 chunks → 空数组', async () => {
        db.localDb!.exec('DELETE FROM chunks');
        db.localDb!.exec('DELETE FROM chunks_vec');

        const results = await retriever.search('投资', { bookId: 'b1' }, [0, 0, 0, 0]);
        expect(results).toEqual([]);
    });

    it('仅 FTS5 命中（vec0 无结果）', async () => {
        // vec0 表为空（未同步向量）
        db.localDb!.exec('DELETE FROM chunks_vec');

        const results = await retriever.search('文学', { bookId: 'b1' }, [0, 0, 0, 0]);
        // c3 包含"文学" → FTS5 命中
        expect(results.some(h => h.cfi === 'c3' && h.source === 'fts')).toBe(true);
    });

    it('仅 vec0 命中（FTS5 无结果）', async () => {
        // FTS5 中无匹配（query 用不存在的词）
        const results = await retriever.search('量子物理', { bookId: 'b1' }, [0, 0, 1, 0]);
        // c3 向量最接近 [0,0,1,0] → vec 命中
        expect(results.some(h => h.cfi === 'c3' && h.source === 'vector')).toBe(true);
    });

    it('RRF 融合排序正确（双源命中排第一）', async () => {
        const results = await retriever.search('投资', { bookId: 'b1', topK: 3 }, [1, 0, 0, 0]);
        // c1 在 FTS(LIKE) + vec(KNN) 双源命中 → RRF 分数最高，排第一
        expect(results[0]!.cfi).toBe('c1');
        expect(results[0]!.source).toBe('hybrid');
    });
});
