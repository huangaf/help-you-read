/**
 * SSE（Server-Sent Events）解析工具
 *
 * 解析格式：data: {JSON}\n\n
 * 结束标记：data: [DONE]\n\n
 * 错误标记：data: {"error": "..."}\n\n
 */

export interface SSEData {
  text?: string;
  error?: string;
  done?: boolean;
}

/**
 * 解析单个 SSE 数据块
 *
 * @param text - SSE 原始文本（可能包含多个数据帧）
 * @returns 解析结果 {text?, error?, done?} 或 null（非数据帧）
 *
 * @example
 * parseSseChunk('data: {"text":"你好"}\n\n')
 * // => { text: "你好" }
 *
 * parseSseChunk('data: [DONE]\n\n')
 * // => { done: true }
 *
 * parseSseChunk('data: {"error":"网络错误"}\n\n')
 * // => { error: "网络错误" }
 */
export function parseSseChunk(text: string): SSEData | null {
  // 按双换行符分割，处理多个数据帧
  const frames = text.split('\n\n').filter(f => f.trim());

  let result: SSEData | null = null;

  for (const frame of frames) {
    // 匹配 "data: ..." 格式（不使用 /s 标志，改用 . 匹配除换行外的所有字符）
    const match = frame.match(/^data:\s*([\s\S]*)$/);
    if (!match) {
      // 非数据帧，跳过
      continue;
    }

    const dataStr = match[1].trim();

    // 结束标记
    if (dataStr === '[DONE]') {
      return { done: true };
    }

    // 尝试解析 JSON
    try {
      const data = JSON.parse(dataStr) as { text?: string; error?: string };

      if (typeof data.text === 'string') {
        result = { text: data.text };
      } else if (typeof data.error === 'string') {
        return { error: data.error };
      }
    } catch {
      // JSON 解析失败，跳过
      continue;
    }
  }

  return result;
}

/**
 * 创建 SSE 流读取器
 *
 * @param reader - ReadableStreamDefaultReader
 * @param onChunk - 收到数据帧的回调
 * @param onComplete - 流结束的回调
 * @param onError - 错误的回调
 */
export async function readSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (data: SSEData) => void,
  onComplete: () => void,
  onError: (error: Error) => void,
) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // 处理剩余缓冲区
        if (buffer.trim()) {
          const data = parseSseChunk(buffer);
          if (data) {
            onChunk(data);
            if (data.done) {
              onComplete();
              return;
            }
          }
        }
        onComplete();
        return;
      }

      // 解码并累积到缓冲区
      buffer += decoder.decode(value, { stream: true });

      // 尝试解析完整的数据帧
      let frameEnd: number;
      while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);

        const data = parseSseChunk(frame);
        if (data) {
          onChunk(data);
          if (data.done) {
            onComplete();
            return;
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error('流读取失败'));
  }
}
