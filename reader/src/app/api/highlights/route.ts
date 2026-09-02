/**
 * GET /api/highlights - 查询高亮列表
 * POST /api/highlights - 创建高亮
 *
 * GET 请求体：?bookId=xxx
 * POST 请求体：{ bookId, quote, cfi, color?, note? }
 * - 校验：缺 bookId/quote/cfi → 400；bookId 不存在 → 404
 * - 成功：201 { highlight }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getBook } from '../../../lib/db';
import { createHighlight, getHighlightsByBook } from '../../../lib/db/highlights';

// 请求体校验 schema
const createHighlightSchema = z.object({
  bookId: z.string().min(1, 'bookId 必填'),
  quote: z.string().min(1, 'quote 必填'),
  cfi: z.string().nullable(),
  color: z.enum(['yellow', 'green', 'blue', 'pink', 'purple']).optional(),
  note: z.string().nullable().optional(),
});

type CreateHighlightBody = z.infer<typeof createHighlightSchema>;

// ---------------------------------------------------------------------------
// GET - 查询高亮列表
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get('bookId');

  if (!bookId) {
    return NextResponse.json({ error: 'bookId 必填' }, { status: 400 });
  }

  // 校验书籍是否存在
  const book = getBook(bookId);
  if (!book) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 });
  }

  // 获取高亮列表
  const highlights = getHighlightsByBook(bookId);

  return NextResponse.json({ highlights });
}

// ---------------------------------------------------------------------------
// POST - 创建高亮
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: CreateHighlightBody;

  try {
    const json = await request.json();
    body = createHighlightSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '请求体校验失败', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: '无效的 JSON 请求体' }, { status: 400 });
  }

  // 校验 bookId 是否存在
  const book = getBook(body.bookId);
  if (!book) {
    return NextResponse.json({ error: '书籍不存在' }, { status: 404 });
  }

  // 创建高亮
  const highlight = createHighlight({
    bookId: body.bookId,
    quote: body.quote,
    cfi: body.cfi,
    color: body.color,
    note: body.note ?? null,
  });

  return NextResponse.json({ highlight }, { status: 201 });
}
