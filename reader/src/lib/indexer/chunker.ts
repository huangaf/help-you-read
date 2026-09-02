/**
 * 文本分块
 *
 * 按 Unicode 码点（code point）切分为固定大小块，相邻块保留重叠，
 * 供 BM25 索引与向量检索使用（M0 支柱 2 / 详细设计第 4 节约定：800 字块 / 200 字重叠）。
 *
 * 零依赖纯函数。
 */

/** 分块选项 */
export interface ChunkOptions {
  /** 块大小（码点数），默认 800 */
  size?: number
  /** 相邻块重叠大小（码点数），默认 200；会被钳制到 [0, size-1] 保证步长 > 0 */
  overlap?: number
}

export const DEFAULT_CHUNK_SIZE = 800
export const DEFAULT_CHUNK_OVERLAP = 200

/**
 * 把文本切成固定大小的块。
 *
 * 行为约定：
 * - 按码点切分（Array.from），emoji 等辅助平面字符不会被截断成落单代理项
 * - 空文本 → []；文本码点数 ≤ size → 单块（原文）
 * - 步长 = size - overlap；末尾不足 size 的残块保留
 * - 重叠永不产生空块（overlap 钳制 + 末块即收尾）
 */
export function splitIntoChunks(text: string, opts?: ChunkOptions): string[] {
  const size = opts?.size ?? DEFAULT_CHUNK_SIZE
  if (!Number.isFinite(size) || size < 1) return []

  const cps = Array.from(text)
  if (cps.length === 0) return []
  // 短于（或恰好等于）块大小：整段作为单块
  if (cps.length <= size) return [text]

  // 钳制 overlap，保证步长至少为 1，避免死循环
  const rawOverlap = opts?.overlap ?? DEFAULT_CHUNK_OVERLAP
  const overlap = Number.isFinite(rawOverlap)
    ? Math.max(0, Math.min(Math.floor(rawOverlap), size - 1))
    : DEFAULT_CHUNK_OVERLAP
  const step = size - overlap

  const chunks: string[] = []
  let start = 0
  while (start < cps.length) {
    const end = Math.min(start + size, cps.length)
    chunks.push(cps.slice(start, end).join(''))
    if (end === cps.length) break
    start += step
  }
  return chunks
}
