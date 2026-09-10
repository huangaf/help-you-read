// @hyr/engine — facade types.ts（类型定义 + EpubSource zod schema 校验）
// 遵循 parse-don't-validate：外部数据通过 zod schema 解析为 branded type

import * as z from 'zod';

// ---------------------------------------------------------------------------
// 支撑类型：FoliateBook / FoliateSection（映射 foliate-js 原生接口）
// ---------------------------------------------------------------------------

/**
 * 模拟 foliate-js 的 Section 接口（窄化视图，仅暴露 facade 需要的成员）。
 * 实际类型来自 vendored foliate-js，此处仅作 TS 声明用。
 */
export interface FoliateSection {
    readonly index: number;
    readonly cfi?: string;
    readonly pageSpread?: 'left' | 'right' | 'center';
    load?(): Promise<{ src: string }>;
}

/**
 * 模拟 foliate-js 的 Book 接口（窄化视图）。
 * metadata 遵循 Dublin Core 常见字段。
 */
export interface FoliateBook {
    readonly sections: readonly FoliateSection[];
    readonly metadata: {
        readonly title?: string;
        readonly creator?: string;
        readonly language?: string;
        readonly publisher?: string;
        readonly identifier?: string;
    };
    readonly dir?: 'ltr' | 'rtl';
}

// ---------------------------------------------------------------------------
// EpubSource：EPUB 输入源（path 或 data，二选一必填）
// ---------------------------------------------------------------------------

/** EPUB 输入源类型标识 */
export type EpubSourceType = 'path' | 'data';

/**
 * EPUB 输入源：文件路径或二进制数据，二选一。
 * - path: 文件系统上的 EPUB 文件路径（字符串）
 * - data: Blob / ArrayBuffer 形式的 EPUB 二进制数据
 */
export interface EpubSource {
    readonly type: EpubSourceType;
    readonly path?: string;
    readonly data?: Blob;
}

/** zod schema：校验 EpubSource 输入（path/data 二选一，全空/双填均 reject） */
export const epubSourceSchema = z.object({
    path: z.string().optional(),
    data: z.instanceof(Blob).optional(),
}).refine(
    (data) => {
        const hasPath = data.path !== undefined && data.path !== null;
        const hasData = data.data !== undefined && data.data !== null;
        // 恰好一个有值
        return (hasPath && !hasData) || (!hasPath && hasData);
    },
    { message: 'EpubSource 必须且只能指定 path 或 data 中的一个' }
);

/**
 * 校验并解析 EpubSource 输入。
 * @param input - 原始输入对象（可能为 unknown）
 * @returns 解析后的 EpubSource
 * @throws {Error} schema 校验失败时抛出 Zod 错误
 */
export function validateEpubSource(input: unknown): EpubSource {
    const parsed = epubSourceSchema.parse(input);

    // 构造带 type 字段的完整 EpubSource
    if (parsed.path !== undefined && parsed.path !== null) {
        return { type: 'path', path: parsed.path };
    }

    // 必须有 data（refine 保证）
    return { type: 'data', data: parsed.data as Blob };
}

// ---------------------------------------------------------------------------
// BookHandle：已加载书籍的句柄（由 facade 构造，持有 book 引用）
// ---------------------------------------------------------------------------

/**
 * 已加载书籍的句柄。
 * 由 Engine.loadBook() 返回，持有对 foliate-js Book 的引用。
 * consumer 通过此句柄执行导航、渲染等操作。
 */
export interface BookHandle {
    /** 书籍元数据（Dublin Core） */
    readonly metadata: {
        readonly title?: string;
        readonly creator?: string;
        readonly language?: string;
        readonly publisher?: string;
        readonly identifier?: string;
    };
    /** 章节列表 */
    readonly sections: readonly FoliateSection[];
}

// ---------------------------------------------------------------------------
// RenderOpts：渲染选项
// ---------------------------------------------------------------------------

/** 页面布局模式 */
export type LayoutMode = 'reflow' | 'fixed';

/** 渲染选项（T5 占位阶段结构预留，具体实现留给 T9） */
export interface RenderOpts {
    /** 页面布局模式（reflow / fixed） */
    readonly layout?: LayoutMode;
    /** 字体大小（reflow 模式，pt） */
    readonly fontSize?: number;
    /** 行高倍率（reflow 模式） */
    readonly lineHeight?: number;
    /** 背景颜色 */
    readonly backgroundColor?: string;
    /** 文字颜色 */
    readonly textColor?: string;
}

// ---------------------------------------------------------------------------
// RenderedPage：渲染后的页面数据
// ---------------------------------------------------------------------------

/** 渲染后的单页数据（T10 GREEN） */
export interface RenderedPage {
    /** 页面索引（从 0 开始） */
    readonly index: number;
    /** 页面纯文本内容（doc.body.textContent） */
    readonly pageText: string;
    /** 当前阅读位置 CFI（未导航时为 null） */
    readonly cfi: string | null;
    /** 页面渲染尺寸（px） */
    readonly dimensions: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// TextItem：文本提取单元（textWalker 输出）
// ---------------------------------------------------------------------------

/**
 * textWalker 提取的文本单元。
 * 对应 foliate-js text-walker.js 的输出结构。
 */
export interface TextItem {
    /** DOM 节点类型（'text' | 'element'） */
    readonly type: 'text' | 'element';
    /** 文本内容（type='text' 时） */
    readonly text?: string;
    /** CSS 标签名（type='element' 时） */
    readonly tag?: string;
}

// ---------------------------------------------------------------------------
// textWalker 支撑类型（T11）
// ---------------------------------------------------------------------------

/** makeRange：由 textWalker 内部构造，供 func 用索引/偏移创建 Range */
export type MakeRangeFunc = (
    startIndex: number,
    startOffset: number,
    endIndex: number,
    endOffset: number,
) => Range;

/**
 * TextWalkFunc：textWalker 的匹配函数。
 * 接收收集到的文本数组 + makeRange，yield 匹配结果（通常为 Range）。
 */
export type TextWalkFunc = (
    strs: string[],
    makeRange: MakeRangeFunc,
) => Generator<unknown>;

/** NodeFilter 回调（可选，自定义节点过滤） */
export type TextWalkFilter = (node: Node) => number;

// ---------------------------------------------------------------------------
// transform 回调（T9）
// ---------------------------------------------------------------------------

/**
 * TransformFn：资源加载变换函数。
 * 在 EPUB 资源（CSS/图片/SVG/JS）加载时由 Engine.transform 注册，
 * foliate-js Loader 派发 'data' 事件后调用此函数改写 detail.data。
 * 作用域仅限资源加载，不触碰渲染后正文 DOM（v1 scope OUT）。
 */
export type TransformFn = (
    data: unknown,
    type: string,
    name: string,
) => Promise<unknown> | unknown;
