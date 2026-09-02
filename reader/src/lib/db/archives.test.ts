/**
 * 读书档案 CRUD 测试
 *
 * 使用临时数据库验证：
 * - upsertArchive：首次插入 / 重复 upsert 更新而非新增
 * - getArchiveByBook：按 bookId 查询
 * - deleteArchive：删除档案
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createDb, resetDb, getDb } from './index';
import type { ReadingArchive } from '../../types';
import {
  getArchiveByBook,
  upsertArchive,
  deleteArchive,
} from './archives';

describe('archives', () => {
  let tmpDbPath: string;

  beforeAll(() => {
    // 创建临时数据库路径
    tmpDbPath = path.join(process.cwd(), 'test-temp-' + Date.now() + '.db');
    resetDb();
    createDb(tmpDbPath);
  });

  afterAll(() => {
    // 清理临时数据库
    resetDb();
    if (fs.existsSync(tmpDbPath)) {
      fs.unlinkSync(tmpDbPath);
      // 清理 WAL 文件
      const walPath = tmpDbPath + '-wal';
      const shmPath = tmpDbPath + '-shm';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    }
  });

  /** 辅助函数：插入测试书籍（满足外键约束） */
  function insertTestBook(bookId: string) {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO books (id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bookId,
      '测试书籍',
      '测试作者',
      null,
      'epub',
      '/path/to/book.epub',
      'hash-' + bookId,
      'unread',
      1,
      10,
      now,
      now
    );
  }

  test('upsertArchive: 首次插入返回新记录', () => {
    insertTestBook('book-001');
    const input = {
      bookId: 'book-001',
      purpose: '学习系统思维',
      keyTakeaways: '核心收获 1',
      actionPlan: '行动计划 1',
      output: '输出记录 1',
      aiDraft: JSON.stringify({ summary: '摘要' }),
    };

    const result = upsertArchive(input);

    expect(result).toMatchObject({
      bookId: input.bookId,
      purpose: input.purpose,
      keyTakeaways: input.keyTakeaways,
      actionPlan: input.actionPlan,
      output: input.output,
      aiDraft: input.aiDraft,
    });
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  test('upsertArchive: 重复 upsert 更新而非新增', () => {
    // 先插入书籍以满足外键约束
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO books (id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('book-002', '测试书籍 2', '作者 2', null, 'epub', '/path/2', 'hash-2', 'unread', 1, 10, now, now);

    const input1 = {
      bookId: 'book-002',
      purpose: '目的 1',
      keyTakeaways: '收获 1',
      actionPlan: '计划 1',
      output: '输出 1',
      aiDraft: '{}',
    };

    upsertArchive(input1);

    const input2 = {
      bookId: 'book-002',
      purpose: '目的 2',
      keyTakeaways: '收获 2',
      actionPlan: '计划 2',
      output: '输出 2',
      aiDraft: '{"summary":"新摘要"}',
    };

    const result = upsertArchive(input2);

    expect(result.purpose).toBe(input2.purpose);
    expect(result.keyTakeaways).toBe(input2.keyTakeaways);
    expect(result.actionPlan).toBe(input2.actionPlan);
    expect(result.output).toBe(input2.output);

    // 查询确认只有一条记录
    const archive = getArchiveByBook('book-002');
    expect(archive).toMatchObject({ purpose: input2.purpose });
  });

  test('getArchiveByBook: 存在时返回档案', () => {
    insertTestBook('book-003');
    const input = {
      bookId: 'book-003',
      purpose: '测试查询',
      keyTakeaways: '收获',
      actionPlan: '计划',
      output: '输出',
      aiDraft: '{}',
    };

    upsertArchive(input);

    const result = getArchiveByBook('book-003');

    expect(result).toMatchObject({
      bookId: 'book-003',
      purpose: '测试查询',
    });
  });

  test('getArchiveByBook: 不存在时返回 null', () => {
    const result = getArchiveByBook('non-existent-book');
    expect(result).toBeNull();
  });

  test('deleteArchive: 存在时返回 true 并删除', () => {
    insertTestBook('book-004');
    const input = {
      bookId: 'book-004',
      purpose: '待删除',
      keyTakeaways: '收获',
      actionPlan: '计划',
      output: '输出',
      aiDraft: '{}',
    };

    upsertArchive(input);

    const deleted = deleteArchive('book-004');
    expect(deleted).toBe(true);

    const archive = getArchiveByBook('book-004');
    expect(archive).toBeNull();
  });

  test('deleteArchive: 不存在时返回 false', () => {
    const result = deleteArchive('non-existent-book');
    expect(result).toBe(false);
  });
});
