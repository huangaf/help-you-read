/**
 * GET /api/books/[id]/file - 返回 EPUB 文件
 *
 * 读取 data/books/{id}.epub 文件并返回 binary response
 * Content-Type: application/epub+zip
 */
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getBook } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 校验书籍是否存在
  const book = getBook(id);
  if (!book) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 });
  }

  // 构建文件路径
  const bookFilePath = path.join(process.cwd(), 'data', 'books', `${id}.epub`);

  // 检查文件是否存在
  if (!fs.existsSync(bookFilePath)) {
    return NextResponse.json({ error: 'EPUB 文件不存在' }, { status: 404 });
  }

  try {
    // 读取文件 buffer（Node Buffer → Uint8Array，NextResponse 不支持 Buffer 直接序列化）
    const buffer = fs.readFileSync(bookFilePath);
    const bytes = new Uint8Array(buffer);

    // URL 编码文件名（处理中文等 Unicode 字符）
    const encodedFileName = encodeURIComponent(book.title);

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodedFileName}.epub"`,
      },
    });
  } catch (error) {
    console.error('[API/Books/[id]/file/GET] 错误:', error);
    return NextResponse.json(
      { error: '读取文件失败' },
      { status: 500 }
    );
  }
}
