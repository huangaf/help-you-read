/**
 * LangChain 多模型客户端（M0 支柱 4）
 *
 * 统一指向 OpenAI 兼容端点（oMLX / DeepSeek / OpenAI）：
 * - getChatModel：从 .env（LLM_* 变量）读取配置构造 ChatOpenAI
 * - chatStream：封装 model.stream，抽取字符串 content（兼容 string | 对象数组）
 * - generateStructured：withStructuredOutput 结构化输出
 *   （本地端点不支持 jsonSchema response_format，须显式 functionCalling）
 */
import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 从 LLM chunk 中提取纯文本 content（兼容 string 与多模态对象数组） */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function getChatModel(): ChatOpenAI {
  const apiKey = process.env.LLM_API_KEY
  const baseURL = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL
  if (!apiKey || !baseURL || !model) {
    throw new Error('缺少 LLM 配置：请检查 .env 中的 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL')
  }
  return new ChatOpenAI({
    model,
    apiKey,
    configuration: { baseURL },
    streamUsage: false,
    temperature: 0.7,
  })
}

export async function* chatStream(
  messages: ChatMessage[],
): AsyncIterable<string> {
  const model = getChatModel()
  const stream = await model.stream(messages as unknown as BaseMessage[])
  for await (const chunk of stream) {
    const text = extractText(chunk.content)
    if (text) yield text
  }
}

export async function generateStructured<T>(
  schema: ZodType<T>,
  prompt: string,
): Promise<T> {
  const model = getChatModel()
  const structured = model.withStructuredOutput(schema, {
    method: 'functionCalling',
    name: 'result',
  })
  return (await structured.invoke(prompt)) as T
}
