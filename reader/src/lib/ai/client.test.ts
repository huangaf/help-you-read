// @vitest-environment node
/// <reference types="vitest/globals" />
/**
 * LangChain 客户端测试（分层）
 * - 纯逻辑（默认）：mock ChatOpenAI，断言 getChatModel 读 env 构造参数正确
 * - 连通（RUN_LLM=1）：真实调 oMLX，验证 chatStream / generateStructured
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { RiaResult } from '@/types'

// mock @langchain/openai 的 ChatOpenAI（类 mock，可被 new，记录构造参数）
const mockOpts: unknown[] = []
vi.mock('@langchain/openai', () => {
  const instanceMethods: Record<string, unknown> = {}
  class MockChatOpenAI {
    constructor(opts: unknown) {
      mockOpts.push(opts)
      // 把测试注入的方法挂到实例上
      Object.assign(this, instanceMethods)
    }
  }
  ;(MockChatOpenAI as unknown as { instanceMethods: Record<string, unknown> }).instanceMethods = instanceMethods
  return { ChatOpenAI: MockChatOpenAI }
})

// 需在 mock 之后动态 import（ESM mock 提升）
import { getChatModel, chatStream, generateStructured } from './client'

// 设置 mock 实例方法（stream/withStructuredOutput），各测试 beforeEach 注入
import { ChatOpenAI } from '@langchain/openai'
const MockChatOpenAI = ChatOpenAI as unknown as {
  new (opts: unknown): unknown
  instanceMethods: Record<string, unknown>
}

function setInstanceMethod(name: string, impl: unknown) {
  MockChatOpenAI.instanceMethods[name] = impl
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOpts.length = 0
  for (const k of Object.keys(MockChatOpenAI.instanceMethods)) {
    delete MockChatOpenAI.instanceMethods[k]
  }
  delete process.env.LLM_API_KEY
  delete process.env.LLM_BASE_URL
  delete process.env.LLM_MODEL
})

describe('getChatModel', () => {
  it('读取 env 配置并构造 ChatOpenAI（baseURL/model/apiKey/streamUsage:false）', () => {
    process.env.LLM_API_KEY = 'sk-test-key'
    process.env.LLM_BASE_URL = 'http://localhost:8090/v1'
    process.env.LLM_MODEL = 'qwen-test'

    getChatModel()
    expect(mockOpts).toHaveLength(1)
    const args = mockOpts[0] as Record<string, unknown>
    expect(args.model).toBe('qwen-test')
    expect(args.apiKey).toBe('sk-test-key')
    expect(args.configuration).toEqual({ baseURL: 'http://localhost:8090/v1' })
    expect(args.streamUsage).toBe(false)
    expect(args.temperature).toBe(0.7)
  })

  it('缺 env 时抛错提示配置', () => {
    expect(() => getChatModel()).toThrow()
  })
})

describe('chatStream', () => {
  it('从 stream 中提取字符串 content（含对象数组 content）', async () => {
    process.env.LLM_API_KEY = 'sk'
    process.env.LLM_BASE_URL = 'http://x'
    process.env.LLM_MODEL = 'm'
    const chunks = [
      { content: '你好' },
      { content: [{ type: 'text', text: '，世界' }] },
      { content: '' },
    ]
    setInstanceMethod('stream', async function* () {
      for (const c of chunks) yield c
    })

    const out: string[] = []
    for await (const s of chatStream([{ role: 'user', content: 'hi' }])) {
      out.push(s)
    }
    expect(out.join('')).toBe('你好，世界')
  })
})

describe('generateStructured', () => {
  it('用 withStructuredOutput(functionCalling) 生成并通过 zod 校验', async () => {
    process.env.LLM_API_KEY = 'sk'
    process.env.LLM_BASE_URL = 'http://x'
    process.env.LLM_MODEL = 'm'
    let capturedMethod: string | undefined
    setInstanceMethod('withStructuredOutput', (_schema: unknown, config: { method?: string }) => {
      capturedMethod = config?.method
      return {
        invoke: async () => ({ I: '复述内容', A1_question: '回忆', A2: '行动' }),
      }
    })

    const schema = z.object({
      I: z.string(),
      A1_question: z.string(),
      A2: z.string(),
    })
    const result = await generateStructured<RiaResult>(schema, '请拆书')
    expect(capturedMethod).toBe('functionCalling')
    expect(result.I).toBe('复述内容')
  })
})
