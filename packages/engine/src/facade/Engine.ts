// @hyr/engine — facade Engine.ts（骨架：六方法占位，T5 不实现逻辑）
// T6-T11 在此骨架上实现各方法的具体逻辑

import { BookHandle, EpubSource, RenderOpts, RenderedPage, TextItem, validateEpubSource, TextWalkFunc, TextWalkFilter, TransformFn } from './types.js';
import { EngineNotReadyError, EpubLoadError, CfiError, TransformError, RenderError } from './errors.js';
import { textWalker as nativeTextWalker } from '../foliate/text-walker.js';

// 导入 foliate-js View 模块（顶层自执行 customElements.define('foliate-view', View)）
// consumer 无需手动注入或全局注册，import 即完成元素定义
import '../foliate/view.js';

/**
 * Engine：EPUB 阅读引擎门面类。
 * T5 阶段所有方法均为占位（抛 EngineNotReadyError），
 * T6-T11 分别实现各方法的具体逻辑。
 */
export class Engine {
    /** 是否已成功加载书籍（内部状态标志） */
    private _ready = false;

    /** foliate-js View 实例（T6 loadBook 初始化） */
    private view?: import('../foliate/view.js').View;

    /** 用户指定的容器元素（View append 目标，缺省 document.body） */
    private _element?: HTMLElement | undefined;

    /** transform 监听器引用（用于重复注册时移除旧监听） */
    private _transformListener?: (e: Event) => void;

    /** 构造引擎。element：View append 目标容器（缺省 document.body） */
    constructor(opts?: { element?: HTMLElement; styles?: string }) {
        this._element = opts?.element;
    }

    /** 判断引擎是否已就绪（loadBook 成功调用后为 true） */
    private get ready(): boolean {
        return this._ready;
    }

    /**
     * loadBook：加载 EPUB 书籍。
     * T6 实现：zod 校验 EpubSource → 构造 File（bytes+name+type）→ view.open(file)
     * → await 后从 view.book 提取 metadata/sections 构造 BookHandle。
     */
    async loadBook(source: EpubSource): Promise<BookHandle> {
        // zod 校验 EpubSource（path/data 二选一）
        validateEpubSource(source);

        let file: File;
        try {
            if (source.type === 'path') {
                // zod refine 保证 path 非空（二选一校验）
                const buf = await fetch(source.path!).then(r => r.blob());
                file = new File([buf], source.path!.split('/').pop() ?? 'book.epub', {
                    type: 'application/epub+zip',
                });
            } else {
                // Blob 无 name 属性，用类型守卫提取 File.name（如有）
                const fileLike = source.data as unknown as { name?: string };
                const name = fileLike?.name ?? 'book.epub';
                file = new File([source.data as BlobPart], name, { type: 'application/epub+zip' });
            }

            // 初始化 View（首次调用时创建，从 customElements 获取已注册的 View class）
            // foliate-js View extends HTMLElement——必须 connected（appendChild 到容器）才能完成渲染管线
            if (!this.view) {
                const ViewClass = customElements.get('foliate-view');
                if (!ViewClass) {
                    throw new Error('foliate-view custom element 未注册：请确保已导入 view.js');
                }
                this.view = new (ViewClass as unknown as new () => import('../foliate/view.js').View)();
            }

            // View 未 connected 时 append 到容器（constructor element 参数 or document.body）
            // 未 connected 的 HTMLElement 无法触发渲染管线（#onLoad/#onRelocate 不派发）
            if (!this.view.isConnected) {
                const container = this._element ?? document.body;
                container.appendChild(this.view);
            }

            // 加载 EPUB（makeBook → isZip → EPUB loader）
            await this.view.open(file);
        } catch (e) {
            throw new EpubLoadError(
                e instanceof Error ? e.message : 'EPUB 加载失败'
            );
        }

        // 从 view.book 提取 metadata + sections，构造 BookHandle
        const book = this.view.book;
        const handle: BookHandle = {
            metadata: {
                title: book.metadata?.title,
                creator: book.metadata?.creator,
                language: book.metadata?.language,
                publisher: book.metadata?.publisher,
                identifier: book.metadata?.identifier,
            },
            sections: book.sections ?? [],
        };

        this._ready = true;
        return handle;
    }

