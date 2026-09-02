/**
 * AI 对话（RAG 流式问答）
 *
 * POST /api/books/[id]/chat
 * - body: { question: string, location?: string, selection?: string }
 * - 响应：SSE 流式 { text: string } + [DONE]
 *
 * 流程：
 * 1. 读取书籍（不存在 404）
 * 2. 读取章节 → 分块 → embedding → 构建 HybridRetriever（模块级缓存）
 * 3. search(question, topK=8)
 * 4. buildRagPrompt → chatStream
 * 5. SSE 响应：data: {text: chunk}\n\n + data: [DONE]\n\n
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getBook, getChaptersByBook } from '@/lib/db/index'
import type { ChatRequest } from '@/types'
import { HybridRetriever, type ChunkEntry, type EmbedQueryFn } from '@/lib/rag/retriever'
import { buildRagPrompt, type RAGChunk } from '@/lib/rag/prompt'
import { chatStream, type ChatMessage } from '@/lib/ai/client'
import { embedTexts } from '@/lib/vector/embedding'

// 模块级缓存：bookId → HybridRetriever
const retrieverCache = new Map<string, HybridRetriever>()

// 分块大小（字符数）
const CHUNK_SIZE = 500
// 向量维度（与 embedding 模型一致，qwen3-embedding 为 1024）
const VECTOR_DIM = 1024

/**
 * 简单文本分块（按字符数切分，不跨段落）
 */
function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + size
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end)
      if (lastSpace > start) {
        end = lastSpace
      }
    }
    const chunk = text.slice(start, end).trim()
    if (chunk) {
      chunks.push(chunk)
    }
    start = end
  }

  return chunks
}

/**
 * 查询向量生成函数（调用真实 embedding）
 */
const embedQueryFn: EmbedQueryFn = async (query: string): Promise<number[]> => {
  const vectors = await embedTexts([query])
  return vectors[0]
}

/**
 * 构建书籍的检索索引（带缓存）
 */
async function buildRetrieverForBook(bookId: string, chapters: Array<{ id: string; title: string; content: string }>): Promise<HybridRetriever> {
  if (retrieverCache.has(bookId)) {
    return retrieverCache.get(bookId)!
  }

  const retriever = new HybridRetriever(VECTOR_DIM, embedQueryFn)

  const allText = chapters
    .map(ch => `${ch.title}\n${ch.content}`)
    .join('\n\n')

  const chunks = chunkText(allText, CHUNK_SIZE)
  const vectors = await embedTexts(chunks)

  const chunkEntries: ChunkEntry[] = chunks.map((text, index) => ({
    id: `chunk-${index}`,
    text,
    vector: vectors[index],
  }))

  retriever.addChunks(chunkEntries)
  retrieverCache.set(bookId, retriever)

  return retriever
}

/**
 * POST /api/books/[id]/chat
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookId } = await params

    // 1. 读取书籍
    const book = getBook(bookId)
    if (!book) {
      return NextResponse.json({ error: `书籍 ${bookId} 不存在` }, { status: 404 })
    }

    // 2. 解析请求体
    let chatRequest: ChatRequest
    try {
      chatRequest = await request.json()
    } catch {
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
    }

    const { question } = chatRequest

    // 空问题处理：返回空流（不报错）
    if (!question?.trim()) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })

      return new NextResponse(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          'Connection': 'keep-alive',
        },
      })
    }

    // 3. 从数据库读取章节
    const dbChapters = getChaptersByBook(bookId)
    
    // 转换为 route 需要的格式
    const chapters = dbChapters.map(ch => ({
      id: ch.id,
      title: ch.title,
      content: ch.content,
    }))

    // 如果有章节，构建检索器
    let retriever: HybridRetriever
    if (chapters.length > 0) {
      retriever = await buildRetrieverForBook(bookId, chapters)
    } else {
      retriever = new HybridRetriever(VECTOR_DIM, embedQueryFn)
    }

    // 4. 搜索相关上下文
    const topK = 8
    const searchResults = await retriever.search(question, topK)

    // 5. 构建 RAG prompt
    const chunks: RAGChunk[] = searchResults.map(r => ({ text: r.text }))
    const systemPrompt = buildRagPrompt(question, chunks)

    // 6. 构造消息
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ]

    // 7. 创建 SSE 流式响应
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送流式数据
          for await (const chunk of chatStream(messages)) {
            const data = JSON.stringify({ text: chunk })
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }

          // 发送结束标记
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          // 流内错误：发送 error 数据帧
          const errorMsg = error instanceof Error ? error.message : '未知错误'
          const errorData = JSON.stringify({ error: errorMsg })
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    // 顶层错误处理
    const message = error instanceof Error ? error.message : '服务器内部错误'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Next.js 动态渲染：避免缓存
export const dynamic = 'force-dynamic'
