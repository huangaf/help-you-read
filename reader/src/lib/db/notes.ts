/**
 * notes 表 CRUD（RIA 便签）
 *
 * - getDb() 单例连接
 * - snake_case ↔ camelCase 双向映射
 */
import { getDb } from './index';
import type { Note, NoteStatus, NoteType } from '@/types';

// ---------------------------------------------------------------------------
// 行类型（snake_case）
// ---------------------------------------------------------------------------

export interface NoteRow {
  id: string;
  book_id: string;
  highlight_id: string | null;
  chapter_id: string | null;
  type: string;
  content: string;
  source_quote: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 行 ↔ 领域类型映射
// ---------------------------------------------------------------------------

/** 行 → Note */
export function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    bookId: row.book_id,
    highlightId: row.highlight_id,
    chapterId: row.chapter_id,
    type: row.type as NoteType,
    content: row.content,
    sourceQuote: row.source_quote,
    status: row.status as NoteStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Note → notes 表插入参数 */
export function noteToRow(note: Note): NoteRow {
  return {
    id: note.id,
    book_id: note.bookId,
    highlight_id: note.highlightId,
    chapter_id: note.chapterId,
    type: note.type,
    content: note.content,
    source_quote: note.sourceQuote,
    status: note.status,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD 操作
// ---------------------------------------------------------------------------

const NOTE_COLUMNS =
  'id, book_id, highlight_id, chapter_id, type, content, source_quote, status, created_at, updated_at';

/** 插入一个便签 */
export function createNote(note: Note): Note {
  const db = getDb();
  const row = noteToRow(note);
  db
    .prepare(
      `INSERT INTO notes (${NOTE_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.book_id,
      row.highlight_id,
      row.chapter_id,
      row.type,
      row.content,
      row.source_quote,
      row.status,
      row.created_at,
      row.updated_at
    );
  return note;
}

/** 按 bookId 查询便签列表（按 createdAt 升序） */
export function getNotesByBook(bookId: string): Note[] {
  const db = getDb();
  const rows = db
    .prepare<[string], NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM notes WHERE book_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(bookId);
  return rows.map(rowToNote);
}

/** 按 ID 更新 content，并刷新 updatedAt；不存在返回 null */
export function updateNoteContent(id: string, content: string): Note | null {
  const db = getDb();
  db.prepare(
    'UPDATE notes SET content = ?, updated_at = ? WHERE id = ?'
  ).run(content, new Date().toISOString(), id);
  return getNoteById(id);
}

/** 按 ID 删除便签；成功返回 true，不存在返回 false */
export function deleteNote(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 按 ID 查询单条便签；不存在返回 null */
function getNoteById(id: string): Note | null {
  const db = getDb();
  const row = db
    .prepare<[string], NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ?`
    )
    .get(id);
  return row ? rowToNote(row) : null;
}
