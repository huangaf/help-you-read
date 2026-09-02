import { describe, it, expect } from 'vitest';
import { parseSseChunk } from './sse';

describe('parseSseChunk', () => {
  it('解析正常的文本数据帧', () => {
    const chunk = 'data: {"text":"你好"}\n\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toEqual({ text: '你好' });
  });

  it('解析包含多行文本的数据帧', () => {
    const chunk = 'data: {"text":"这是一段\\n多行文本"}\n\n';
    const result = parseSseChunk(chunk);
    
    // JSON.parse 会将 \n 转换为真实换行符
    expect(result).toEqual({ text: '这是一段\n多行文本' });
  });

  it('解析结束标记 [DONE]', () => {
    const chunk = 'data: [DONE]\n\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toEqual({ done: true });
  });

  it('解析错误数据帧', () => {
    const chunk = 'data: {"error":"网络错误"}\n\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toEqual({ error: '网络错误' });
  });

  it('解析多个连续数据帧', () => {
    const chunk = 'data: {"text":"第一"}\n\ndata: {"text":"第二"}\n\n';
    const result = parseSseChunk(chunk);
    
    // 只返回最后一个有效数据
    expect(result).toEqual({ text: '第二' });
  });

  it('对非数据帧返回 null', () => {
    const chunk = 'event: message\nid: 1\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toBeNull();
  });

  it('对空字符串返回 null', () => {
    const result = parseSseChunk('');
    expect(result).toBeNull();
  });

  it('对无效 JSON 返回 null', () => {
    const chunk = 'data: {invalid json}\n\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toBeNull();
  });

  it('解析带额外空白的数据帧', () => {
    const chunk = 'data:   {"text":"测试"}  \n\n';
    const result = parseSseChunk(chunk);
    
    expect(result).toEqual({ text: '测试' });
  });

  it('解析完整的 SSE 流片段', () => {
    const chunks = [
      'data: {"text":"思考"}\n\n',
      'data: {"text":"中"}\n\n',
      'data: {"text":"。"}\n\n',
      'data: [DONE]\n\n',
    ];

    let finalResult: { text?: string; done?: boolean } | null = null;
    
    for (const chunk of chunks) {
      const result = parseSseChunk(chunk);
      if (result?.text) {
        finalResult = result;
      }
      if (result?.done) {
        break;
      }
    }
    
    expect(finalResult).toEqual({ text: '。' });
  });
});
