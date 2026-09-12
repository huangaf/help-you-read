// AIChat 页面 — AI 对话（浏览器直接调用 oMLX，不经过 /api/core）

import { useState, useEffect, useRef } from 'react';
import type { CoreClient } from '../services/core.js';

interface AIChatProps {
    coreClient: CoreClient;
    bookId: string;
    selectedText: string | null;
    currentCfi: string | null;
}

interface ChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function AIChat({ coreClient, bookId, selectedText, currentCfi }: AIChatProps) {
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const threadIdRef = useRef<string | null>(null);

    // 加载已有对话（或创建新 thread）
    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                // 查找该 bookId 的已有 threads
                const threads = await coreClient.listThreads(bookId);
                if (threads.length > 0) {
                    const latest = threads[threads.length - 1]!;
                    threadIdRef.current = latest.id as string;
                } else {
                    const newThread = await coreClient.addThread(bookId, 'AI 对话');
                    threadIdRef.current = newThread.id as string;
                }

                // 加载该 thread 的消息
                const msgs = await coreClient.listMessages(threadIdRef.current!);
                if (!cancelled) {
                    setMessages(msgs.map(m => ({ id: m.id as string, role: m.role as 'user' | 'assistant', content: m.content as string })));
                }
            } catch (e) {
                console.error('加载对话失败:', e);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [coreClient, bookId]);

    // 发送消息（浏览器直接调用 oMLX）
    const handleSend = async () => {
        if (!input.trim() || loading) return;

        setLoading(true);
        try {
            const threadId = threadIdRef.current!;

            // 构造用户消息（含选中上下文）
            const userContent = selectedText
                ? `【选中文本】${selectedText}\n\n【问题】${input}`
                : input;

            // 保存用户消息到 DB
            const userMsg = await coreClient.addMessage({ threadId, role: 'user', content: userContent });
            setMessages(prev => [...prev, { id: userMsg.id as string, role: 'user', content: userContent }]);

            // 直接调用 oMLX（浏览器侧，不经过 /api/core）
            const aiResponse = await fetchAIChat(threadId, userContent);

            // 保存 AI 回复到 DB
            const aiMsg = await coreClient.addMessage({ threadId, role: 'assistant', content: aiResponse });
            setMessages(prev => [...prev, { id: aiMsg.id as string, role: 'assistant', content: aiResponse }]);

            setInput('');
        } catch (e) {
            console.error('AI 对话失败:', e);
            alert(`AI 调用失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>AI 对话</h3>

            {/* 消息列表 */}
            <div style={{ flex: 1, overflow: 'auto', marginBottom: '8px' }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{
                        margin: '4px 0',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: msg.role === 'user' ? '#e8f0fe' : '#f5f5f5',
                        fontSize: '13px',
                    }}>
                        <strong style={{ color: msg.role === 'user' ? '#1a73e8' : '#4285f4' }}>
                            {msg.role === 'user' ? '你' : 'AI'}:
                        </strong>{' '}
                        {msg.content}
                    </div>
                ))}
                {messages.length === 0 && <p style={{ color: '#999', fontSize: '12px' }}>开始对话吧</p>}
            </div>

            {/* 输入区 */}
            <div style={{ display: 'flex', gap: '4px' }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="输入问题…"
                    style={{ flex: 1, padding: '6px', fontSize: '13px' }}
                    disabled={loading}
                />
                <button onClick={handleSend} disabled={loading || !input.trim()} style={{ padding: '6px 12px' }}>
                    {loading ? '…' : '发送'}
                </button>
            </div>

            {/* 选中提示 */}
            {selectedText && (
                <p style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    已关联选中: 「{selectedText.slice(0, 30)}…」
                </p>
            )}
        </div>
    );
}

// oMLX 直接调用（浏览器侧）
async function fetchAIChat(threadId: string, userContent: string): Promise<string> {
    const res = await fetch('http://100.126.215.3:8090/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer REDACTED_API_KEY',
        },
        body: JSON.stringify({
            model: 'Qwen3.6-35B-A3B-OptiQ-4bit',
            messages: [
                { role: 'system', content: `你是电子书阅读助手。用户正在阅读一本书，以下是当前上下文：\n【线程ID】${threadId}\n\n请根据用户问题提供简洁、有用的回答。` },
                { role: 'user', content: userContent },
            ],
        }),
    });

    if (!res.ok) {
        throw new Error(`oMLX API 错误: ${res.status}`);
    }

    const json = await res.json() as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? '';
}
