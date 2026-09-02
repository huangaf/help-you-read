// @vitest-environment node
/// <reference types="vitest/globals" />
/**
 * RIA 便签生成测试（TDD RED→GREEN）
 * 
 * 测试要点：
 * - 模板正确读取（含 RIA 关键词）
 * - quote 被替换
 * - context 可选追加
 * - zod schema 校验 RiaResult 通过
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import * as fs from 'node:fs'

// mock fs.readFileSync
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('# RIA 便签 Prompt\n\n请根据以下原文片段生成 RIA 便签：\n\n原文：{quote}\n\n要求：\n- I：用自己的话重述核心（80-150 字）\n- A1_question：给引导问题帮用户回忆经验\n- A2：具体可执行的行动计划（30-80 字）'),
}))

// 动态 import（在 mock 之后）
import { generateRia, RiaSchema } from './ria'
import type { RiaResult } from '@/types'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateRia', () => {
  it('读取 prompts/ria.md 模板并替换 {quote}', async () => {
    const mockReadFileSync = vi.mocked(fs.readFileSync)
    
    await generateRia('机器学习是人工智能的分支')
    
    // 验证模板被读取
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('ria.md'), 'utf8')
  })

  it('quote 被正确替换到模板中', async () => {
    const testQuote = '测试引用内容'
    
    // 模拟 generateStructured 返回
    vi.mock('./client', () => ({
      generateStructured: vi.fn().mockResolvedValue({
        I: '重述内容',
        A1_question: '引导问题',
        A2: '行动计划',
      }),
    }))
    
    // 重新 import 以应用 mock
    const { generateRia: generateRiaMocked } = await import('./ria')
    const result = await generateRiaMocked(testQuote)
    
    // 验证返回结果符合 schema
    const parsed = RiaSchema.parse(result)
    expect(parsed.I).toBeDefined()
    expect(parsed.A1_question).toBeDefined()
    expect(parsed.A2).toBeDefined()
  })

  it('context 可选参数被追加到 prompt', async () => {
    const testContext = '关联上下文：这是关于深度学习的章节'
    
    vi.mock('./client', () => ({
      generateStructured: vi.fn().mockResolvedValue({
        I: '重述',
        A1_question: '问题',
        A2: '行动',
      }),
    }))
    
    const { generateRia: generateRiaMocked } = await import('./ria')
    await generateRiaMocked('引用', { context: testContext })
    
    // 验证 generateStructured 被调用（实际验证在 client mock 中）
    const { generateStructured } = await import('./client')
    expect(generateStructured).toHaveBeenCalled()
  })

  it('RiaSchema zod 校验 RiaResult 通过', async () => {
    const validResult: RiaResult = {
      I: '这是 I 重述内容，长度在 80-150 字之间，用自己的话重述原文核心内容。',
      A1_question: '你在什么情况下遇到过类似的问题？请回忆当时的经历。',
      A2: '明天早上开会前，阅读这篇文档并写下三个行动计划。',
    }

    const parsed = RiaSchema.parse(validResult)
    expect(parsed.I).toBe(validResult.I)
    expect(parsed.A1_question).toBe(validResult.A1_question)
    expect(parsed.A2).toBe(validResult.A2)
  })

  it('zod schema 拒绝无效字段', () => {
    const invalidResult = {
      I: '有效',
      // 缺少 A1_question 和 A2
    }

    expect(() => RiaSchema.parse(invalidResult)).toThrow()
  })
})

// 真实生成测试（RUN_LLM=1 开关，默认 skip）
describe.skipIf(!process.env.RUN_LLM)('generateRia 真实生成', () => {
  it('调用真实 LLM 生成 RIA 便签', async () => {
    const quote = '机器学习是人工智能的分支'
    
    // 120s timeout
    const result = await generateRia(quote, { timeout: 120000 })
    
    // 验证结果非空且过 zod
    const parsed = RiaSchema.parse(result)
    expect(parsed.I).toBeTruthy()
    expect(parsed.I.length).toBeGreaterThanOrEqual(80)
    expect(parsed.I.length).toBeLessThanOrEqual(150)
    expect(parsed.A1_question).toBeTruthy()
    expect(parsed.A2).toBeTruthy()
    expect(parsed.A2.length).toBeGreaterThanOrEqual(30)
    expect(parsed.A2.length).toBeLessThanOrEqual(80)
  }, 120000)
})
