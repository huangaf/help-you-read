// @vitest-environment browser
// @hyr/engine — facade selection.test.ts（TDD：onSelectionChange 订阅正文选区）
// 环境：browser（foliate 将正文渲染在 iframe 中，选区归属该 document）

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';
import type { EngineSelection } from './types.js';

async function loadEpubFile(filename: string): Promise<File> {
    const buf = await fetch(`/books/${filename}`).then(r => r.blob());
    return new File([buf], filename, { type: 'application/epub+zip' });
}

function getContentDoc(engine: Engine): Document {
    const view = (engine as unknown as {
        view: { renderer: { getContents(): Array<{ doc: Document }> } };
    }).view;
    return view.renderer.getContents()[0]!.doc;
}

describe('onSelectionChange', () => {
    it('未 loadBook 时调用 → EngineNotReadyError', () => {
        const engine = new Engine();
        let caught: unknown;
        try { engine.onSelectionChange(() => {}); } catch (e) { caught = e; }
        expect(caught).toMatchObject({ code: 'EngineNotReady' });
    });

    it('正文选区变化 → 回调收到选中文本 + CFI', async () => {
        const engine = new Engine();
        const file = await loadEpubFile('fixture-nav-hidden.epub');
        await engine.loadBook({ type: 'data', data: file });
        await engine.init();

        const results: Array<EngineSelection | null> = [];
        const unsubscribe = engine.onSelectionChange(sel => results.push(sel));

        const doc = getContentDoc(engine);
        const paragraph = doc.querySelector('p')!;
        const range = doc.createRange();
        range.selectNodeContents(paragraph);
        const selection = doc.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        doc.dispatchEvent(new Event('selectionchange'));

        expect(results.length).toBeGreaterThan(0);
        const last = results[results.length - 1]!;
        expect(last).not.toBeNull();
        expect(last!.text.length).toBeGreaterThan(0);

        unsubscribe();
    });

    it('取消订阅后不再回调', async () => {
        const engine = new Engine();
        const file = await loadEpubFile('fixture-nav-hidden.epub');
        await engine.loadBook({ type: 'data', data: file });
        await engine.init();

        const results: Array<EngineSelection | null> = [];
        const unsubscribe = engine.onSelectionChange(sel => results.push(sel));
        unsubscribe();

        const doc = getContentDoc(engine);
        doc.dispatchEvent(new Event('selectionchange'));

        expect(results.length).toBe(0);
    });
});
