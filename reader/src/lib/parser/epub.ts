/**
 * EPUB 解析（仅服务端）
 *
 * ============================================================================
 * Spike 结论（2026-09-01，Node v24 实测，见 .spike 实测记录）
 * ============================================================================
 * 采用【路径 A】：复用 foliate-js/epub.js（EPUB 类）+ jsdom DOMParser 注入
 *   - foliate 的 EPUB 以"裸全局引用"调用 `new DOMParser()`（构造函数实例字段，
 *     构造时求值），Node 无此全局 → 本模块惰性创建 jsdom 实例并最小注入
 *     （仅注入 DOMParser 一个全局，不引入 document/window 等其他 DOM 全局）
 *   - 实测通过：init()（container/opf/nav→TOC）、章节 CFI（如 epubcfi(/6/2)）、
 *     resolveCFI 反查；章节 XHTML 用同一 jsdom 实例解析并提取标题/正文
 *
 * 未采用【路径 B】：fflate 解 ZIP + 手写 XML 解析
 *   - 技术可行（fflate 已验证），但需自行维护 OPF/spine 解析并丢失 CFI/TOC
 *     能力，故优先 A；fflate 仍用于 ZIP 解包（foliate 的 loader 需要文件表）
 *
 * linkedom 评估：不可行——其 DOMParser 缺 lookupNamespaceURI/lookupPrefix，
 * epub.js 的 childGetter() 直接抛 TypeError。
 *
 * 依赖说明：jsdom 已移入 dependencies（服务端运行时依赖）；后续接入
 * Next.js 路由时，如打包异常可将 jsdom/foliate-js 加入 next.config 的
 * serverExternalPackages。
 * ============================================================================
 */
import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { JSDOM } from 'jsdom'
import { v4 as uuidv4 } from 'uuid'
import { EPUB } from 'foliate-js/epub.js'
import type {
  Book,
  EpubImportDb,
  ParsedBook,
  ParsedChapter,
} from '@/types'

export type {
  CreateBookInput,
  EpubImportDb,
  ParsedBook,
  ParsedChapter,
} from '@/types'

// ---------------------------------------------------------------------------
// jsdom DOMParser（模块内封装，惰性单例）
// ---------------------------------------------------------------------------

/** jsdom DOMParser 构造器（实例方法返回值在边界经 unknown 中转） */
type DomParserCtor = new () => { parseFromString(data: string, type: string): unknown }

let domParser: DomParserCtor | null = null

/**
 * 确保 jsdom DOMParser 就绪：
 * 1. 惰性创建 jsdom 实例（单例）；
 * 2. 向全局最小注入 DOMParser（foliate 内部以裸全局引用调用 `new DOMParser()`，
 *    Node 无此全局；不覆盖宿主已有的 DOMParser）。
 */
function ensureDomParser(): DomParserCtor {
  if (domParser) return domParser
  const { DOMParser } = new JSDOM().window
  const g = globalThis as { DOMParser?: unknown }
  if (g.DOMParser === undefined) g.DOMParser = DOMParser
  domParser = DOMParser
  return DOMParser
}

/** jsdom Document → lib.dom Document 类型边界（运行时 DOM API 兼容） */
function toDocument(x: unknown): Document {
  return x as Document
}

/**
 * 解析章节文档：按 mediaType 选择 XHTML/HTML；
 * 与 foliate 同策略——非法 XHTML 回退 HTML 解析。
 */
function parseChapterDoc(str: string, mediaType: string | null): Document {
  const Parser = ensureDomParser()
  const mkDoc = (type: string): Document =>
    toDocument(new Parser().parseFromString(str, type))
  if (mediaType === 'text/html') return mkDoc('text/html')
  let doc = mkDoc('application/xhtml+xml')
  if (!doc.documentElement?.namespaceURI || doc.querySelector('parsererror')) {
    doc = mkDoc('text/html')
  }
  return doc
}

// ---------------------------------------------------------------------------
// 文本提取
// ---------------------------------------------------------------------------