    /**
     * currentCfi：获取当前阅读位置的 CFI 字符串。
     * T7 实现：未 loadBook → null（不抛错）；已 loadBook → view.lastLocation?.cfi ?? null。
     */
    async currentCfi(): Promise<string | null> {
        // 未 loadBook（无 view）→ 直接返回 null，不抛错
        if (!this._ready) {
            return null;
        }
        // 已 loadBook → 从 foliate-js View.lastLocation 提取 cfi
        return this.view?.lastLocation?.cfi ?? null;
    }

    /**
     * goToCfi：导航到指定 CFI 位置。
     * 未 loadBook → EngineNotReadyError；已 load → view.goTo(cfi)（foliate-js 内部自动路由 CFI）。
     * 成功判据：goTo 返回值非 null/undefined +（同位置直接成功 | 不同位置 poll CFI 变化）。
     * 超时未变 → CfiError（code=CfiNotFound）。
     */
    async goToCfi(cfi: string): Promise<void> {
        if (!this._ready) {
            throw new EngineNotReadyError();
        }

        const view = this.view;
        if (!view) {
            throw new EngineNotReadyError();
        }

        // 记录导航前 CFI（用于区分 round-trip vs 静默失败）
        const before = view.lastLocation?.cfi ?? null;

        // 执行导航（foliate-js View.goTo 内部 catch 吞错，失败时 resolve undefined）
        const resolved = await this.goToInternal(view, cfi);

        // goTo 返回 null/undefined → foliate-js 内部解析/定位失败
        if (resolved == null) {
            throw new CfiError(`CFI 定位失败：${cfi}`, 'CfiNotFound');
        }

        // round-trip（导航目标 = 当前位置）→ 无需等待，直接成功
        if (cfi === before) return;

        // 不同位置 → poll 等待 #onRelocate 更新 lastLocation.cfi（异步触发）
        await this.waitForCfiChange(view, before);
    }

    /** 调用 View.goTo 并拦截 foliate-js 内部异常（如 resolveNavigation 返 null → .index 访问错误） */
    private async goToInternal(
        view: import('../foliate/view.js').View,
        target: string | number,
    ): Promise<{ index: number; anchor?: unknown } | undefined> {
        try {
            const resolved = await view.goTo(target);
            return (resolved ?? undefined) as { index: number; anchor?: unknown } | undefined;
        } catch {
            return undefined;
        }
    }

