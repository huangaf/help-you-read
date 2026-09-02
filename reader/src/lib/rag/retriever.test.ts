/**
 * HybridRetriever 单元测试
 *
 * 测试 mock embedding 注入、RRF 融合、空查询处理
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { HybridRetriever } from './retriever'

// Mock embedding 函数：根据文本内容返回伪向量
function createMockEmbedding(text: string): number[] {
  const dims = 4
  const vector = new Array(dims).fill(0)
  
  // 根据关键词设置向量值
  if (text.includes('机器学习')) {
    vector[0] = 1
  }
  if (text.includes('深度学习')) {
    vector[1] = 1
  }
  if (text.includes('神经网络')) {
    vector[2] = 1
  }
  if (text.includes('自然语言')) {
    vector[3] = 1
  }
  
  return vector
}

// Mock async embedQueryFn
function createMockEmbedQueryFn(): (query: string) => Promise<number[]> {
  return async (query: string): Promise<number[]> => {
    return createMockEmbedding(query)
  }
}

describe('HybridRetriever', () => {
  let retriever: HybridRetriever

  beforeEach(() => {
    retriever = new HybridRetriever(4) // 4 维向量
  })

  describe('addChunks', () => {
    test('addChunks 同时添加向量和 BM25 索引', () => {
      const chunks = [
        { id: 'chunk1', text: '机器学习是人工智能的重要分支', vector: createMockEmbedding('机器学习是人工智能的重要分支') },
        { id: 'chunk2', text: '深度学习使用多层神经网络', vector: createMockEmbedding('深度学习使用多层神经网络') },
        { id: 'chunk3', text: '自然语言处理需要理解语义', vector: createMockEmbedding('自然语言处理需要理解语义') },
      ]

      retriever.addChunks(chunks)

      // 验证 size
      expect(retriever.size).toBe(3)
    })

    test('addChunks 添加中文概念 chunk', () => {
      const chunks = [
        { id: 'c1', text: '机器学习算法包括监督学习和无监督学习', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '深度学习是机器学习的子领域', vector: [0.5, 1, 0, 0] },
        { id: 'c3', text: '神经网络模拟人脑结构', vector: [0, 0.5, 1, 0] },
        { id: 'c4', text: '自然语言处理应用广泛', vector: [0, 0, 0.5, 1] },
      ]

      retriever.addChunks(chunks)
      expect(retriever.size).toBe(4)
    })
  })

  describe('search', () => {
    test('search 含目标词的 chunk 进 top3', async () => {
      const chunks = [
        { id: 'c1', text: '机器学习的核心是算法优化', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '深度学习使用反向传播', vector: [0.8, 1, 0, 0] },
        { id: 'c3', text: '神经网络需要大量数据', vector: [0.6, 0.8, 1, 0] },
        { id: 'c4', text: '其他话题无关内容', vector: [0, 0, 0, 1] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('机器学习算法', 3)

      // 含"机器学习"的 c1 应该进 top3
      const ids = results.map(r => r.id)
      expect(ids).toContain('c1')
      // c1 应该在前面（BM25 匹配 + 向量相似）
      expect(results[0].id).toBe('c1')
    })

    test('RRF 融合后排序正确', async () => {
      const chunks = [
        // c1: 向量相似度高，BM25 也匹配
        { id: 'c1', text: '机器学习算法', vector: [1, 0, 0, 0] },
        // c2: 向量相似度中等，BM25 不匹配
        { id: 'c2', text: '深度学习的技巧', vector: [0.7, 1, 0, 0] },
        // c3: 向量相似度低，BM25 匹配关键词
        { id: 'c3', text: '算法的优化方法', vector: [0.3, 0.3, 1, 0] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('机器学习算法', 10)

      // c1 应该排第一（RRF 融合后）
      expect(results[0].id).toBe('c1')
      // c2 和 c3 的排序取决于 RRF 加权
      expect(results.length).toBe(3)
    })

    test('RRF 权重：向量 0.6 / BM25 0.4 影响排序', async () => {
      const chunks = [
        // c1: 向量完全匹配
        { id: 'c1', text: '机器学习', vector: [1, 0, 0, 0] },
        // c2: BM25 关键词匹配但向量不匹配
        { id: 'c2', text: '算法优化技术', vector: [0, 0, 1, 0] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('机器学习算法', 10)

      // 向量权重 0.6 更高，c1 应该排前面
      expect(results[0].id).toBe('c1')
    })

    test('search 空查询不崩溃', async () => {
      const chunks = [
        { id: 'c1', text: '机器学习', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '深度学习', vector: [0, 1, 0, 0] },
      ]

      retriever.addChunks(chunks)

      // 空查询应该返回空数组或不崩溃
      const results = await retriever.search('', 10)
      expect(results).toEqual([])
    })

    test('search 纯空格查询不崩溃', async () => {
      const chunks = [
        { id: 'c1', text: '机器学习', vector: [1, 0, 0, 0] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('   ', 10)
      expect(results).toEqual([])
    })

    test('search 返回带分数的结果', async () => {
      const chunks = [
        { id: 'c1', text: '机器学习算法', vector: [1, 0, 0, 0] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('机器学习', 10)

      expect(results[0].id).toBe('c1')
      expect(results[0].text).toBe('机器学习算法')
      expect(typeof results[0].score).toBe('number')
      expect(results[0].score).toBeGreaterThan(0)
    })

    test('search 中文概念检索', async () => {
      const chunks = [
        { id: 'c1', text: '监督学习需要标注数据', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '无监督学习发现隐藏模式', vector: [0.9, 0.1, 0, 0] },
        { id: 'c3', text: '强化学习通过奖励机制', vector: [0.8, 0.2, 0.1, 0] },
      ]

      retriever.addChunks(chunks)

      const results = await retriever.search('监督学习标注', 3)

      // c1 含"监督学习"和"标注"，应该排第一
      expect(results[0].id).toBe('c1')
    })
  })

  describe('size', () => {
    test('size 返回当前 chunk 数量', () => {
      retriever.addChunks([
        { id: 'c1', text: 'test1', vector: [1, 0, 0, 0] },
        { id: 'c2', text: 'test2', vector: [0, 1, 0, 0] },
        { id: 'c3', text: 'test3', vector: [0, 0, 1, 0] },
      ])
      expect(retriever.size).toBe(3)
    })
  })

  describe('embedQueryFn injection', () => {
    test('注入 embedQueryFn 后 vectorSearch 使用真实 query 调用', async () => {
      const mockEmbedFn = vi.fn(async (query: string): Promise<number[]> => {
        // 根据 query 返回特定向量
        if (query.includes('机器学习')) {
          return [1, 0, 0, 0]
        }
        return [0, 0, 0, 0]
      })

      const retrieverWithEmbed = new HybridRetriever(4, mockEmbedFn)

      const chunks = [
        { id: 'c1', text: '机器学习算法', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '深度学习技巧', vector: [0, 1, 0, 0] },
      ]

      retrieverWithEmbed.addChunks(chunks)

      // 执行搜索
      const results = await retrieverWithEmbed.search('机器学习', 10)

      // 验证 mock 被调用
      expect(mockEmbedFn).toHaveBeenCalledWith('机器学习')
      
      // 验证结果包含目标 chunk
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('c1')
    })

    test('注入 embedQueryFn 后搜索结果用真实向量参与融合', async () => {
      const mockEmbedFn = vi.fn(async (query: string): Promise<number[]> => {
        // 返回与 c1 高度相似的向量
        return [1, 0.1, 0, 0]
      })

      const retrieverWithEmbed = new HybridRetriever(4, mockEmbedFn)

      const chunks = [
        { id: 'c1', text: '机器学习的重要概念', vector: [1, 0, 0, 0] },
        { id: 'c2', text: '其他无关内容', vector: [0, 0, 1, 0] },
      ]

      retrieverWithEmbed.addChunks(chunks)

      const results = await retrieverWithEmbed.search('机器学习概念', 10)

      // 验证 embedFn 被调用
      expect(mockEmbedFn).toHaveBeenCalled()
      
      // c1 应该排第一（向量相似度高 + BM25 匹配）
      expect(results[0].id).toBe('c1')
    })

    test('未注入 embedQueryFn 时回退占位向量', async () => {
      const retrieverWithoutEmbed = new HybridRetriever(4) // 不传 embedQueryFn

      const chunks = [
        { id: 'c1', text: '机器学习', vector: [1, 0, 0, 0] },
      ]

      retrieverWithoutEmbed.addChunks(chunks)

      // 应该不崩溃，使用占位向量
      const results = await retrieverWithoutEmbed.search('测试查询', 10)
      
      expect(results.length).toBeGreaterThan(0)
    })
  })
})
