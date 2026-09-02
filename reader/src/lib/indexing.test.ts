/**
 * 书籍索引测试（TDD 先行）
 *
 * - mock embedTexts（返回假向量）
 * - 构造章节 → indexBook → 断言 VectorStore/BM25 有对应 chunks
 * - 幂等：重复索引不重复
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { VectorStore } from './vector/store';
import { BM25 } from './indexer/bm25';
import { splitIntoChunks } from './indexer/chunker';
import { indexBook, getVectorStore, getBm25Index } from './indexing';
import type { Chapter } from '@/types';

// Mock embedTexts
vi.mock('./vector/embedding', () => ({
  embedTexts: vi.fn().mockResolvedValue([
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.2, 0.3, 0.4, 0.5, 0.6],
  ]),
}));

import { embedTexts } from './vector/embedding';

describe('indexBook', () => {
  let testVectorStore: VectorStore;
  let testBm25Index: BM25;

  beforeEach(() => {
    // 创建新的测试实例
    testVectorStore = new VectorStore();
    testBm25Index = new BM25();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('对空章节数组返回 0 chunk', async () => {
    const bookId = uuidv4();
    const chapters: Chapter[] = [];

    const { chunkCount } = await indexBook(bookId, chapters, testVectorStore, testBm25Index);

    expect(chunkCount).toBe(0);
    expect(testVectorStore.size).toBe(0);
    expect(testBm25Index.size).toBe(0);
  });

  it('单章文本被正确分块、向量化并索引', async () => {
    const bookId = uuidv4();
    const chapters: Chapter[] = [
      {
        id: `${bookId}-ch0`,
        bookId,
        index: 0,
        title: '第一章',
        content: '这是第一章的内容，用于测试向量化索引。RIA 便签方法很重要。',
        charCount: 30,
      },
    ];

    const { chunkCount } = await indexBook(bookId, chapters, testVectorStore, testBm25Index);

    expect(chunkCount).toBeGreaterThan(0);
    expect(embedTexts).toHaveBeenCalled();

    // 验证 VectorStore 有条目
    expect(testVectorStore.size).toBe(chunkCount);

    // 验证 BM25 有文档
    expect(testBm25Index.size).toBe(chunkCount);

    // 验证检索能命中
    const hits = testBm25Index.search('RIA', 3);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('多章文本分别分块，chunk id 格式正确', async () => {
    const bookId = uuidv4();
    const chapters: Chapter[] = [
      {
        id: `${bookId}-ch0`,
        bookId,
        index: 0,
        title: '第一章',
        content: '第一章内容，测试分块。',
        charCount: 10,
      },
      {
        id: `${bookId}-ch1`,
        bookId,
        index: 1,
        title: '第二章',
        content: '第二章内容，继续测试。',
        charCount: 10,
      },
    ];

    await indexBook(bookId, chapters, testVectorStore, testBm25Index);

    // 验证 chunk id 格式：${bookId}:${chapterIdx}:${chunkIdx}
    const entries = (testVectorStore as unknown as { entries: Map<string, number[]> }).entries;
    for (const [id] of entries.entries()) {
      expect(id).toMatch(new RegExp(`^${bookId}:\\d+:\\d+$`));
    }
  });

  it('幂等：重复索引不重复（先移除该书旧 chunks）', async () => {
    const bookId = uuidv4();
    const chapters: Chapter[] = [
      {
        id: `${bookId}-ch0`,
        bookId,
        index: 0,
        title: '第一章',
        content: '幂等测试内容',
        charCount: 6,
      },
    ];

    // 第一次索引
    const result1 = await indexBook(bookId, chapters, testVectorStore, testBm25Index);
    const sizeAfterFirst = testVectorStore.size;

    // 第二次索引（相同内容）
    const result2 = await indexBook(bookId, chapters, testVectorStore, testBm25Index);
    const sizeAfterSecond = testVectorStore.size;

    expect(result1.chunkCount).toBe(result2.chunkCount);
    expect(sizeAfterFirst).toBe(sizeAfterSecond); // 不重复增加

    // BM25 同样幂等
    expect(testBm25Index.size).toBe(result2.chunkCount);
  });

  it('不同书籍的 chunks 互不干扰', async () => {
    const bookId1 = uuidv4();
    const bookId2 = uuidv4();

    const chapters1: Chapter[] = [
      {
        id: `${bookId1}-ch0`,
        bookId: bookId1,
        index: 0,
        title: '书 1 第一章',
        content: '第一本书的内容',
        charCount: 6,
      },
    ];

    const chapters2: Chapter[] = [
      {
        id: `${bookId2}-ch0`,
        bookId: bookId2,
        index: 0,
        title: '书 2 第一章',
        content: '第二本书的内容',
        charCount: 6,
      },
    ];

    await indexBook(bookId1, chapters1, testVectorStore, testBm25Index);
    const sizeAfterBook1 = testVectorStore.size;

    await indexBook(bookId2, chapters2, testVectorStore, testBm25Index);
    const sizeAfterBook2 = testVectorStore.size;

    expect(sizeAfterBook2).toBe(sizeAfterBook1 + 1); // 增加一章
  });

  it('分块大小符合预期（800 字块 / 200 字重叠）', async () => {
    const bookId = uuidv4();
    // 构造长文本（超过 800 字）
    const longContent = '测试'.repeat(1000); // 2000 字符
    const chapters: Chapter[] = [
      {
        id: `${bookId}-ch0`,
        bookId,
        index: 0,
        title: '长章节',
        content: longContent,
        charCount: longContent.length,
      },
    ];

    const { chunkCount } = await indexBook(bookId, chapters, testVectorStore, testBm25Index);

    // 2000 字符 / (800-200) 步长 ≈ 3-4 个块
    expect(chunkCount).toBeGreaterThan(1);
    expect(chunkCount).toBeLessThanOrEqual(5);
  });

  it('向量维度一致（所有 chunk 使用同一 embedding 模型）', async () => {
    const bookId = uuidv4();
    const chapters: Chapter[] = [
      {
        id: `${bookId}-ch0`,
        bookId,
        index: 0,
        title: '第一章',
        content: '第一章内容',
        charCount: 4,
      },
      {
        id: `${bookId}-ch1`,
        bookId,
        index: 1,
        title: '第二章',
        content: '第二章内容',
        charCount: 4,
      },
    ];

    await indexBook(bookId, chapters, testVectorStore, testBm25Index);

    // 验证所有向量维度一致
    const entries = (testVectorStore as unknown as { entries: Map<string, number[]> }).entries;
    const vectors = Array.from(entries.values());
    const firstDim = vectors[0].length;

    for (const vector of vectors) {
      expect(vector.length).toBe(firstDim);
    }
  });
});
