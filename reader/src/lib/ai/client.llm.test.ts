// @vitest-environment node
/// <reference types="vitest/globals" />
/**
 * oMLX 真实连通测试（RUN_LLM=1 才执行，默认 skip）
 *
 * 与 client.test.ts 分离：本文件不 mock ChatOpenAI，直接调真实 client，
 * 需要 .env 提供 LLM_* 配置（运行时通过 export 注入）。
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chatStream, generateStructured } from './client'
import type { RiaResult } from '@/types'

const runLlm = process.env.RUN_LLM === '1'
const itLlm = runLlm ? it : it.skip

describe('oMLX 真实联通（RUN_LLM=1）', () => {
  itLlm('chatStream 返回非空中文回答', { timeout: 120000 }, async () => {
    const out: string[] = []
    for await (const s of chatStream([{ role: 'user', content: '用一句话介绍你自己' }])) {
      out.push(s)
    }
    expect(out.join('').length).toBeGreaterThan(0)
  })

  itLlm('generateStructured 返回通过 zod 校验的 RIA 便签', { timeout: 120000 }, async () => {
    const schema = z.object({ I: z.string(), A1_question: z.string(), A2: z.string() })
    const result = await generateStructured<RiaResult>(
      schema,
      '请把"机器学习是人工智能的一个分支"拆成 RIA 便签',
    )
    expect(result.I.length).toBeGreaterThan(0)
    expect(result.A2.length).toBeGreaterThan(0)
  })
})
