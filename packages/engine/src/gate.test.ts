// @vitest-environment browser

// @hyr/engine — EPUB 加载 + CFI 往返门控测试
// 运行环境：Playwright headless Chromium（`// @vitest-environment browser` docblock）
// 门控规则：3 EPUB 全部通过 = GO；任何一项失败 = NO-GO（不修改 vendor 源码）
// EPUB 文件复制到 Vite public/books/，运行时 fetch() 从 dev server 加载
//
// Foliate-js Native API（精确签名，从 view.js / epub.js 源码提取）：
//   View.open(book: Blob | File | string): Promise<void> — 加载 EPUB；Blob/File 需带 name+type（makeBook 格式路由解构 {name,type}），内部 → 对应解析器 init()
//   View.init(opts?: { lastLocation?, showTextStart? }): Promise<void> — 恢复上次位置或从头开始
//   View.goTo(target: number | string): Promise<{index, anchor} | undefined> — await 返回时导航/重排已完成，lastLocation 已更新
//   View.lastLocation?: {cfi, fraction?, size?, tocItem?, pageItem?, range?} — 由 #onRelocate 设置
//   View.getCFI(index: number, range: Range): string    — 生成 CFI-1.1
//   View.book.sections: Section[] = [{id, cfi, linear, size, load, unload, createDocument}] — spine 映射
//   View.book.metadata.title: string | string map       — Dublin Core 解析
//   View.book.rendition.layout: 'pre-paginated' | 'reflowable'
//   customElements.define('foliate-view', View)         — view.js 模块顶层注册
//
// CFI 往返设计：用 await goTo + 直接查 lastLocation.cfi（不依赖事件监听——once:true 监听器在
// init/goTo 派发 relocate 之后才注册会竞态错过；goTo 为 async，await 返回即导航完成、lastLocation 已设）

// export {} 使本文件成为 ES module（top-level await 必需）
export {};

// 导入 view.js 触发 `customElements.define('foliate-view', View)`
if (!customElements.get('foliate-view')) {
	await import('./foliate/view.js');
}

// 门控 fixtures：3 EPUB 覆盖不同格式
const FIXTURES = [
	{
		name: '毛泽东选集一至七卷 (毛泽东) (Z-Library).epub',
		expectedTitleContains: '毛泽东',
		description: 'EPUB2/NCX（真实 NCX 目录，428 条目）',
	},
	{
		name: 'fixture-fixed-layout.epub',
		expectedTitleContains: '',
		description: 'EPUB3/NAV fixed-layout（多列 + 富 CSS）',
	},
	{
		name: 'fixture-nav-hidden.epub',
		expectedTitleContains: '',
		description: 'EPUB3/NAV hidden text（display:none）',
	},
];

// 运行时加载 EPUB → File（浏览器 fetch，Vite public/books/ 根路径）
// foliate-js makeBook/isCBZ/isEpub 从传入对象解构 {name,type} 做格式路由，
// 纯 Blob 无 name → undefined.endsWith 抛错；File（extends Blob）带 name+type，故用 File
async function loadEpubFile(name: string): Promise<File> {
	const res = await fetch(`/books/${name}`);
	if (!res.ok) throw new Error(`Failed to fetch /books/${name}: HTTP ${res.status}`);
	const buf = await res.arrayBuffer();
	return new File([buf], name, { type: 'application/epub+zip' });
}

// foliate-js View 类型：继承 HTMLElement（custom element 本身即 HTMLElement），
// 叠加 foliate-js 专有方法——使 appendChild（期望 Node）类型兼容，且 cast 无需 unknown 中转
interface FoliateView extends HTMLElement {
	open(book: Blob | File | string): Promise<void>;
	init(opts?: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
	goTo(target: number | string): Promise<{ index: number; anchor: unknown } | undefined>;
	lastLocation?: {
		cfi?: string;
		fraction?: number;
		size?: number;
		tocItem?: unknown;
		pageItem?: unknown;
		range?: Range;
	};
	getCFI(index: number, range: Range): string;
	book: {
		metadata: { title?: string | Record<string, string> };
		sections: Array<{ id: string; cfi?: string; linear?: string }>;
		toc?: Array<unknown>;
		landmarks?: Array<unknown>;
		resolveCFI(cfi: string): { index: number; anchor: unknown };
		rendition?: { layout?: string };
	};
	close(): void;
}

// 导航到目标并返回导航完成后 view.lastLocation.cfi（await goTo 保证重排完成、lastLocation 已设）
async function navigateAndCfi(view: FoliateView, target: number | string): Promise<string> {
	await view.goTo(target);
	const cfi = view.lastLocation?.cfi;
	if (!cfi) throw new Error(`goTo(${String(target)}) 后 lastLocation.cfi 未生成`);
	return cfi;
}

describe('EPUB gate test — vendored foliate-js engine', () => {
	for (const fixture of FIXTURES) {
		describe(`[${fixture.description}] ${fixture.name}`, () => {
			let view: FoliateView | null = null;

			afterEach(async () => {
				if (view) {
					// 等待 open/setStyles 调度的 rAF 回调在 #view 存活时执行完，
					// 再 close()（→ renderer.destroy() 置 #view=null），避免 rAF 读 null 抛 unhandled error
					await new Promise<void>(r => requestAnimationFrame(() => r()));
					try { view.close(); } catch { /* 视图可能未完全初始化 */ }
					view = null;
				}
			});

			it('should load EPUB via View.open() without error', async () => {
				const file = await loadEpubFile(fixture.name);

				view = document.createElement('foliate-view') as FoliateView;
				document.body.appendChild(view);

				await expect(async () => {
					await view!.open(file);
				}).not.toThrow();
			});

			it('should have valid metadata.title after load', async () => {
				const file = await loadEpubFile(fixture.name);

				view = document.createElement('foliate-view') as FoliateView;
				document.body.appendChild(view);

				await view.open(file);

				const title = view.book.metadata.title;
				expect(typeof title === 'string' || typeof title === 'object').toBe(true);

				if (fixture.expectedTitleContains) {
					const titleStr = typeof title === 'string' ? title : JSON.stringify(title);
					expect(titleStr).toContain(fixture.expectedTitleContains);
				}
			});

			it('should have non-zero sections after load', async () => {
				const file = await loadEpubFile(fixture.name);

				view = document.createElement('foliate-view') as FoliateView;
				document.body.appendChild(view);

				await view.open(file);

				const sections = view.book.sections;
				expect(Array.isArray(sections)).toBe(true);
				expect(sections.length).toBeGreaterThan(0);
			});

			it('should round-trip CFI navigation', async () => {
				const file = await loadEpubFile(fixture.name);

				view = document.createElement('foliate-view') as FoliateView;
				document.body.appendChild(view);

				await view.open(file);

				// 导航到首页（goTo(0)），await 保证渲染/重排完成、lastLocation.cfi 已生成
				const initialCfi = await navigateAndCfi(view, 0);
				expect(typeof initialCfi).toBe('string');
				expect(initialCfi.length).toBeGreaterThan(0);

				// 通过 CFI 字符串重新导航，验证往返一致性（goTo(cfi) → resolveCFI → 同位置）
				const returnedCfi = await navigateAndCfi(view, initialCfi);
				expect(returnedCfi).toBe(initialCfi);
			});
		});
	}
});
