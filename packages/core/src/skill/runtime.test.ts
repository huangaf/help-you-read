// SkillRuntime — TDD 测试（Phase 4）
// 三路径：prompt / agent / script + access gate

import { describe, it, expect } from 'vitest';
import { SkillRuntime } from './runtime.js';
import { CapabilityCatalog } from './catalog.js';
import type { SkillManifest, SkillRunContext, CapabilityTool } from './types.js';

// ============ Mock Provider（测试用，不依赖真实 AI 服务）============

interface MockProviderOptions {
    /** chat 返回值（按调用顺序，数组形式） */
    chatResponses: { content: string; toolCalls?: { name: string; args: unknown }[] }[];
    /** 记录每次 chat 调用的 messages（用于断言） */
    chatCallLog?: { role: string; content: string }[][];
}

class MockProvider {
    chatResponses: { content: string; toolCalls?: { name: string; args: unknown }[] }[];
    chatCallLog: { role: string; content: string }[][] = [];
    #callIndex = 0;

    constructor(opts: MockProviderOptions) {
        this.chatResponses = opts.chatResponses;
    }

    async chat(messages: { role: string; content: string }[], _opts?: Record<string, unknown>): Promise<{ content: string; toolCalls?: { name: string; args: unknown }[] }> {
        this.chatCallLog.push(messages);
        const idx = this.#callIndex;
        this.#callIndex++;
        const resp = this.chatResponses[idx];
        if (resp) {
            return resp;
        }
        // 超出预设次数，返回空
        return { content: '(no more responses)' };
    }

    async embed(_texts: string[]): Promise<number[][]> { return [[0, 0]]; }
    async summarize(_text: string): Promise<string> { return 'summary'; }
}

// ============ 辅助函数 ============

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
    return {
        schemaVersion: 1,
        id: 'test_skill',
        kind: 'prompt' as const,
        source: 'builtin' as const,
        name: '测试技能',
        description: '测试用技能',
        access: 'read' as const,
        tools: [],
        prompt: { inline: '模板 {{selectedText}}' },
        ...overrides,
    };
}

function makeCtx(overrides: Partial<SkillRunContext> = {}): SkillRunContext {
    return { skillId: 'test_skill', ...overrides };
}

function makeTool(overrides: Partial<CapabilityTool> = {}): CapabilityTool {
    return {
        name: 'test_tool',
        description: '测试工具',
        access: 'read' as const,
        inputSchema: undefined,
        ...overrides,
    };
}

// ============ 测试场景 ============

