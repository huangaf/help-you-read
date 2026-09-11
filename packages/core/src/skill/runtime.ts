// Skill Runtime — 三路径执行引擎（Phase 4）
// prompt: 模板渲染 → AI chat
// agent:  多轮工具调用循环 + access gate
// script: Node vm 沙箱执行（v1 仅受信内置脚本）

import { Script } from 'node:vm';
import type { SkillManifest, SkillRunContext, SkillResult, AccessLevel, CapabilityTool } from './types.js';
import { canAccess } from './types.js';
import type { CapabilityCatalog } from './catalog.js';

/** chat 响应（toolCalls 可选） */
interface ChatResponse {
    content: string;
    toolCalls?: ReadonlyArray<{ readonly name: string; readonly args: unknown }>;
}

/** 最小 chat provider 接口（兼容 OpenAICompatibleProvider + Mock） */
export interface ChatProvider {
    chat(
        messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
        opts?: Record<string, unknown>
    ): Promise<ChatResponse>;
}

/** SkillRuntime 构造选项 */
export interface SkillRuntimeOptions {
    catalog: CapabilityCatalog;
    /** AI provider（prompt/agent 路径需要；script 不需要） */
    provider?: ChatProvider | undefined;
    /** agent 路径最大工具调用轮次（默认 10） */
    maxTurns?: number | undefined;
}

/**
 * 技能执行引擎：根据 manifest.kind 分派到对应路径。
 * - prompt: 渲染模板 → provider.chat() → 返回结果
 * - agent:  system + user context → 多轮 chat → toolCalls → resolve + access check → execute
 * - script: Node vm 沙箱执行受信脚本
 */
export class SkillRuntime {
    #catalog: CapabilityCatalog;
    #provider?: ChatProvider | undefined;
    #maxTurns: number;

    constructor(opts: SkillRuntimeOptions) {
        this.#catalog = opts.catalog;
        this.#provider = opts.provider;
        this.#maxTurns = opts.maxTurns ?? 10;
    }

    /** 主入口：根据 kind 分派执行路径 */
    async invoke(manifest: SkillManifest, ctx: SkillRunContext): Promise<SkillResult> {
        switch (manifest.kind) {
            case 'prompt': return this.#runPrompt(manifest, ctx);
            case 'agent':  return this.#runAgent(manifest, ctx);
            case 'script': return this.#runScript(manifest, ctx);
        }
    }

    // ============ 模板渲染 ============

