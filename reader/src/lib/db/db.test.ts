/**
 * SQLite 数据层测试（TDD 先行）
 *
 * - 每个测试使用独立临时数据库文件（os.tmpdir + 随机 uuid），互不干扰
 * - beforeEach：清空单例连接 + 生成新路径；afterEach：关闭连接 + 删除 db/-wal/-shm 文件
 * - 覆盖：createDb 幂等、pragma 设置、books CRUD 往返、createBookFromParse 默认值、
 *   章节插入/读取（charCount 自动计算）、删书级联删章节、getDb 单例
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Book, Chapter } from '../../types';
import {
  createBook,
  createBookFromParse,
  createDb,
  deleteBook,
  getBook,
  getChaptersByBook,
  getDb,
  insertChapter,
  listBooks,
  resetDb,
  updateBookStatus,
} from './index';

// ---------------------------------------------------------------------------
// 测试数据工厂
// ---------------------------------------------------------------------------

/** 生成随机临时数据库文件路径 */
function tmpDbPath(): string {
  return path.join(os.tmpdir(), `test-${crypto.randomUUID()}.db`);
}

/** 构造完整 Book 测试数据 */
function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '测试之书',
    author: '测试作者',
    coverPath: null,
    format: 'epub',
    filePath: `/tmp/fake-${crypto.randomUUID()}.epub`,
    fileHash: `hash-${crypto.randomUUID()}`,
    status: 'unread',
    grade: 1,
    totalChapters: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** 构造单章测试数据（charCount 默认 null，验证入库时自动计算） */
function makeChapter(bookId: string, index: number, charCount: number | null = null): Chapter {
  return {
    id: crypto.randomUUID(),
    bookId,
    index,
    title: `第 ${index} 章`,
    content: `content-${index}-`.padEnd(20 + index, 'x'),
    charCount,
  };
}

// ---------------------------------------------------------------------------
// 隔离：每个测试一个新临时路径
// ---------------------------------------------------------------------------

let dbPath = '';

beforeEach(() => {
  resetDb(); // 清掉上一个测试遗留的单例连接
  dbPath = tmpDbPath();
});

afterEach(() => {
  resetDb(); // 关闭单例连接（若有）
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // 清理失败不影响断言结果
    }
  }
  dbPath = '';
});

// ---------------------------------------------------------------------------
// createDb
// ---------------------------------------------------------------------------

describe('createDb', () => {
  it('连续调用两次不报错（IF NOT EXISTS 幂等建表）', () => {
    const a = createDb(dbPath);
    const b = createDb(dbPath);
    expect(a.open).toBe(true);
    expect(b.open).toBe(true);
    a.close();
    b.close();
  });

  it('设置 WAL / busy_timeout / foreign_keys pragma', () => {
    const db = getDb(dbPath);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// books CRUD
// ---------------------------------------------------------------------------

describe('books CRUD', () => {
  it('createBook → getBook 往返字段一致', () => {
    getDb(dbPath); // 初始化单例连接
    const book = makeBook();
    const created = createBook(book);
    expect(created).toEqual(book);
    expect(getBook(book.id)).toEqual(book);
  });

  it('getBook 对不存在的书返回 null', () => {
    getDb(dbPath);
    expect(getBook('no-such-id')).toBeNull();
  });

  it('listBooks 返回全部书籍（createdAt 升序）', () => {
    getDb(dbPath);
    const b1 = makeBook({
      id: crypto.randomUUID(),
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const b2 = makeBook({
      id: crypto.randomUUID(),
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    createBook(b1);
    createBook(b2);
    const books = listBooks();
    expect(books).toHaveLength(2);
    expect(books.map((b) => b.id)).toEqual([b1.id, b2.id]);
  });

  it('updateBookStatus 更新 status/grade/updatedAt', () => {
    getDb(dbPath);
    const book = makeBook({
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    createBook(book);
    const updated = updateBookStatus(book.id, 'reading', 3);
    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('reading');
    expect(updated?.grade).toBe(3);
    expect(updated?.updatedAt).not.toBe(book.updatedAt);
    // 省略 grade 时保留原分级
    const updated2 = updateBookStatus(book.id, 'finished');
    expect(updated2?.status).toBe('finished');
    expect(updated2?.grade).toBe(3);
  });

  it('updateBookStatus 对不存在的书返回 null', () => {
    getDb(dbPath);
    expect(updateBookStatus('no-such-id', 'reading')).toBeNull();
  });

  it('createBookFromParse 补全默认字段并持久化', () => {
    getDb(dbPath);
    const book = createBookFromParse({
      id: crypto.randomUUID(),
      title: '解析之书',
      author: '解析作者',
      format: 'epub',
      filePath: '/tmp/parsed.epub',
      fileHash: 'parsed-hash',
      totalChapters: 5,
    });
    expect(book.status).toBe('unread');
    expect(book.grade).toBe(1);
    expect(book.coverPath).toBeNull();
    expect(book.createdAt).toBeTypeOf('string');
    expect(book.updatedAt).toBeTypeOf('string');
    expect(getBook(book.id)).toEqual(book);
  });

  it('deleteBook 删除成功返回 true，重复删除返回 false', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);
    expect(deleteBook(book.id)).toBe(true);
    expect(getBook(book.id)).toBeNull();
    expect(deleteBook(book.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// chapters
// ---------------------------------------------------------------------------

describe('chapters', () => {
  it('insertChapter → getChaptersByBook 读取一致（index 升序 + charCount）', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);
    const c0 = makeChapter(book.id, 0); // charCount null → 入库时自动计算
    const c1 = makeChapter(book.id, 1, 42); // 显式 charCount → 保留
    const returned = insertChapter(c0);
    expect(returned.charCount).toBe(c0.content.length);
    insertChapter(c1);
    const chapters = getChaptersByBook(book.id);
    expect(chapters).toHaveLength(2);
    expect(chapters.map((c) => c.index)).toEqual([0, 1]);
    expect(chapters.map((c) => c.title)).toEqual([c0.title, c1.title]);
    expect(chapters.map((c) => c.content)).toEqual([c0.content, c1.content]);
    expect(chapters.map((c) => c.charCount)).toEqual([c0.content.length, 42]);
  });

  it('getChaptersByBook 对无章节的书返回空数组', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);
    expect(getChaptersByBook(book.id)).toEqual([]);
  });

  it('删书级联删除章节（foreign_keys=ON）', () => {
    const db = getDb(dbPath);
    const book = makeBook();
    createBook(book);
    insertChapter(makeChapter(book.id, 0));
    insertChapter(makeChapter(book.id, 1));
    expect(getChaptersByBook(book.id)).toHaveLength(2);
    expect(deleteBook(book.id)).toBe(true);
    expect(getChaptersByBook(book.id)).toHaveLength(0);
    // 直接查库确认级联生效
    const row = db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM chapters')
      .get();
    expect(row?.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDb 单例
// ---------------------------------------------------------------------------

describe('getDb 单例', () => {
  it('重复调用返回同一连接', () => {
    const a = getDb(dbPath);
    const b = getDb(dbPath);
    expect(b).toBe(a);
  });

  it('resetDb 之后重新创建新连接', () => {
    const a = getDb(dbPath);
    resetDb();
    const b = getDb(dbPath);
    expect(b).not.toBe(a);
    expect(b.open).toBe(true);
  });
});
