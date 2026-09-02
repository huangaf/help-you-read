/**
 * 书库接口
 *
 * GET: 返回书库列表
 * POST: 导入 EPUB 书籍（multipart 上传）
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { listBooks, getChaptersByBook } from '@/lib/db';
import { getEpubImportDb } from '@/lib/db/epubDbAdapter';
import { importEpubToDb } from '@/lib/parser/epub';
import { indexBook, getVectorStore, getBm25Index } from '@/lib/indexing';

// ---------------------------------------------------------------------------
// GET - 书库列表
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const books = listBooks();
    return NextResponse.json({ books });
  } catch (error) {
    console.error('[API/Books/GET] 错误:', error);
    return NextResponse.json(
      { error: '读取书库失败' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST - 导入 EPUB
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // 1. 解析 multipart/form-data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // 2. 文件校验
    if (!file) {
      return NextResponse.json(
        { error: '缺少文件' },
        { status: 400 },
      );
    }

    // 空文件校验
    if (file.size === 0) {
      return NextResponse.json(
        { error: '文件为空' },
        { status: 400 },
      );
    }

    // 扩展名或 mimetype 校验
    const fileName = file.name.toLowerCase();
    const mimeType = file.type;
    const isEpub = fileName.endsWith('.epub') || mimeType === 'application/epub+zip';

    if (!isEpub) {
      return NextResponse.json(
        { error: '仅支持 EPUB 格式文件' },
        { status: 400 },
      );
    }

    // 3. 读取文件 buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. 入库（含去重）
    const epubDb = getEpubImportDb();
    const book = await importEpubToDb(buffer, epubDb);

    // 5. 保存原文件到 data/books/{bookId}.epub
    const bookDir = path.join(process.cwd(), 'data', 'books');
    fs.mkdirSync(bookDir, { recursive: true });
    const bookFilePath = path.join(bookDir, `${book.id}.epub`);
    fs.writeFileSync(bookFilePath, buffer);

    // 6. 向量化索引
    const chapters = getChaptersByBook(book.id);
    await indexBook(book.id, chapters, getVectorStore(), getBm25Index());

    // 7. 返回 201 + book
    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    console.error('[API/Books/POST] 错误:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: `导入失败：${errorMessage}` },
      { status: 500 },
    );
  }
}
