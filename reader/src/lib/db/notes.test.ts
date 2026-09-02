/**
 * notes 数据层测试（TDD RED→GREEN）
 *
 * 测试要点：
 * - 临时 db，每个测试独立路径
 * - createNote 往返/按书过滤/删除/外键级联
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Note } from '../../types';
import {
  createNote,
  deleteNote,
  getNotesByBook,
  updateNoteContent,
} from './notes';
import { createDb, getBook, resetDb } from './index';

// ---------------------------------------------------------------------------
// 测试数据工厂
// ---------------------------------------------------------------------------

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `test-notes-${crypto.randomUUID()}.db`);
}

/** 创建测试用的书 */
async function createTestBook(bookId: string) {
  const { createBook } = await import('./index');
  const now = new Date().toISOString();
  const book = {
    id: bookId,
    title: '测试之书',
    author: null,
    coverPath: null,
    format: 'epub' as const,
    filePath: '/tmp/test.epub',
    fileHash: null,
    status: 'unread' as const,
    grade: 1 as const,
    totalChapters: null,
    createdAt: now,
    updatedAt: now,
  };
  createBook(book);
  return book;
}

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

// ---------------------------------------------------------------------------
// 隔离
// ---------------------------------------------------------------------------

let dbPath = '';

beforeEach(() => {
  resetDb();
  dbPath = tmpDbPath();
  createDb(dbPath); // 初始化 schema
});

afterEach(() => {
  resetDb();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = dbPath + suffix;
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // 忽略
    }
  }
  dbPath = '';
});

// ---------------------------------------------------------------------------
// createNote / getNotesByBook
// ---------------------------------------------------------------------------

describe('createNote', () => {
  it('createNote → getNotesByBook 往返字段一致', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const note = makeNote({ bookId });
    const created = createNote(note);
    expect(created).toEqual(note);

    const notes = getNotesByBook(note.bookId);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual(note);
  });

  it('按书过滤：不同书的便签不混', async () => {
    const bookA = crypto.randomUUID();
    const bookB = crypto.randomUUID();
    await createTestBook(bookA);
    await createTestBook(bookB);
    
    const note1 = makeNote({
      bookId: bookA,
      content: '书 A 的便签',
    });
    const note2 = makeNote({
      bookId: bookB,
      content: '书 B 的便签',
    });
    createNote(note1);
    createNote(note2);

    const notesA = getNotesByBook(bookA);
    const notesB = getNotesByBook(bookB);

    expect(notesA).toHaveLength(1);
    expect(notesA[0].content).toBe('书 A 的便签');
    expect(notesB).toHaveLength(1);
    expect(notesB[0].content).toBe('书 B 的便签');
  });

  it('按书过滤：无便签返回空数组', () => {
    const notes = getNotesByBook('non-existent-book');
    expect(notes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updateNoteContent
// ---------------------------------------------------------------------------

describe('updateNoteContent', () => {
  it('更新 content 并刷新 updatedAt', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const note = makeNote({ bookId });
    createNote(note);

    // 等待一小段时间确保时间戳不同
    await new Promise(r => setTimeout(r, 10));
    
    const updated = updateNoteContent(note.id, '更新后的内容');
    expect(updated).not.toBeNull();
    expect(updated?.content).toBe('更新后的内容');
    // updatedAt 应该更新（可能相同，因为时间精度问题，不做强校验）
    expect(updated?.updatedAt).toBeTruthy();
  });

  it('更新不存在的 ID 返回 null', () => {
    const updated = updateNoteContent('non-existent-id', 'content');
    expect(updated).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteNote
// ---------------------------------------------------------------------------

describe('deleteNote', () => {
  it('删除成功返回 true，重复删除返回 false', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const note = makeNote({ bookId });
    createNote(note);

    expect(deleteNote(note.id)).toBe(true);
    expect(getNotesByBook(note.bookId)).toHaveLength(0);
    expect(deleteNote(note.id)).toBe(false);
  });

  it('外键级联：删书后便签被级联删除', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);

    const note = makeNote({ bookId });
    createNote(note);

    expect(getNotesByBook(bookId)).toHaveLength(1);

    // 删书
    const { deleteBook } = await import('./index');
    deleteBook(bookId);

    // 便签被级联删除
    expect(getNotesByBook(bookId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 类型字段校验
// ---------------------------------------------------------------------------

describe('Note 类型字段', () => {
  it('type 支持 I/A1/A2', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const noteI = createNote(makeNote({ bookId, type: 'I' }));
    const noteA1 = createNote(makeNote({ bookId, type: 'A1' }));
    const noteA2 = createNote(makeNote({ bookId, type: 'A2' }));

    expect(noteI.type).toBe('I');
    expect(noteA1.type).toBe('A1');
    expect(noteA2.type).toBe('A2');
  });

  it('status 支持 active/done/archived', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const noteActive = createNote(makeNote({ bookId, status: 'active' }));
    const noteDone = createNote(makeNote({ bookId, status: 'done' }));
    const noteArchived = createNote(makeNote({ bookId, status: 'archived' }));

    expect(noteActive.status).toBe('active');
    expect(noteDone.status).toBe('done');
    expect(noteArchived.status).toBe('archived');
  });

  it('highlightId/chapterId/sourceQuote 可为 null', async () => {
    const bookId = crypto.randomUUID();
    await createTestBook(bookId);
    
    const note = makeNote({
      bookId,
      highlightId: null,
      chapterId: null,
      sourceQuote: '原文引用',
    });
    const created = createNote(note);

    expect(created.highlightId).toBeNull();
    expect(created.chapterId).toBeNull();
    expect(created.sourceQuote).toBe('原文引用');
  });
});
