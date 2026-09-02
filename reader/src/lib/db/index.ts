/**
 * SQLite 数据层（better-sqlite3 同步驱动）
 *
 * - 连接单例：globalThis 缓存，防 dev HMR 热重载重复建连（Prisma 同款模式，
 *   见 docs/better-sqlite3-nextjs16-集成指南.md §2）
 * - pragma：journal_mode=WAL / busy_timeout=5000 / foreign_keys=ON
 * - schema.sql 以 IF NOT EXISTS 幂等建表
 * - snake_case 行 ↔ camelCase 领域类型（Book/Chapter）双向映射
 * - 仅服务端使用（Server Components / Route Handlers / Server Actions）
 */
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Book, BookFormat, BookGrade, BookStatus, Chapter } from '../../types';

// ---------------------------------------------------------------------------
// 路径与连接
// ---------------------------------------------------------------------------

/** 默认数据库文件（相对 process.cwd()） */
export const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'library.db');

/** schema.sql 位于源码目录（不参与构建产物打包，运行时从磁盘读取） */
const SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');

/**
 * 读取 schema.sql 并做内存等价改写（不修改 schema.sql 文件本身）：
 *
 * chapters 表的列名 `index` 是 SQLite 保留字，SQLite 3.53（better-sqlite3 12.11.1
 * 内置版本）起未加引号的 index 不能再作列名，直接 exec 会报
 * `near "index": syntax error`。因此执行前把列定义与 UNIQUE 约束中的 index
 * 改写为加引号的 "index"（仅匹配列定义位置，CREATE INDEX 语句不受影响）。
 */
function loadSchemaSql(): string {
  return fs
    .readFileSync(SCHEMA_PATH, 'utf8')
    .replace(/\bindex\s+INTEGER NOT NULL\b/g, '"index" INTEGER NOT NULL')
    .replace(/\bUNIQUE\(book_id,\s*index\)/g, 'UNIQUE(book_id, "index")');
}

/** 导出给测试复用（epub.test.ts 需要建临时 db 时用同一份改写后的 schema） */
export { loadSchemaSql };

/**
 * 创建新的 SQLite 连接并初始化 schema（幂等，可重复执行）。
 * @param dbPath 数据库文件路径，默认 data/library.db
 */
export function createDb(dbPath: string = DEFAULT_DB_PATH): BetterSqlite3.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new BetterSqlite3(dbPath, {
    verbose: (msg: unknown) => console.warn('[sqlite]', msg),
  });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.exec(loadSchemaSql());

  // 设置到 globalThis 单例（供 getDb 使用）
  const g = globalThis as DbGlobal;
  g.__readerDb = db;

  return db;
}

// globalThis 单例：dev 热重载时复用同一连接
type DbGlobal = typeof globalThis & { __readerDb?: BetterSqlite3.Database };

/**
 * 获取单例连接。
 * @param dbPath 仅首次初始化时生效（测试注入临时路径）；已有缓存则直接返回
 */
export function getDb(dbPath?: string): BetterSqlite3.Database {
  const g = globalThis as DbGlobal;
  if (!g.__readerDb) {
    g.__readerDb = createDb(dbPath);
  }
  return g.__readerDb;
}

/** 关闭并清除单例连接（供测试隔离使用；生产代码不应调用） */
export function resetDb(): void {
  const g = globalThis as DbGlobal;
  if (g.__readerDb && g.__readerDb.open) {
    g.__readerDb.close();
  }
  g.__readerDb = undefined;
}

// ---------------------------------------------------------------------------
// 行类型（snake_case，与 schema.sql 列名一一对应）
// ---------------------------------------------------------------------------

/** books 表行 */
export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  cover_path: string | null;
  format: string;
  file_path: string;
  file_hash: string | null;
  status: string;
  grade: number;
  total_chapters: number | null;
  created_at: string;
  updated_at: string;
}

/** chapters 表行（index 为 SQLite 关键字，SQL 中需加引号） */
export interface ChapterRow {
  id: string;
  book_id: string;
  index: number;
  title: string;
  content: string;
  char_count: number | null;
}

// ---------------------------------------------------------------------------
// 行 ↔ 领域类型映射（snake_case ↔ camelCase）
// ---------------------------------------------------------------------------

/** 行 → Book */
export function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverPath: row.cover_path,
    format: row.format as BookFormat,
    filePath: row.file_path,
    fileHash: row.file_hash,
    status: row.status as BookStatus,
    grade: row.grade as BookGrade,
    totalChapters: row.total_chapters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Book → books 表插入参数 */