    /** 替换 {{variable}} 占位符（selectedText/cfi/bookId + args keys） */
    #renderTemplate(template: string, ctx: SkillRunContext): string {
        let result = template;
        if (ctx.selectedText !== undefined) {
            result = result.split('{{selectedText}}').join(ctx.selectedText);
        }
        if (ctx.cfi !== undefined) {
            result = result.split('{{cfi}}').join(ctx.cfi);
        }
        if (ctx.bookId !== undefined) {
            result = result.split('{{bookId}}').join(ctx.bookId);
        }
        // 通用 {{key}} from args
        if (ctx.args) {
            for (const [key, value] of Object.entries(ctx.args)) {
                if (typeof value === 'string') {
                    result = result.split(`{{${key}}}`).join(value);
                }
            }
        }
        return result;
    }

    // ============ Prompt 路径 ============

    #runPrompt(manifest: SkillManifest, ctx: SkillRunContext): Promise<SkillResult> {
        if (!this.#provider) {
            return Promise.resolve({ ok: false, error: 'SKILL_NO_PROVIDER: prompt 路径需要 AI provider' });
        }
        const template = manifest.prompt?.inline;
        if (!template) {
            return Promise.resolve({ ok: false, error: 'SKILL_MANIFEST_INVALID: prompt 路径需包含 prompt.inline' });
        }

        const rendered = this.#renderTemplate(template, ctx);
        const provider = this.#provider;

        return provider.chat(
            [{ role: 'user', content: rendered }],
        ).then(response => ({ ok: true, data: response.content }))
         .catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: `SKILL_PROMPT_ERROR: ${msg}` } as SkillResult;
        });
    }

    // ============ Agent 路径（多轮工具循环）============

    async #runAgent(manifest: SkillManifest, ctx: SkillRunContext): Promise<SkillResult> {
        if (!this.#provider) {
            return { ok: false, error: 'SKILL_NO_PROVIDER: agent 路径需要 AI provider' };
        }

        // 构建初始消息：system + user context
        const messages: { role: string; content: string }[] = [
            { role: 'system', content: manifest.description },
        ];

        // 添加用户上下文
        const userContent = this.#buildUserContext(ctx);
        messages.push({ role: 'user', content: userContent });

        // 获取该技能允许的工具白名单
        const allowedTools = this.#catalog.getToolsForSkill(manifest.tools);

        for (let turn = 0; turn < this.#maxTurns; turn++) {
            let response: ChatResponse;
            try {
                response = await this.#provider.chat(messages);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: `SKILL_AGENT_ERROR: ${msg}` };
            }

            // 无 toolCalls → 返回最终结果
            if (!response.toolCalls || response.toolCalls.length === 0) {
                return { ok: true, data: response.content };
            }

            // 执行 tool calls（含 access gate）
            const toolResults: { role: string; content: string }[] = [];

            for (const toolCall of response.toolCalls) {
                const tool = this.#catalog.resolve(toolCall.name);

                // 工具未注册（或不在白名单中）
                if (!tool || !manifest.tools.includes(toolCall.name)) {
                    return { ok: false, error: `SKILL_TOOL_NOT_FOUND: 工具 "${toolCall.name}" 未注册或不在白名单` };
                }

                // access gate: skill.access >= tool.access 才放行
                if (!canAccess(manifest.access, tool.access)) {
                    return { ok: false, error: `SKILL_ACCESS_DENIED: skill access "${manifest.access}" 不允许调用工具 "${tool.name}" (requires ${tool.access})` };
                }

                // 执行工具（v1: JSON 占位；Phase 5 实现实际逻辑）
                const result = this.#executeTool(tool, toolCall.args);
                toolResults.push({ role: 'tool', content: result });
            }

            // 将工具结果追加到消息历史
            messages.push(...toolResults);
        }

        // 超过 maxTurns
        return { ok: false, error: `SKILL_MAX_TURNS_EXCEEDED: 超过最大轮次 ${this.#maxTurns}` };
    }

    /** 构建用户上下文（注入到 user message） */
    #buildUserContext(ctx: SkillRunContext): string {
        const parts: string[] = [];
        if (ctx.selectedText) parts.push(`选中原文：${ctx.selectedText}`);
        if (ctx.cfi) parts.push(`位置：${ctx.cfi}`);
        if (ctx.bookId) parts.push(`书籍：${ctx.bookId}`);
        if (ctx.args && Object.keys(ctx.args).length > 0) {
            // 排除内部字段 _code（script 路径专用）
            const filtered = Object.fromEntries(
                Object.entries(ctx.args).filter(([k]) => k !== '_code')
            );
            if (Object.keys(filtered).length > 0) {
                parts.push(`参数：${JSON.stringify(filtered)}`);
            }
        }
        return parts.join('\n') || '（无额外上下文）';
    }

    /** 执行工具（v1: JSON 占位；Phase 5 实现实际逻辑） */
    #executeTool(tool: CapabilityTool, args: unknown): string {
        return JSON.stringify({ tool: tool.name, args });
    }

    // ============ Script 路径（Node vm）============

    async #runScript(manifest: SkillManifest, ctx: SkillRunContext): Promise<SkillResult> {
        const scriptConfig = manifest.script;
        if (!scriptConfig || !scriptConfig.enabled) {
            return { ok: false, error: 'SKILL_SCRIPT_DISABLED: script 未启用' };
        }

        // v1: 仅支持 Node runtime（K2 决策）
        if (scriptConfig.runtime !== 'node') {
            return { ok: false, error: `SKILL_SCRIPT_UNSUPPORTED_RUNTIME: v1 仅支持 node，收到 ${scriptConfig.runtime}` };
        }

        // 获取脚本代码（v1: 从 ctx.args._code 或 scriptConfig.entry）
        const code = (ctx.args?._code as string | undefined) ?? scriptConfig.entry;
        if (!code) {
            return { ok: false, error: 'SKILL_SCRIPT_NO_ENTRY: 未提供脚本代码' };
        }

        try {
            // vm.Script + runInNewContext: 隔离沙箱执行
            // 包装 IIFE：脚本内可使用 return（顶层 script 不允许）
            const sandbox: Record<string, unknown> = { context: ctx };
            const wrapped = `(function() { ${code} })()`;
            const vmScript = new Script(wrapped);
            const result = vmScript.runInNewContext(sandbox) as unknown;

            return { ok: true, data: result };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: `SKILL_SCRIPT_ERROR: ${msg}` };
        }
    }
}
