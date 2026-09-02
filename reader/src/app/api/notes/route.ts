/**
 * RIA 便签接口
 *
 * POST: 创建便签（I/A1/A2）
 * GET: 按书过滤便签列表
 * 详见 docs/详细设计.md 第 4.2 节
 */
import { NextRequest, NextResponse } from 'next/server';
import { createNote, getNotesByBook } from '@/lib/db/notes';
import type { Note, NoteType } from '@/types';

// ---------------------------------------------------------------------------
// POST /api/notes
// ---------------------------------------------------------------------------

interface CreateNoteBody {
  bookId: string;
  type: string;
  content: string;
  highlightId?: string | null;
  chapterId?: string | null;
  sourceQuote?: string | null;
}

/** 验证 NoteType */
function isValidNoteType(type: string): type is NoteType {
  return type === 'I' || type === 'A1' || type === 'A2';
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateNoteBody = await req.json();

    // 必填字段校验
    if (!body.bookId) {
      return NextResponse.json({ error: 'bookId 为必填字段' }, { status: 400 });
    }
    if (!body.type) {
      return NextResponse.json({ error: 'type 为必填字段' }, { status: 400 });
    }
    if (!body.content) {
      return NextResponse.json({ error: 'content 为必填字段' }, { status: 400 });
    }

    // type 校验
    if (!isValidNoteType(body.type)) {
      return NextResponse.json(
        { error: 'type 必须是 I、A1 或 A2' },
        { status: 400 }
      );
    }

    // 构造 Note
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      bookId: body.bookId,
      type: body.type,
      content: body.content,
      highlightId: body.highlightId ?? null,
      chapterId: body.chapterId ?? null,
      sourceQuote: body.sourceQuote ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const created = createNote(note);

    return NextResponse.json({ note: created }, { status: 201 });
  } catch (error) {
    console.error('[notes POST] 解析请求失败:', error);
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/notes?bookId=xxx
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      // 无 bookId 参数返回空数组
      return NextResponse.json({ notes: [] });
    }

    const notes = getNotesByBook(bookId);

    return NextResponse.json({ notes });
  } catch (error) {
    console.error('[notes GET] 查询失败:', error);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