    /** poll 等待 lastLocation.cfi 从 beforeCfi 变化（#onRelocate 异步派发，goTo resolve 后尚未触发） */
    private async waitForCfiChange(
        view: import('../foliate/view.js').View,
        beforeCfi: string | null,
        timeoutMs = 5000,
    ): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const after = view.lastLocation?.cfi ?? null;
            if (after && after !== beforeCfi) return;
            await new Promise(r => setTimeout(r, 50));
        }
        throw new CfiError(`CFI 导航未生效（${timeoutMs}ms 内 lastLocation.cfi 未变化）`, 'CfiNotFound');
    }

    /**
     * transform：注册资源加载变换函数。
     * 作用域仅限 EPUB 资源（CSS/图片/SVG/JS）加载时生效，不触碰渲染后正文 DOM。
     * 重复调用替换前一次注册的监听器。
     */
    async transform(fn: TransformFn): Promise<void> {
        if (!this._ready) {
            throw new EngineNotReadyError();
        }

        const view = this.view;
        if (!view) {
            throw new EngineNotReadyError();
        }

        const target = (view as unknown as { book: { transformTarget?: EventTarget } }).book?.transformTarget;
        if (!target) {
            throw new TransformError('transformTarget 不可用（非 EPUB 格式或 Book 未初始化）');
        }

        // 移除前一次注册的监听器（重复调用时替换）
        if (this._transformListener) {
            target.removeEventListener('data', this._transformListener);
        }

        const listener = (e: Event): void => {
            const event = e as CustomEvent<{ data: unknown; type: string; name: string }>;
            const { data, type, name } = event.detail;
            // 调用用户变换函数，结果写回 detail.data（Loader 后续 await 该值）
            event.detail.data = fn(data, type, name);
        };

        target.addEventListener('data', listener);
        this._transformListener = listener;
    }

    /**
     * render：应用样式变更并返回当前页渲染状态。
     * 对 reflowable 书籍：将 RenderOpts 转为 CSS 覆盖层，调用 setStyles 注册。
     * re-layout 由 foliate-js 异步调度（fonts.ready → expand），本方法不阻塞等待。
     * 降级语义：若运行环境缺 document.fonts / ResizeObserver（如纯 jsdom），
     * 则 re-layout 无法即时触发，样式于下次导航/resize 时自然生效。
     */
    async render(opts?: RenderOpts): Promise<RenderedPage> {
        if (!this._ready) throw new EngineNotReadyError();

        const view = this.view;
        if (!view) throw new EngineNotReadyError();

        const renderer = this.getRenderer(view);

        // 应用样式变更（仅 reflowable；fixed-layout 样式随 book rendition）
        if (opts && this.hasStyleChanges(opts) && opts.layout !== 'fixed') {
            const css = this.buildCssOverride(opts);
            if (css) {
                (renderer as unknown as { setStyles(s: string): void }).setStyles(css);
            }
        }

        // 读取当前页渲染状态，构造 RenderedPage
        const contents = (renderer as unknown as { getContents(): Array<{ doc: Document; index?: number }> }).getContents();
        if (!contents.length) {
            throw new RenderError('无可用渲染内容（页面尚未加载）');
        }

        const content = contents[0]!;
        const doc = content.doc;
        const rect = doc.documentElement.getBoundingClientRect();

        return {
            index: content.index ?? 0,
            pageText: doc.body.textContent ?? '',
            cfi: (view as unknown as { lastLocation?: { cfi?: string } }).lastLocation?.cfi ?? null,
            dimensions: { width: rect.width, height: rect.height },
        };
    }

    /** 获取 View 内部的 renderer（Paginator 或 FixedLayout） */
    private getRenderer(view: import('../foliate/view.js').View): unknown {
        return (view as unknown as { renderer: unknown }).renderer;
    }

    /** 判断 RenderOpts 是否包含需应用的样式变更 */
    private hasStyleChanges(opts: RenderOpts): boolean {
        return opts.fontSize !== undefined || opts.lineHeight !== undefined
            || opts.backgroundColor !== undefined || opts.textColor !== undefined;
    }

    /** 将 RenderOpts 转为 CSS 覆盖层（body 选择器） */
    private buildCssOverride(opts: RenderOpts): string | null {
        const props: string[] = [];

        if (opts.fontSize !== undefined) {
            props.push(`font-size: ${opts.fontSize}px`);
        }
        if (opts.lineHeight !== undefined) {
            props.push(`line-height: ${opts.lineHeight}`);
        }
        if (opts.backgroundColor !== undefined) {
            props.push(`background-color: ${opts.backgroundColor}`);
        }
        if (opts.textColor !== undefined) {
            props.push(`color: ${opts.textColor}`);
        }

        if (!props.length) return null;
        return `body { ${props.join('; ')} }`;
    }

    /**
     * textWalker：对指定 Range/Document 收集文本节点，按 func 匹配，yield 结果。
     * 纯 DOM 操作（createTreeWalker / comparePoint），不依赖 loadBook。
     * jsdom / webview 均可运行（仅用标准 DOM API）。
     */
    *textWalker(
        x: Range | Document,
        func?: TextWalkFunc,
        filterFunc?: TextWalkFilter,
    ): Generator<unknown> {
        yield* nativeTextWalker(x, func, filterFunc) as Generator<unknown>;
    }
}