/** 折叠 ASCII 空白（与 foliate 的 normalizeWhitespace 同算法） */
function collapse(str: string): string {
  return str
    .replace(/[\t\n\f\r ]+/g, ' ')
    .replace(/^[\t\n\f\r ]+/, '')
    .replace(/[\t\n\f\r ]+$/, '')
}

/** 块级元素选择器（含其内文本即视为一个"文本块"） */
const BLOCK_SELECTOR =
  'address, article, aside, blockquote, div, dl, fieldset, figure, figcaption, footer, form, h1, h2, h3, h4, h5, h6, header, hr, main, nav, ol, p, pre, section, table, ul'

/** 提取正文：按块级结构切分，块内折叠空白、块间换行（保留段落结构） */
function extractBodyText(doc: Document): string {
  const body = doc.querySelector('body') ?? doc.documentElement
  if (!body) return ''
  const root = body.cloneNode(true) as Element
  root.querySelectorAll('script, style, link, meta').forEach(el => el.remove())

  const blocks: string[] = []
  const walk = (el: Element): void => {
    const blockKids = Array.from(el.children).filter(c => c.matches(BLOCK_SELECTOR))
    if (blockKids.length === 0) {
      const t = collapse(el.textContent ?? '')
      if (t) blocks.push(t)
    } else {
      blockKids.forEach(walk)
    }
  }
  walk(root)
  return blocks.join('\n')
}

/** 提取章节标题：<title> → 首个标题元素 → 兜底「第 N 章」 */
function extractChapterTitle(doc: Document, index: number): string {
  const t = collapse(doc.querySelector('title')?.textContent ?? '')
  if (t) return t
  const h = doc.querySelector('h1, h2, h3, h4, h5, h6')
  if (h) {
    const t2 = collapse(h.textContent ?? '')
    if (t2) return t2
  }
  return `第 ${index + 1} 章`
}

// ---------------------------------------------------------------------------
// 元数据（foliate 输出为 webpub 风格：值可能是字符串或 {lang: 值} 映射）
// ---------------------------------------------------------------------------

function titleFromMeta(raw: unknown): string {
  if (typeof raw === 'string') {
    const t = collapse(raw)
    return t || '未命名书籍'
  }
  if (raw && typeof raw === 'object') {
    const vals = Object.values(raw as Record<string, unknown>)
    const first = vals.find((v): v is string => typeof v === 'string')
    const t = collapse(first ?? '')
    if (t) return t
  }
  return '未命名书籍'
}

