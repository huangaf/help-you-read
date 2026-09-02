/**
 * Highlights 表 CRUD（better-sqlite3 同步驱动）
 *
 * - 复用 getDb() 单例 + snake↔camel 映射（参考 db/index.ts 的 rowToBook 模式）
 * - 外键约束：book_id 必须存在（ON DELETE CASCADE）
 */
import crypto from 'node:crypto';
import type { Highlight, HighlightColor } from '../../types';
import { getDb } from './index';

// ---------------------------------------------------------------------------
// 行类型（snake_case，与 schema.sql 列名一一对应）
// ---------------------------------------------------------------------------

/** highlights 表行 */
export interface HighlightRow {
  id: string;
  book_id: string;
  chapter_id: string | null;
  color: string;
  quote: string;
  note: string | null;
  cfi: string | null;
  page_ref: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 行 ↔ 领域类型映射（snake_case ↔ camelCase）
// ---------------------------------------------------------------------------

/** 行 → Highlight */
export function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    color: row.color as HighlightColor,
    quote: row.quote,
    note: row.note,
    cfi: row.cfi,
    pageRef: row.page_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Highlight → highlights 表插入参数 */
export function highlightToRow(highlight: Highlight): HighlightRow {
  return {
    id: highlight.id,
    book_id: highlight.bookId,
    chapter_id: highlight.chapterId,
    color: highlight.color,
    quote: highlight.quote,
    note: highlight.note,
    cfi: highlight.cfi,
    page_ref: highlight.pageRef,
    created_at: highlight.createdAt,
    updated_at: highlight.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Highlights CRUD
// ---------------------------------------------------------------------------

const HIGHLIGHT_COLUMNS =
  'id, book_id, chapter_id, color, quote, note, cfi, page_ref, created_at, updated_at';

/** 创建高亮 */
export function createHighlight(input: {
  bookId: string;
  quote: string;
  cfi: string | null;
  color?: HighlightColor;
  note?: string | null;
  chapterId?: string | null;
  pageRef?: string | null;
}): Highlight {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const row: HighlightRow = {
    id,
    book_id: input.bookId,
    chapter_id: input.chapterId ?? null,
    color: input.color ?? 'yellow',
    quote: input.quote,
    note: input.note ?? null,
    cfi: input.cfi ?? null,
    page_ref: input.pageRef ?? null,
    created_at: now,
    updated_at: now,
  };

  db
    .prepare(
      `INSERT INTO highlights (${HIGHLIGHT_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.book_id,
      row.chapter_id,
      row.color,
      row.quote,
      row.note,
      row.cfi,
      row.page_ref,
      row.created_at,
      row.updated_at
    );

  return rowToHighlight(row);
}

/** 按书 ID 查询高亮列表（createdAt 升序） */
export function getHighlightsByBook(bookId: string): Highlight[] {
  const db = getDb();
  const rows = db
    .prepare<[string], HighlightRow>(
      `SELECT ${HIGHLIGHT_COLUMNS}
       FROM highlights
       WHERE book_id = ?
       ORDER BY created_at ASC`
    )
    .all(bookId);
  return rows.map(rowToHighlight);
}

/** 按 ID 查询高亮；不存在返回 null */
export function getHighlight(id: string): Highlight | null {
  const db = getDb();
  const row = db
    .prepare<[string], HighlightRow>(
      `SELECT ${HIGHLIGHT_COLUMNS} FROM highlights WHERE id = ?`
    )
    .get(id);
  return row ? rowToHighlight(row) : null;
}

/** 更新高亮批注（note），并刷新 updatedAt；不存在返回 null */
export function updateHighlightNote(id: string, note: string | null): Highlight | null {
  const db = getDb();
  db.prepare(
    'UPDATE highlights SET note = ?, updated_at = ? WHERE id = ?'
  ).run(note, new Date().toISOString(), id);
  return getHighlight(id);
}

/** 删除高亮；不存在返回 false */
export function deleteHighlight(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM highlights WHERE id = ?').run(id);
  return result.changes > 0;
}
