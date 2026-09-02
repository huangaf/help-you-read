/**
 * GET /api/books/[id]/file 路由测试
 *
 * - 测试书籍存在且文件存在返回 200 + binary
 * - 书籍不存在返回 404
 * - 文件不存在返回 404
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET } from './route';
import { createBook, createDb, getDb, resetDb } from '@/lib/db';
import type { Book } from '@/types';

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `test-file-${Date.now()}-${Math.random()}.db`);
}

function makeBook(overrides: Partial<Book> = {}): Book {
  const now = new Date().toISOString();
  return {
    id: 'test-book-001',
    title: '测试之书',
    author: '测试作者',
    coverPath: null,
    format: 'epub',
    filePath: '/tmp/test.epub',
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
let testEpubPath = '';

beforeEach(() => {
  resetDb();
  dbPath = tmpDbPath();
  getDb(dbPath);
  
  // 创建测试 EPUB 文件
  const booksDir = path.join(process.cwd(), 'data', 'books');
  fs.mkdirSync(booksDir, { recursive: true });
  testEpubPath = path.join(booksDir, 'test-book-001.epub');
  fs.writeFileSync(testEpubPath, 'fake epub content');
});

afterEach(() => {
  resetDb();
  const g = globalThis as unknown as { __readerDb?: { open: boolean; close(): void } };
  if (g.__readerDb && g.__readerDb.open) {
    g.__readerDb.close();
  }
  g.__readerDb = undefined;
  
  // 清理临时文件
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
  if (fs.existsSync(testEpubPath)) fs.unlinkSync(testEpubPath);
  const booksDir = path.join(process.cwd(), 'data', 'books');
  if (fs.existsSync(booksDir)) {
    try { fs.rmSync(booksDir, { recursive: true, force: true }); } catch {}
  }
});

describe('GET /api/books/[id]/file', () => {
  it('书籍存在且文件存在返回 200 + binary', async () => {
    const book = makeBook();
    createBook(book);

    const req = new Request(`http://localhost/api/books/test-book-001/file`);
    const res = await GET(req, { params: Promise.resolve({ id: 'test-book-001' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/epub+zip');
    
    const blob = await res.blob();
    expect(blob.size).toBeGreaterThan(0);
  });

  it('书籍不存在返回 404', async () => {
    const req = new Request(`http://localhost/api/books/non-existent/file`);
    const res = await GET(req, { params: Promise.resolve({ id: 'non-existent' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('书籍不存在');
  });

  it('文件不存在返回 404', async () => {
    const book = makeBook({ id: 'no-file-book' });
    createBook(book);

    const req = new Request(`http://localhost/api/books/no-file-book/file`);
    const res = await GET(req, { params: Promise.resolve({ id: 'no-file-book' }) });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('EPUB 文件不存在');
  });
});
