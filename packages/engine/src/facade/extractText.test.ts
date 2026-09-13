// @vitest-environment browser
// @hyr/engine — facade extractText.test.ts（TDD：全文提取，供 RAG 索引）

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';

async function loadEpubFile(filename: string): Promise<File> {
    const buf = await fetch(`/books/${filename}`).then(r => r.blob());
    return new File([buf], filename, { type: 'application/epub+zip' });
}

describe('extractText', () => {
    it('未 loadBook 时调用 → EngineNotReadyError', async () => {
        const engine = new Engine();
        let caught: unknown;
        try { await engine.extractText(); } catch (e) { caught = e; }
        expect(caught).toMatchObject({ code: 'EngineNotReady' });
    });

    it('loadBook → extractText 返回全书文本（含多章节）', async () => {
        const engine = new Engine();
        const file = await loadEpubFile('fixture-nav-hidden.epub');
        await engine.loadBook({ type: 'data', data: file });

        const text = await engine.extractText();
        expect(text).toContain('第一章');
        expect(text).toContain('第二章');
        expect(text.length).toBeGreaterThan(20);
    });
});
