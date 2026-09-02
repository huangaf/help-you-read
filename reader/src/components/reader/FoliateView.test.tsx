// @vitest-environment jsdom
/// <reference types="vitest/globals" />

/**
 * FoliateView 生命周期测试（jsdom）
 *
 * jsdom 无法执行 foliate-js 的真实渲染（zip 解析 / 布局 / shadow DOM），
 * 因此 vi.mock 模拟 foliate-js/view.js 副作用模块（View 类 +
 * customElements.define 注册），只验证组件自身的生命周期逻辑：
 *   挂载 → createElement('foliate-view') → 注册事件 → Blob 包装 → open()
 *   卸载 → close() + 移除事件 + 移除元素
 * 真实渲染验收在浏览器中完成（src/app/demo/page.tsx + public/demo.epub）。
 */
import { render, cleanup, waitFor } from '@testing-library/react'
import FoliateView from './FoliateView'

// vi.mock 的工厂会被提升到 import 之前，用 vi.hoisted 提供共享的 mock
const { openMock, closeMock, MockView } = vi.hoisted(() => {
  // 参数类型与真实 View.open 一致（组件只会传入 File/Blob）
  const openMock = vi.fn(async (book: Blob) => {
    void book
  })
  const closeMock = vi.fn()
  class MockView extends HTMLElement {
    open = openMock
    close = closeMock
  }
  return { openMock, closeMock, MockView }
})

vi.mock('foliate-js/view.js', () => {
  // 模拟真实模块的副作用：导入时注册自定义元素
  customElements.define('foliate-view', MockView)
  return { View: MockView }
})

// 构造含已知内容的 ArrayBuffer（避免 TypedArray.buffer 的 SharedArrayBuffer 联合类型）
const makeBuffer = (text = 'foliate-demo-content') => {
  const bytes = new TextEncoder().encode(text)
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

describe('FoliateView 生命周期', () => {
  beforeEach(() => {
    openMock.mockClear()
    closeMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    // 兜底：确保无残留自定义元素
    document.querySelectorAll('foliate-view').forEach(el => el.remove())
  })

  it('挂载时创建 <foliate-view> 元素并调用 open', async () => {
    const { container } = render(<FoliateView src={makeBuffer()} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    const el = document.querySelector('foliate-view')
    expect(el).not.toBeNull()
    expect(el).toBeInstanceOf(MockView)
    // 元素挂在组件容器内
    expect(container.querySelector('foliate-view')).toBe(el)
  })

  it('ArrayBuffer 会包装成 File(application/epub+zip) 再调 open', async () => {
    const text = 'arraybuffer-to-blob'
    const buffer = makeBuffer(text)
    render(<FoliateView src={buffer} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    const arg = openMock.mock.calls[0][0]
    // File 而非 Blob：foliate makeBook 格式探测需要 file.name（Blob 无 name 会崩）
    expect(arg).toBeInstanceOf(File)
    expect(arg.type).toBe('application/epub+zip')
    expect(arg.size).toBe(buffer.byteLength)
    // 内容与原始 ArrayBuffer 一致
    const decoded = new TextDecoder().decode(await arg.arrayBuffer())
    expect(decoded).toBe(text)
  })

  it('src 已是 Blob 时直接透传，不重复包装', async () => {
    const blob = new Blob(['x'], { type: 'application/epub+zip' })
    render(<FoliateView src={blob} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    expect(openMock.mock.calls[0][0]).toBe(blob)
  })

  it('卸载时调用 close 并移除元素', async () => {
    const { unmount } = render(<FoliateView src={makeBuffer()} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    unmount()
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('foliate-view')).toBeNull()
  })

  it('open 完成前卸载：无元素泄漏，不调用 open/close', async () => {
    const { unmount } = render(<FoliateView src={makeBuffer()} />)
    unmount()
    // 等待动态 import 的后续代码执行（应被 cancelled 拦截）
    await new Promise(r => setTimeout(r, 10))
    expect(openMock).not.toHaveBeenCalled()
    expect(closeMock).not.toHaveBeenCalled()
    expect(document.querySelector('foliate-view')).toBeNull()
  })

  it('relocate 事件转发为 onRelocate({ cfi, fraction, chapterIndex })', async () => {
    const onRelocate = vi.fn()
    render(<FoliateView src={makeBuffer()} onRelocate={onRelocate} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    const el = document.querySelector('foliate-view')!
    el.dispatchEvent(
      new CustomEvent('relocate', {
        detail: {
          cfi: 'epubcfi(/6/2[id=p1]/2)',
          fraction: 0.42,
          section: { current: 3, total: 10 },
        },
      }),
    )
    expect(onRelocate).toHaveBeenCalledTimes(1)
    expect(onRelocate).toHaveBeenCalledWith({
      cfi: 'epubcfi(/6/2[id=p1]/2)',
      fraction: 0.42,
      chapterIndex: 3,
    })
  })

  it('load 事件转发为 onLoad 回调', async () => {
    const onLoad = vi.fn()
    render(<FoliateView src={makeBuffer()} onLoad={onLoad} />)
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1))
    const el = document.querySelector('foliate-view')!
    el.dispatchEvent(new CustomEvent('load', { detail: { doc: null, index: 0 } }))
    expect(onLoad).toHaveBeenCalledTimes(1)
  })
})