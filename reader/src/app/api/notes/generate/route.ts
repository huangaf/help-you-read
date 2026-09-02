/**
 * RIA 便签 AI 生成接口
 *
 * POST: 调用 LLM 生成 RIA 便签（I/A1/A2）
 * 详见 docs/详细设计.md 第 4.2 节
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateRia } from '@/lib/ai/ria';

// ---------------------------------------------------------------------------
// POST /api/notes/generate
// ---------------------------------------------------------------------------

interface GenerateRiaBody {
  quote: string;
  bookId?: string;
  context?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateRiaBody = await req.json();

    // 必填字段校验
    if (!body.quote || body.quote.trim() === '') {
      return NextResponse.json({ error: 'quote 为必填字段且不能为空' }, { status: 400 });
    }

    // 调用 generateRia（异步，等待完成）
    const result = await generateRia(body.quote, {
      context: body.context,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[notes/generate POST] 生成失败:', error);
    return NextResponse.json({ error: '生成失败' }, { status: 500 });
  }
}
