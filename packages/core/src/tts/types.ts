// TTS 层共享类型（Phase 5）
// 承自 docs/技术方案.md §3.4

/** TTS 音色 */
export interface Voice {
    readonly id: string;
    readonly label: string;
    /** BCP-47 语言标签（如 zh, en, yue） */
    readonly lang?: string | undefined;
}

/** TTS 流式音频块 */
export interface AudioChunk {
    readonly data: ArrayBuffer;
    /** 编码格式 */
    readonly format: 'mp3' | 'wav' | 'ogg';
}

/** TTSEngine 可插拔抽象（本地默认 / 云可选） */
export interface TTSEngine {
    readonly id: string;
    readonly label: string;
    /** 列出可用音色 */
    voices(): Promise<Voice[]>;
    /** 流式合成（AsyncIterable，支持取消） */
    synthesize(text: string, voice?: string): AsyncIterable<AudioChunk>;
}
