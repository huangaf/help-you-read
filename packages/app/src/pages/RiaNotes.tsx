// RiaNotes 页面 — RIA (Read-Interact-Articulate) 笔记

import { useState } from 'react';
import type { CoreClient } from '../services/core.js';

interface RiaNotesProps {
    coreClient: CoreClient;
    bookId: string;
    selectedText: string | null;
    currentCfi: string | null;
    onDone: () => void;
}

export default function RiaNotes({ coreClient, bookId, selectedText, currentCfi, onDone }: RiaNotesProps) {
    const [interpretation, setInterpretation] = useState('');
    const [application, setApplication] = useState('');
    const [saving, setSaving] = useState(false);
    const [wall, setWall] = useState(false);

    // 无选中文本时提示
    if (!selectedText) {
        return (
            <div style={{ padding: '16px', color: '#999' }}>
                <p>请先在阅读器中选中一段文字</p>
            </div>
        );
    }

    const handleSave = async () => {
        if (!interpretation.trim() && !application.trim()) return;

        setSaving(true);
        try {
            // 组合 RIA 笔记内容（R=原文, I=解读, A=应用）
            const content = `【Read】${selectedText}\n\n【Interpret】${interpretation}\n\n【Apply】${application}`;
            await coreClient.addNote({ bookId, title: `RIA: ${selectedText.slice(0, 30)}…`, content, method: 'ria', pinned: wall });

            // A2「贴墙」：生成复习卡进池（question 取 A 应用内容）
            if (wall) {
                await coreClient.addReviewItem({ bookId, content: application.trim() || content });
            }

            onDone();

            // 重置表单
            setInterpretation('');
            setApplication('');
            setWall(false);
        } catch (e) {
            console.error('保存 RIA 笔记失败:', e);
            alert(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>RIA 笔记</h3>

            {/* R: 原文（只读展示） */}
            <div style={{ marginBottom: '8px' }}>
                <label style={styles.label}>Read（原文）</label>
                <div style={{ padding: '6px 8px', background: '#f0f4ff', borderRadius: '4px', fontSize: '13px' }}>
                    {selectedText}
                </div>
            </div>

            {/* I: 解读 */}
            <div style={{ marginBottom: '8px' }}>
                <label style={styles.label}>Interpret（解读）</label>
                <textarea
                    value={interpretation}
                    onChange={e => setInterpretation(e.target.value)}
                    placeholder="用自己的话解释这段话…"
                    rows={3}
                    style={styles.textarea}
                />
            </div>

            {/* A: 应用 */}
            <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Apply（应用）</label>
                <textarea
                    value={application}
                    onChange={e => setApplication(e.target.value)}
                    placeholder="如何应用到实际场景…"
                    rows={3}
                    style={styles.textarea}
                />
            </div>

            <label style={styles.wallLabel}>
                <input type="checkbox" checked={wall} onChange={e => setWall(e.target.checked)} />
                贴墙（A2 长期卡片 → 进复习池）
            </label>

            <button onClick={handleSave} disabled={saving || (!interpretation.trim() && !application.trim())} style={styles.saveBtn}>
                {saving ? '保存中…' : wall ? '保存并贴墙' : '保存笔记'}
            </button>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    label: { fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' },
    textarea: { width: '100%', padding: '6px 8px', fontSize: '13px', boxSizing: 'border-box' },
    saveBtn: { padding: '6px 16px', fontSize: '13px' },
    wallLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', marginBottom: '10px', cursor: 'pointer' },
};
