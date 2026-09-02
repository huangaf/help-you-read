'use client'

/**
 * FoliateView — foliate-js 阅读渲染组件（M0 支柱 3）
 *
 * foliate-js/view.js 是浏览器专属副作用模块：导入时即执行
 * `customElements.define('foliate-view', View)`（SSR 环境无 customElements 会崩），
 * 因此禁止顶层静态 import，只在 useEffect 内动态 import 并加 window 守卫。
 *
 * 生命周期：
 *   挂载 → document.createElement('foliate-view') → 注册 relocate/load 监听
 *        → ArrayBuffer 包装为 Blob({ type: 'application/epub+zip' })
 *        → view.open(blob)
 *   卸载 → view.close() + 移除监听 + 移除元素
 *
 * 注：jsdom 无法执行真实渲染（zip 解析 / 布局 / shadow DOM），
 * 真实渲染验收见 src/app/demo/page.tsx + public/demo.epub（浏览器验证）。
 */
import { useEffect, useRef } from 'react'
import type { View } from 'foliate-js/view.js'

/** 阅读位置（映射自 foliate relocate 事件的 detail） */
export interface FoliateLocation {
  /** EPUB CFI */
  cfi?: string
  /** 全书进度 0~1 */
  fraction?: number
  /** 当前章节索引（detail.section.current，0 起） */
  chapterIndex?: number
}

/** 高亮颜色 */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

/** 高亮数据 */
export interface HighlightData {
  /** CFI 位置 */
  cfi: string
  /** 选中文本 */
  quote: string
  /** 颜色 */
  color: HighlightColor
  /** 章节索引 */
  chapterIndex: number
}

export interface FoliateViewProps {
  /** 书籍数据 (EPUB zip 的 ArrayBuffer 或 Blob) */
  src: ArrayBuffer | Blob
  /** 阅读位置变化回调 (relocate 事件) */
  onRelocate?: (loc: FoliateLocation) => void
  /** 书籍打开成功回调 (load 事件) */
  onLoad?: () => void
  /** 选中文本回调 (mouseup 事件) */
  onSelection?: (selection: { cfi: string; quote: string; chapterIndex: number }) => void
  /** 高亮绘制回调 (draw-annotation 事件) */
  onAnnotationDraw?: (highlight: HighlightData) => void
}

export default function FoliateView({
  src,
  onRelocate,
  onLoad,
  onSelection,
  onAnnotationDraw,
}: FoliateViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const callbacksRef = useRef({ onRelocate, onLoad, onSelection, onAnnotationDraw })
  useEffect(() => {
    callbacksRef.current = { onRelocate, onLoad, onSelection, onAnnotationDraw }
  }, [onRelocate, onLoad, onSelection, onAnnotationDraw])

  useEffect(() => {
    // SSR 守卫：服务端无 window，不执行任何浏览器逻辑
    if (typeof window === 'undefined') return

    let cancelled = false
    const view: View | null = null

    const handleRelocate = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            cfi?: string
            fraction?: number
            section?: { current: number }
          }
        | undefined
      callbacksRef.current.onRelocate?.({
        cfi: detail?.cfi,
        fraction: detail?.fraction,
        chapterIndex: detail?.section?.current,
      })
    }
    const handleLoad = () => callbacksRef.current.onLoad?.()

    // 处理选中文本
    const handleSelection = () => {
      if (!viewRef.current) return
      
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      
      const range = selection.getRangeAt(0)
      if (!range) return
      
      // 获取选中的文本
      const quote = range.toString().trim()
      if (!quote) return
      
      // 获取当前章节索引
      const chapterIndex = viewRef.current.lastLocation?.section?.current ?? 0
      
      // 获取 CFI
      const cfi = viewRef.current.getCFI(chapterIndex, range)
      
      callbacksRef.current.onSelection?.({
        cfi,
        quote,
        chapterIndex,
      })
    }

    // 处理高亮绘制
    const handleDrawAnnotation = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        draw: (overlayer: unknown, annotation: { color: string }) => void
        annotation: { value: string; color?: string }
      }
      
      // 从 detail 中提取高亮信息
      const annotation = detail?.annotation
      if (!annotation?.value) return
      
      // 尝试从 CFI 解析章节索引 (简化处理)
      const chapterIndex = viewRef.current?.lastLocation?.section?.current ?? 0
      
      callbacksRef.current.onAnnotationDraw?.({
        cfi: annotation.value,
        quote: '', // draw-annotation 事件不包含原文，需外部查询
        color: (annotation.color as HighlightColor) || 'yellow',
        chapterIndex,
      })
    }

    const init = async () => {
      // 动态 import：模块导入即注册自定义元素，仅限浏览器执行
      await import('foliate-js/view.js')
      if (cancelled || !containerRef.current) return

      const el = document.createElement('foliate-view')
      // 自定义元素默认 inline，撑满容器
      el.style.cssText = 'display: block; width: 100%; height: 100%'
      el.addEventListener('relocate', handleRelocate)
      el.addEventListener('load', handleLoad)
      // 监听选中文本
      el.addEventListener('mouseup', handleSelection)
      // 监听高亮绘制
      el.addEventListener('draw-annotation', handleDrawAnnotation)
      // 监听高亮恢复 (create-overlay)
      el.addEventListener('create-overlay', (e: Event) => {
        const detail = (e as CustomEvent).detail as { index: number }
        // 章节高亮恢复由外部处理
        console.log('[FoliateView] create-overlay at index:', detail?.index)
      })
      viewRef.current = el
      containerRef.current.appendChild(el)

      // ArrayBuffer 需包装为 File;已是 File/Blob 则直接透传。
      // 注意必须用 File 而非 Blob:foliate makeBook 的格式探测
      // (isCBZ/isFB2/isFBZ) 读取 file.name,Blob 无 name 属性会抛错
      const file =
        src instanceof ArrayBuffer
          ? new File([src], 'book.epub', { type: 'application/epub+zip' })
          : src
      await viewRef.current.open(file)
    }

    void init()

    return () => {
      cancelled = true
      if (!viewRef.current) return
      viewRef.current.removeEventListener('relocate', handleRelocate)
      viewRef.current.removeEventListener('load', handleLoad)
      viewRef.current.removeEventListener('mouseup', handleSelection)
      viewRef.current.removeEventListener('draw-annotation', handleDrawAnnotation)
      viewRef.current.close()
      viewRef.current.remove()
    }
  }, [src])

  return <div ref={containerRef} className="h-full w-full" />
}