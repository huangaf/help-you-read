/**
 * 读书档案 CRUD（reading_archives 表）
 *
 * - getArchiveByBook(bookId): 按书查询档案
 * - upsertArchive(input): 插入或更新档案（bookId 唯一约束）
 * - deleteArchive(bookId): 删除档案
 *
 * 复用 src/lib/db/index.ts 的 getDb()、snake↔camel 映射
 */
import { getDb } from './index';
import type { ReadingArchive } from '../../types';

// ---------------------------------------------------------------------------
// 行类型（snake_case，与 schema.sql 列名一一对应）
// ---------------------------------------------------------------------------

export interface ReadingArchiveRow {
  id: string;
  book_id: string;
  purpose: string | null;
  key_takeaways: string | null;
  action_plan: string | null;
  output: string | null;
  ai_draft: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// 行 ↔ 领域类型映射（snake_case ↔ camelCase）
// ---------------------------------------------------------------------------

function rowToArchive(row: ReadingArchiveRow): ReadingArchive {
  return {
    id: row.id,
    bookId: row.book_id,
    purpose: row.purpose,
    keyTakeaways: row.key_takeaways,
    actionPlan: row.action_plan,
    output: row.output,
    aiDraft: row.ai_draft,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function archiveToRow(archive: Omit<ReadingArchive, 'id' | 'createdAt' | 'updatedAt'>): ReadingArchiveRow {
  return {
    id: '', // 插入时由调用方生成
    book_id: archive.bookId,
    purpose: archive.purpose ?? null,
    key_takeaways: archive.keyTakeaways ?? null,
    action_plan: archive.actionPlan ?? null,
    output: archive.output ?? null,
    ai_draft: archive.aiDraft ?? null,
    created_at: '', // 由调用方设置
    updated_at: '', // 由调用方设置
  };
}

// ---------------------------------------------------------------------------
// CRUD 操作
// ---------------------------------------------------------------------------

const ARCHIVE_COLUMNS =
  'id, book_id, purpose, key_takeaways, action_plan, output, ai_draft, created_at, updated_at';

/**
 * 按 bookId 查询档案；不存在返回 null
 */
export function getArchiveByBook(bookId: string): ReadingArchive | null {
  const db = getDb();
  const row = db
    .prepare<[string], ReadingArchiveRow>(
      `SELECT ${ARCHIVE_COLUMNS} FROM reading_archives WHERE book_id = ?`
    )
    .get(bookId);
  return row ? rowToArchive(row) : null;
}

/**
 * 插入或更新档案（upsert）
 *
 * 利用 reading_archives 表的 book_id UNIQUE 约束，
 * 使用 INSERT OR REPLACE 实现 upsert 语义。
 *
 * @param input 档案数据（不含 id/createdAt/updatedAt）
 * @returns 插入/更新后的档案
 */
export function upsertArchive(
  input: Omit<ReadingArchive, 'id' | 'createdAt' | 'updatedAt'>
): ReadingArchive {
  const db = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const row = {
    id,
    book_id: input.bookId,
    purpose: input.purpose ?? null,
    key_takeaways: input.keyTakeaways ?? null,
    action_plan: input.actionPlan ?? null,
    output: input.output ?? null,
    ai_draft: input.aiDraft ?? null,
    created_at: now,
    updated_at: now,
  };

  db
    .prepare(
      `INSERT OR REPLACE INTO reading_archives (${ARCHIVE_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.book_id,
      row.purpose,
      row.key_takeaways,
      row.action_plan,
      row.output,
      row.ai_draft,
      row.created_at,
      row.updated_at
    );

  return { ...rowToArchive(row), createdAt: row.created_at, updatedAt: row.updated_at };
}

/**
 * 按 bookId 删除档案
 *
 * @returns 是否删除成功（存在则 true，不存在则 false）
 */
export function deleteArchive(bookId: string): boolean {
  const db = getDb();
  const result = db
    .prepare<[string], { changes: number }>(
      `DELETE FROM reading_archives WHERE book_id = ?`
    )
    .run(bookId);
  return result.changes > 0;
}
