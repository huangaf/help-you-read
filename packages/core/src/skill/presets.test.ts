// 预置技能端到端测试（Phase 4）
// 验证：manifest 解析 → SkillRuntime.invoke → 三路径各跑通一例

import { describe, it, expect } from 'vitest';
import { parseSkillManifest } from './manifest.js';
import type { SkillManifest, CapabilityTool } from './types.js';
import { CapabilityCatalog } from './catalog.js';
import { SkillRuntime, type ChatProvider } from './runtime.js';
import { promptExample } from './presets/prompt_example.js';
import { agentExample } from './presets/agent_example.js';
import { scriptExample } from './presets/script_example.js';

// Mock provider（测试用）
class MockProvider implements ChatProvider {
    #responses: { content: string; toolCalls?: { name: string; args: unknown }[] }[];
    #callLog: { role: string; content: string }[][] = [];
    #idx = 0;

    constructor(responses: { content: string; toolCalls?: { name: string; args: unknown }[] }[]) {
        this.#responses = responses;
    }

    async chat(
        messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
        _opts?: Record<string, unknown>
    ): Promise<{ readonly content: string; readonly toolCalls?: ReadonlyArray<{ readonly name: string; readonly args: unknown }> }> {
        this.#callLog.push(messages.map(m => ({ role: m.role, content: m.content })));
        const idx = this.#idx;
        this.#idx++;
        const r = this.#responses[idx];
        if (!r) {
            return { content: '(exhausted)' };
        }
        return { content: r.content, ...(r.toolCalls ? { toolCalls: [...r.toolCalls] } : {}) };
    }

    get callLog() { return this.#callLog; }
}

describe('skill/presets — 三路径端到端', () => {
    it('E2E-1: prompt_example 解析 + invoke → ok=true', async () => {
        // manifest 校验通过
        const parsed = parseSkillManifest(promptExample as unknown as Record<string, unknown>);
        expect(parsed.id).toBe('prompt_example');
        expect(parsed.kind).toBe('prompt');

        const catalog = new CapabilityCatalog();
        const provider = new MockProvider([{ content: '摘要：价值投资核心' }]);
        const runtime = new SkillRuntime({ catalog, provider });

        const result = await runtime.invoke(parsed, {
            skillId: 'prompt_example',
            selectedText: '投资的第一条规则是不要亏钱',
        });

        expect(result.ok).toBe(true);
        // 验证模板被渲染（provider 收到的消息包含替换后的文本）
        const logged = provider.callLog[0]?.[0];
        expect(logged?.content).toContain('投资的第一条规则是不要亏钱');
    });

    it('E2E-2: agent_example 解析 + invoke → tool loop → ok=true', async () => {
        const parsed = parseSkillManifest(agentExample as unknown as Record<string, unknown>);
        expect(parsed.id).toBe('agent_example');
        expect(parsed.kind).toBe('agent');
        expect(parsed.tools).toEqual(['retrieval.search']);

        // 注册工具
        const catalog = new CapabilityCatalog();
        catalog.register({
            name: 'retrieval.search',
            description: '混合检索（LIKE + vec0 KNN → RRF）',
            access: 'read' as const,
            inputSchema: undefined,
        } satisfies CapabilityTool);

        // 第1轮：AI 请求调用 retrieval.search；第2轮：返回最终结果
        const provider = new MockProvider([
            { content: '', toolCalls: [{ name: 'retrieval.search', args: { query: '安全边际' } }] },
            { content: '分析：安全边际是价值投资的核心概念' },
        ]);

        const runtime = new SkillRuntime({ catalog, provider });
        const result = await runtime.invoke(parsed, {
            skillId: 'agent_example',
            selectedText: '安全边际是指买入价格远低于内在价值',
        });

        expect(result.ok).toBe(true);
        expect(result.data).toBe('分析：安全边际是价值投资的核心概念');
    });

    it('E2E-3: script_example 解析 + invoke → vm exec → ok=true', async () => {
        const parsed = parseSkillManifest(scriptExample as unknown as Record<string, unknown>);
        expect(parsed.id).toBe('script_example');
        expect(parsed.kind).toBe('script');

        const catalog = new CapabilityCatalog();
        const runtime = new SkillRuntime({ catalog });

        // 通过 args._code 传入脚本（模拟受信内置脚本）
        const result = await runtime.invoke(parsed, {
            skillId: 'script_example',
            selectedText: '这是一个测试句子。这是第二个句子。',
            args: {
                _code: `return { length: context.selectedText.length, sentences: (context.selectedText.match(/句/g) || []).length };`,
            },
        });

        expect(result.ok).toBe(true);
        const data = result.data as { length: number; sentences: number };
        expect(data.length).toBe(17); // "这是一个测试句子。这是第二个句子。" = 17 chars（含两个句号）
        expect(data.sentences).toBe(2);
    });

    it('E2E-4: access gate — none skill 不能调用 read tool', async () => {
        // scriptExample 的 access = 'none'，不能调用需要 read 的工具
        const parsed = parseSkillManifest(scriptExample as unknown as Record<string, unknown>);
        expect(parsed.access).toBe('none');

        // 构造一个 agent manifest，access=none，但 tools 包含 read 级工具
        const blockedManifest: SkillManifest = {
            ...parsed,
            id: 'blocked_test',
            kind: 'agent',
            access: 'none',
            tools: ['retrieval.search'],
        };

        const catalog = new CapabilityCatalog();
        catalog.register({
            name: 'retrieval.search',
            description: '混合检索',
            access: 'read' as const,
            inputSchema: undefined,
        } satisfies CapabilityTool);

        const provider = new MockProvider([
            { content: '', toolCalls: [{ name: 'retrieval.search', args: {} }] },
        ]);

        const runtime = new SkillRuntime({ catalog, provider });
        const result = await runtime.invoke(blockedManifest, { skillId: 'blocked_test' });

        expect(result.ok).toBe(false);
        expect(result.error).toContain('ACCESS_DENIED');
    });
});
