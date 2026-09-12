// Tts 页面 — 文本朗读（espeak-ng，经 /api/core）

import { useState, useRef } from 'react';
import type { CoreClient } from '../services/core.js';

interface TtsProps {
    coreClient: CoreClient;
    selectedText: string | null;
}

export default function TtsPanel({ coreClient, selectedText }: TtsProps) {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 无选中文本时提示
    if (!selectedText) {
        return (
            <div style={{ padding: '16px', color: '#999' }}>
                <p>请先在阅读器中选中要朗读的文字</p>
            </div>
        );
    }

    // 合成语音（经 /api/core → CoreService.synthesize → espeak-ng）
    const handleSynthesize = async () => {
        setLoading(true);
        try {
            const result = await coreClient.synthesize(selectedText, {});
            const path = result.audioPath as string;

            // espeak-ng 输出 WAV 文件，通过 Vite dev server 静态服务
            const url = `/tts-audio/${encodeURIComponent(path.split('/').pop() ?? 'output.wav')}`;
            setAudioUrl(url);

            // 创建 audio 元素并播放
            if (audioRef.current) {
                audioRef.current.src = url;
                await audioRef.current.play();
            } else {
                const audio = new Audio(url);
                audioRef.current = audio;
                await audio.play();
            }
        } catch (e) {
            console.error('TTS 合成失败:', e);
            alert(`TTS 合成失败: ${e instanceof Error ? e.message : String(e)}\n\n提示：需要安装 espeak-ng（sudo apt install espeak-ng）`);
        } finally {
            setLoading(false);
        }
    };

    const handleStop = () => {
        audioRef.current?.pause();
    };

    return (
        <div style={{ padding: '12px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '14px' }}>朗读</h3>

            {/* 选中文本预览（截断显示） */}
            <div style={{ padding: '6px 8px', background: '#f0fff0', borderRadius: '4px', fontSize: '13px', marginBottom: '8px' }}>
                {selectedText.length > 80 ? `${selectedText.slice(0, 80)}…` : selectedText}
            </div>

            {/* 操作按钮 */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSynthesize} disabled={loading} style={{ padding: '6px 12px' }}>
                    {loading ? '合成中…' : '朗读'}
                </button>
                {audioUrl && <button onClick={handleStop} style={{ padding: '6px 12px' }}>停止</button>}
            </div>

            {/* 播放器 */}
            {audioUrl && (
                <audio ref={audioRef} controls style={{ width: '100%', marginTop: '8px', height: '40px' }}>
                    <source src={audioUrl} type="audio/wav" />
                </audio>
            )}

            <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
                依赖：espeak-ng（本地 TTS 引擎）
            </p>
        </div>
    );
}
