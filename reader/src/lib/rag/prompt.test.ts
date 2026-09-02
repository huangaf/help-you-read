/**
 * RAG Prompt 构建测试
 */

import { describe, it, expect } from 'vitest'
import { buildRagPrompt } from './prompt'

describe('buildRagPrompt', () => {
  it('应该基于上下文构建带引用的 prompt', () => {
    const question = '什么是相对论？'
    const chunks = [
      { text: '相对论是爱因斯坦提出的物理理论。' },
      { text: '它包括狭相对论和广义相对论。' },
    ]

    const prompt = buildRagPrompt(question, chunks)

    expect(prompt).toContain('[来源：段落 1]')
    expect(prompt).toContain('[来源：段落 2]')
    expect(prompt).toContain('相对论是爱因斯坦提出的物理理论')
    expect(prompt).toContain('它包括狭相对论和广义相对论')
    expect(prompt).toContain('问题：什么是相对论？')
  })

  it('无上下文时应说明"书中未找到"', () => {
    const question = '书中未提及的内容'
    const chunks: { text: string }[] = []

    const prompt = buildRagPrompt(question, chunks)

    expect(prompt).toContain('书中未找到')
    expect(prompt).toContain('书中未提及的内容')
  })

  it('应该仅基于上下文回答的指令', () => {
    const chunks = [{ text: '测试内容' }]
    const prompt = buildRagPrompt('问题', chunks)

    expect(prompt).toContain('仅根据上述上下文')
    expect(prompt).toContain('不要使用外部知识')
  })

  it('多个 chunk 时应该按顺序编号引用', () => {
    const chunks = [
      { text: '第一段' },
      { text: '第二段' },
      { text: '第三段' },
    ]

    const prompt = buildRagPrompt('问题', chunks)

    expect(prompt).toContain('[来源：段落 1]')
    expect(prompt).toContain('[来源：段落 2]')
    expect(prompt).toContain('[来源：段落 3]')
  })
})
