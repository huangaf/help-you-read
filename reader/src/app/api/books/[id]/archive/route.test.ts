/**
 * 读书档案 API 测试
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import { resetDb, createDb, getDb } from '@/lib/db';
import { upsertArchive } from '@/lib/db/archives';

vi.mock('@/lib/ai/archive', () => ({
  generateArchive: vi.fn().mockResolvedValue({
    summary: '全书摘要',
    keyTakeaways: ['核心收获 1', '核心收获 2', '核心收获 3'],
    actionPlan: ['行动计划 1', '行动计划 2'],
    output: '输出建议',
  }),
}));

import { generateArchive } from '@/lib/ai/archive';
import { handleGet, handlePost } from '@/app/api/books/[id]/archive/route';

describe('archive route', () => {
  let tmpDbPath: string;

  beforeEach(() => {
    tmpDbPath = path.join('/tmp', 'test-api-' + Date.now() + Math.random() + '.db');
    resetDb();
    createDb(tmpDbPath);
    getDb(); // 触发 getDb 使用新创建的数据库
  });

  afterEach(() => {
    // 关闭数据库连接
    const g = globalThis as unknown as { __readerDb?: { open: boolean; close(): void } };
    if (g.__readerDb && g.__readerDb.open) {
      g.__readerDb.close();
    }
    g.__readerDb = undefined;
    resetDb();

    if (fs.existsSync(tmpDbPath)) {
      fs.unlinkSync(tmpDbPath);
      const walPath = tmpDbPath + '-wal';
      const shmPath = tmpDbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    }
  });

  function insertBook(id: string) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books (id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, '测试书', '作者', null, 'epub', '/path', 'hash', 'unread', 1, 10, now, now);
  }

  function insertChapter(bookId: string, id: string, index: number) {
    const db = getDb();
    db.prepare(
      `INSERT INTO chapters (id, book_id, "index", title, content, char_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, bookId, index, '第一章', '第一章内容', 100);
  }

  test('GET 无档案返回 null', async () => {
    insertBook('book-001');

    const req = new Request(`http://localhost/api/books/book-001/archive`);
    const res = await handleGet(req, { params: Promise.resolve({ id: 'book-001' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.archive).toBeNull();
  });

  test('GET 有档案返回档案', async () => {
    insertBook('book-002');
    upsertArchive({
      bookId: 'book-002',
      purpose: '读书目的',
      keyTakeaways: '核心收获',
      actionPlan: '行动计划',
      output: '输出',
      aiDraft: '{}',
    });

    const req = new Request(`http://localhost/api/books/book-002/archive`);
    const res = await handleGet(req, { params: Promise.resolve({ id: 'book-002' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.archive).toMatchObject({ bookId: 'book-002', purpose: '读书目的' });
  });

  test('POST bookId 不存在返回 404', async () => {
    const req = new Request(`http://localhost/api/books/non-existent/archive`, {
      method: 'POST',
      body: JSON.stringify({ purpose: '目的' }),
    });
    const res = await handlePost(req, { params: Promise.resolve({ id: 'non-existent' }) });

    expect(res.status).toBe(404);
  });

  test('POST 成功生成档案', async () => {
    insertBook('book-003');
    insertChapter('book-003', 'chap-001', 0);

    const req = new Request(`http://localhost/api/books/book-003/archive`, {
      method: 'POST',
      body: JSON.stringify({ purpose: '学习系统思维' }),
    });
    const res = await handlePost(req, { params: Promise.resolve({ id: 'book-003' }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.archive).toMatchObject({
      bookId: 'book-003',
      purpose: '学习系统思维',
    });
    expect(generateArchive).toHaveBeenCalled();
  });

  test('POST 生成后 GET 有档案', async () => {
    insertBook('book-004');
    insertChapter('book-004', 'chap-002', 0);

    const postReq = new Request(`http://localhost/api/books/book-004/archive`, {
      method: 'POST',
      body: JSON.stringify({ purpose: '目的' }),
    });
    await handlePost(postReq, { params: Promise.resolve({ id: 'book-004' }) });

    const getReq = new Request(`http://localhost/api/books/book-004/archive`);
    const getRes = await handleGet(getReq, { params: Promise.resolve({ id: 'book-004' }) });

    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    expect(data.archive).toMatchObject({ bookId: 'book-004', purpose: '目的' });
  });
});
