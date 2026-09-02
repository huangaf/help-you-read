/**
 * 内存向量存储
 *
 * 零依赖内存实现，支持余弦相似度检索。
 */

/** 向量存储条目 */
export interface VectorEntry {
  id: string
  vector: number[]
}

/** 检索结果 */
export interface VectorSearchResult {
  id: string
  score: number
}

/**
 * 内存向量存储类
 *
 * 支持：
 * - add: 添加单个向量
 * - addMany: 批量添加向量
 * - search: 余弦相似度检索
 * - remove: 删除指定 id
 * - clear: 清空所有
 */
export class VectorStore {
  private entries: Map<string, number[]> = new Map()

  /**
   * 余弦相似度
   *
   * cos(a,b) = dot(a,b) / (|a| * |b|)
   * 结果 clamp 到 [-1, 1]
   * 零向量处理返回 0
   */
  cosineSimilarity(a: number[], b: number[]): number {
    // 维度不一致返回 0
    if (a.length !== b.length) return 0

    let dot = 0
    let magA = 0
    let magB = 0

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }

    magA = Math.sqrt(magA)
    magB = Math.sqrt(magB)

    // 零向量处理
    if (magA === 0 || magB === 0) return 0

    let similarity = dot / (magA * magB)

    // Clamp 到 [-1, 1]
    similarity = Math.max(-1, Math.min(1, similarity))

    return similarity
  }

  /**
   * 添加单个向量
   *
   * 重复 id 会覆盖原向量
   */
  add(id: string, vector: number[]): void {
    this.entries.set(id, vector)
  }

  /**
   * 批量添加向量
   */
  addMany(entries: VectorEntry[]): void {
    for (const entry of entries) {
      this.entries.set(entry.id, entry.vector)
    }
  }

  /**
   * 向量检索
   *
   * @param queryVector 查询向量
   * @param topK 返回数量
   * @returns 按相似度降序排列的结果
   */
  search(queryVector: number[], topK = 10): VectorSearchResult[] {
    if (this.entries.size === 0) return []

    // 检查查询向量维度
    if (queryVector.length === 0) return []

    const results: VectorSearchResult[] = []

    for (const [id, vector] of this.entries.entries()) {
      // 维度不匹配跳过
      if (vector.length !== queryVector.length) continue
      const score = this.cosineSimilarity(queryVector, vector)
      results.push({ id, score })
    }

    // 按分数降序
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, topK)
  }

  /**
   * 删除指定 id 的向量
   */
  remove(ids: string[]): void {
    for (const id of ids) {
      this.entries.delete(id)
    }
  }

  /**
   * 清空所有向量
   */
  clear(): void {
    this.entries.clear()
  }

  /**
   * 当前存储的向量数量
   */
  get size(): number {
    return this.entries.size
  }
}
