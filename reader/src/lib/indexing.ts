/**
 * 书籍索引（向量化 + BM25）
 *
 * - 分块：splitIntoChunks
 * - 向量化：embedTexts
 * - 存入 VectorStore（模块级单例）+ BM25（模块级单例）
 * - chunk id 格式：`${bookId}:${chapterIdx}:${chunkIdx}`
 * - 幂等：重复索引先移除该书旧 chunks
 */
import { embedTexts } from './vector/embedding';
import { VectorStore } from './vector/store';
import { BM25, type BM25Document } from './indexer/bm25';
import { splitIntoChunks } from './indexer/chunker';
import type { Chapter } from '@/types';

// 模块级单例
let vectorStoreInstance: VectorStore | null = null;
let bm25IndexInstance: BM25 | null = null;

/**
 * 获取 VectorStore 单例
 */
export function getVectorStore(): VectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
  }
  return vectorStoreInstance;
}

/**
 * 获取 BM25 索引单例
 */
export function getBm25Index(): BM25 {
  if (!bm25IndexInstance) {
    bm25IndexInstance = new BM25();
  }
  return bm25IndexInstance;
}

/**
 * 索引一本书
 *
 * @param bookId 书籍 ID
 * @param chapters 该书的章节列表
 * @param vectorStore 可选：自定义 VectorStore（测试用）；缺省用单例
 * @param bm25Index 可选：自定义 BM25 索引（测试用）；缺省用单例
 * @returns { chunkCount: number } 索引的 chunk 数量
 */
export async function indexBook(
  bookId: string,
  chapters: Chapter[],
  vectorStore?: VectorStore,
  bm25Index?: BM25,
): Promise<{ chunkCount: number }> {
  const store = vectorStore ?? getVectorStore();
  const bm25 = bm25Index ?? getBm25Index();

  // 幂等：先移除该书旧 chunks
  const oldChunkIds = getChunkIdsForBook(bookId, store);
  if (oldChunkIds.length > 0) {
    store.remove(oldChunkIds);
    // BM25 移除：逐个删除
    for (const id of oldChunkIds) {
      removeDocFromBm25(bm25, id);
    }
  }

  // 分块
  const chunks: { id: string; text: string }[] = [];

  for (const [chapterIdx, chapter] of chapters.entries()) {
    const chunkTexts = splitIntoChunks(chapter.content);

    for (const [chunkIdx, text] of chunkTexts.entries()) {
      const chunkId = `${bookId}:${chapterIdx}:${chunkIdx}`;
      chunks.push({ id: chunkId, text });
    }
  }

  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  // 向量化
  const texts = chunks.map(c => c.text);
  const vectors = await embedTexts(texts);

  // 存入 VectorStore
  for (const [i, chunk] of chunks.entries()) {
    store.add(chunk.id, vectors[i]);
  }

  // 存入 BM25
  const bm25Docs: BM25Document[] = chunks.map(c => ({ id: c.id, text: c.text }));
  bm25.indexDocuments(bm25Docs);

  return { chunkCount: chunks.length };
}

/**
 * 获取某书的所有 chunk ID
 */
function getChunkIdsForBook(bookId: string, store: VectorStore): string[] {
  // 通过内部 entries Map 访问（测试友好）
  const entries = (store as unknown as { entries: Map<string, number[]> }).entries;
  if (!entries) return [];

  const prefix = `${bookId}:`;
  const ids: string[] = [];
  for (const [id] of entries.entries()) {
    if (id.startsWith(prefix)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * 从 BM25 删除一个文档
 *
 * BM25 没有 public remove API，这里通过访问内部方法实现。
 */
function removeDocFromBm25(bm25: BM25, id: string): void {
  // 访问内部 removeDoc 方法（private，通过类型断言调用）
  const internalBm25 = bm25 as unknown as {
    docs: Array<{ id: string; tf: Map<string, number>; len: number }>;
    idToPos: Map<string, number>;
    docFreq: Map<string, number>;
    removeDoc: (id: string) => void;
  };

  if (internalBm25.idToPos.has(id)) {
    internalBm25.removeDoc(id);
  }
}
