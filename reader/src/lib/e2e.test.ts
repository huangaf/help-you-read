// @vitest-environment node
/// <reference types="vitest/globals" />
/**
 * M0 端到端集成：EPUB → 入库 → 分块 → BM25 检索
 *
 * 用 public/demo.epub（2 章）走完整链路：
 *   importEpubToDb → getChaptersByBook → splitIntoChunks → BM25 → 检索命中
 * db 单例通过 getDb(临时路径) 注入临时库，测后 resetDb() 清理。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { getDb, resetDb, getChaptersByBook } from '@/lib/db'
import { importEpubToDb } from '@/lib/parser/epub'
import { splitIntoChunks } from '@/lib/indexer/chunker'
import { BM25 } from '@/lib/indexer/bm25'
import type { Book, EpubImportDb } from '@/types'

const DEMO_EPUB = path.join(process.cwd(), 'public', 'demo.epub')

describe('M0 端到端（EPUB→入库→分块→BM25→检索）', () => {
  let dbPath: string
  let importDb: EpubImportDb

  beforeAll(() => {
    expect(fs.existsSync(DEMO_EPUB)).toBe(true)
    dbPath = path.join(os.tmpdir(), `e2e-${uuidv4()}.db`)
    resetDb()
    const db = getDb(dbPath)
    // EpubImportDb 薄适配（db/index.ts 的 createBook 收 Book 而非 CreateBookInput）
    importDb = {
      findBookByFileHash: hash => {
        const row = db
          .prepare('SELECT * FROM books WHERE file_hash = ?')
          .get(hash) as Record<string, unknown> | undefined
        return row ? rowToBook(row) : null
      },
      createBook: input => {
        const now = new Date().toISOString()
        db.prepare(
          `INSERT INTO books (id, title, author, cover_path, format, file_path, file_hash, status, grade, total_chapters, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          input.id, input.title, input.author, input.coverPath, input.format,
          input.filePath, input.fileHash, input.status, input.grade,
          input.totalChapters, now, now,
        )
        const row = db
          .prepare('SELECT * FROM books WHERE id = ?')
          .get(input.id) as Record<string, unknown> | undefined
        if (!row) throw new Error('createBook 后未找到书记录')
        return rowToBook(row)
      },
      insertChapter: c => {
        const id = `${c.bookId}-ch${c.index}`
        db.prepare(
          `INSERT INTO chapters (id, book_id, "index", title, content, char_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, c.bookId, c.index, c.title, c.content, c.charCount)
        return { id, bookId: c.bookId, index: c.index, title: c.title, content: c.content, charCount: c.charCount }
      },
    }
  })

  afterAll(() => {
    resetDb()
    fs.rmSync(dbPath, { force: true })
    fs.rmSync(`${dbPath}-wal`, { force: true })
    fs.rmSync(`${dbPath}-shm`, { force: true })
  })

  it('完整链路：解析→入库→分块→BM25 检索命中目标概念', async () => {
    const buffer = fs.readFileSync(DEMO_EPUB)

    // 1) 解析 + 入库
    const book = await importEpubToDb(buffer, importDb)
    expect(book.title).toBe('AI 辅助阅读器演示')
    expect(book.totalChapters).toBe(2)

    // 2) 从 db 读章节（真实持久化 + getChaptersByBook 联动）
    const chapters = getChaptersByBook(book.id)
    expect(chapters).toHaveLength(2)

    // 3) 分块
    const chunks: { id: string; text: string }[] = []
    chapters.forEach((ch, ci) => {
      splitIntoChunks(ch.content).forEach((text, i) => {
        chunks.push({ id: `${ci}-${i}`, text })
      })
    })
    expect(chunks.length).toBeGreaterThan(0)

    // 4) BM25 索引 + 检索
    const index = new BM25()
    index.indexDocuments(chunks)
    const hits = index.search('RIA 便签', 3)
    expect(hits.length).toBeGreaterThan(0)
    const hitChunk = chunks.find(c => c.id === hits[0].id)
    expect(hitChunk?.text).toContain('RIA')
  })

  it('重复导入去重：再次入库返回同一本书（fileHash 幂等）', async () => {
    const buffer = fs.readFileSync(DEMO_EPUB)
    const again = await importEpubToDb(buffer, importDb)
    expect(again.totalChapters).toBe(2)
  })
})

/** books 表行 → Book（snake→camel） */
function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: String(r.id),
    title: String(r.title),
    author: r.author as string | null,
    coverPath: r.cover_path as string | null,
    format: r.format as Book['format'],
    filePath: String(r.file_path),
    fileHash: r.file_hash as string | null,
    status: r.status as Book['status'],
    grade: r.grade as Book['grade'],
    totalChapters: r.total_chapters as number | null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}