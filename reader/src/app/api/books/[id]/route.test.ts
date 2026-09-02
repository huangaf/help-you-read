/**
 * GET /api/books/[id] 路由测试
 *
 * - 测试书籍存在返回 200 + {book, chapters}
 * - 书籍不存在返回 404
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { GET } from './route';
import { createBook, createDb, getDb, resetDb, insertChapter } from '@/lib/db';
import type { Book } from '@/types';

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `test-book-detail-${Date.now()}-${Math.random()}.db`);
}

function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '测试之书',
    author: '测试作者',
    coverPath: null,
    format: 'epub',
    filePath: '/tmp/fake.epub',
    fileHash: 'hash-test',
    status: 'unread',
    grade: 1,
    totalChapters: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

let dbPath = '';

beforeEach(() => {
  resetDb();
  dbPath = tmpDbPath();
  getDb(dbPath);
});

afterEach(() => {
  resetDb();
  const g = globalThis as unknown as { __readerDb?: { open: boolean; close(): void } };
  if (g.__readerDb && g.__readerDb.open) {
    g.__readerDb.close();
  }
  g.__readerDb = undefined;

  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
});

describe('GET /api/books/[id]', () => {
  it('书籍存在返回 200 + {book, chapters}', async () => {
    const book = makeBook();
    createBook(book);
    insertChapter({ id: 'chap-1', bookId: book.id, index: 0, title: '第一章', content: '第一章内容', charCount: 4 });
    insertChapter({ id: 'chap-2', bookId: book.id, index: 1, title: '第二章', content: '第二章内容', charCount: 4 });

    const req = new Request(`http://localhost/api/books/${book.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: book.id }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.book).toMatchObject({
      id: book.id,
      title: '测试之书',
      author: '测试作者',
    });
    expect(data.chapters).toHaveLength(2);
    expect(data.chapters[0]).toMatchObject({
      index: 0,
      title: '第一章',
    });
    expect(data.chapters[1]).toMatchObject({
      index: 1,
      title: '第二章',
    });
  });

  it('书籍不存在返回 404', async () => {
    const req = new Request(`http://localhost/api/books/non-existent`);
    const res = await GET(req, { params: Promise.resolve({ id: 'non-existent' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('书籍不存在');
  });

  it('书籍存在但无章节返回空数组', async () => {
    const book = makeBook();
    createBook(book);

    const req = new Request(`http://localhost/api/books/${book.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: book.id }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.book).toBeDefined();
    expect(data.chapters).toEqual([]);
  });
});