function authorFromMeta(raw: unknown): string | null {
  const first: unknown = Array.isArray(raw) ? raw[0] : raw
  if (typeof first === 'string') {
    const t = collapse(first)
    return t || null
  }
  if (first && typeof first === 'object') {
    const name: unknown = (first as { name?: unknown }).name
    if (typeof name === 'string') {
      const t = collapse(name)
      return t || null
    }
    if (name && typeof name === 'object') {
      const vals = Object.values(name as Record<string, unknown>)
      const firstVal = vals.find((v): v is string => typeof v === 'string')
      const t = collapse(firstVal ?? '')
      if (t) return t
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// parseEpub
// ---------------------------------------------------------------------------

/** foliate EPUB#resources 的最小运行时类型（foliate.d.ts 未声明） */
interface EpubSpineItem {
  idref: string
  linear: string | null
  properties: string[] | null
}

interface EpubManifestItem {
  href: string
  id: string | null
  mediaType: string | null
  properties: string[] | null
  mediaOverlay: string | null
}

interface EpubResources {
  spine: EpubSpineItem[]
  cfis: (string | null)[]
  getItemByID(id: string): EpubManifestItem | undefined
}

function toBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

/** 解 ZIP；非法容器抛友好错误 */
function unzipEpub(buffer: ArrayBuffer | Uint8Array): ReturnType<typeof unzipSync> {
  try {
    return unzipSync(toBytes(buffer))
  } catch {
    throw new Error('无效的 EPUB 文件：无法解压（不是合法的 ZIP 容器）')
  }
}

/**
 * 解析 EPUB 为书籍结构（纯函数，不碰 DB）
 *
 * @param buffer EPUB 文件字节（ArrayBuffer 或 Uint8Array）
 * @returns 标题/作者 + 按 spine 顺序的章节（含 CFI）
 */
export async function parseEpub(buffer: ArrayBuffer | Uint8Array): Promise<ParsedBook> {
  const files = unzipEpub(buffer)
  const decoder = new TextDecoder('utf-8')

  // 按名取条目（容忍前导 /）
  const readEntry = (name: string) => {
    if (files[name]) return files[name]
    const alt = name.replace(/^\//, '')
    return files[alt]
  }
  const readText = (name: string): string | null => {
    const bytes = readEntry(name)
    return bytes ? decoder.decode(bytes) : null
  }

  // foliate loader：基于 ZIP 文件表
  const loader = {
    loadText: async (name: string) => readText(name),
    loadBlob: async (name: string): Promise<Blob | null> => {
      const bytes = readEntry(name)
      return bytes ? new Blob([bytes]) : null
    },
    getSize: (name: string): number => readEntry(name)?.length ?? 0,
  }

  // 必须在 new EPUB() 之前就位：其构造函数会 `new DOMParser()`（裸全局引用）
  ensureDomParser()
  const epub = new EPUB(loader)
  const book = await epub.init()

  const resources = book['resources'] as EpubResources | undefined
  if (!resources) throw new Error('EPUB 解析失败：未能读取 spine 资源')

  const chapters: ParsedChapter[] = []
  const spine = resources.spine
  for (let i = 0; i < spine.length; i++) {
    const item = resources.getItemByID(spine[i].idref)
    if (!item) continue
    // 跳过非文本章节（如 SMIL 媒体叠加）
    if (item.mediaType && !/xhtml\+xml$|html$/.test(item.mediaType)) continue
    const str = readText(item.href)
    if (!str) continue

    const doc = parseChapterDoc(str, item.mediaType)
    chapters.push({
      index: chapters.length,
      title: extractChapterTitle(doc, i),
      content: extractBodyText(doc),
      cfi: resources.cfis[i] ?? null,
    })
  }
  if (chapters.length === 0) throw new Error('EPUB 解析失败：未找到可解析的章节')

  return {
    title: titleFromMeta(book.metadata['title']),
    author: authorFromMeta(book.metadata['author']),
    chapters,
  }
}

// ---------------------------------------------------------------------------
// importEpubToDb（胶水：parseEpub + db CRUD）
// ---------------------------------------------------------------------------

/**
 * EPUB 入库：
 * 1. 按 fileHash（sha256）去重——重复导入直接返回已有书（不重复插章）；
 * 2. parseEpub 后 createBook + 逐章 insertChapter。
 *
 * db 依赖以最小接口 EpubImportDb 解耦（与 W1-T-db 约定一致，
 * src/lib/db 就绪后可直接传入其实例）。
 *
 * @param opts.filePath 原文件落盘路径；缺省为 data/books/<id>.epub
 */
export async function importEpubToDb(
  buffer: ArrayBuffer | Uint8Array,
  db: EpubImportDb,
  opts?: { filePath?: string },
): Promise<Book> {
  const fileHash = createHash('sha256').update(toBytes(buffer)).digest('hex')

  const existing = db.findBookByFileHash(fileHash)
  if (existing) return existing

  const parsed = await parseEpub(buffer)
  const id = uuidv4()

  const book = db.createBook({
    id,
    title: parsed.title,
    author: parsed.author,
    coverPath: null,
    format: 'epub',
    filePath: opts?.filePath ?? `data/books/${id}.epub`,
    fileHash,
    status: 'unread',
    grade: 1,
    totalChapters: parsed.chapters.length,
  })

  for (const ch of parsed.chapters) {
    db.insertChapter({
      bookId: book.id,
      index: ch.index,
      title: ch.title,
      content: ch.content,
      charCount: ch.content.length,
    })
  }

  return book
}
