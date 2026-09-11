// 技能系统共享类型（Phase 4）
// 承自 docs/技术方案.md §3.3，精化后供 manifest/catalog/runtime 消费

/** 技能执行路径：prompt（单次 AI 调用）/ agent（多轮工具循环）/ script（Node vm 执行） */
export type SkillKind = 'prompt' | 'agent' | 'script';

/** 访问分级：none（无权限）< read（只读）< write（读写）< full（完全访问） */
export type AccessLevel = 'none' | 'read' | 'write' | 'full';

/** 技能清单 — 描述一个技能的元数据与执行配置 */
export interface SkillManifest {
    readonly schemaVersion: number;
    readonly id: string;
    readonly kind: SkillKind;
    readonly source: 'builtin' | 'user';
    readonly name: string;
    readonly description: string;
    readonly access: AccessLevel;
    /** Capability Catalog 白名单（工具名列表） */
    readonly tools: string[];
    /** prompt 路径配置（kind='prompt' 时必填） */
    readonly prompt?: { inline?: string | undefined; path?: string | undefined } | undefined;
    /** script 路径配置（kind='script' 时必填） */
    readonly script?: { enabled: boolean; runtime: 'node' | 'quickjs'; entry?: string | undefined } | undefined;
}

/** Capability Catalog 中的工具定义 */
export interface CapabilityTool {
    readonly name: string;
    readonly description: string;
    /** 调用该工具所需的最低 access 等级 */
    readonly access: AccessLevel;
    /** 输入参数 schema（zod schema 或 JSON Schema） */
    readonly inputSchema: unknown;
}

/** 技能运行上下文 — 由调用方（UI/上层）提供 */
export interface SkillRunContext {
    readonly skillId: string;
    /** 关联书籍 ID（可选，按技能需求） */
    readonly bookId?: string | undefined;
    /** 用户选中的原文片段（RIA 等技能需要） */
    readonly selectedText?: string | undefined;
    /** CFI 定位（原文锚点） */
    readonly cfi?: string | undefined;
    /** 自定义参数（技能特定） */
    readonly args?: Record<string, unknown> | undefined;
}

/** 技能运行结果 */
export interface SkillResult {
    readonly ok: boolean;
    /** 成功时的输出数据（结构由技能定义） */
    readonly data?: unknown;
    /** 失败时的错误描述 */
    readonly error?: string | undefined;
}

// ============ 常量 ============

/** 合法 SkillKind 值（用于校验） */
export const SKILL_KINDS: readonly SkillKind[] = ['prompt', 'agent', 'script'];

/** 合法 AccessLevel 值（用于校验） */
export const ACCESS_LEVELS: readonly AccessLevel[] = ['none', 'read', 'write', 'full'];

/** access 等级数值映射（用于比较） */
const ACCESS_ORDER: Record<AccessLevel, number> = {
    none: 0,
    read: 1,
    write: 2,
    full: 3,
};

/**
 * 返回 access level 的数值排序（0=none, 1=read, 2=write, 3=full）
 * 非法值抛出类型化错误（code: SKILL_INVALID_ACCESS）
 */
export function accessOrder(level: AccessLevel): number {
    const order = ACCESS_ORDER[level];
    if (order === undefined) {
        throw new Error(`SKILL_INVALID_ACCESS: 非法 access level "${level}"`);
    }
    return order;
}

/**
 * 判定：持有 skillAccess 权限的主体能否调用要求 toolAccess 的工具
 * 规则：skillAccess 数值 >= toolAccess 数值 → 放行
 */
export function canAccess(skillAccess: AccessLevel, toolAccess: AccessLevel): boolean {
    return accessOrder(skillAccess) >= accessOrder(toolAccess);
}
