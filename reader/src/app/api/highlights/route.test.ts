/**
 * POST /api/highlights 路由测试（TDD 先行）
 *
 * - 每个测试使用独立临时数据库文件，互不干扰
 * - 直接调用 POST 处理函数（构造 Request 对象）
 * - 覆盖：合法请求 201 返回 Highlight、缺字段 400、bookId 不存在 404
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { POST } from './route';
import { createBook, createDb, getDb, resetDb } from '../../../lib/db';
import type { Book } from '../../../types';

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
  resetDb();
  dbPath = tmpDbPath();
});

afterEach(() => {
  resetDb();
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
// POST /api/highlights
// ---------------------------------------------------------------------------

describe('POST /api/highlights', () => {
  it('合法请求返回 201 + Highlight', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      bookId: book.id,
      quote: '这是原文摘录',
      cfi: 'epubcfi(/1/4)',
      color: 'yellow',
      note: '这是批注',
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.highlight).toBeDefined();
    expect(data.highlight.bookId).toBe(book.id);
    expect(data.highlight.quote).toBe('这是原文摘录');
    expect(data.highlight.cfi).toBe('epubcfi(/1/4)');
    expect(data.highlight.color).toBe('yellow');
    expect(data.highlight.note).toBe('这是批注');
  });

  it('缺 bookId 返回 400', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      quote: '这是原文摘录',
      cfi: 'epubcfi(/1/4)',
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('校验失败');
  });

  it('缺 quote 返回 400', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      bookId: book.id,
      cfi: 'epubcfi(/1/4)',
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('校验失败');
  });

  it('缺 cfi 返回 400（cfi 必填）', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      bookId: book.id,
      quote: '这是原文摘录',
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('校验失败');
  });

  it('bookId 不存在返回 404', async () => {
    getDb(dbPath);
    // 不创建书

    const requestBody = {
      bookId: 'non-existent-book-id',
      quote: '这是原文摘录',
      cfi: 'epubcfi(/1/4)',
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('书籍不存在');
  });

  it('color 可选，默认 yellow', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      bookId: book.id,
      quote: '测试默认颜色',
      cfi: null,
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.highlight.color).toBe('yellow');
  });

  it('note 可选，可为 null', async () => {
    getDb(dbPath);
    const book = makeBook();
    createBook(book);

    const requestBody = {
      bookId: book.id,
      quote: '测试无批注',
      cfi: null,
      note: null,
    };

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.highlight.note).toBeNull();
  });

  it('无效 JSON 请求体返回 400', async () => {
    getDb(dbPath);

    const request = new Request(`http://localhost/api/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('无效的 JSON 请求体');
  });
});

// ---------------------------------------------------------------------------
// GET /api/highlights
// ---------------------------------------------------------------------------

import { GET } from './route';
import { createHighlight } from '../../../lib/db/highlights';

describe('GET /api/highlights', () => {
  it('bookId 存在返回 200 + highlights 列表', async () => {
    const book = makeBook();
    createBook(book);
    
    // 创建两个高亮
    createHighlight({
      bookId: book.id,
      quote: '高亮 1',
      cfi: 'epubcfi(/1/4)',
      color: 'yellow',
    });
    createHighlight({
      bookId: book.id,
      quote: '高亮 2',
      cfi: 'epubcfi(/1/8)',
      color: 'green',
    });

    const req = new Request(`http://localhost/api/highlights?bookId=${book.id}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.highlights).toHaveLength(2);
    expect(data.highlights[0].quote).toBe('高亮 1');
    expect(data.highlights[1].quote).toBe('高亮 2');
  });

  it('缺少 bookId 返回 400', async () => {
    const req = new Request(`http://localhost/api/highlights`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('bookId 必填');
  });

  it('bookId 不存在返回 404', async () => {
    const req = new Request(`http://localhost/api/highlights?bookId=non-existent`);
    const res = await GET(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('书籍不存在');
  });

  it('无高亮返回空数组', async () => {
    const book = makeBook();
    createBook(book);

    const req = new Request(`http://localhost/api/highlights?bookId=${book.id}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.highlights).toEqual([]);
  });
});
