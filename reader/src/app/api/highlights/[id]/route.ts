/**
 * PATCH /api/highlights/[id] - 更新高亮批注
 * DELETE /api/highlights/[id] - 删除高亮
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getHighlight, updateHighlightNote, deleteHighlight } from '../../../../lib/db/highlights';

// PATCH 请求体校验 schema
const updateHighlightSchema = z.object({
  note: z.string().nullable().optional(),
});

type UpdateHighlightBody = z.infer<typeof updateHighlightSchema>;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const highlightId = id;

  let body: UpdateHighlightBody;

  try {
    const json = await request.json();
    body = updateHighlightSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: '请求体校验失败', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: '无效的 JSON 请求体' }, { status: 400 });
  }

  // 检查高亮是否存在
  const highlight = getHighlight(highlightId);
  if (!highlight) {
    return NextResponse.json({ error: '高亮不存在' }, { status: 404 });
  }

  // 更新批注（note 为可选，若未提供则不更新）
  if (body.note !== undefined) {
    const updated = updateHighlightNote(highlightId, body.note);
    if (!updated) {
      return NextResponse.json({ error: '高亮不存在' }, { status: 404 });
    }
    return NextResponse.json({ highlight: updated });
  }

  // 如果没有提供可更新的字段，返回 400
  return NextResponse.json(
    { error: '至少提供一个可更新的字段（note）' },
    { status: 400 }
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const highlightId = id;

  const deleted = deleteHighlight(highlightId);
  if (!deleted) {
    return NextResponse.json({ error: '高亮不存在' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
