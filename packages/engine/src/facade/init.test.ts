// @vitest-environment browser
// @hyr/engine — facade init.test.ts（TDD：loadBook 后 init 使渲染器产出内容）
// 环境：browser（init 依赖真实渲染管线）

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';

async function loadEpubFile(filename: string): Promise<File> {
    const buf = await fetch(`/books/${filename}`).then(r => r.blob());
    return new File([buf], filename, { type: 'application/epub+zip' });
}

describe('init', () => {
    it('未 loadBook 时调用 init → EngineNotReadyError', async () => {
        const engine = new Engine();
        await expect(engine.init()).rejects.toMatchObject({ code: 'EngineNotReady' });
    });

    it('loadBook → init → render 返回非空 pageText', async () => {
        const engine = new Engine();
        const file = await loadEpubFile('fixture-nav-hidden.epub');
        await engine.loadBook({ type: 'data', data: file });
        await engine.init();

        const start = Date.now();
        let pageText = '';
        while (Date.now() - start < 10000) {
            const page = await engine.render().catch(() => null);
            if (page && page.pageText.length > 0) {
                pageText = page.pageText;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        expect(pageText.length).toBeGreaterThan(0);
    });
});
