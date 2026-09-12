// ReviewQueue 页面 — SuperMemo 间隔复习（SM-2 评分）

import { useState, useEffect } from 'react';
import type { CoreClient } from '../services/core.js';

interface ReviewQueueProps {
    coreClient: CoreClient;
    bookId: string;
    onDone: () => void;
}

interface ReviewItem {
    id: string;
    bookId: string;
    question: string;
    answer: string;
    context?: string | null;
    dueDate: number;
    intervalDays: number;
    easeFactor: number;
    lapses: number;
    retrievalCount: number;
    lastReviewedAt?: string | null;
}

export default function ReviewQueue({ coreClient, bookId, onDone }: ReviewQueueProps) {
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // 加载到期复习项
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        coreClient.listDueReviews()
            .then(data => {
                if (cancelled) return;
                setItems((data as Array<Record<string, unknown>>).map(r => ({
                    id: r.id as string,
                    bookId: r.bookId as string,
                    question: r.question as string,
                    answer: (r.answer as string) ?? '',
                    context: (r.context as string | undefined) ?? null,
                    dueDate: r.dueDate as number,
                    intervalDays: r.intervalDays as number,
                    easeFactor: r.easeFactor as number,
                    lapses: r.lapses as number,
                    retrievalCount: r.retrievalCount as number,
                    lastReviewedAt: (r.lastReviewedAt as string | undefined) ?? null,
                })).filter(i => i.bookId === bookId));
            })
            .catch(e => console.error('加载复习队列失败:', e))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [coreClient, bookId]);

    // SM-2 评分（0-5）
    const handleScore = async (item: ReviewItem, quality: number) => {
        setSaving(true);
        try {
            await coreClient.scheduleReview(item.id, { quality });
            onDone();
        } catch (e) {
            console.error('评分失败:', e);
            alert(`评分失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p style={{ color: '#999' }}>加载中…</p>;

    if (items.length === 0) {
        return <p style={{ color: '#999', padding: '16px' }}>暂无到期复习项</p>;
    }

    return (
        <div style={{ padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>复习队列（{items.length}）</h3>

            {items.map(item => (
                <div key={item.id} style={{ marginBottom: '12px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <p style={{ fontSize: '13px', margin: '0 0 6px' }}>{item.question}</p>
                    <small style={{ color: '#888', display: 'block', marginBottom: '6px' }}>
                        间隔: {item.intervalDays}天 | EF: {item.easeFactor.toFixed(2)} | 复习 {item.lapses} 次
                    </small>

                    {/* SM-2 评分按钮（0=完全不记得, 5=完美回忆） */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {[0, 1, 2, 3, 4, 5].map(q => (
                            <button key={q} onClick={() => handleScore(item, q)} style={{ flex: 1, padding: '4px' }}>
                                {q}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
