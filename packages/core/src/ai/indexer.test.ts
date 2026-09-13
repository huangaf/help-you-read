import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../db/index.js';
import { migrateAll } from '../db/migrations.js';
import { BookIndexer } from './indexer.js';
import { HybridRetriever } from './retrieval.js';

const embed4 = async (texts: string[]): Promise<number[][]> => texts.map(() => [1, 0, 0, 0]);

describe('BookIndexer', () => {
    let db: Database;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:', localDbPath: ':memory:' });
        migrateAll(db);
        db.mainDb.exec("INSERT INTO books(id, file_path, format, title, tags, progress, added_at, updated_at) VALUES ('b1', '/test.epub', 'epub', '测试书', '[]', 0, 1000, 1000)");
    });

    it('index(): 文本 → chunk+embed 入库，检索可命中', async () => {
        const indexer = new BookIndexer(db.localDb!);
        const count = await indexer.index('b1', '投资哲学与价值评估。芒格的投资原则。文学创作技巧。', embed4);
        expect(count).toBeGreaterThan(0);

        const retriever = new HybridRetriever(db.localDb!);
        const hits = await retriever.search('投资', { bookId: 'b1' }, [1, 0, 0, 0]);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some(h => h.text.includes('投资'))).toBe(true);
    });

    it('index(): 空文本 → 0 chunks，不建表', async () => {
        const indexer = new BookIndexer(db.localDb!);
        const count = await indexer.index('b1', '', async () => []);
        expect(count).toBe(0);
    });

    it('index(): 同书二次索引替换旧数据', async () => {
        const indexer = new BookIndexer(db.localDb!);
        await indexer.index('b1', '第一版内容甲。', embed4);
        await indexer.index('b1', '第二版内容乙。', embed4);

        const total = db.localDb!.prepare('SELECT COUNT(*) as n FROM chunks WHERE book_id = ?').get('b1') as { n: number };
        expect(total.n).toBeGreaterThan(0);
        const stale = db.localDb!.prepare("SELECT COUNT(*) as n FROM chunks WHERE book_id = 'b1' AND content LIKE '%第一版%'").get() as { n: number };
        expect(stale.n).toBe(0);
        const vecStale = db.localDb!.prepare("SELECT COUNT(*) as n FROM chunks_vec").get() as { n: number };
        expect(vecStale.n).toBe(total.n);
    });

    it('index(): embedding 维度不一致 → 抛错', async () => {
        const indexer = new BookIndexer(db.localDb!, { maxTokens: 3, overlap: 0 });
        const badEmbed = async (texts: string[]): Promise<number[][]> => texts.map((_, i) => (i === 0 ? [1, 0, 0, 0] : [1, 0]));
        await expect(indexer.index('b1', '甲。乙。', badEmbed)).rejects.toThrow(/维度/);
    });
});
