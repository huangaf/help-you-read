// Skills 页面 — 技能列表 + 执行

import { useState, useEffect } from 'react';
import type { CoreClient } from '../services/core.js';

interface SkillsProps {
    coreClient: CoreClient;
    bookId: string;
    selectedText: string | null;
    currentCfi: string | null;
    onDone: () => void;
}

interface SkillRecord {
    id: string;
    name: string;
    kind: string;
    access: string;
    source: string;
    enabled: boolean;
}

export default function Skills({ coreClient, bookId, selectedText, currentCfi, onDone }: SkillsProps) {
    const [skills, setSkills] = useState<SkillRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [runningSkill, setRunningSkill] = useState<string | null>(null);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);

    // 加载技能列表
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        coreClient.listSkills()
            .then(data => {
                if (cancelled) return;
                setSkills((data as Array<Record<string, unknown>>).map(s => ({
                    id: s.id as string,
                    name: s.name as string,
                    kind: s.kind as string,
                    access: s.access as string,
                    source: s.source as string,
                    enabled: s.enabled as boolean,
                })));
            })
            .catch(e => console.error('加载技能列表失败:', e))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [coreClient]);

    // 执行技能
    const handleRun = async (skill: SkillRecord) => {
        setRunningSkill(skill.id);
        setResult(null);

        try {
            const res = await coreClient.runSkill({
                skillId: skill.id,
                ...(bookId ? { bookId } : {}),
                ...(selectedText ? { selectedText } : {}),
                ...(currentCfi ? { cfi: currentCfi } : {}),
            });

            setResult(res);
            onDone();
        } catch (e) {
            console.error('技能执行失败:', e);
            setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
        } finally {
            setRunningSkill(null);
        }
    };

    if (loading) return <p style={{ color: '#999' }}>加载中…</p>;

    if (skills.length === 0) {
        return <p style={{ color: '#999', padding: '16px' }}>暂无已安装技能</p>;
    }

    return (
        <div style={{ padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>技能（{skills.length}）</h3>

            {skills.map(skill => (
                <div key={skill.id} style={{ marginBottom: '8px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{skill.name}</span>
                        <small style={{ color: '#888' }}>
                            {skill.kind} | {skill.source}
                        </small>
                    </div>

                    <button
                        onClick={() => handleRun(skill)}
                        disabled={runningSkill === skill.id || !skill.enabled}
                        style={{ marginTop: '4px', padding: '4px 12px', fontSize: '12px' }}
                    >
                        {runningSkill === skill.id ? '执行中…' : '运行'}
                    </button>
                </div>
            ))}

            {/* 执行结果 */}
            {result && (
                <div style={{ marginTop: '12px', padding: '8px', background: result.ok ? '#e8f5e9' : '#fdecea', borderRadius: '4px' }}>
                    <strong style={{ fontSize: '12px', color: result.ok ? '#2e7d32' : '#c62828' }}>
                        {result.ok ? '成功' : '失败'}
                    </strong>
                    <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                        {result.ok ? JSON.stringify(result.data, null, 2) : (result.error as string)}
                    </pre>
                </div>
            )}
        </div>
    );
}
