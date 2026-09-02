'use client';

/**
 * 右栏面板 - 三栏阅读器的右侧工具面板
 *
 * 包含三个标签页：
 * - 对话：RAG 问答，流式响应
 * - 便签：RIA 便签管理（I/A1/A2）
 * - 档案：读书档案（麦肯锡方法）
 */

import { useState, useRef, useEffect } from 'react';
import type { Note, ReadingArchive } from '@/types';
import { parseSseChunk, readSseStream } from '@/lib/sse';

/** 标签页类型 */
type TabType = 'chat' | 'notes' | 'archive';

export interface RightPanelProps {
  /** 书籍 ID */
  bookId: string;
  /** 获取当前选中文本的回调（可选） */
  onGetSelection?: () => string | null;
}

/** 便签类型 → 颜色映射 */
const NOTE_TYPE_COLORS: Record<Note['type'], string> = {
  I: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  A1: 'bg-green-100 border-green-400 text-green-800',
  A2: 'bg-blue-100 border-blue-400 text-blue-800',
};

/** 便签类型标签 */
const NOTE_TYPE_LABELS: Record<Note['type'], string> = {
  I: 'I - 重述',
  A1: 'A1 - 关联',
  A2: 'A2 - 行动',
};

export default function RightPanel({ bookId, onGetSelection }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  
  // 对话状态
  const [question, setQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // 便签状态
  const [notes, setNotes] = useState<Note[]>([]);
  const [riaQuote, setRiaQuote] = useState('');
  const [riaResult, setRiaResult] = useState<{ I: string; A1_question: string; A2: string } | null>(null);
  const [isGeneratingRia, setIsGeneratingRia] = useState(false);
  
  // 档案状态
  const [archive, setArchive] = useState<ReadingArchive | null>(null);
  const [isGeneratingArchive, setIsGeneratingArchive] = useState(false);

  // 滚动到底部
  useEffect(() => {
    const el = chatEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // 加载便签
  useEffect(() => {
    if (activeTab === 'notes') {
      loadNotes();
    }
  }, [activeTab, bookId]);

  // 加载档案
  useEffect(() => {
    if (activeTab === 'archive') {
      loadArchive();
    }
  }, [activeTab, bookId]);

  /** 加载便签列表 */
  async function loadNotes() {
    try {
      const res = await fetch(`/api/notes?bookId=${encodeURIComponent(bookId)}`);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (error) {
      console.error('[便签] 加载失败:', error);
    }
  }

  /** 加载档案 */
  async function loadArchive() {
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookId)}/archive`);
      const data = await res.json();
      setArchive(data.archive || null);
    } catch (error) {
      console.error('[档案] 加载失败:', error);
    }
  }

  /** 发送对话消息 */
  async function handleSendMessage() {
    if (!question.trim() || isStreaming) return;

    const userQuestion = question;
    const selection = onGetSelection?.() || null;
    
    setQuestion('');
    setChatMessages(prev => [...prev, { role: 'user', content: userQuestion }]);
    setIsStreaming(true);

    let assistantContent = '';

    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: userQuestion,
          selection,
          location: null,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('无法获取流读取器');
      }

      const onChunk = (data: { text?: string; error?: string; done?: boolean }) => {
        if (data.text) {
          assistantContent += data.text;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...last, content: last.content + data.text }];
            }
            return [...prev, { role: 'assistant', content: data.text! }];
          });
        }
        if (data.error) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: `错误：${data.error}` }]);
          setIsStreaming(false);
        }
        if (data.done) {
          setIsStreaming(false);
        }
      };

      const onComplete = () => setIsStreaming(false);
      const onError = (error: Error) => {
        console.error('[聊天] 流读取错误:', error);
        setChatMessages(prev => [...prev, { role: 'assistant', content: `错误：${error.message}` }]);
        setIsStreaming(false);
      };

      await readSseStream(reader, onChunk, onComplete, onError);
    } catch (error) {
      console.error('[聊天] 发送失败:', error);
      const errorMsg = error instanceof Error ? error.message : '请求失败';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `错误：${errorMsg}` }]);
      setIsStreaming(false);
    }
  }

  /** 处理输入换行 */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  /** 生成 RIA 便签 */
  async function handleGenerateRia() {
    if (!riaQuote.trim()) return;

    setIsGeneratingRia(true);
    try {
      const res = await fetch('/api/notes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote: riaQuote, bookId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = await res.json();
      setRiaResult(result);
    } catch (error) {
      console.error('[RIA] 生成失败:', error);
      alert('生成失败，请重试');
    } finally {
      setIsGeneratingRia(false);
    }
  }

  /** 保存 RIA 便签 */
  async function saveRiaNotes() {
    if (!riaResult) return;

    try {
      // 保存三条便签
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bookId, 
          type: 'I', 
          content: riaResult.I,
          sourceQuote: riaQuote,
        }),
      });

      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bookId, 
          type: 'A1', 
          content: riaResult.A1_question,
          sourceQuote: riaQuote,
        }),
      });

      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bookId, 
          type: 'A2', 
          content: riaResult.A2,
          sourceQuote: riaQuote,
        }),
      });

      alert('RIA 便签已保存');
      loadNotes(); // 刷新列表
      setRiaResult(null);
      setRiaQuote('');
    } catch (error) {
      console.error('[RIA] 保存失败:', error);
      alert('保存失败，请重试');
    }
  }

  /** 生成读书档案 */
  async function handleGenerateArchive() {
    setIsGeneratingArchive(true);
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(bookId)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: null }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setArchive(data.archive);
    } catch (error) {
      console.error('[档案] 生成失败:', error);
      alert('生成失败，请重试');
    } finally {
      setIsGeneratingArchive(false);
    }
  }

  /** 按类型分组便签 */
  const notesByType = {
    I: notes.filter(n => n.type === 'I'),
    A1: notes.filter(n => n.type === 'A1'),
    A2: notes.filter(n => n.type === 'A2'),
  };

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* 标签页导航 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          对话
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'notes'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          便签
        </button>
        <button
          onClick={() => setActiveTab('archive')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'archive'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          档案
        </button>
      </div>

      {/* 标签页内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-500 mt-8">
                  <p className="text-sm">向这本书提问，AI 会基于内容回答</p>
                </div>
              )}
              
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              
              {isStreaming && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <span className="text-gray-500 text-sm">思考中...</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* 输入框 */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入问题...（Enter 发送，Shift+Enter 换行）"
                  className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!question.trim() || isStreaming}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="p-4 space-y-6">
            {/* RIA 生成器 */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">生成 RIA 便签</h3>
              <textarea
                value={riaQuote}
                onChange={(e) => setRiaQuote(e.target.value)}
                placeholder="输入原文摘录..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateRia}
                  disabled={!riaQuote.trim() || isGeneratingRia}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingRia ? '生成中...' : '生成 RIA'}
                </button>
                {riaResult && (
                  <button
                    onClick={saveRiaNotes}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    保存
                  </button>
                )}
              </div>

              {/* RIA 结果展示 */}
              {riaResult && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-xs font-medium text-yellow-800 mb-1">I - 重述</p>
                    <p className="text-sm text-yellow-900">{riaResult.I}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-xs font-medium text-green-800 mb-1">A1 - 关联</p>
                    <p className="text-sm text-green-900">{riaResult.A1_question}</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium text-blue-800 mb-1">A2 - 行动</p>
                    <p className="text-sm text-blue-900">{riaResult.A2}</p>
                  </div>
                </div>
              )}
            </div>

            {/* 便签列表 */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900">便签列表</h3>
              
              {notes.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">暂无便签</p>
              )}

              {(['I', 'A1', 'A2'] as const).map((type) => (
                <div key={type}>
                  <h4 className="text-xs font-medium text-gray-500 mb-2">{NOTE_TYPE_LABELS[type]}</h4>
                  <div className="space-y-2">
                    {notesByType[type].map((note) => (
                      <div
                        key={note.id}
                        className={`p-3 rounded-lg border ${NOTE_TYPE_COLORS[note.type]}`}
                      >
                        <p className="text-sm font-medium mb-1">{note.content}</p>
                        {note.sourceQuote && (
                          <p className="text-xs opacity-75 mt-2 border-t border-current pt-2">
                            &ldquo;{note.sourceQuote}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <div className="p-4">
            {!archive ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">尚未生成读书档案</p>
                <button
                  onClick={handleGenerateArchive}
                  disabled={isGeneratingArchive}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingArchive ? '生成中...' : '生成档案'}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 档案内容 */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">核心收获</h3>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {archive.keyTakeaways || '暂无'}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">行动计划</h3>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {archive.actionPlan || '暂无'}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">输出记录</h3>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {archive.output || '暂无'}
                    </p>
                  </div>
                </div>

                {/* 重新生成按钮 */}
                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={handleGenerateArchive}
                    disabled={isGeneratingArchive}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingArchive ? '生成中...' : '重新生成'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
