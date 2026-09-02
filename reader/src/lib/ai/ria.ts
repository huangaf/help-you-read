/**
 * RIA 便签生成
 *
 * 依据《docs/详细设计.md》第 5.2 节 RIA 阅读法实现。
 */
import * as fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { generateStructured } from './client'
import type { RiaResult } from '@/types'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** RIA 便签生成结果 Zod Schema */
export const RiaSchema = z.object({
  I: z.string().describe('用自己的话重述核心概念（80-150 字）'),
  A1_question: z.string().describe('引导用户回忆相关经验的开放性问题'),
  A2: z.string().describe('具体可执行的行动计划（30-80 字，含对象和场景）'),
})

// ---------------------------------------------------------------------------
// 核心函数
// ---------------------------------------------------------------------------

/** RIA 生成选项 */
export interface GenerateRiaOptions {
  /** 可选的上下文信息（如章节标题、书籍主题等） */
  context?: string
  /** 真实 LLM 调用超时（ms），默认不设 */
  timeout?: number
}

/**
 * 生成 RIA 便签
 *
 * @param quote 原文片段
 * @param opts 选项
 * @returns RIA 便签生成结果
 */
export async function generateRia(
  quote: string,
  opts?: GenerateRiaOptions,
): Promise<RiaResult> {
  // 1. 读取模板
  const templatePath = path.join(process.cwd(), 'src', 'prompts', 'ria.md')
  const template = fs.readFileSync(templatePath, 'utf8')

  // 2. 替换占位符
  let prompt = template.replace('{quote}', quote)

  // 3. 可选上下文追加
  if (opts?.context) {
    prompt = prompt.replace('{context}', `关联上下文：${opts.context}\n`)
  } else {
    prompt = prompt.replace('{context}', '')
  }

  // 4. 调用 LLM 生成结构化输出
  return generateStructured<RiaResult>(RiaSchema, prompt)
}
