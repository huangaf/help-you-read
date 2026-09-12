// Reader 页面 — EPUB 渲染（Engine）+ 文本选中 + CFI 定位
// v1: 浏览器直接运行 Engine（foliate-js），不经过 /api/core

import { useState, useEffect, useRef, useCallback } from 'react';
import { Engine } from '@hyr/engine';
import type { EpubSource, BookHandle, RenderedPage } from '@hyr/engine';
import type { CoreClient } from '../services/core.js';
import { getEpub } from '../services/epub-store.js';

interface ReaderProps {
    coreClient: CoreClient;
    bookId: string;
    currentCfi: string | null;
    onCfiChange: (cfi: string) => void;
    onSelectText: (text: string | null, cfi?: string) => void;
    /** 浏览器导入的 EPUB Blob（Tauri 环境为 null，使用 path 模式） */
    blob?: Blob | null;
}

/** 轮询 render() 直到渲染管线产出内容（foliate 布局为异步调度） */
async function renderWhenReady(engine: Engine, timeoutMs = 15000): Promise<RenderedPage> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
        try {
            return await engine.render();
        } catch (e) {
            lastError = e;
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw lastError instanceof Error ? lastError : new Error('RENDER_TIMEOUT: 渲染超时');
}

export default function Reader({ coreClient, bookId, currentCfi, onCfiChange, onSelectText, blob }: ReaderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const unsubscribeSelectionRef = useRef<(() => void) | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageText, setPageText] = useState<string>('');
    const [bookTitle, setBookTitle] = useState('');

    // 加载 EPUB（Engine.loadBook）
    useEffect(() => {
        let cancelled = false;

        const loadEngine = async () => {
            if (!containerRef.current) return;

            // 销毁旧引擎实例 + 移除已 append 的 foliate-view（避免多本书叠加）
            if (engineRef.current) {
                engineRef.current = null;
            }
            containerRef.current.querySelectorAll('foliate-view').forEach(el => el.remove());

            try {
                setLoading(true);
                setError(null);

                // 创建 Engine（指定容器元素）
                const engine = new Engine({ element: containerRef.current });
                engineRef.current = engine;

                // 构造 EpubSource（path / data 二选一）
                let source: EpubSource;

                if (blob) {
                    // 浏览器导入：data 模式
                    source = { type: 'data', data: blob };
                } else {
                    // Tauri / 文件系统：path 模式（从 book record 获取 filePath）
                    const book = await coreClient.getBook(bookId);
                    if (!book) {
                        throw new Error('BOOK_NOT_FOUND: 书籍记录不存在');
                    }
                    const filePath = book.filePath as string;
                    if (!filePath) {
                        throw new Error('BOOK_NO_FILE: 书籍无文件路径');
                    }
                    if (filePath.startsWith('browser:')) {
                        // web 模式：从 IndexedDB 读取持久化的 EPUB 字节
                        const stored = await getEpub(bookId);
                        if (!stored) {
                            throw new Error('EPUB_DATA_MISSING: 未找到已导入的 EPUB 数据，请重新导入');
                        }
                        source = { type: 'data', data: stored };
                    } else {
                        source = { type: 'path', path: filePath };
                    }
                }

                // 加载 EPUB
                const handle = await engine.loadBook(source);
                if (cancelled) return;

                setBookTitle(handle.metadata?.title ?? '未知');

                // 初始化渲染管线（loadBook 不加载章节，须 init 触发首次导航）
                await engine.init();

                // 初次渲染：等待渲染管线就绪后提取当前页文本
                const rendered = await renderWhenReady(engine);
                if (!cancelled) setPageText(rendered.pageText);

                // 订阅正文选区（foliate 正文在 iframe 内，须由引擎侧监听）
                const unsubscribe = engine.onSelectionChange(selection => {
                    if (cancelled) return;
                    onSelectText(selection?.text ?? null, selection?.cfi ?? undefined);
                });
                unsubscribeSelectionRef.current = unsubscribe;
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadEngine();
        return () => {
            cancelled = true;
            unsubscribeSelectionRef.current?.();
            unsubscribeSelectionRef.current = null;
        };
    }, [bookId, blob, onSelectText]);

    // 页面导航（前/后页）
    const handleNext = useCallback(async () => {
        if (!engineRef.current) return;
        try {
            const rendered = await engineRef.current.render();
            // 导航到下一页（通过 goToCfi 或 foliate-js 内置 next）
            // v1: 使用 currentCfi + goToCfi 简化实现
            const cfi = await engineRef.current.currentCfi();
            if (!cfi) return;

            // 获取下一页 CFI（简化：通过 foliate-js history 的 next）
            // v1: 直接调用 render() 获取当前页，用户通过按钮导航
            setPageText(rendered.pageText);

            // 更新 CFI（如果 foliate-js 自动推进了位置）
            const newCfi = await engineRef.current.currentCfi();
            if (newCfi && newCfi !== cfi) {
                onCfiChange(newCfi);
            }
        } catch (e) {
            console.error('导航失败:', e);
        }
    }, [engineRef, onCfiChange]);

    const handlePrev = useCallback(async () => {
        if (!engineRef.current) return;
        try {
            const rendered = await engineRef.current.render();
            setPageText(rendered.pageText);

            const newCfi = await engineRef.current.currentCfi();
            if (newCfi) onCfiChange(newCfi);
        } catch (e) {
            console.error('导航失败:', e);
        }
    }, [engineRef, onCfiChange]);

    // 文本选中（mouseup 时检测 selection）
    // 渲染当前页文本（供 RIA/AIChat 引用）
    const handleRefreshPage = useCallback(async () => {
        if (!engineRef.current) return;
        try {
            const rendered = await engineRef.current.render();
            setPageText(rendered.pageText);

            const newCfi = await engineRef.current.currentCfi();
            if (newCfi) onCfiChange(newCfi);
        } catch (e) {
            console.error('刷新页面失败:', e);
        }
    }, [engineRef, onCfiChange]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 工具栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ fontSize: '13px', color: '#666' }}>{bookTitle}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handlePrev} disabled={loading}>◀ 上一页</button>
                    <button onClick={handleNext} disabled={loading}>下一页 ▶</button>
                </div>
            </div>

            {/* EPUB 渲染容器（foliate-view custom element append 目标） */}
            <div
                ref={containerRef}
                style={{ flex: 1, overflow: 'auto', padding: '16px' }}
            >
                {loading && <p style={{ color: '#999' }}>加载 EPUB 中…</p>}
                {error && <p style={{ color: '#d32f2f' }}>加载失败: {error}</p>}
                {!loading && !error && pageText && (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: '15px' }}>
                        {pageText}
                    </div>
                )}
            </div>

            {/* 状态提示 */}
            {!loading && !error && !pageText && (
                <p style={{ color: '#999', textAlign: 'center', padding: '16px' }}>
                    使用按钮导航页面，选中文字后可在右侧面板操作
                </p>
            )}
        </div>
    );
}
