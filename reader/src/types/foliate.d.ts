/**
 * foliate-js 类型声明
 *
 * foliate-js (1.0.1) 是纯 JavaScript 项目，无内置 TypeScript 类型。
 * 本文件使用 declare module 语法为 ESM 副作用模块提供类型提示。
 *
 * 依据：node_modules/foliate-js/view.js、epub.js 源码分析。
 *
 * 注意：本文件是 script 文件（无顶层 import/export）——
 * ambient module 声明（declare module）只在 script 文件中生效。
 * 全局增强（HTMLElementTagNameMap / JSX）在 foliate-elements.d.ts
 * （module 文件）中声明，两者不可合并：module 文件中的
 * `declare module` 会被当作 module augmentation，无法为新模块提供类型。
 */

// ============================================================================
// foliate-js/view.js — 核心视图模块
// ============================================================================

declare module 'foliate-js/view.js' {
  /**
   * 书籍打开时的元数据（不同格式来源字段不同）
   */
  interface BookMetadata {
    title?: string;
    author?: string;
    language?: string;
    [key: string]: unknown;
  }

  /** 书籍章节 */
  interface BookSection {
    id?: string;
    cfi?: string;
    linear?: string;
    mediaOverlay?: string;
    createDocument?(): Promise<Document>;
    resolveHref?(href: string): string;
    [key: string]: unknown;
  }

  /** 书籍目录项 */
  interface TOCItem {
    label?: string;
    href?: string;
    sections?: number[];
    children?: TOCItem[];
    [key: string]: unknown;
  }

  /** 页面列表项 */
  interface PageListItem {
    label?: string;
    href?: string;
    [key: string]: unknown;
  }

  /**
   * 书籍对象（makeBook 返回）
   * 由具体格式解析器（EPUB/MOBI/FB2 等）构造，字段因格式而异。
   */
  interface BookObject {
    metadata: BookMetadata;
    sections: BookSection[];
    toc: TOCItem[];
    pageList?: PageListItem[];
    rendition?: { layout?: string };
    dir?: string;
    landmarks?: { type?: string; href?: string }[];
    splitTOCHref?: (href: string) => [string, string?];
    getTOCFragment?: (doc: Document, id: string) => Element | null;
    resolveHref?: (href: string) => { index: number; anchor: (doc: Document) => Range | Node };
    isExternal?: (uri: string) => boolean;
    resolveCFI?: (cfi: string) => { index: number; anchor: (doc: Document) => Range | Node };
    [key: string]: unknown;
  }

  /** 位置信息（lastLocation 的类型） */
  interface LocationInfo {
    cfi?: string;
    fraction?: number;
    section?: { current: number; total: number };
    tocItem?: unknown;
    pageItem?: unknown;
    range?: Range;
    [key: string]: unknown;
  }

  /** 注释对象 */
  interface Annotation {
    value: string;
    [key: string]: unknown;
  }

  // ---------------------------------------------------------------------------
  // View 自定义元素类
  // ---------------------------------------------------------------------------

  /**
   * foliate 阅读视图，作为自定义元素 `<foliate-view>` 使用。
   *
   * 用法：
   * ```tsx
   * const viewRef = useRef<HTMLElement>(null);
   * const view = viewRef.current as View | null;
   * await view?.open(bookFile);
   * ```
   */
  class View extends HTMLElement {
    constructor();

    // ---- 生命周期 ----

    /**
     * 打开一本书籍。
     * @param book — 文件路径（字符串 URL）、Blob/File、DirectoryEntry，或已有 BookObject
     */
    open(book: string | Blob | File | object): Promise<void>;

    /** 关闭当前书籍，释放资源 */
    close(): void;

    /**
     * 初始化视图（恢复上次位置或跳到正文开头）。
     * @param opts — 配置选项
     */
    init(opts: {
      lastLocation?: string | number | object;
      showTextStart?: boolean;
    }): Promise<void>;

    // ---- 导航 ----

    /**
     * 跳转到指定位置。
     * @param target — CFI 字符串、章节索引（数字）、分数（{fraction}），或 BookObject.resolveHref 接受的格式
     * @returns 解析后的位置 { index, anchor }，失败时返回 undefined
     */
    goTo(target: string | number | object): Promise<{ index: number; anchor?: unknown } | undefined>;

    /** 跳转到文件开头 */
    goToTextStart(): void;

    /** 跳转到指定分数位置（0~1） */
    goToFraction(frac: number): Promise<void>;

    /** 选中指定位置的内容 */
    select(target: string | number): Promise<void>;

    /** 取消当前选区 */
    deselect(): void;

    /** 上一页 */
    prev(distance?: number): Promise<void>;

    /** 下一页 */
    next(distance?: number): Promise<void>;

    /** 向左翻页（考虑 RTL 方向） */
    goLeft(): void;

    /** 向右翻页（考虑 RTL 方向） */
    goRight(): void;

