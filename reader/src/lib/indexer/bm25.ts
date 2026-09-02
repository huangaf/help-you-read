/**
 * BM25 关键词索引
 *
 * 轻量中文分词（CJK bigram + 拉丁词按空白/标点切分），零依赖，
 * 供 M0 端到端验证（EPUB→入库→分块→BM25→检索）与 M1 RAG 使用。
 */

/** BM25 标准参数（Lucene 默认值） */
const K1 = 1.5
const B = 0.75

/** 检索命中 */
export interface SearchHit {
  id: string
  score: number
}

/** 可入库的文档 */
export interface BM25Document {
  id: string
  text: string
}

/** 内部文档记录：词频表 + 文档长度（token 数） */
interface InternalDoc {
  id: string
  /** term → 词频 */
  tf: Map<string, number>
  len: number
}

/** 判断码点是否为 CJK 表意文字（基本区 + 扩展 A + 兼容区） */
function isCJK(cp: string): boolean {
  const c = cp.codePointAt(0) ?? 0
  return (
    (c >= 0x4e00 && c <= 0x9fff) || // CJK 统一表意文字
    (c >= 0x3400 && c <= 0x4dbf) || // 扩展 A
    (c >= 0xf900 && c <= 0xfaff) // 兼容表意文字
  )
}

/** 拉丁词字符：字母 / 数字 / 下划线（单一字符正则，辅助平面字符不匹配） */
const LATIN_WORD_CHAR = /^[A-Za-z0-9_]$/

/** 判断码点是否为拉丁词字符 */
function isLatinWordChar(cp: string): boolean {
  return LATIN_WORD_CHAR.test(cp)
}

/**
 * 轻量分词：CJK 连续段用相邻两字 bigram（段尾单字用 unigram 兜底），
 * 拉丁词按空白/标点切分并转小写。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  const cps = Array.from(text)
  let latin = ''
  const flushLatin = () => {
    if (latin) {
      tokens.push(latin.toLowerCase())
      latin = ''
    }
  }
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]
    if (isCJK(cp)) {
      flushLatin()
      const next = cps[i + 1]
      tokens.push(next && isCJK(next) ? cp + next : cp)
    } else if (isLatinWordChar(cp)) {
      latin += cp
    } else {
      // 空白/标点：终止当前拉丁词
      flushLatin()
    }
  }
  flushLatin()
  return tokens
}

/**
 * 内存 BM25 索引。
 *
 * 得分公式（Robertson 1994，Lucene 非负 IDF 变体）：
 *   score(D, Q) = Σ_{t∈Q} idf(t) · f(t,D)·(k1+1) / (f(t,D) + k1·(1 − b + b·|D|/avgdl))
 *   idf(t) = ln((N − df(t) + 0.5) / (df(t) + 0.5) + 1)
 *
 * 注意：重复 id 的 addDocument 视为对旧文档的更新（先删后加）。
 */
export class BM25 {
  private docs: InternalDoc[] = []
  private idToPos = new Map<string, number>()
  /** term → 文档频率 df */
  private docFreq = new Map<string, number>()

  /** 索引中当前文档数 */
  get size(): number {
    return this.docs.length
  }

  /** 添加（或按 id 更新）一个文档 */
  addDocument(id: string, text: string): void {
    if (this.idToPos.has(id)) this.removeDoc(id)

    const tokens = tokenize(text)
    const tf = new Map<string, number>()
    for (const term of tokens) tf.set(term, (tf.get(term) ?? 0) + 1)

    this.docs.push({ id, tf, len: tokens.length })
    this.idToPos.set(id, this.docs.length - 1)
    for (const term of tf.keys()) {
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1)
    }
  }

  /** 批量添加文档（与 addDocument 语义相同，重复 id 视为更新） */
  indexDocuments(docs: BM25Document[]): void {
    for (const d of docs) this.addDocument(d.id, d.text)
  }

  /** 按 BM25 得分降序检索，最多返回 topK 条；空语料/空查询返回 [] */
  search(query: string, topK = 10): SearchHit[] {
    const n = this.docs.length
    if (n === 0 || topK < 1) return []

    const terms = [...new Set(tokenize(query))]
    if (terms.length === 0) return []

    const avgdl = this.docs.reduce((sum, d) => sum + d.len, 0) / n

    const scores = new Map<string, number>()
    for (const term of terms) {
      const df = this.docFreq.get(term)
      if (!df) continue
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1)
      for (const doc of this.docs) {
        const f = doc.tf.get(term)
        if (!f) continue
        const denom = f + K1 * (1 - B + (B * doc.len) / avgdl)
        scores.set(doc.id, (scores.get(doc.id) ?? 0) + (idf * (f * (K1 + 1))) / denom)
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** 按 id 删除文档（内部用于重复 id 更新） */
  private removeDoc(id: string): void {
    const pos = this.idToPos.get(id)
    if (pos === undefined) return
    const doc = this.docs[pos]
    this.docs.splice(pos, 1)
    // splice 之后重建后续位置映射
    for (let i = pos; i < this.docs.length; i++) this.idToPos.set(this.docs[i].id, i)
    this.idToPos.delete(id)
    for (const term of doc.tf.keys()) {
      const df = this.docFreq.get(term) ?? 0
      if (df <= 1) this.docFreq.delete(term)
      else this.docFreq.set(term, df - 1)
    }
  }
}
