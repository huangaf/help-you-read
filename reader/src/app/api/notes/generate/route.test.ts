/**
 * /api/notes/generate 路由测试（TDD RED→GREEN）
 *
 * 测试要点：
 * - mock generateRia（不真实调 LLM）
 * - 断言返回 RiaResult 结构
 * - 缺 quote → 400
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

// mock generateRia
vi.mock('@/lib/ai/ria');

import { POST } from './route';
import { generateRia } from '@/lib/ai/ria';
const mockGenerateRia = vi.mocked(generateRia);

// 模拟请求体
function makeRequestBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    quote: '机器学习是人工智能的分支',
    bookId: 'book-' + crypto.randomUUID().slice(0, 8),
    context: '这是关于深度学习的章节',
    ...overrides,
  };
}

describe('POST /api/notes/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('合法请求 → 200 { I, A1_question, A2 }', async () => {
    const mockResult = {
      I: '用自己的话重述核心概念（80-150 字）',
      A1_question: '引导用户回忆相关经验的开放性问题',
      A2: '具体可执行的行动计划（30-80 字，含对象和场景）',
    };
    mockGenerateRia.mockResolvedValueOnce(mockResult);

    const reqBody = makeRequestBody();
    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.I).toBe(mockResult.I);
    expect(data.A1_question).toBe(mockResult.A1_question);
    expect(data.A2).toBe(mockResult.A2);
  });

  it('缺 quote → 400', async () => {
    const reqBody = makeRequestBody();
    reqBody.quote = undefined;

    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('quote');
  });

  it('quote 为空字符串 → 400', async () => {
    const reqBody = makeRequestBody({ quote: '' });

    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('有 context 参数 → 传递给 generateRia', async () => {
    const mockResult = {
      I: '重述',
      A1_question: '问题',
      A2: '行动',
    };
    mockGenerateRia.mockResolvedValueOnce(mockResult);

    const reqBody = makeRequestBody({
      quote: '测试引用',
      context: '关联上下文信息',
    });
    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    await POST(req);

    // 验证 generateRia 被调用时带了 context
    expect(mockGenerateRia).toHaveBeenCalledWith('测试引用', {
      context: '关联上下文信息',
    });
  });

  it('无 context 参数 → generateRia 不传 context', async () => {
    const mockResult = {
      I: '重述',
      A1_question: '问题',
      A2: '行动',
    };
    mockGenerateRia.mockResolvedValueOnce(mockResult);

    const reqBody = makeRequestBody();
    reqBody.context = undefined;
    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    await POST(req);

    // 验证 generateRia 被调用时第二个参数的 context 字段是 undefined
    expect(mockGenerateRia).toHaveBeenCalledTimes(1);
    const secondArg = mockGenerateRia.mock.calls[0][1];
    expect(secondArg).toEqual({});
  });

  it('bookId 参数被忽略（仅用于前端上下文，不影响生成）', async () => {
    const mockResult = {
      I: '重述',
      A1_question: '问题',
      A2: '行动',
    };
    mockGenerateRia.mockResolvedValueOnce(mockResult);

    const reqBody = makeRequestBody({
      bookId: 'some-book-id',
      context: '上下文',
    });
    const req = new NextRequest('http://localhost/api/notes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    await POST(req);

    // bookId 不影响 generateRia 调用
    expect(mockGenerateRia).toHaveBeenCalled();
  });
});
