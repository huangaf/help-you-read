// Library 页面 — 书籍列表 + 导入 EPUB

import { useState, useEffect } from 'react';
import type { CoreClient } from '../services/core.js';
import { putEpub } from '../services/epub-store.js';

interface LibraryProps {
    coreClient: CoreClient;
    currentBookId: string | null;
    onSelectBook: (book: Record<string, unknown>, blob?: Blob) => void;
    refreshKey: number;
}

export default function Library({ coreClient, currentBookId, onSelectBook, refreshKey }: LibraryProps) {
    const [books, setBooks] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);

    // 刷新书籍列表
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        coreClient.listBooks()
            .then(data => { if (!cancelled) setBooks(data); })
            .catch(e => console.error('listBooks 失败:', e))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [coreClient, refreshKey]);

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.epub,application/epub+zip';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;

            setLoading(true);
            try {
                // 浏览器环境：EPUB 数据由 Engine.loadBook({type:'data'}) 处理
                // CoreService 仅创建 DB record（用虚拟路径标识，不读文件）
                const virtualPath = `browser:${file.name}`;
                const result = await coreClient.importBook(virtualPath);

                // 持久化 EPUB 字节到 IndexedDB（页面刷新后仍可重新打开）
                await putEpub(virtualPath, file);

                // 去重：同文件名只保留最新导入
                setBooks(prev => {
                    const filtered = prev.filter(b => b.filePath !== virtualPath);
                    return [...filtered, result];
                });

                // 传递 Blob（供 Reader 通过 Engine.loadBook({type:'data'}) 加载）
                onSelectBook(result, file as Blob);
            } catch (e) {
                console.error('导入失败:', e);
                alert(`EPUB 导入失败: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
                setLoading(false);
            }
        };
        input.click();
    };

    return (
        <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>书库</h3>
            <button onClick={handleImport} disabled={loading} style={{ width: '100%', padding: '6px', marginBottom: '8px' }}>
                {loading ? '加载中…' : '+ 导入 EPUB'}
            </button>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {books.map(book => (
                    <li key={book.id as string} style={{ padding: '6px 8px' }}>
                        <button
                            onClick={() => onSelectBook(book)}
                            style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 8px',
                                border: 'none',
                                cursor: 'pointer',
                                background: currentBookId === book.id ? '#e8f0fe' : 'transparent',
                                borderRadius: '4px',
                            }}
                        >
                            <span style={{ fontWeight: currentBookId === book.id ? 600 : 400 }}>
                                {book.title as string}
                            </span>
                            {book.author ? <small style={{ color: '#888' }}> — {book.author as string}</small> : null}
                        </button>
                    </li>
                ))}
            </ul>
            {books.length === 0 && !loading && (
                <p style={{ color: '#999', fontSize: '12px' }}>暂无书籍，请先导入 EPUB</p>
            )}
        </div>
    );
}
