// demo 页：加载 public/demo.epub 验证 FoliateView 真实渲染（M0 支柱 3 验收）
'use client'
import FoliateView from '@/components/reader/FoliateView'
import { useEffect, useState } from 'react'

export default function DemoPage() {
  const [book, setBook] = useState<ArrayBuffer | null>(null)
  const [status, setStatus] = useState('加载中…')
  const [loc, setLoc] = useState('')

  useEffect(() => {
    // 客户端 fetch demo.epub（M0 验证用；M1 将从 db 读文件）
    fetch('/demo.epub')
      .then(r => r.arrayBuffer())
      .then(setBook)
      .catch(() => setStatus('加载失败'))
  }, [])

  if (!book) return <div id="status">{status}</div>

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-4 border-b px-4 py-2 text-sm">
        <span id="status">{status}</span>
        <span id="location">{loc}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <FoliateView
          src={book}
          onLoad={() => setStatus('已打开')}
          onRelocate={l => setLoc(`cfi:${l.cfi?.slice(0, 30) ?? '-'} 进度:${Math.round((l.fraction ?? 0) * 100)}% 章:${l.chapterIndex}`)}
        />
      </div>
    </div>
  )
}