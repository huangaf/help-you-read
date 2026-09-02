// chunker 单元测试：验证 800 字块 / 200 字重叠、Unicode 码点切分、边界处理
import { splitIntoChunks } from './chunker'

/** 把字符串拆成码点数组（测试断言基准，避免 UTF-16 单元歧义） */
function cps(text: string): string[] {
  return Array.from(text)
}

/** 检测字符串中是否存在落单的代理项（即被截断的 emoji 等辅助平面字符） */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      // 高代理项后必须紧跟低代理项
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1
      if (next < 0xdc00 || next > 0xdfff) return true
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true // 低代理项未紧跟在高代理项之后
    }
  }
  return false
}

/** 构造 BMP 中文文本（基本多文种平面，1 码点 = 1 UTF-16 单元） */
function cjkText(n: number): string {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(0x4e00 + (i % 200))).join('')
}

describe('splitIntoChunks', () => {
  it('空文本返回空数组', () => {
    expect(splitIntoChunks('')).toEqual([])
  })

  it('文本长度恰好等于 size 时返回单块（原文不变）', () => {
    const t = cjkText(800)
    expect(splitIntoChunks(t)).toEqual([t])
  })

  it('短于 size 的文本返回单块且内容不变', () => {
    const t = '这是一段远短于 800 字的文本，包含 emoji 📚 验证内容保真。'
    expect(splitIntoChunks(t)).toEqual([t])
  })

  it('默认 800 字块：2500 码点文本按步长 600 切成 800/800/800/700 四块', () => {
    const t = cjkText(2500)
    const chunks = splitIntoChunks(t)
    expect(chunks).toHaveLength(4)
    expect(cps(chunks[0])).toEqual(cps(t).slice(0, 800))
    expect(cps(chunks[1])).toEqual(cps(t).slice(600, 1400))
    expect(cps(chunks[2])).toEqual(cps(t).slice(1200, 2000))
    expect(cps(chunks[3])).toEqual(cps(t).slice(1800, 2500)) // 末尾残块 700 码点
  })

  it('默认 200 字重叠：相邻块共享 200 码点', () => {
    const t = cjkText(2500)
    const chunks = splitIntoChunks(t).map(cps)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1].slice(-200)).toEqual(chunks[i].slice(0, 200))
    }
  })

  it('末尾残块保留：1000 码点文本切成 800/400 两块', () => {
    const t = cjkText(1000)
    const chunks = splitIntoChunks(t)
    expect(chunks).toHaveLength(2)
    expect(cps(chunks[1])).toEqual(cps(t).slice(600, 1000))
    expect(cps(chunks[1])).toHaveLength(400)
  })

  it('自定义 size/overlap 生效：25 码点、size=10、overlap=3 切成 4 块', () => {
    const t = cjkText(25)
    const chunks = splitIntoChunks(t, { size: 10, overlap: 3 })
    expect(chunks).toHaveLength(4)
    expect(cps(chunks[0])).toEqual(cps(t).slice(0, 10))
    expect(cps(chunks[1])).toEqual(cps(t).slice(7, 17))
    expect(cps(chunks[2])).toEqual(cps(t).slice(14, 24))
    expect(cps(chunks[3])).toEqual(cps(t).slice(21, 25))
  })

  it('overlap 不小于 size 时不产生空块也不死循环', () => {
    const t = cjkText(15)
    const chunks = splitIntoChunks(t, { size: 5, overlap: 5 })
    // overlap 被钳制到 size-1=4，步长 1：块起点 0..10，共 11 块，每块 5 码点
    expect(chunks).toHaveLength(11)
    for (const c of chunks) {
      expect(cps(c)).toHaveLength(5)
    }
  })

  it('emoji 不被截断：码点边界切分后无落单代理项', () => {
    // 850 码点 = 799 个 BMP 汉字 + 51 个 emoji，第 800 码点（首个 emoji）正好落在首块末尾
    const t = cjkText(799) + '📚'.repeat(51)
    expect(cps(t)).toHaveLength(850)
    const chunks = splitIntoChunks(t)
    expect(chunks).toHaveLength(2)
    // 首块 = 前 800 码点（含 1 个完整 emoji），次块 = 第 600 码点起（200 汉字 + 51 emoji）
    expect(cps(chunks[0])).toEqual(cps(t).slice(0, 800))
    expect(cps(chunks[1])).toEqual(cps(t).slice(600, 850))
    for (const c of chunks) {
      expect(hasLoneSurrogate(c)).toBe(false)
    }
    // 内容保真：去重叠后拼回原文
    expect(chunks[0] + cps(chunks[1]).slice(200).join('')).toBe(t)
  })

  it('含 emoji 的长文本去重叠后可完整还原', () => {
    // 1500 码点，emoji 均匀分布（每 10 码点 1 个），跨越多个块边界
    const chars: string[] = []
    for (let i = 0; i < 150; i++) {
      chars.push('甲乙丙丁戊己庚辛壬' + '🔥') // 9 汉字 + 1 emoji = 10 码点
    }
    const t = chars.join('')
    expect(cps(t)).toHaveLength(1500)
    const chunks = splitIntoChunks(t)
    for (const c of chunks) expect(hasLoneSurrogate(c)).toBe(false)
    // 逐块与期望码点切片比对（步长 600）
    const tc = cps(t)
    let start = 0
    let idx = 0
    while (start < tc.length && idx < chunks.length) {
      expect(cps(chunks[idx])).toEqual(tc.slice(start, Math.min(start + 800, tc.length)))
      if (start + 800 >= tc.length) break
      start += 600
      idx++
    }
    expect(idx).toBe(chunks.length - 1)
  })
})