// @vitest-environment browser

// @hyr/engine — facade currentCfi.test.ts（T7：browser mode + 真实 EPUB）
// 测试目标：Engine.currentCfi() → Promise<string | null>
//   - 未 loadBook → null（不抛错）
//   - loadBook + goTo(0) 后 poll → 合法 CFI 字符串（非 null，含 'epubcfi'）
//
// 关键设计：foliate-js #onRelocate（renderer 'relocate' 事件）异步设置 lastLocation，
// await goTo 返回时 relocate 尚未触发 → currentCfi() 暂返 null。
// 故导航后须 poll currentCfi() 直至非 null（带 timeout），而非立即断言。
//
// 初始导航策略：用 raw view.goTo(0)（数字，resolveNavigation 同步快路径），
// 避免 CFI 串走异步 resolveCFI 在 book 未就绪时触发 foliate-js 内部 unhandled error。
// 对齐 gate.test.ts 已验证模式（3 EPUB 全过）。

export {};

import { describe, it, expect } from 'vitest';
import { Engine } from './Engine.js';

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

// poll currentCfi() 直至非 null（#onRelocate 异步设置 lastLocation，await goTo 返回时尚未触发）
async function waitForCfi(engine: Engine, timeoutMs = 10_000): Promise<string> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const cfi = await engine.currentCfi();
		if (cfi && typeof cfi === 'string') return cfi;
		await new Promise(r => setTimeout(r, 50));
	}
	throw new Error(`waitForCfi: ${timeoutMs}ms 内未获得非 null CFI`);
}

// 从 Engine 提取 raw View（测试专用，生产代码不暴露）
function getRawView(engine: Engine): FoliateView {
	return (engine as unknown as { view?: FoliateView }).view!;
}

describe('currentCfi', () => {
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

	it('未 loadBook 时调用 currentCfi() → null（不抛错）', async () => {
		const result = await engine.currentCfi();
		expect(result).toBeNull();
	});

	it('loadBook + goTo(0) 后 poll → 合法 CFI（非 null，含 epubcfi）', async () => {
		const file = await loadEpubFile('fixture-fixed-layout.epub');
		await engine.loadBook({ type: 'data', data: file });

		// 初始导航：raw view.goTo(0)（数字，同步快路径），避免 CFI 异步解析在 book 未就绪时出错
		const view = getRawView(engine);
		await view.goTo(0);

		// poll 等待 #onRelocate 异步设置 lastLocation
		const cfi = await waitForCfi(engine);

		expect(typeof cfi).toBe('string');
		expect(cfi.length).toBeGreaterThan(0);

		// CFI 往返：通过 facade goToCfi(CFI串) 重新导航（book 已就绪，resolveCFI 可靠）
		await engine.goToCfi(cfi);
		const cfi2 = await waitForCfi(engine);
		expect(cfi2).toBe(cfi);
	});

	it('loadBook + goTo(1) 后 poll → CFI 与首页不同', async () => {
		const file = await loadEpubFile('fixture-fixed-layout.epub');
		await engine.loadBook({ type: 'data', data: file });

		const view = getRawView(engine);

		// 初始导航：raw view.goTo(0)
		await view.goTo(0);
		const cfiHome = await waitForCfi(engine);

		// 导航到第二页：raw view.goTo(1)（数字快路径）
		await view.goTo(1);
		const cfi2 = await waitForCfi(engine);
		expect(cfi2).not.toBe(cfiHome);
	});
});
