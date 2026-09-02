/**
 * 向量 Embedding 适配
 *
 * 从 .env 读取 EMBEDDING_API_KEY/EMBEDDING_BASE_URL/EMBEDDING_MODEL，
 * 构造 OpenAIEmbeddings 用于批量文本向量化。
 */

import { OpenAIEmbeddings } from '@langchain/openai'

/**
 * 获取 Embedding 实例
 *
 * 从 .env 读取配置：
 * - EMBEDDING_API_KEY
 * - EMBEDDING_BASE_URL
 * - EMBEDDING_MODEL
 */
export function getEmbeddings(): OpenAIEmbeddings {
  const apiKey = process.env.EMBEDDING_API_KEY
  const baseURL = process.env.EMBEDDING_BASE_URL
  const model = process.env.EMBEDDING_MODEL

  if (!apiKey || !baseURL || !model) {
    throw new Error(
      '缺少 Embedding 配置：请检查 .env 中的 EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL',
    )
  }

  return new OpenAIEmbeddings({
    model,
    apiKey,
    configuration: { baseURL },
  })
}

/**
 * 批量文本向量化
 *
 * @param texts 待向量的文本数组
 * @returns 向量数组，每个向量维度一致
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const embeddings = getEmbeddings()
  const result = await embeddings.embedDocuments(texts)
  return result
}
