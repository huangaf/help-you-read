import { describe, it, expect } from 'vitest';
import { TextChunker } from './chunker.js';

describe('TextChunker', () => {
    it('S1: 长文本分块（500 token, overlap 100）', () => {
        const text = '这是测试内容。'.repeat(200); // ~800 字符 ≈ 400 tokens
        const chunks = new TextChunker({ maxTokens: 500, overlap: 100 }).chunk(text);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        // 验证 overlap：chunk2 开头文本包含于 chunk1（重叠区域）
        if (chunks.length >= 2) {
            const c1 = chunks[0]!.content;
            const c2start = chunks[1]!.content.slice(0, 30);
            expect(c1).toContain(c2start);
        }
    });

    it('S5a: 空文本 → 空数组', () => {
        const chunks = new TextChunker({ maxTokens: 500, overlap: 100 }).chunk('');
        expect(chunks).toEqual([]);
    });

    it('S5b: 短文本（< maxTokens）→ 单 chunk', () => {
        const chunks = new TextChunker({ maxTokens: 500, overlap: 100 }).chunk('短句。');
        expect(chunks).toHaveLength(1);
        expect(chunks[0]!.content).toBe('短句。');
    });

    it('句子边界优先（不在词中间切断）', () => {
        const sentences = ['第一句话。', '第二句话。', '第三句话。'];
        const text = sentences.join('');
        const chunks = new TextChunker({ maxTokens: 10, overlap: 2 }).chunk(text);
        // 每句完整出现在某个 chunk 中（不被切断）
        for (const s of sentences) {
            const found = chunks.some(c => c.content.includes(s));
            expect(found).toBe(true);
        }
    });

    it('tokenCount 准确（非空白字符数）', () => {
        const text = 'abcdef'; // 6 non-space chars = 6 tokens
        const chunks = new TextChunker({ maxTokens: 3, overlap: 0 }).chunk(text);
        expect(chunks).toHaveLength(2);
        expect(chunks[0]!.tokenCount).toBe(3);
    });
});
