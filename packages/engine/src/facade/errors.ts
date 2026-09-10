// @hyr/engine — facade errors.ts（typed errors，readonly code 字段）

/**
 * 引擎错误基类。
 * 所有 facade 层错误均继承此类，code 为不可变字符串标识符。
 */
export abstract class EngineError extends Error {
    /** 错误码（只读，用于精准 catch / 日志分类） */
    public abstract readonly code: string;

    constructor(message?: string) {
        super(message);
        this.name = 'EngineError';
    }

    /** 类型守卫：区分于普通 Error */
    public isEngineError(): this is EngineError {
        return true;
    }
}

/** EPUB 加载失败（文件损坏、非 EPUB、ZIP 解析错误等） */
export class EpubLoadError extends EngineError {
    public override readonly code = 'EpubLoadFailed' as const;

    constructor(message?: string) {
        super(message);
        this.name = 'EpubLoadError';
    }
}

/** CFI 相关错误（CFI 格式无效、定位失败等） */
export class CfiError extends EngineError {
    public override readonly code: 'CfiNotFound' | 'InvalidCfi';

    constructor(message?: string, code: 'CfiNotFound' | 'InvalidCfi' = 'CfiNotFound') {
        super(message);
        this.name = 'CfiError';
        this.code = code;
    }
}

/** 内容转换错误（transform / transformSource） */
export class TransformError extends EngineError {
    public override readonly code = 'TransformFailed' as const;

    constructor(message?: string) {
        super(message);
        this.name = 'TransformError';
    }
}

/** 渲染错误（不支持的版式、渲染管线异常等） */
export class RenderError extends EngineError {
    public override readonly code: 'RenderFailed' | 'UnsupportedLayout';

    constructor(message?: string, code: 'RenderFailed' | 'UnsupportedLayout' = 'RenderFailed') {
        super(message);
        this.name = 'RenderError';
        this.code = code;
    }
}

/** 引擎未就绪（loadBook 尚未成功调用） */
export class EngineNotReadyError extends EngineError {
    public override readonly code = 'EngineNotReady' as const;

    constructor(message?: string) {
        super(
            message ?? '引擎尚未就绪：请先调用 loadBook() 加载书籍'
        );
        this.name = 'EngineNotReadyError';
    }
}
