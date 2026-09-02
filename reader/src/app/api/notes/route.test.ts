/**
 * /api/notes 路由测试（TDD RED→GREEN）
 *
 * 测试要点：
 * - POST 合法 → 201 {note}
 * - POST 缺字段 → 400
 * - GET ?bookId=xxx → { notes: Note[] }
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

// mock 数据库模块
vi.mock('@/lib/db/notes', () => ({
  createNote: vi.fn(),
  getNotesByBook: vi.fn(),
}));

vi.mock('@/lib/db/index', () => ({
  resetDb: vi.fn(),
}));

import { POST, GET } from './route';
import type { Note } from '@/types';

// 模拟请求体
function makeRequestBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    bookId: 'book-' + crypto.randomUUID().slice(0, 8),
    type: 'I',
    content: '测试便签内容',
    highlightId: null,
    chapterId: null,
    sourceQuote: null,
    ...overrides,
  };
}

// 模拟 Note 对象
function makeNote(overrides: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    bookId: 'book-' + crypto.randomUUID().slice(0, 8),
    highlightId: null,
    chapterId: null,
    type: 'I',
    content: '测试便签内容',
    sourceQuote: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('POST /api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('合法请求 → 201 {note}', async () => {
    const { createNote } = await import('@/lib/db/notes');
    const mockNote = makeNote();
    vi.mocked(createNote).mockReturnValue(mockNote);

    const reqBody = makeRequestBody();
    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.note).toEqual(mockNote);
  });

  it('缺 bookId → 400', async () => {
    const reqBody = makeRequestBody();
    reqBody.bookId = undefined;

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('bookId');
  });

  it('缺 type → 400', async () => {
    const reqBody = makeRequestBody();
    reqBody.type = undefined;

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('type');
  });

  it('缺 content → 400', async () => {
    const reqBody = makeRequestBody();
    reqBody.content = undefined;

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('content');
  });

  it('type 无效 → 400', async () => {
    const reqBody = makeRequestBody({ type: 'invalid' });

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/notes', () => {
  it('?bookId=xxx → { notes: Note[] }', async () => {
    const { getNotesByBook } = await import('@/lib/db/notes');
    const mockNotes = [makeNote(), makeNote()];
    vi.mocked(getNotesByBook).mockReturnValue(mockNotes);

    const req = new NextRequest('http://localhost/api/notes?bookId=book-123');
    const res = await GET(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.notes).toEqual(mockNotes);
  });

  it('无 bookId 参数 → 返回全部（空数组）', async () => {
    const { getNotesByBook } = await import('@/lib/db/notes');
    vi.mocked(getNotesByBook).mockReturnValue([]);

    const req = new NextRequest('http://localhost/api/notes');
    const res = await GET(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.notes).toEqual([]);
  });

  it('bookId 不存在 → { notes: [] }', async () => {
    const { getNotesByBook } = await import('@/lib/db/notes');
    vi.mocked(getNotesByBook).mockReturnValue([]);

    const req = new NextRequest('http://localhost/api/notes?bookId=non-existent');
    const res = await GET(req);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.notes).toEqual([]);
  });
});
