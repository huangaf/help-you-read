// bm25 单元测试：验证中文 bigram 分词、BM25 排序、边界处理
import { BM25 } from './bm25'

/** 合成中文语料：d1/d2 含「机器学习」，d3 无关，d4 仅含「学习」 */
const CHINESE_DOCS: { id: string; text: string }[] = [
  { id: 'd1', text: '机器学习是人工智能的一个分支，通过数据让计算机自动学习规律。' },
  { id: 'd2', text: '深度学习是机器学习中基于神经网络的子领域。' },
  { id: 'd3', text: '自然语言处理让计算机理解人类语言。' },
  { id: 'd4', text: '深度学习模型在图像识别任务上取得了突破。' },
]

describe('BM25', () => {
  it('查询「机器学习」：含目标词的文档全部进 top3，无关文档不出现', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    const hits = bm25.search('机器学习')
    const ids = hits.map((h) => h.id)
    // 匹配文档：d1、d2（含「机器/器学/学习」），d4（含「学习」）；d3 不含任何查询词
    for (const id of ['d1', 'd2', 'd4']) expect(ids).toContain(id)
    expect(ids).not.toContain('d3')
    expect(hits).toHaveLength(3)
    // 全部得分应为正
    for (const h of hits) expect(h.score).toBeGreaterThan(0)
  })

  it('结果按得分降序排列', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    const hits = bm25.search('深度学习模型')
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].score).toBeLessThanOrEqual(hits[i - 1].score)
    }
  })

  it('无匹配的查询返回空数组', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    expect(bm25.search('量子纠缠')).toEqual([])
  })

  it('空语料不崩：空索引检索返回空数组', () => {
    const bm25 = new BM25()
    expect(bm25.search('机器学习')).toEqual([])
  })

  it('空查询 / 纯标点查询返回空数组', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    expect(bm25.search('')).toEqual([])
    expect(bm25.search('。！？ ')).toEqual([])
  })

  it('topK 限制结果数量', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    const hits = bm25.search('学习', 1)
    expect(hits).toHaveLength(1)
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it('addDocument 与 indexDocuments 可混用', () => {
    const bm25 = new BM25()
    bm25.indexDocuments(CHINESE_DOCS)
    bm25.addDocument('d5', '强化学习让智能体在与环境的交互中不断试错。')
    const hits = bm25.search('强化学习')
    expect(hits.map((h) => h.id)).toContain('d5')
    expect(bm25.size).toBe(5)
  })

  it('重复 id 重新添加视为更新而非追加', () => {
    const bm25 = new BM25()
    bm25.indexDocuments([{ id: 'a', text: '机器学习入门指南' }])
    bm25.addDocument('a', '量子计算与量子纠错综述')
    expect(bm25.size).toBe(1)
    expect(bm25.search('机器学习')).toEqual([])
    expect(bm25.search('量子').map((h) => h.id)).toContain('a')
  })

  it('拉丁词按空白/标点切分且大小写不敏感', () => {
    const bm25 = new BM25()
    bm25.indexDocuments([
      { id: 'e1', text: 'Transformer is a large language model used in NLP research.' },
      { id: 'e2', text: 'Quantum computers will break classical cryptography.' },
    ])
    expect(bm25.search('model').map((h) => h.id)).toEqual(['e1'])
    expect(bm25.search('MODEL').map((h) => h.id)).toEqual(['e1'])
    expect(bm25.search('classical').map((h) => h.id)).toEqual(['e2'])
    // 多词查询：两个词都命中的文档得分更高
    const multi = bm25.search('transformer nlp')
    expect(multi.map((h) => h.id)).toEqual(['e1'])
  })
})