// App 主组件 — 三栏布局（Library | Reader | TabPanel）+ 状态管理
// v1: 无 react-router，用 state-based tab switching

import { useState, useCallback } from 'react';
import { CoreClient } from './services/core.js';
import Library from './pages/Library.js';
import Reader from './pages/Reader.js';
import AIChat from './pages/AIChat.js';
import RiaNotes from './pages/RiaNotes.js';
import ReviewQueue from './pages/ReviewQueue.js';
import TtsPanel from './pages/Tts.js';
import Skills from './pages/Skills.js';

/** 右侧面板 tab 标识 */
type TabId = 'ai' | 'ria' | 'review' | 'tts' | 'skills';

const TAB_LABELS: Record<TabId, string> = {
    ai: 'AI 对话',
    ria: 'RIA 笔记',
    review: '复习队列',
    tts: '朗读',
    skills: '技能',
};

export default function App() {
    const [coreClient] = useState(() => new CoreClient());

    // 当前选中的书籍
    const [currentBook, setCurrentBook] = useState<Record<string, unknown> | null>(null);

    // 浏览器导入的 EPUB Blob（Tauri 环境为 null，使用 path 模式）
    const [importedBlob, setImportedBlob] = useState<Blob | null>(null);

    // 右侧面板当前 tab
    const [activeTab, setActiveTab] = useState<TabId>('ai');

    // 当前选中的文本（阅读器 → RIA/AIChat 传递）
    const [selectedText, setSelectedText] = useState<string | null>(null);

    // 当前 CFI（阅读器 → 定位）
    const [currentCfi, setCurrentCfi] = useState<string | null>(null);

    // 刷新触发器（让子组件重新拉取数据）
    const [refreshKey, setRefreshKey] = useState(0);

    // 选中书籍（可选携带 Blob，浏览器导入场景）
    const handleSelectBook = useCallback((book: Record<string, unknown>, blob?: Blob) => {
        setCurrentBook(book);
        setImportedBlob(blob ?? null);
        setRefreshKey(k => k + 1);
    }, []);

    // 选中文本（从 Reader 传递）
    const handleSelectText = useCallback((text: string | null, cfi?: string) => {
        setSelectedText(text);
        if (cfi) setCurrentCfi(cfi);
    }, []);

    // 刷新数据（操作完成后触发）
    const handleRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
    }, []);

    const bookId = currentBook ? (currentBook.id as string) : null;

    return (
        <div style={styles.app}>
            {/* 左栏：书库 */}
            <aside style={styles.leftPanel}>
                <Library
                    coreClient={coreClient}
                    currentBookId={bookId ?? null}
                    onSelectBook={handleSelectBook}
                    refreshKey={refreshKey}
                />
            </aside>

            {/* 中栏：阅读器 */}
            <main style={styles.centerPanel}>
                {currentBook ? (
                    <Reader
                        coreClient={coreClient}
                        bookId={bookId!}
                        currentCfi={currentCfi}
                        onCfiChange={setCurrentCfi}
                        onSelectText={handleSelectText}
                        blob={importedBlob}
                    />
                ) : (
                    <div style={styles.emptyState}>
                        <p>从左侧书库选择一本书开始阅读</p>
                    </div>
                )}
            </main>

            {/* 右栏：Tab 面板 */}
            <aside style={styles.rightPanel}>
                {/* Tab 导航条 */}
                <nav style={styles.tabBar}>
                    {(Object.keys(TAB_LABELS) as TabId[]).map(tab => (
                        <button
                            key={tab}
                            style={{
                                ...styles.tabButton,
                                ...(activeTab === tab ? styles.tabActive : {}),
                            }}
                            onClick={() => setActiveTab(tab)}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </nav>

                {/* Tab 内容区 */}
                <div style={styles.tabContent}>
                    {currentBook ? (
                        <>
                            {activeTab === 'ai' && (
                                <AIChat coreClient={coreClient} bookId={bookId!} selectedText={selectedText} currentCfi={currentCfi} />
                            )}
                            {activeTab === 'ria' && (
                                <RiaNotes coreClient={coreClient} bookId={bookId!} selectedText={selectedText} currentCfi={currentCfi} onDone={handleRefresh} />
                            )}
                            {activeTab === 'review' && (
                                <ReviewQueue coreClient={coreClient} bookId={bookId!} onDone={handleRefresh} />
                            )}
                            {activeTab === 'tts' && (
                                <TtsPanel coreClient={coreClient} selectedText={selectedText} />
                            )}
                            {activeTab === 'skills' && (
                                <Skills coreClient={coreClient} bookId={bookId!} selectedText={selectedText} currentCfi={currentCfi} onDone={handleRefresh} />
                            )}
                        </>
                    ) : (
                        <p style={styles.emptyHint}>请先选择一本书</p>
                    )}
                </div>
            </aside>
        </div>
    );
}

// ============ 内联样式（v1: 无 CSS framework，保持零依赖）============
const styles: Record<string, React.CSSProperties> = {
    app: {
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    leftPanel: {
        width: '220px',
        minWidth: '180px',
        borderRight: '1px solid #ddd',
        overflow: 'auto',
        padding: '8px',
    },
    centerPanel: {
        flex: 1,
        overflow: 'auto',
        padding: '16px',
    },
    rightPanel: {
        width: '380px',
        minWidth: '320px',
        borderLeft: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
    },
    tabBar: {
        display: 'flex',
        borderBottom: '1px solid #ddd',
        padding: '4px 8px',
    },
    tabButton: {
        padding: '6px 12px',
        border: 'none',
        borderBottom: '2px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '13px',
    },
    tabActive: {
        borderBottomColor: '#4a90d7',
        color: '#4a90d7',
        fontWeight: 600,
    },
    tabContent: {
        flex: 1,
        overflow: 'auto',
        padding: '12px',
    },
    emptyState: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#999',
    },
    emptyHint: {
        color: '#999',
        textAlign: 'center',
        marginTop: '2rem',
    },
};
