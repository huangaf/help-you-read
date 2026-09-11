// SkillManifest 校验层（Phase 4）
// parse-don't-validate：外部数据用 zod schema 校验，不逐字段手写 if

import { z } from 'zod';
import type { SkillManifest, SkillKind, AccessLevel } from './types.js';

/** 类型化错误：manifest 校验失败时抛出 */
export class SkillManifestError extends Error {
    readonly code: string;
    readonly issues: ReadonlyArray<{ path: string; message: string }>;

    constructor(code: string, issues: ReadonlyArray<{ path: string; message: string }>, baseMessage?: string) {
        super(baseMessage ?? `SkillManifest 校验失败 [${code}]: ${issues.map(i => i.message).join('; ')}`);
        this.code = code;
        this.issues = issues;
    }
}

// ============ Zod Schema ============

const skillKindSchema = z.enum(['prompt', 'agent', 'script']);
const accessLevelSchema = z.enum(['none', 'read', 'write', 'full']);
const sourceSchema = z.enum(['builtin', 'user']);

/** prompt 配置：inline（内联模板）或 path（外部文件路径），至少一个 */
const promptConfigSchema = z.object({
    inline: z.string().optional(),
    path: z.string().optional(),
}).refine(
    (v) => v.inline !== undefined || v.path !== undefined,
    { message: 'prompt 配置需包含 inline 或 path（至少一个）' }
);

/** script 配置 */
const scriptConfigSchema = z.object({
    enabled: z.boolean(),
    runtime: z.enum(['node', 'quickjs']),
    entry: z.string().optional(),
});

/** 完整 SkillManifest schema */
const skillManifestSchema = z.object({
    schemaVersion: z.number().int().min(1),
    id: z.string().min(1).max(128),
    kind: skillKindSchema,
    source: sourceSchema,
    name: z.string().min(1).max(256),
    description: z.string(),
    access: accessLevelSchema,
    tools: z.array(z.string()),
    // prompt 配置（kind=prompt 时由 refine 强制）
    prompt: promptConfigSchema.optional(),
    // script 配置（kind=script 时由 refine 强制）
    script: scriptConfigSchema.optional(),
});

/**
 * 条件 refine：kind=prompt 必须有 prompt；kind=script 必须有 script
 */
const validatedManifestSchema = skillManifestSchema.superRefine((val, ctx) => {
    if (val.kind === 'prompt' && !val.prompt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'kind=prompt 需包含 prompt 配置', path: ['prompt'] });
    }
    if (val.kind === 'script' && !val.script) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'kind=script 需包含 script 配置', path: ['script'] });
    }
});

// ============ 解析函数 ============

/**
 * 解析并校验 SkillManifest。
 * 接受：已解析对象 | JSON string（DB manifestJson 字段）| 非法输入
 * 成功 → 返回 SkillManifest；失败 → 抛出 SkillManifestError（带 code + issues）
 */
export function parseSkillManifest(raw: unknown): SkillManifest {
    // 如果是 JSON string（DB 存储），先解析为对象
    let input: unknown = raw;
    if (typeof raw === 'string') {
        try {
            input = JSON.parse(raw);
        } catch (e) {
            throw new SkillManifestError('SKILL_MANIFEST_PARSE', [
                { path: '$', message: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}` },
            ]);
        }
    }

    // 必须是非数组对象
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new SkillManifestError('SKILL_MANIFEST_INVALID', [
            { path: '$', message: `输入必须是非数组对象，收到 ${typeof input}` },
        ]);
    }

    // zod 校验
    const result = validatedManifestSchema.safeParse(input);
    if (!result.success) {
        const issues = result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
        }));
        throw new SkillManifestError('SKILL_MANIFEST_VALIDATION', issues);
    }

    // 转换为 SkillManifest（branded type）
    const data = result.data;
    return {
        schemaVersion: data.schemaVersion,
        id: data.id,
        kind: data.kind as SkillKind,
        source: data.source,
        name: data.name,
        description: data.description,
        access: data.access as AccessLevel,
        tools: data.tools,
        ...(data.prompt !== undefined && { prompt: { ...data.prompt } }),
        ...(data.script !== undefined && { script: { ...data.script } }),
    };
}
