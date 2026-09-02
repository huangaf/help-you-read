/**
 * RAG Prompt 构建
 *
 * 根据检索到的上下文构建系统提示，要求模型仅基于上下文回答。
 */

/** Chunk 条目（最小集） */
export interface RAGChunk {
  text: string
}

/**
 * 构建 RAG 系统提示
 *
 * @param question 用户问题
 * @param chunks 检索到的上下文段落
 * @returns 系统提示文本
 */
export function buildRagPrompt(question: string, chunks: RAGChunk[]): string {
  // 无上下文时返回兜底提示
  if (!chunks || chunks.length === 0) {
    return `你是图书问答助手。

用户问题：${question}

书中未找到相关内容。请礼貌告知用户书中没有这个问题答案。

要求：
- 仅基于书中内容回答
- 不要使用外部知识
- 如果书中未找到，明确说明`
  }

  // 构建上下文段落
  const contextTexts = chunks
    .map((chunk, index) => `[来源：段落 ${index + 1}]\n${chunk.text}`)
    .join('\n\n')

  return `你是图书问答助手。请根据以下上下文回答问题。

上下文：
${contextTexts}

用户问题：${question}

要求：
- 仅根据上述上下文回答
- 不要使用外部知识
- 回答中引用来源，格式如 [来源：段落 1]
- 如果上下文中没有答案，明确说明"书中未找到"`
}
