/**
 * EpubImportDb 薄适配层
 *
 * 包装 getDb() 单例的 CRUD，实现 EpubImportDb 接口：
 * - findBookByFileHash
 * - createBook（补全时间戳）
 * - insertChapter
 *
 * 供 importEpubToDb 使用，与 src/lib/db/index.ts 解耦。
 */
import { getDb, rowToBook, rowToChapter } from './index';
import type { Book, Chapter, CreateBookInput, EpubImportDb } from '@/types';

/**
 * 获取 EpubImportDb 适配实例
 *
 * 复用 getDb() 单例，暴露最小接口供 importEpubToDb 使用。
 * @param dbPath 仅用于首次初始化（测试注入临时路径）；已有缓存则直接返回
 */
export function getEpubImportDb(dbPath?: string): EpubImportDb {
  // 确保 db 单例就位（getDb 内部处理缓存）
  if (dbPath) {
    getDb(dbPath);
  } else {
    getDb();
  }

  return {
    /** 按文件哈希查书（去重用） */
    findBookByFileHash: (hash: string): Book | null => {
      const db = getDb();
      const row = db
        .prepare(
          'SELECT id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at FROM books WHERE file_hash = ?',
        )
        .get(hash) as Record<string, unknown> | undefined;

      if (!row) return null;
      return rowToBook({
        id: String(row.id),
        title: String(row.title),
        author: row.author as string | null,
        cover_path: row.cover_path as string | null,
        format: String(row.format),
        file_path: String(row.file_path),
        file_hash: row.file_hash as string | null,
        status: String(row.status),
        grade: Number(row.grade),
        total_chapters: row.total_chapters as number | null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      });
    },

    /** 建书：补全时间戳后持久化 */
    createBook: (input: CreateBookInput): Book => {
      const db = getDb();
      const now = new Date().toISOString();

      db
        .prepare(
          `INSERT INTO books (id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.title,
          input.author,
          input.coverPath,
          input.format,
          input.filePath,
          input.fileHash,
          input.status,
          input.grade,
          input.totalChapters,
          now,
          now,
        );

      // 返回刚插入的书
      const row = db
        .prepare(
          'SELECT id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at FROM books WHERE id = ?',
        )
        .get(input.id) as Record<string, unknown> | undefined;

      if (!row) {
        throw new Error(`createBook 后未找到书记录：${input.id}`);
      }
      return rowToBook({
        id: String(row.id),
        title: String(row.title),
        author: row.author as string | null,
        cover_path: row.cover_path as string | null,
        format: String(row.format),
        file_path: String(row.file_path),
        file_hash: row.file_hash as string | null,
        status: String(row.status),
        grade: Number(row.grade),
        total_chapters: row.total_chapters as number | null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      });
    },

    /** 插章 */
    insertChapter: (input: {
      bookId: string;
      index: number;
      title: string;
      content: string;
      charCount: number | null;
    }): Chapter => {
      const db = getDb();
      const id = `${input.bookId}-ch${input.index}`;

      db
        .prepare(
          `INSERT INTO chapters (id, book_id, "index", title, content, char_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.bookId, input.index, input.title, input.content, input.charCount);

      return {
        id,
        bookId: input.bookId,
        index: input.index,
        title: input.title,
        content: input.content,
        charCount: input.charCount,
      };
    },
  };
}

/** books 表行类型（与 index.ts 保持一致） */
interface BookRow {
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
