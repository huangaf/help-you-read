/**
 * EpubImportDb 适配层测试（TDD 先行）
 *
 * - 用临时 db（getDb(tmpPath)+resetDb()）
 * - 断言 EpubImportDb 接口可用：findBookByFileHash/createBook/insertChapter 往返
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { getDb, resetDb } from './index';
import { getEpubImportDb } from './epubDbAdapter';
import type { Book, Chapter } from '../../types';

describe('getEpubImportDb', () => {
  let dbPath: string;

  beforeEach(() => {
    resetDb();
    dbPath = path.join(os.tmpdir(), `epubdb-${uuidv4()}.db`);
  });

  afterEach(() => {
    resetDb();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
  });

  it('findBookByFileHash 对不存在的哈希返回 null', () => {
    const db = getEpubImportDb(dbPath);
    const result = db.findBookByFileHash('non-existent-hash');
    expect(result).toBeNull();
  });

  it('createBook → findBookByFileHash 往返一致', () => {
    const db = getEpubImportDb(dbPath);
    const input = {
      id: uuidv4(),
      title: '测试之书',
      author: '测试作者',
      coverPath: null,
      format: 'epub' as const,
      filePath: '/tmp/test.epub',
      fileHash: 'test-hash-123',
      status: 'unread' as const,
      grade: 1 as const,
      totalChapters: 2,
    };

    const book = db.createBook(input);

    expect(book.id).toBe(input.id);
    expect(book.title).toBe(input.title);
    expect(book.author).toBe(input.author);
    expect(book.format).toBe(input.format);
    expect(book.fileHash).toBe(input.fileHash);
    expect(book.status).toBe('unread');
    expect(book.grade).toBe(1);
    expect(book.createdAt).toBeTypeOf('string');
    expect(book.updatedAt).toBeTypeOf('string');

    // 验证 findBookByFileHash 能找到
    const found = db.findBookByFileHash(input.fileHash);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(book.id);
    expect(found?.title).toBe(book.title);
  });

  it('insertChapter → getChaptersByBook 读取一致', () => {
    const db = getEpubImportDb(dbPath);
    const bookInput = {
      id: uuidv4(),
      title: '测试之书',
      author: null,
      coverPath: null,
      format: 'epub' as const,
      filePath: '/tmp/test.epub',
      fileHash: 'hash-chapter-test',
      status: 'unread' as const,
      grade: 1 as const,
      totalChapters: 2,
    };
    const book = db.createBook(bookInput);

    const chapter0 = {
      bookId: book.id,
      index: 0,
      title: '第一章',
      content: '第一章内容测试',
      charCount: 6,
    };
    const chapter1 = {
      bookId: book.id,
      index: 1,
      title: '第二章',
      content: '第二章内容测试',
      charCount: 6,
    };

    const ch0 = db.insertChapter(chapter0);
    const ch1 = db.insertChapter(chapter1);

    expect(ch0.bookId).toBe(book.id);
    expect(ch0.index).toBe(0);
    expect(ch0.title).toBe('第一章');
    expect(ch0.content).toBe('第一章内容测试');
    expect(ch0.charCount).toBe(6);

    expect(ch1.bookId).toBe(book.id);
    expect(ch1.index).toBe(1);
    expect(ch1.title).toBe('第二章');

    // 验证 getChaptersByBook 能读到
    const chapters = getChaptersByBook(book.id);
    expect(chapters).toHaveLength(2);
    expect(chapters.map(c => c.index)).toEqual([0, 1]);
    expect(chapters.map(c => c.title)).toEqual(['第一章', '第二章']);
  });

  it('重复导入同一 fileHash：findBookByFileHash 返回第一本', () => {
    const db = getEpubImportDb(dbPath);
    const input = {
      id: uuidv4(),
      title: '重复测试',
      author: null,
      coverPath: null,
      format: 'epub' as const,
      filePath: '/tmp/dupe.epub',
      fileHash: 'dupe-hash',
      status: 'unread' as const,
      grade: 1 as const,
      totalChapters: 1,
    };

    const first = db.createBook(input);

    const found = db.findBookByFileHash(input.fileHash);
    expect(found?.id).toBe(first.id);
    expect(found?.title).toBe(first.title);
  });
});

/** 从 db/index.ts 导入（测试复用） */
function getChaptersByBook(bookId: string): Chapter[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, book_id, "index", title, content, char_count
       FROM chapters WHERE book_id = ? ORDER BY "index" ASC`,
    )
    .all(bookId) as Array<{
      id: string;
      book_id: string;
      index: number;
      title: string;
      content: string;
      char_count: number | null;
    }>;

  return rows.map(row => ({
    id: row.id,
    bookId: row.book_id,
    index: row.index,
    title: row.title,
    content: row.content,
    charCount: row.char_count,
  }));
}
