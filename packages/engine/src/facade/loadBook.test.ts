// @vitest-environment browser

// @hyr/engine — facade loadBook.test.ts（T6 TDD：RED → GREEN）
// 测试目标：Engine.loadBook(source) → BookHandle（metadata + sections）

// foliate-js View 类在 jsdom 中无法正确初始化（isConnected 始终为 false），
// 故使用 browser 环境（Playwright headless Chromium）运行本测试。

import { Engine } from './Engine.js';
import type { EpubSource } from './types.js';
import { EpubLoadError } from './errors.js';

// ---------- RED 1：loadBook 不存在 → TypeError（占位行为验证） ----------
describe('loadBook (RED)', () => {
    it('loadBook 返回非 BookHandle 时 → fail', async () => {
        // loadBook 是设置 _ready 的方法，不应检查自身；
        // 传无效 path → fetch 失败 → EpubLoadError（非 EngineNotReady）
        const engine = new Engine();

        // 故意传缺少 type 字段的对象（as unknown as 绕过 TS 检查，zod runtime reject）
        await expect(engine.loadBook({ path: '/tmp/x.epub' } as unknown as EpubSource)).rejects.toThrow();
    });
});

// ---------- GREEN：loadBook 真实实现测试（data 分支，browser mode） ----------
describe('loadBook (GREEN)', () => {
    // 从 Vite public/books/ 加载 EPUB → File（浏览器 fetch）
    async function loadEpubFile(name: string): Promise<File> {
        const res = await fetch(`/books/${name}`);
        if (!res.ok) throw new Error(`Failed to fetch /books/${name}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        return new File([buf], name, { type: 'application/epub+zip' });
    }

    it('loadBook(EPUB data) → BookHandle.metadata.title 含「重排测试书」', async () => {
        const file = await loadEpubFile('fixture-reflow.epub');
        const engine = new Engine();
        const handle = await engine.loadBook({ type: 'data', data: file });

        expect(handle).toBeDefined();
        expect(typeof handle.metadata.title).toBe('string');
        expect(handle.metadata.title).toContain('重排测试书');
    });

    it('loadBook(EPUB data) → sections.length > 0', async () => {
        const file = await loadEpubFile('fixture-reflow.epub');
        const engine = new Engine();
        const handle = await engine.loadBook({ type: 'data', data: file });

        expect(handle.sections.length).toBeGreaterThan(0);
    });

    it('loadBook(非 EPUB 路径) → EpubLoadError(code=EpubLoadFailed)', async () => {
        const engine = new Engine();

        await expect(engine.loadBook({ type: 'path', path: '/dev/null' }))
            .rejects.toThrow(EpubLoadError);
    });

    it('loadBook(不存在路径) → EpubLoadError(code=EpubLoadFailed)', async () => {
        const engine = new Engine();

        await expect(
            engine.loadBook({ type: 'path', path: '/nonexistent/book.epub' })
        ).rejects.toThrow(EpubLoadError);
    });

    it('EpubSource path/data 双填 → reject', async () => {
        const engine = new Engine();

        await expect(
            // zod refine 在运行时 reject（path+data 同时存在）
            engine.loadBook({ type: 'path', path: '/tmp/x.epub', data: new Blob(['x']) } as unknown as EpubSource)
        ).rejects.toThrow();
    });

    it('EpubSource path/data 全空 → reject', async () => {
        const engine = new Engine();

        // zod refine 在运行时 reject（path+data 同时缺失）
        await expect(
            engine.loadBook({ type: 'path' as const } as unknown as EpubSource)
        ).rejects.toThrow();
    });
});