    // ---- 注释 ----

    /**
     * 添加注释标记（在文本上绘制高亮/轮廓）。
     * @param annotation — 包含 value（CFI 字符串）的对象
     * @param remove — 如果为 true，则移除已有注释
     * @returns 注释位置信息 { index, label }
     */
    addAnnotation(annotation: Annotation, remove?: boolean): Promise<{ index: number; label: string } | undefined>;

    /** 删除注释 */
    deleteAnnotation(annotation: Annotation): Promise<void>;

    /** 显示注释并跳转到对应位置 */
    showAnnotation(annotation: Annotation): Promise<void>;

    // ---- 搜索 ----

    /**
     * 搜索书籍内容（异步迭代器）。
     * @param opts — 搜索选项
     */
    search(opts: { query: string; index?: number }): AsyncIterableIterator<unknown>;

    /** 清除所有搜索结果和标记 */
    clearSearch(): void;

    // ---- 属性 ----

    /** 最后阅读位置 */
    lastLocation: LocationInfo | null;

    /** 导航历史 */
    history: EventTarget & {
      canGoBack: boolean;
      canGoForward: boolean;
      pushState(state: unknown): void;
      replaceState(state: unknown): void;
      back(): void;
      forward(): void;
      clear(): void;
    };

    /** 当前书籍对象 */
    book: BookObject | null;

    /** 渲染器元素（paginator 或 fxl） */
    renderer: HTMLElement;

    /** 是否为固定排版（如漫画、绘本） */
    isFixedLayout: boolean;

    /** 语言信息 */
    language: {
      canonical?: string;
      locale?: Intl.Locale;
      isCJK?: boolean;
      direction?: string;
    };

    /** 文字转语音引擎 */
    tts: unknown;

    /** 媒体叠加（有声书） */
    mediaOverlay: unknown;

    // ---- 工具方法 ----

    /** 将 CFI 转换为 { index, anchor } */
    resolveCFI(cfi: string): { index: number; anchor: (doc: Document) => Range | Node };

    /** 解析导航目标为 { index, anchor } */
    resolveNavigation(target: string | number | object): { index: number; anchor: (doc: Document) => Range | Node };

    /** 获取当前位置的 CFI 字符串 */
    getCFI(index: number, range: Range): string;

    /** 获取指定章节的进度信息 */
    getProgressOf(index: number, range: Range): { tocItem?: unknown; pageItem?: unknown };

    /** 获取位置对应的目录项 */
    getTOCItemOf(target: string | number): Promise<unknown>;

    /** 获取章节分数列表 */
    getSectionFractions(): number[];

    /** 初始化 TTS */
    initTTS(granularity?: 'sentence' | 'word'): Promise<void>;

    /** 开始媒体叠加播放 */
    startMediaOverlay(): void;
  }

  // ---------------------------------------------------------------------------
  // 错误类
  // ---------------------------------------------------------------------------

  /** HTTP 响应错误 */
  class ResponseError extends Error {
    constructor(message: string, options?: { cause?: Response });
  }

  /** 文件未找到错误 */
  class NotFoundError extends Error {
    constructor(message?: string);
  }

  /** 不支持的文件类型错误 */
  class UnsupportedTypeError extends Error {
    constructor(message?: string);
  }

  // ---------------------------------------------------------------------------
  // makeBook 工厂函数
  // ---------------------------------------------------------------------------

  /**
   * 根据文件自动检测格式并返回 BookObject。
   * 支持 EPUB、CBZ、FB2/FBZ、MOBI、TXT 等格式。
   */
  function makeBook(file: string | Blob | File | DirectoryEntry): Promise<BookObject>;

  // ---------------------------------------------------------------------------
  // 导出
  // ---------------------------------------------------------------------------

  export {
    View,
    ResponseError,
    NotFoundError,
    UnsupportedTypeError,
    makeBook,
  };
}

// ============================================================================
// foliate-js/epub.js — EPUB 解析模块
// ============================================================================

declare module 'foliate-js/epub.js' {
  /**
   * EPUB 书籍解析器。
   * 内部由 view.js 的 makeBook 通过动态 import 使用，
   * 一般不需要直接实例化。
   */
  class EPUB {
    constructor(loader: {
      loadText: (name: string) => Promise<string | null>;
      loadBlob: (name: string, type?: string) => Promise<Blob | null>;
      getSize: (name: string) => number;
      destroy?(): void;
    });

    /** 初始化并返回 BookObject */
    init(): Promise<import('foliate-js/view.js').BookObject>;

    /** 销毁加载器 */
    destroy(): void;
  }

  export { EPUB };
}

// ============================================================================
// 自定义元素全局增强
//
// 见 foliate-elements.d.ts（必须是独立的 module 文件，
// script 文件中的 declare global 会被 TypeScript 忽略）。
// ============================================================================
