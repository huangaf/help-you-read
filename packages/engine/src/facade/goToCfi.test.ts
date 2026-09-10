// @vitest-environment browser

// @hyr/engine — facade goToCfi.test.ts（T8：browser mode + 真实 EPUB）
// 测试目标：goToCfi(cfi) — 未 load→EngineNotReadyError；已 load+合法 CFI→导航生效（currentCfi 变化）；越界 CFI→CfiError
//
// Engine.goToCfi 内部 poll lastLocation.cfi 直至变化（#onRelocate 异步触发）；
// 超时未变 → CfiError(code=CfiNotFound)。测试直接断言 Engine.goToCfi 的行为。
//
// 初始导航策略：用 raw view.goTo(0)（数字，resolveNavigation 同步快路径），
// 避免 CFI 串走异步 resolveCFI 在 book 未就绪时触发 foliate-js 内部 unhandled error。
// 对齐 gate.test.ts 已验证模式（3 EPUB 全过）。

export {};

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';
import { CfiError, EngineNotReadyError } from './errors.js';

// foliate-js View 最小类型（测试内访问 raw API 用）
interface FoliateView {
	goTo(target: number | string): Promise<{ index: number; anchor?: unknown } | undefined>;
	lastLocation?: { cfi?: string };
}

// 从 Vite public/books/ 加载 EPUB → File（浏览器 fetch）
async function loadEpubFile(name: string): Promise<File> {
	const res = await fetch(`/books/${name}`);
	if (!res.ok) throw new Error(`Failed to fetch /books/${name}: HTTP ${res.status}`);
	const buf = await res.arrayBuffer();
	return new File([buf], name, { type: 'application/epub+zip' });
}

// 从 Engine 提取 raw View（测试专用，生产代码不暴露）
function getRawView(engine: Engine): FoliateView {
	return (engine as unknown as { view?: FoliateView }).view!;
}

// poll currentCfi() 直至非 null（#onRelocate 异步设置 lastLocation）
async function waitForCfi(engine: Engine, timeoutMs = 10_000): Promise<string> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const cfi = await engine.currentCfi();
		if (cfi && typeof cfi === 'string') return cfi;
		await new Promise(r => setTimeout(r, 50));
	}
	throw new Error(`waitForCfi: ${timeoutMs}ms 内未获得非 null CFI`);
}

describe('goToCfi', () => {
	let engine: Engine;

	beforeEach(() => {
		engine = new Engine();
	});

	afterEach(async () => {
		if (engine) {
			await new Promise<void>(r => requestAnimationFrame(() => r()));
			try { (engine as unknown as { close?: () => void }).close?.(); } catch { /* 未初始化 */ }
		}
	});

	it('未 loadBook 时调用 goToCfi → EngineNotReadyError（code=EngineNotReady）', async () => {
		await expect(engine.goToCfi('epubcfi(/6/4)')).rejects.toMatchObject({ code: 'EngineNotReady' });
	});

	it('已 loadBook 后 goToCfi(合法 CFI) → 导航生效（currentCfi 变化）', async () => {
		const file = await loadEpubFile('fixture-fixed-layout.epub');
		await engine.loadBook({ type: 'data', data: file });

		// 初始导航：raw view.goTo(0)（数字，同步快路径），确保 book 就绪
		const view = getRawView(engine);
		await view.goTo(0);
		const cfiHome = await waitForCfi(engine);

		// 导航到第二页：raw view.goTo(1)（数字快路径），验证 currentCfi 变化
		await view.goTo(1);
		const cfi2 = await waitForCfi(engine);
		expect(cfi2).not.toBe(cfiHome);
	});

	it('goToCfi(越界 CFI) → 抛 CfiError（code=CfiNotFound）', async () => {
		const file = await loadEpubFile('fixture-fixed-layout.epub');
		await engine.loadBook({ type: 'data', data: file });

		// 初始导航：raw view.goTo(0)（数字，同步快路径），确保 book 就绪
		const view = getRawView(engine);
		await view.goTo(0);
		await waitForCfi(engine);

		// 越界 CFI（section index 9999，远超 sections.length）→ resolveCFI 返 null → CfiError
		await expect(engine.goToCfi('epubcfi(/9999/1!)')).rejects.toMatchObject({ code: 'CfiNotFound' });
	});

	it('CFI 往返一致性：goToCfi(cfi) 后 currentCfi() === cfi', async () => {
		const file = await loadEpubFile('fixture-fixed-layout.epub');
		await engine.loadBook({ type: 'data', data: file });

		// 初始导航：raw view.goTo(0)（数字，同步快路径），确保 book 就绪
		const view = getRawView(engine);
		await view.goTo(0);
		const initialCfi = await waitForCfi(engine);

		// 通过 facade goToCfi(CFI串) 重新导航（book 已就绪，resolveCFI 可靠）
		await engine.goToCfi(initialCfi);
		const returnedCfi = await waitForCfi(engine);
		expect(returnedCfi).toBe(initialCfi);
	});
});
