/**
 * 读书档案 API（麦肯锡，M1 场景 S6）
 *
 * - GET: 读取书籍的读书档案
 * - POST: 生成并保存读书档案（调用 LLM，非流式）
 *
 * 详见 docs/详细设计.md 第 4.4 节
 */
import { NextResponse } from 'next/server';
import { getBook, getChaptersByBook } from '@/lib/db';
import { getArchiveByBook, upsertArchive } from '@/lib/db/archives';
import { generateArchive } from '@/lib/ai/archive';
import type { ReadingArchive } from '@/types';

// ---------------------------------------------------------------------------
// 核心处理函数（供测试使用）
// ---------------------------------------------------------------------------

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function handleGet(request: Request, { params }: RouteParams) {
  const { id: bookId } = await params;

  const archive = getArchiveByBook(bookId);

  return NextResponse.json({ archive });
}

export async function handlePost(request: Request, { params }: RouteParams) {
  const { id: bookId } = await params;

  // 检查书籍是否存在
  const book = getBook(bookId);
  if (!book) {
    return NextResponse.json(
      { error: '书籍不存在' },
      { status: 404 }
    );
  }

  // 解析请求体
  let purpose: string | null = null;
  try {
    const body = await request.json();
    purpose = body?.purpose ?? null;
  } catch {
    // 无 body 或解析失败，purpose 保持 null
  }

  // 获取书籍章节
  const chapters = getChaptersByBook(bookId);

  // 调用 AI 生成档案
  const archiveResult = await generateArchive({
    title: book.title,
    author: book.author,
    chapters: chapters.map(ch => ({ title: ch.title, content: ch.content })),
  });

  // 构建档案数据
  const archiveData: Omit<ReadingArchive, 'id' | 'createdAt' | 'updatedAt'> = {
    bookId,
    purpose,
    keyTakeaways: archiveResult.keyTakeaways.join('\n'),
    actionPlan: archiveResult.actionPlan.join('\n'),
    output: archiveResult.output,
    aiDraft: JSON.stringify(archiveResult),
  };

  // 保存档案
  const archive = upsertArchive(archiveData);

  return NextResponse.json({ archive });
}

// ---------------------------------------------------------------------------
// Next.js Route Handlers
// ---------------------------------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  return handleGet(request, { params });
}

export async function POST(request: Request, { params }: RouteParams) {
  return handlePost(request, { params });
}
