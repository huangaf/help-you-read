// @hyr/engine — facade types.test.ts（RED → GREEN）
// 测试目标：六方法存在性、未 loadBook 时抛 EngineNotReadyError（code='EngineNotReady'）、EpubSource schema 校验
// 环境：jsdom（vitest.config.ts 默认，无 docblock）

import { describe, it, expect } from 'vitest';

// 最小契约类型（RED 阶段模块未实现，用 unknown/接口描述预期形状，避免 any）
type SchemaLike = { parse(input: unknown): unknown };

// Engine 类契约（T5 骨架）：构造后实例暴露六方法，均存在且可调用。
// T5 阶段所有方法为占位（未 loadBook 成功前抛 EngineNotReadyError），返回类型不固定；
// 具体返回类型断言留给 T6-T10 各方法专属测试。故此处统一 (...args: unknown[]) => unknown，
// 既满足"禁 any"（用 unknown 而非 any），又与占位实现兼容。
type EngineClass = new () => {
	loadBook: (...args: unknown[]) => unknown;
	currentCfi: (...args: unknown[]) => unknown;
	goToCfi: (...args: unknown[]) => unknown;
	transform: (...args: unknown[]) => unknown;
	render: (...args: unknown[]) => unknown;
	textWalker: (...args: unknown[]) => Generator<unknown>;
};

// ---------- EpubSource schema 校验（需先实现 types.ts） ----------
describe('EpubSource schema', () => {
	let schema: SchemaLike;

	beforeAll(async () => {
		const mod = await import('./types.js');
		schema = (mod as { epubSourceSchema: SchemaLike }).epubSourceSchema;
	});

	it('path 必填（data 为空）→ pass', () => {
		expect(() => schema.parse({ path: '/tmp/book.epub' })).not.toThrow();
	});

	it('data 必填（path 为空）→ pass', () => {
		expect(() => schema.parse({ data: new Blob(['x']) })).not.toThrow();
	});

	it('path/data 全空 → reject', () => {
		expect(() => schema.parse({})).toThrow();
	});

	it('path/data 双填 → reject（二选一）', () => {
		expect(() => schema.parse({ path: '/tmp/book.epub', data: new Blob(['x']) })).toThrow();
	});
});

// ---------- Engine 六方法存在性（需先实现 Engine.ts） ----------
describe('Engine class', () => {
	let Engine: EngineClass;

	beforeAll(async () => {
		const mod = await import('./Engine.js');
		Engine = (mod as { Engine: EngineClass }).Engine;
	});

	it('构造成功', () => {
		const engine = new Engine();
		expect(engine).toBeInstanceOf(Engine);
	});

	it('六方法存在且为函数', () => {
		const engine = new Engine();
		expect(typeof engine.loadBook).toBe('function');
		expect(typeof engine.currentCfi).toBe('function');
		expect(typeof engine.goToCfi).toBe('function');
		expect(typeof engine.transform).toBe('function');
		expect(typeof engine.render).toBe('function');
		expect(typeof engine.textWalker).toBe('function');
	});

	it('未 loadBook 时调用 currentCfi → null（不抛错，T7）', async () => {
		const engine = new Engine();
		const result = await engine.currentCfi();
		expect(result).toBeNull();
	});

	it('未 loadBook 时调用 goToCfi → EngineNotReadyError（code=EngineNotReady）', async () => {
		const engine = new Engine();
		await expect(engine.goToCfi('epubcfi(...)' as string)).rejects.toMatchObject({ code: 'EngineNotReady' });
	});

	it('未 loadBook 时调用 transform → EngineNotReadyError（code=EngineNotReady）', async () => {
		const engine = new Engine();
		await expect(engine.transform({})).rejects.toMatchObject({ code: 'EngineNotReady' });
	});

	it('未 loadBook 时调用 render → EngineNotReadyError（code=EngineNotReady）', async () => {
		const engine = new Engine();
		await expect(engine.render({})).rejects.toMatchObject({ code: 'EngineNotReady' });
	});

	it('textWalker 为纯 DOM 操作，不依赖 loadBook', async () => {
		const engine = new Engine();
		const doc = document.implementation.createHTMLDocument('test');
		const p = doc.createElement('p');
		p.textContent = 'hello';
		doc.body.appendChild(p);

		function* matcher(strs: string[], makeRange: (si: number, so: number, ei: number, eo: number) => Range) {
			for (let i = 0; i < strs.length; i++) {
				const idx = strs[i]!.indexOf('hello');
				if (idx >= 0) yield makeRange(i, idx, i, idx + 'hello'.length);
			}
		}

		const results: Range[] = [];
		for (const match of engine.textWalker(doc, matcher)) {
			results.push(match as Range);
		}
		expect(results.length).toBe(1);
	});

	it('loadBook 存在且可调用', async () => {
		const engine = new Engine();
		expect(typeof engine.loadBook).toBe('function');
	});
});
