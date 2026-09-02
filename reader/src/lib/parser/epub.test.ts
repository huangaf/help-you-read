/**
 * EPUB 解析测试
 *
 * - fixture：测试内用 fflate 构造最小合法 EPUB
 *   （mimetype + META-INF/container.xml + OEBPS/content.opf + 2 个 XHTML 章节）
 * - parseEpub：纯函数断言（标题/作者/章节数/章节标题与内容/CFI）
 * - importEpubToDb：os.tmpdir() + uuid 临时 SQLite（执行 schema.sql），测后清理
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { zipSync } from 'fflate'
import { loadSchemaSql } from '../db/index'
import type { Book, BookFormat, BookStatus, CreateBookInput, EpubImportDb } from '@/types'
import { parseEpub, importEpubToDb } from './epub'

// ============================================================================
// fixture：最小合法 EPUB（2 章）
// ============================================================================

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

interface FixtureOptions {
  title?: string
  author?: string
  chapter1Text?: string
  chapter2Text?: string
}

function makeEpubFixture(opts: FixtureOptions = {}): Uint8Array {
  const {
    title = '测试之书',
    author = '测试作者',
    chapter1Text = '这是第一章的正文内容。',
    chapter2Text = '这是第二章的正文内容。',
  } = opts

  return zipSync({
    'mimetype': enc('application/epub+zip'),
    'META-INF/container.xml': enc(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
    'OEBPS/content.opf': enc(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:22222222-3333-4444-5555-666666666666</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`),
    'OEBPS/chapter1.xhtml': enc(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第一章 简介</title></head>
<body><p>${chapter1Text}</p></body>
</html>`),
    'OEBPS/chapter2.xhtml': enc(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第二章 深入</title></head>
<body><p>${chapter2Text}</p></body>
</html>`),
  })
}

// ============================================================================
// parseEpub
// ============================================================================

describe('parseEpub', () => {
  const buffer = makeEpubFixture()

  it('解析书籍标题与作者', async () => {
    const book = await parseEpub(buffer)
    expect(book.title).toBe('测试之书')
    expect(book.author).toBe('测试作者')
  })

  it('解析出 2 个章节，标题/内容/序号正确', async () => {
    const book = await parseEpub(buffer)
    expect(book.chapters).toHaveLength(2)
    expect(book.chapters[0]).toMatchObject({
      index: 0,
      title: '第一章 简介',
      content: '这是第一章的正文内容。',
    })
    expect(book.chapters[1]).toMatchObject({
      index: 1,
      title: '第二章 深入',
      content: '这是第二章的正文内容。',
    })
  })

  it('每章提供非空且唯一的 CFI（路径 A 能力）', async () => {
    const book = await parseEpub(buffer)
    for (const ch of book.chapters) {
      expect(ch.cfi).toMatch(/^epubcfi\(/)
    }
    expect(new Set(book.chapters.map(c => c.cfi)).size).toBe(2)
  })

  it('支持 ArrayBuffer 输入', async () => {
    // 复制为独立 ArrayBuffer（排除 byteOffset 干扰）
    const ab: ArrayBuffer = new Uint8Array(buffer).buffer
    const book = await parseEpub(ab)
    expect(book.title).toBe('测试之书')
    expect(book.chapters).toHaveLength(2)
  })

  it('非法输入（非 ZIP）应抛错', async () => {
    await expect(parseEpub(enc('这不是一个 EPUB 文件'))).rejects.toThrow(/EPUB/)
  })
})

// ============================================================================
// importEpubToDb（临时 SQLite db，执行 schema.sql）
// ============================================================================

/** books 表行（snake_case） */
interface BooksRow {
  id: string
  title: string
  author: string | null
  cover_path: string | null
  format: string
  file_path: string
  file_hash: string | null
  status: string
  grade: number
  total_chapters: number | null
  created_at: string
  updated_at: string
}

/** chapters 表行（snake_case） */
interface ChaptersRow {
  id: string
  book_id: string
  index: number
  title: string
  content: string
  char_count: number | null
}

