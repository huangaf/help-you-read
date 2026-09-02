/**
 * Highlights CRUD 测试（TDD 先行）
 *
 * - 每个测试使用独立临时数据库文件（os.tmpdir + 随机 uuid），互不干扰
 * - beforeEach：清空单例连接 + 生成新路径；afterEach：关闭连接 + 删除 db/-wal/-shm 文件
 * - 覆盖：createHighlight 往返字段一致、getHighlightsByBook 按书过滤、deleteHighlight 后消失、
 *   外键约束（bookId 不存在报错）、updateHighlightNote 更新批注
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createBook,
  createDb,
  deleteBook,
  getDb,
  resetDb,
} from './index';
import {
  createHighlight,
  deleteHighlight,
  getHighlight,
  getHighlightsByBook,
  updateHighlightNote,
} from './highlights';
import type { Book } from '../../types';

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
// createHighlight
// ---------------------------------------------------------------------------

describe('createHighlight', () => {
  it('createHighlight → getHighlight 往返字段一致（camelCase）', () => {
    getDb(dbPath); // 初始化单例连接
    const book = makeBook();
    createBook(book); // 先建书，满足外键约束

    const highlight = createHighlight({
      bookId: book.id,
      quote: '这是原文摘录',
      cfi: 'epubcfi(/1/4)',
      color: 'yellow',
      note: '这是批注',
      chapterId: null,
      pageRef: null,
    });

    expect(highlight.id).toBeDefined();
    expect(highlight.bookId).toBe(book.id);
    expect(highlight.quote).toBe('这是原文摘录');
    expect(highlight.cfi).toBe('epubcfi(/1/4)');
    expect(highlight.color).toBe('yellow');
    expect(highlight.note).toBe('这是批注');
    expect(highlight.chapterId).toBeNull();
    expect(highlight.pageRef).toBeNull();
    expect(highlight.createdAt).toBeTypeOf('string');
    expect(highlight.updatedAt).toBe(highlight.createdAt);

    // 从数据库读取验证往返一致
    const fromDb = getHighlight(highlight.id);
    expect(fromDb).toEqual(highlight);
  });

  it('createHighlight 默认 color=yellow', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '测试默认颜色',
      cfi: null,
    });

    expect(highlight.color).toBe('yellow');
  });

  it('createHighlight 允许 null 字段（cfi/pageRef/note/chapterId）', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '最小字段高亮',
      cfi: null,
      note: null,
      pageRef: null,
      chapterId: null,
    });

    expect(highlight.cfi).toBeNull();
    expect(highlight.note).toBeNull();
    expect(highlight.pageRef).toBeNull();
    expect(highlight.chapterId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getHighlightsByBook
// ---------------------------------------------------------------------------

describe('getHighlightsByBook', () => {
  it('getHighlightsByBook 按书过滤（不同书的高亮不混）', () => {
    getDb(dbPath);
    const book1 = makeBook({ id: crypto.randomUUID() });
    const book2 = makeBook({ id: crypto.randomUUID() });
    createBook(book1);
    createBook(book2);

    const h1 = createHighlight({
      bookId: book1.id,
      quote: '书 1 的高亮',
      cfi: null,
    });
    const h2 = createHighlight({
      bookId: book1.id,
      quote: '书 1 的另一高亮',
      cfi: null,
    });
    const h3 = createHighlight({
      bookId: book2.id,
      quote: '书 2 的高亮',
      cfi: null,
    });

    const highlights1 = getHighlightsByBook(book1.id);
    const highlights2 = getHighlightsByBook(book2.id);

    expect(highlights1).toHaveLength(2);
    expect(highlights1.map((h) => h.quote)).toContain('书 1 的高亮');
    expect(highlights1.map((h) => h.quote)).toContain('书 1 的另一高亮');

    expect(highlights2).toHaveLength(1);
    expect(highlights2[0].quote).toBe('书 2 的高亮');
  });

  it('getHighlightsByBook 对无高亮的书返回空数组', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    expect(getHighlightsByBook(book.id)).toEqual([]);
  });

  it('getHighlightsByBook 按 createdAt 升序排序', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const h1 = createHighlight({ bookId: book.id, quote: '先创建', cfi: null });
    // 短暂延时确保时间戳不同
    const h2 = createHighlight({ bookId: book.id, quote: '后创建', cfi: null });

    const highlights = getHighlightsByBook(book.id);
    expect(highlights[0].quote).toBe('先创建');
    expect(highlights[1].quote).toBe('后创建');
  });
});

// ---------------------------------------------------------------------------
// updateHighlightNote
// ---------------------------------------------------------------------------

describe('updateHighlightNote', () => {
  it('updateHighlightNote 更新批注并刷新 updatedAt', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '测试批注更新',
      cfi: null,
      note: '初始批注',
    });

    expect(highlight.note).toBe('初始批注');

    const updated = updateHighlightNote(highlight.id, '更新后的批注');

    expect(updated).not.toBeNull();
    expect(updated?.note).toBe('更新后的批注');
    expect(updated?.updatedAt).toBeTypeOf('string');
  });

  it('updateHighlightNote 对不存在的高亮返回 null', () => {
    getDb(dbPath);
    expect(updateHighlightNote('no-such-id', '批注')).toBeNull();
  });

  it('updateHighlightNote 可以将批注设为 null', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '测试清空批注',
      cfi: null,
      note: '初始批注',
    });

    const updated = updateHighlightNote(highlight.id, null);

    expect(updated?.note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteHighlight
// ---------------------------------------------------------------------------

describe('deleteHighlight', () => {
  it('deleteHighlight 删除成功返回 true，删除后 getHighlight 返回 null', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '测试删除',
      cfi: null,
    });

    expect(deleteHighlight(highlight.id)).toBe(true);
    expect(getHighlight(highlight.id)).toBeNull();
  });

  it('deleteHighlight 对不存在的高亮返回 false', () => {
    getDb(dbPath);
    expect(deleteHighlight('no-such-id')).toBe(false);
  });

  it('deleteHighlight 重复删除返回 false', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const highlight = createHighlight({
      bookId: book.id,
      quote: '测试重复删除',
      cfi: null,
    });

    expect(deleteHighlight(highlight.id)).toBe(true);
    expect(deleteHighlight(highlight.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 外键约束
// ---------------------------------------------------------------------------

describe('外键约束', () => {
  it('createHighlight 时 bookId 不存在应报错（foreign_keys=ON）', () => {
    getDb(dbPath);
    // 不创建书，直接用不存在的 bookId

    expect(() =>
      createHighlight({
        bookId: 'non-existent-book-id',
        quote: '测试外键约束',
        cfi: null,
      })
    ).toThrow();
  });

  it('删书级联删除高亮（ON DELETE CASCADE）', () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const h1 = createHighlight({ bookId: book.id, quote: '高亮 1', cfi: null });
    const h2 = createHighlight({ bookId: book.id, quote: '高亮 2', cfi: null });

    expect(getHighlightsByBook(book.id)).toHaveLength(2);

    // 删书
    deleteBook(book.id);

    // 高亮应被级联删除
    expect(getHighlightsByBook(book.id)).toHaveLength(0);
    expect(getHighlight(h1.id)).toBeNull();
    expect(getHighlight(h2.id)).toBeNull();
  });
});