export function bookToRow(book: Book): BookRow {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    cover_path: book.coverPath,
    format: book.format,
    file_path: book.filePath,
    file_hash: book.fileHash,
    status: book.status,
    grade: book.grade,
    total_chapters: book.totalChapters,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
  };
}

/** 行 → Chapter */
export function rowToChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    index: row.index,
    title: row.title,
    content: row.content,
    charCount: row.char_count,
  };
}

/** Chapter → chapters 表插入参数（charCount 为 null 时按 content.length 计算） */
export function chapterToRow(chapter: Chapter): ChapterRow {
  return {
    id: chapter.id,
    book_id: chapter.bookId,
    index: chapter.index,
    title: chapter.title,
    content: chapter.content,
    char_count: chapter.charCount ?? chapter.content.length,
  };
}

// ---------------------------------------------------------------------------
// books CRUD
// ---------------------------------------------------------------------------

const BOOK_COLUMNS =
  'id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at';

/** 插入一本书（全量字段由调用方提供） */
export function createBook(book: Book): Book {
  const db = getDb();
  const row = bookToRow(book);
  db
    .prepare(
      `INSERT INTO books (${BOOK_COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.title,
      row.author,
      row.cover_path,
      row.format,
      row.file_path,
      row.file_hash,
      row.status,
      row.grade,
      row.total_chapters,
      row.created_at,
      row.updated_at
    );
  return book;
}

/** 解析器产出的书籍最小字段集 */
export interface ParsedBook {
  id: string;
  title: string;
  author?: string | null;
  coverPath?: string | null;
  format: BookFormat;
  filePath: string;
  fileHash?: string | null;
  totalChapters?: number | null;
}

/** 从解析结果入库：补全默认值（status=unread / grade=1 / 时间戳）后持久化 */
export function createBookFromParse(parsed: ParsedBook): Book {
  const now = new Date().toISOString();
  const book: Book = {
    id: parsed.id,
    title: parsed.title,
    author: parsed.author ?? null,
    coverPath: parsed.coverPath ?? null,
    format: parsed.format,
    filePath: parsed.filePath,
    fileHash: parsed.fileHash ?? null,
    status: 'unread',
    grade: 1,
    totalChapters: parsed.totalChapters ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return createBook(book);
}

/** 按 id 查询书籍；不存在返回 null */
export function getBook(id: string): Book | null {
  const db = getDb();
  const row = db
    .prepare<[string], BookRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`)
    .get(id);
  return row ? rowToBook(row) : null;
}

/** 按文件哈希查书（importEpubToDb 去重用）；不存在返回 null */
export function findBookByFileHash(hash: string): Book | null {
  const db = getDb();
  const row = db
    .prepare<[string], BookRow>(`SELECT ${BOOK_COLUMNS} FROM books WHERE file_hash = ?`)
    .get(hash);
  return row ? rowToBook(row) : null;
}

/** 列出全部书籍（createdAt 升序） */
export function listBooks(): Book[] {
  const db = getDb();
  const rows = db
    .prepare<[], BookRow>(
      `SELECT ${BOOK_COLUMNS} FROM books ORDER BY created_at ASC, id ASC`
    )
    .all();
  return rows.map(rowToBook);
}

/** 更新书籍阅读状态（可选同步更新分级），并刷新 updatedAt；不存在返回 null */
export function updateBookStatus(
  id: string,
  status: BookStatus,
  grade?: BookGrade
): Book | null {
  const db = getDb();
  db.prepare(
    'UPDATE books SET status = ?, grade = COALESCE(?, grade), updated_at = ? WHERE id = ?'
  ).run(status, grade ?? null, new Date().toISOString(), id);
  return getBook(id);
}

/** 删除书籍（外键 ON DELETE CASCADE 级联删除章节等子表） */
export function deleteBook(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM books WHERE id = ?').run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// chapters
// ---------------------------------------------------------------------------

/** 插入一章（charCount 为 null 时自动按 content.length 计算） */
export function insertChapter(chapter: Chapter): Chapter {
  const db = getDb();
  const row = chapterToRow(chapter);
  db
    .prepare(
      `INSERT INTO chapters (id, book_id, "index", title, content, char_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(row.id, row.book_id, row.index, row.title, row.content, row.char_count);
  return { ...chapter, charCount: row.char_count };
}

/** 列出某书全部章节（index 升序） */
export function getChaptersByBook(bookId: string): Chapter[] {
  const db = getDb();
  const rows = db
    .prepare<[string], ChapterRow>(
      `SELECT id, book_id, "index", title, content, char_count
       FROM chapters WHERE book_id = ? ORDER BY "index" ASC`
    )
    .all(bookId);
  return rows.map(rowToChapter);
}