function toBook(r: BooksRow): Book {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    coverPath: r.cover_path,
    format: r.format as BookFormat,
    filePath: r.file_path,
    fileHash: r.file_hash,
    status: r.status as BookStatus,
    grade: r.grade as Book['grade'],
    totalChapters: r.total_chapters,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

describe('importEpubToDb', () => {
  let sqlite: Database.Database
  let db: EpubImportDb
  const tmpFiles: string[] = []

  beforeAll(() => {
    // 临时 db：os.tmpdir() + uuid，避免污染 data/library.db
    const dbPath = path.join(os.tmpdir(), `epub-import-test-${uuidv4()}.db`)
    tmpFiles.push(dbPath)
    sqlite = new Database(dbPath)
    const schema = loadSchemaSql()
    sqlite.exec(schema)

    // 按 EpubImportDb 约定实现的测试 db（模拟 W1-T-db 的 CRUD 语义）
    db = {
      findBookByFileHash: (hash: string) => {
        const row = sqlite
          .prepare<string[], BooksRow>('SELECT * FROM books WHERE file_hash = ?')
          .get(hash)
        return row ? toBook(row) : null
      },
      createBook: (input: CreateBookInput): Book => {
        const now = new Date().toISOString()
        sqlite
          .prepare(
            `INSERT INTO books
               (id, title, author, cover_path, format, file_path, file_hash,
                status, grade, total_chapters, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.id, input.title, input.author, input.coverPath, input.format,
            input.filePath, input.fileHash, input.status, input.grade,
            input.totalChapters, now, now,
          )
        const row = sqlite
          .prepare<string[], BooksRow>('SELECT * FROM books WHERE id = ?')
          .get(input.id)
        if (!row) throw new Error('createBook 写入后未找到书记录')
        return toBook(row)
      },
      insertChapter: ({ bookId, index, title, content, charCount }) => {
        const id = uuidv4()
        sqlite
          .prepare('INSERT INTO chapters (id, book_id, "index", title, content, char_count) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, bookId, index, title, content, charCount)
        return { id, bookId, index, title, content, charCount }
      },
    }
  })

  afterAll(() => {
    sqlite.close()
    for (const f of tmpFiles) fs.rmSync(f, { force: true })
  })

  it('入库：books 1 行，chapters 行数 == 解析章节数', async () => {
    const buffer = makeEpubFixture()
    const parsed = await parseEpub(buffer)
    const book = await importEpubToDb(buffer, db)

    expect(book.format).toBe('epub')
    expect(book.title).toBe('测试之书')
    expect(book.author).toBe('测试作者')
    expect(book.fileHash).toMatch(/^[0-9a-f]{64}$/)
    expect(book.totalChapters).toBe(parsed.chapters.length)

    const { n } = sqlite
      .prepare<string[], { n: number }>('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?')
      .get(book.id) as { n: number }
    expect(n).toBe(parsed.chapters.length)
    expect(n).toBe(2)

    const rows = sqlite
      .prepare<string[], ChaptersRow>('SELECT * FROM chapters WHERE book_id = ? ORDER BY "index"')
      .all(book.id)
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBe('第一章 简介')
    expect(rows[0].content).toBe('这是第一章的正文内容。')
    expect(rows[0].char_count).toBe('这是第一章的正文内容。'.length)
  })

  it('重复导入按 fileHash 去重：返回同一本书，不重复插章', async () => {
    const buffer = makeEpubFixture()
    const b1 = await importEpubToDb(buffer, db)
    const b2 = await importEpubToDb(buffer, db)

    expect(b2.id).toBe(b1.id)
    expect(b2.title).toBe('测试之书')
    const { n } = sqlite
      .prepare<string[], { n: number }>('SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?')
      .get(b1.id) as { n: number }
    expect(n).toBe(2)
  })

  it('不同文件不去重', async () => {
    const b1 = await importEpubToDb(makeEpubFixture(), db)
    const b2 = await importEpubToDb(makeEpubFixture({ chapter1Text: '完全不同的正文内容。' }), db)
    expect(b2.id).not.toBe(b1.id)
    expect(b2.fileHash).not.toBe(b1.fileHash)
  })
})
