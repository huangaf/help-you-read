import type { Chunk } from '../db/types.js';

export interface ChunkerOptions {
    readonly maxTokens: number;
    readonly overlap: number;
}

export interface ChunkResult {
    readonly content: string;
    readonly tokenCount: number;
}

export class TextChunker {
    #maxTokens: number;
    #overlap: number;

    constructor(options: ChunkerOptions) {
        this.#maxTokens = options.maxTokens;
        this.#overlap = options.overlap;
    }

    chunk(text: string): ChunkResult[] {
        if (!text) return [];

        const sentences = this.#splitSentences(text);
        if (sentences.length === 0) return [];

        const results: ChunkResult[] = [];
        let current: string[] = [];
        let currentTokens = 0;

        for (const sentence of sentences) {
            const sentenceTokens = this.#countTokens(sentence);

            // 单句超长：字符级切分
            if (sentenceTokens > this.#maxTokens) {
                const subChunks = this.#splitByChars(sentence, this.#maxTokens);
                for (const sc of subChunks) {
                    results.push({ content: sc.content, tokenCount: sc.tokenCount });
                }
                current = [];
                currentTokens = 0;
                continue;
            }

            if (currentTokens + sentenceTokens > this.#maxTokens && current.length > 0) {
                results.push({ content: current.join(''), tokenCount: currentTokens });

                const overlapText = this.#extractOverlap(current, this.#overlap);
                current = overlapText ? [overlapText] : [];
                currentTokens = this.#countTokens(current.join(''));
            }

            current.push(sentence);
            currentTokens += sentenceTokens;
        }

        if (current.length > 0) {
            results.push({ content: current.join(''), tokenCount: currentTokens });
        }

        return results;
    }

    #splitByChars(text: string, maxTokens: number): ChunkResult[] {
        const results: ChunkResult[] = [];
        let i = 0;
        while (i < text.length) {
            const end = Math.min(i + maxTokens, text.length);
            results.push({ content: text.slice(i, end), tokenCount: end - i });
            if (end === text.length) break;
            i = end - this.#overlap; // overlap：回退
            if (i <= 0) { i = end; }
        }
        return results;
    }

    #splitSentences(text: string): string[] {
        // CJK + Latin 句子边界
        const parts = text.split(/([。！？.!?…]+[\s]*)/);
        const sentences: string[] = [];
        for (const part of parts) {
            if (!part.trim()) continue;
            // 如果 part 是纯标点，附加到前一句
            if (/^[。！？.!?…]+$/.test(part.trim()) && sentences.length > 0) {
                sentences[sentences.length - 1] += part;
            } else {
                sentences.push(part);
            }
        }
        return sentences;
    }

    #countTokens(text: string): number {
        // 近似：非空白字符数 = token 数（v1 简化，embedding 模型会精确计数）
        let tokens = 0;
        for (const char of text) {
            if (!/\s/.test(char)) tokens++;
        }
        return tokens;
    }

    #extractOverlap(sentences: string[], overlapTokens: number): string | null {
        if (overlapTokens <= 0) return null;

        // 从尾部累积句子直到达到 overlap tokens
        let accumulated = '';
        let count = 0;
        for (let i = sentences.length - 1; i >= 0 && count < overlapTokens; i--) {
            const sentence = sentences[i]!;
            accumulated = sentence + accumulated;
            count += this.#countTokens(sentence);
        }

        return accumulated || null;
    }
}