describe('skill/runtime', () => {
  // --- S1: prompt 路径 — 模板渲染 + AI chat ---

  it('S1: kind=prompt → 渲染模板 {{变量}} → 调用 provider.chat() → 返回结果', async () => {
    const catalog = new CapabilityCatalog();
    const provider = new MockProvider({
      chatResponses: [{ content: 'AI 生成的 RIA 笔记' }],
    });

    const runtime = new SkillRuntime({ catalog, provider: provider as never });
    const manifest = makeManifest({
      kind: 'prompt',
      prompt: { inline: '请分析：{{selectedText}}' },
    });
    const ctx = makeCtx({ selectedText: '价值投资的核心是安全边际' });

    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(true);
    // 验证模板被正确渲染（chatCallLog 中应包含替换后的文本）
    expect(provider.chatCallLog[0]?.[0]?.content).toContain('请分析：价值投资的核心是安全边际');
  });

  // --- S2: agent 路径 — 多轮工具调用循环 ---

  it('S2: kind=agent → provider 返回 toolCalls → catalog resolve + execute → 循环直到无 tools', async () => {
    const catalog = new CapabilityCatalog();
    // 注册一个工具，执行时返回固定值
    const tool = makeTool({ name: 'reader.getSelection', description: '获取选中原文', access: 'read' });
    catalog.register(tool);

    // 第1轮：AI 请求调用工具；第2轮：AI 返回最终内容
    const provider = new MockProvider({
      chatResponses: [
        { content: '', toolCalls: [{ name: 'reader.getSelection', args: {} }] },
        { content: '最终总结：这本书讲了价值投资' },
      ],
    });

    const runtime = new SkillRuntime({ catalog, provider: provider as never });
    const manifest = makeManifest({ kind: 'agent', prompt: undefined, tools: ['reader.getSelection'] });
    const ctx = makeCtx({ selectedText: '投资要逆向思考' });

    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toBe('最终总结：这本书讲了价值投资');
  });

  // --- S3: script 路径 — Node vm 执行 ---

  it('S3: kind=script → vm.runInContext 执行脚本', async () => {
    const catalog = new CapabilityCatalog();
    const runtime = new SkillRuntime({ catalog });
    // 简单脚本：返回固定值
    const manifest = makeManifest({
      kind: 'script',
      prompt: undefined,
      script: { enabled: true, runtime: 'node' },
    });
    const ctx = makeCtx({ args: { _code: 'return context.args.a + context.args.b;', a: 3, b: 4 } });

    // script entry 用 inline code（通过 args._code 传入，模拟受信内置脚本）
    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(true);
    expect(result.data).toBe(7);
  });

  // --- S4: access gate — skill access 不足时拦截工具调用 ---

  it('S4: agent 路径中 tool.access > skill.access → 拦截，返回 error', async () => {
    const catalog = new CapabilityCatalog();
    // 工具要求 write access
    catalog.register(makeTool({ name: 'db.query', description: '数据库查询', access: 'write' }));

    const provider = new MockProvider({
      chatResponses: [
        { content: '', toolCalls: [{ name: 'db.query', args: {} }] },
      ],
    });

    const runtime = new SkillRuntime({ catalog, provider: provider as never });
    // skill access = 'read'，工具要求 'write' → 应被拦截
    const manifest = makeManifest({ kind: 'agent', prompt: undefined, access: 'read', tools: ['db.query'] });
    const ctx = makeCtx();

    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('access');
  });

  // --- S5: agent maxTurns — 超过最大轮次 → error ---

  it('S5: agent 路径 maxTurns 耗尽 → 返回 error', async () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'loop_tool', description: '循环工具', access: 'none' }));

    // 预设 20 轮 toolCalls（永远不结束）
    const responses = Array.from({ length: 20 }, () => ({
      content: '',
      toolCalls: [{ name: 'loop_tool', args: {} }],
    }));
    const provider = new MockProvider({ chatResponses: responses });

    const runtime = new SkillRuntime({ catalog, provider: provider as never, maxTurns: 5 });
    const manifest = makeManifest({ kind: 'agent', prompt: undefined, tools: ['loop_tool'] });
    const ctx = makeCtx();

    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('MAX_TURNS');
  });

  // --- S6: prompt 路径 — provider chat 抛错 → SkillResult error ---

  it('S6: prompt 路径 — provider.chat() 抛异常 → ok=false + error', async () => {
    const catalog = new CapabilityCatalog();

    // Mock provider 的 chat 方法抛错
    const failingProvider = {
      chat: async () => { throw new Error('API 连接超时'); },
      embed: async () => [[]],
      summarize: async () => 'x',
    };

    const runtime = new SkillRuntime({ catalog, provider: failingProvider as never });
    const manifest = makeManifest({ kind: 'prompt', prompt: { inline: 'test {{x}}' } });
    const ctx = makeCtx({ args: { x: 'val' } });

    const result = await runtime.invoke(manifest, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('API 连接超时');
  });

  // --- S7: script disabled → error ---

  it('S7: kind=script + script.enabled=false → ok=false', async () => {
    const catalog = new CapabilityCatalog();
    const runtime = new SkillRuntime({ catalog });
    const manifest = makeManifest({
      kind: 'script',
      prompt: undefined,
      script: { enabled: false, runtime: 'node' },
    });

    const result = await runtime.invoke(manifest, makeCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DISABLED');
  });
});
