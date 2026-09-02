/**
 * GET /api/books/[id] - 返回书籍详情
 *
 * 返回 { book, chapters } 包含书籍元数据和章节列表
 */
import { NextResponse } from 'next/server';
import { getBook, getChaptersByBook } from '@/lib/db';

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

  // 获取章节列表
  const chapters = getChaptersByBook(id);

  return NextResponse.json({
    book,
    chapters: chapters.map(chapter => ({
      id: chapter.id,
      index: chapter.index,
      title: chapter.title,
    })),
  });
}
