'use client'

/**
 * 三栏阅读器页面 (M1 核心 UI)
 *
 * 布局:
 * - 左栏 (~20%): 章节目录 + 高亮列表
 * - 中央 (~55%): FoliateView 阅读区
 * - 右栏 (~25%): AI 对话/便签/档案标签页 (骨架，内容由 Wave C 填充)
 */
import { useEffect, useState, useCallback, use } from 'react'
import FoliateView, { type HighlightData } from '@/components/reader/FoliateView'
import type { Highlight } from '@/types'

/** 高亮颜色映射到 CSS */
const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  yellow: '#fde047',
  green: '#86efac',
  blue: '#93c5fd',
  pink: '#f9a8d4',
  purple: '#d8b4fe',
}

export default function ReadPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params)
  
  // 书籍数据
  const [book, setBook] = useState<{ title: string; author: string | null } | null>(null)
  const [chapters, setChapters] = useState<{ index: number; title: string }[]>([])
  
  // 高亮数据
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [tempSelection, setTempSelection] = useState<HighlightData | null>(null)
  const [selectedColor, setSelectedColor] = useState<HighlightData['color']>('yellow')
  
  // 右栏标签页
  const [activeTab, setActiveTab] = useState<'ai' | 'note' | 'archive'>('ai')
  
  // 书籍 ArrayBuffer
  const [epubBuffer, setEpubBuffer] = useState<ArrayBuffer | null>(null)
  
  // 加载书籍信息和章节
  useEffect(() => {
    const loadBookInfo = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}`)
        if (!res.ok) {
          console.error('[ReadPage] 加载书籍信息失败:', res.status)
          return
        }
        const data = await res.json()
        setBook(data.book)
        setChapters(data.chapters || [])
      } catch (error) {
        console.error('[ReadPage] 加载书籍信息错误:', error)
      }
    }
    loadBookInfo()
  }, [bookId])
  
  // 加载高亮列表
  useEffect(() => {
    const loadHighlights = async () => {
      try {
        const res = await fetch(`/api/highlights?bookId=${bookId}`)
        if (!res.ok) {
          console.error('[ReadPage] 加载高亮失败:', res.status)
          return
        }
        const data = await res.json()
        setHighlights(data.highlights || [])
      } catch (error) {
        console.error('[ReadPage] 加载高亮错误:', error)
      }
    }
    loadHighlights()
  }, [bookId])
  
  // 加载 EPUB 文件
  useEffect(() => {
    const loadEpub = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/file`)
        if (!res.ok) {
          console.error('[ReadPage] 加载 EPUB 文件失败:', res.status)
          return
        }
        const buffer = await res.arrayBuffer()
        setEpubBuffer(buffer)
      } catch (error) {
        console.error('[ReadPage] 加载 EPUB 错误:', error)
      }
    }
    loadEpub()
  }, [bookId])
  
  // 处理选中文本
  const handleSelection = useCallback((selection: { cfi: string; quote: string; chapterIndex: number }) => {
    setTempSelection({
      cfi: selection.cfi,
      quote: selection.quote,
      chapterIndex: selection.chapterIndex,
      color: selectedColor,
    })
  }, [selectedColor])
  
  // 创建高亮
  const createHighlight = async () => {
    if (!tempSelection) return
    
    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          quote: tempSelection.quote,
          cfi: tempSelection.cfi,
          color: tempSelection.color,
        }),
      })
      
      if (!res.ok) {
        console.error('[ReadPage] 创建高亮失败:', res.status)
        return
      }
      
      const data = await res.json()
      setHighlights(prev => [...prev, data.highlight])
      setTempSelection(null)
    } catch (error) {
      console.error('[ReadPage] 创建高亮错误:', error)
    }
  }
  
  // 取消高亮
  const cancelHighlight = () => {
    setTempSelection(null)
  }
  
  // 跳转到章节
  const goToChapter = (index: number) => {
    console.log('[ReadPage] 跳转到章节:', index)
  }
  
  return (
    <div className="flex h-screen w-full bg-white">
      {/* 左栏：章节目录 + 高亮列表 */}
      <aside className="w-1/5 border-r border-gray-200 flex flex-col overflow-hidden">
        {/* 章节目录 */}
        <div className="flex-1 overflow-y-auto border-b border-gray-200">
          <div className="p-4 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">目录</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {chapters.map(chapter => (
              <li key={chapter.index}>
                <button
                  onClick={() => goToChapter(chapter.index)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                >
                  {chapter.title || `第${chapter.index + 1}章`}
                </button>
              </li>
            ))}
          </ul>
        </div>
        
        {/* 高亮列表 */}
        <div className="h-1/3 overflow-y-auto">
          <div className="p-4 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">高亮 ({highlights.length})</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {highlights.map(highlight => (
              <li key={highlight.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start gap-2">
                  <div
                    className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[highlight.color] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 line-clamp-2">{highlight.quote}</p>
                  </div>
                </div>
              </li>
            ))}
            {highlights.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-gray-400">
                暂无高亮
              </li>
            )}
          </ul>
        </div>
      </aside>
      
      {/* 中央：阅读器 */}
      <main className="flex-1 flex flex-col">
        {/* 顶部栏：书籍信息 */}
        <header className="h-12 border-b border-gray-200 flex items-center px-4 bg-white">
          {book ? (
            <>
              <h1 className="text-base font-semibold text-gray-900">{book.title}</h1>
              {book.author && (
                <span className="ml-2 text-xs text-gray-500">by {book.author}</span>
              )}
            </>
          ) : (
            <div className="animate-pulse h-4 w-48 bg-gray-200 rounded" />
          )}
        </header>
        
        {/* 阅读器区域 */}
        <div className="flex-1 relative">
          {epubBuffer ? (
            <FoliateView
              src={epubBuffer}
              onRelocate={(loc) => console.log('[ReadPage] relocate:', loc)}
              onLoad={() => console.log('[ReadPage] load')}
              onSelection={handleSelection}
              onAnnotationDraw={(highlight) => console.log('[ReadPage] draw:', highlight)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-gray-400">加载书籍...</div>
            </div>
          )}
        </div>
      </main>
      
      {/* 右栏：AI 对话/便签/档案 */}
      <aside className="w-1/4 border-l border-gray-200 flex flex-col bg-white">
        {/* 标签页切换 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            AI 对话
          </button>
          <button
            onClick={() => setActiveTab('note')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'note'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            便签
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'archive'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            档案
          </button>
        </div>
        
        {/* 标签页内容占位 */}
        <div className="flex-1 p-4">
          {activeTab === 'ai' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-xl">🤖</span>
              </div>
              <p className="text-sm text-gray-500">AI 对话面板<br />内容待 Wave C 实现</p>
            </div>
          )}
          {activeTab === 'note' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-xl">📝</span>
              </div>
              <p className="text-sm text-gray-500">便签面板<br />内容待 Wave C 实现</p>
            </div>
          )}
          {activeTab === 'archive' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <span className="text-xl">📚</span>
              </div>
              <p className="text-sm text-gray-500">读书档案<br />内容待 Wave C 实现</p>
            </div>
          )}
        </div>
      </aside>
      
      {/* 高亮颜色选择弹窗 */}
      {tempSelection && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50">
          <div className="mb-3 max-w-md">
            <p className="text-sm text-gray-700 line-clamp-2">{tempSelection.quote}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">选择颜色:</span>
            {(['yellow', 'green', 'blue', 'pink', 'purple'] as const).map(color => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-8 h-8 rounded-full transition-transform ${
                  selectedColor === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: HIGHLIGHT_COLOR_MAP[color] }}
                title={color}
              />
            ))}
            <div className="w-px h-8 bg-gray-200" />
            <button
              onClick={cancelHighlight}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={createHighlight}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
