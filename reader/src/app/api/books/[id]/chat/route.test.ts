/**
 * RAG 流式问答 API 测试
 *
 * 测试 SSE 流式响应、book 不存在 404、mock 检索和 LLM
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock 模块
vi.mock('@/lib/rag/retriever', () => ({
  HybridRetriever: class MockHybridRetriever {
    addChunks = vi.fn()
    search = vi.fn().mockResolvedValue([
      { id: 'mock-chunk-1', text: 'mock context text', score: 0.85 },
    ])
    get size() { return 1 }
  },
}))

vi.mock('@/lib/ai/client', () => ({
  chatStream: vi.fn().mockImplementation(async function* () {
    yield 'mock '
    yield 'stream '
    yield 'response'
  }),
}))

vi.mock('@/lib/db/index', () => ({
  getBook: vi.fn(),
  getChaptersByBook: vi.fn(),
}))

vi.mock('@/lib/vector/embedding', () => ({
  embedTexts: vi.fn().mockResolvedValue([Array(1024).fill(0.1)]),
  getEmbeddings: vi.fn(),
}))

import { POST } from './route'
import { getBook, getChaptersByBook } from '@/lib/db/index'
import { chatStream } from '@/lib/ai/client'
import { HybridRetriever } from '@/lib/rag/retriever'
import { embedTexts } from '@/lib/vector/embedding'

// 辅助函数：构造 NextRequest
function makeRequest(body: unknown, bookId = 'test-book-id'): NextRequest {
  return new NextRequest(`http://localhost/api/books/${bookId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/books/[id]/chat', () => {
  describe('book 不存在', () => {
    test('返回 404', async () => {
      vi.mocked(getBook).mockReturnValue(null)

      const req = makeRequest({ question: '测试问题' })
      const res = await POST(req, { params: Promise.resolve({ id: 'non-existent' }) })

      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.error).toContain('不存在')
    })
  })

  describe('book 存在', () => {
    beforeEach(() => {
      vi.mocked(getBook).mockReturnValue({
        id: 'test-book-id',
        title: '测试书籍',
        author: '测试作者',
        coverPath: null,
        format: 'epub',
        filePath: '/test.epub',
        fileHash: null,
        status: 'reading',
        grade: 1,
        totalChapters: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      vi.mocked(getChaptersByBook).mockReturnValue([
        { id: 'ch1', bookId: 'test-book-id', index: 0, title: '第一章', content: '机器学习是人工智能的分支', charCount: 12 },
        { id: 'ch2', bookId: 'test-book-id', index: 1, title: '第二章', content: 'RIA 便签法强调拆为己用', charCount: 12 },
      ])
      vi.mocked(embedTexts).mockResolvedValue([
        Array(1024).fill(0.1),
        Array(1024).fill(0.1),
      ])
    })

    test('返回 SSE 流式响应，包含 text 数据帧和 [DONE]', async () => {
      // mock 检索结果
      const mockRetriever = new HybridRetriever(4)
      vi.mocked(mockRetriever.search).mockResolvedValue([
        { id: 'c1', text: '上下文内容 1', score: 0.9 },
        { id: 'c2', text: '上下文内容 2', score: 0.8 },
      ])

      // mock chatStream
      vi.mocked(chatStream).mockImplementation(async function* () {
        yield 'Hello'
        yield ' World'
      })

      const req = makeRequest({ question: '测试问题' })
      const res = await POST(req, { params: Promise.resolve({ id: 'test-book-id' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')
      expect(res.headers.get('Cache-Control')).toContain('no-cache')
      expect(res.headers.get('X-Accel-Buffering')).toBe('no')

      // 读取流式响应
      const reader = res.body?.getReader()
      expect(reader).toBeDefined()

      if (!reader) return

      let fullText = ''
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          fullText += new TextDecoder().decode(value)
        }
      }

      // 断言包含 text 数据帧
      expect(fullText).toContain('data: {')
      expect(fullText).toContain('"text":')
      expect(fullText).toContain('Hello')
      expect(fullText).toContain('World')
      // 断言包含 [DONE]
      expect(fullText).toContain('data: [DONE]')
    })

    test('空问题也返回流式响应', async () => {
      const req = makeRequest({ question: '' })
      const res = await POST(req, { params: Promise.resolve({ id: 'test-book-id' }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    })

    test('带 location 和 selection 参数正常处理', async () => {
      const req = makeRequest({
        question: '关于这个主题',
        location: 'epubcfi(/4/2)',
        selection: '选中的文本',
      })
      const res = await POST(req, { params: Promise.resolve({ id: 'test-book-id' }) })

      expect(res.status).toBe(200)
    })
  })

  describe('流内错误处理', () => {
    test('chatStream 抛错时返回 error 数据帧', async () => {
      vi.mocked(getBook).mockReturnValue({
        id: 'test-book-id',
        title: '测试书籍',
        author: null,
        coverPath: null,
        format: 'epub',
        filePath: '/test.epub',
        fileHash: null,
        status: 'reading',
        grade: 1,
        totalChapters: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      // mock chatStream 抛错
      vi.mocked(chatStream).mockImplementation(async function* () {
        throw new Error('LLM 服务不可用')
      })

      const req = makeRequest({ question: '测试问题' })
      const res = await POST(req, { params: Promise.resolve({ id: 'test-book-id' }) })

      expect(res.status).toBe(200)

      const reader = res.body?.getReader()
      if (!reader) return

      let fullText = ''
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          fullText += new TextDecoder().decode(value)
        }
      }

      // 断言包含 error 数据帧
      expect(fullText).toContain('error')
      expect(fullText).toContain('LLM 服务不可用')
    })
  })
})
