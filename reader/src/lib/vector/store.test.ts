/**
 * VectorStore 单元测试
 *
 * 测试余弦相似度、search 排序、remove/clear 功能
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { VectorStore } from './store'

describe('VectorStore', () => {
  describe('cosine similarity', () => {
    test('相同向量相似度 = 1', () => {
      const store = new VectorStore()
      const a = [1, 2, 3]
      const b = [1, 2, 3]
      const result = store.cosineSimilarity(a, b)
      expect(result).toBeCloseTo(1, 5)
    })

    test('正交向量相似度 = 0', () => {
      const store = new VectorStore()
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      const result = store.cosineSimilarity(a, b)
      expect(result).toBeCloseTo(0, 5)
    })

    test('相反向量相似度 = -1', () => {
      const store = new VectorStore()
      const a = [1, 2, 3]
      const b = [-1, -2, -3]
      const result = store.cosineSimilarity(a, b)
      expect(result).toBeCloseTo(-1, 5)
    })

    test('零向量返回 0', () => {
      const store = new VectorStore()
      const a = [0, 0, 0]
      const b = [1, 2, 3]
      const result = store.cosineSimilarity(a, b)
      expect(result).toBe(0)
    })

    test('两个零向量返回 0', () => {
      const store = new VectorStore()
      const a = [0, 0, 0]
      const b = [0, 0, 0]
      const result = store.cosineSimilarity(a, b)
      expect(result).toBe(0)
    })
  })

  describe('add / addMany', () => {
    test('add 单个向量', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      expect(store.size).toBe(1)
    })

    test('addMany 批量添加', () => {
      const store = new VectorStore()
      store.addMany([
        { id: 'doc1', vector: [1, 2, 3] },
        { id: 'doc2', vector: [4, 5, 6] },
        { id: 'doc3', vector: [7, 8, 9] },
      ])
      expect(store.size).toBe(3)
    })

    test('重复 id 覆盖原向量', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      store.add('doc1', [4, 5, 6])
      expect(store.size).toBe(1)
      const results = store.search([4, 5, 6], 10)
      expect(results[0].id).toBe('doc1')
    })
  })

  describe('search', () => {
    test('search 按相似度降序排序', () => {
      const store = new VectorStore()
      // doc1: [1, 0, 0] - 与查询 [1, 0, 0] 完全匹配
      store.add('doc1', [1, 0, 0])
      // doc2: [0.7, 0.7, 0] - 相似度较低
      store.add('doc2', [0.7, 0.7, 0])
      // doc3: [0, 0, 1] - 正交，相似度 0
      store.add('doc3', [0, 0, 1])

      const results = store.search([1, 0, 0], 10)

      expect(results.length).toBe(3)
      expect(results[0].id).toBe('doc1') // 相似度 1
      expect(results[1].id).toBe('doc2') // 相似度 ~0.707
      expect(results[2].id).toBe('doc3') // 相似度 0
    })

    test('search 返回正确分数', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 0, 0])
      store.add('doc2', [0.7, 0.7, 0])

      const results = store.search([1, 0, 0], 10)

      expect(results[0].score).toBeCloseTo(1, 5)
      expect(results[1].score).toBeCloseTo(0.707, 3)
    })

    test('search 限制返回数量 topK', () => {
      const store = new VectorStore()
      for (let i = 0; i < 10; i++) {
        store.add(`doc${i}`, [i, 0, 0])
      }

      const results = store.search([5, 0, 0], 3)

      expect(results.length).toBe(3)
    })

    test('search 空存储返回空数组', () => {
      const store = new VectorStore()
      const results = store.search([1, 2, 3], 10)
      expect(results).toEqual([])
    })

    test('search 查询向量维度不匹配时能处理', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      // 查询向量维度不同
      const results = store.search([1, 2], 10)
      // 应该返回空或处理错误
      expect(results).toEqual([])
    })
  })

  describe('remove', () => {
    test('remove 单个 id', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 0, 0])
      store.add('doc2', [0, 1, 0])
      store.remove(['doc1'])
      expect(store.size).toBe(1)
      // 现在只有 doc2，search([1,0,0]) 应该返回 doc2（分数 0，因为正交）
      const results = store.search([1, 0, 0], 10)
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('doc2')
      expect(results[0].score).toBe(0)
    })

    test('remove 多个 id', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      store.add('doc2', [4, 5, 6])
      store.add('doc3', [7, 8, 9])
      store.remove(['doc1', 'doc2'])
      expect(store.size).toBe(1)
      const results = store.search([7, 8, 9], 10)
      expect(results[0].id).toBe('doc3')
    })

    test('remove 不存在的 id 不报错', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      store.remove(['nonexistent'])
      expect(store.size).toBe(1)
    })
  })

  describe('clear', () => {
    test('clear 清空所有', () => {
      const store = new VectorStore()
      store.add('doc1', [1, 2, 3])
      store.add('doc2', [4, 5, 6])
      store.clear()
      expect(store.size).toBe(0)
      const results = store.search([1, 2, 3], 10)
      expect(results).toEqual([])
    })
  })
})
