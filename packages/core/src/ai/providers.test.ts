import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleProvider } from './providers.js';
import type { AIConfig, ChatMessage, ChatStreamChunk } from './types.js';

const mockConfig: AIConfig = {
    llmBaseUrl: 'http://mock-llm.test/v1',
    llmApiKey: 'test-key',
    llmModel: 'test-model',
    embeddingBaseUrl: 'http://mock-embed.test/v1',
    embeddingApiKey: 'test-key',
    embeddingModel: 'test-embed-model',
};

interface MockResponse {
    ok: boolean;
    status: number;
    json: () => unknown;
}

describe('OpenAICompatibleProvider', () => {
    let provider: OpenAICompatibleProvider;
    let capturedCalls: { url: string; headers: Record<string, string>; body: string }[];
    let mockResponse: MockResponse;

    beforeEach(() => {
        provider = new OpenAICompatibleProvider(mockConfig);
        capturedCalls = [];

        const mockFetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
            const urlStr = typeof url === 'string' ? url : url.toString();
            capturedCalls.push({
                url: urlStr,
                headers: (init?.headers as Record<string, string>) ?? {},
                body: typeof init?.body === 'string' ? init.body : '',
            });

            const jsonBody = mockResponse.json();
            return new Response(JSON.stringify(jsonBody), {
                status: mockResponse.ok ? 200 : mockResponse.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;

        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('S2: embed() 调用 /embeddings，返回 number[][]', async () => {
        mockResponse = {
            ok: true, status: 200,
            json: () => ({ data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }, { embedding: [0.4, 0.5, 0.6], index: 1 }], usage: { prompt_tokens: 10, total_tokens: 10 } }),
        };

        const result = await provider.embed(['文本一', '文本二']);
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual([0.1, 0.2, 0.3]);
        expect(result[1]).toEqual([0.4, 0.5, 0.6]);

        expect(capturedCalls[0]!.url).toBe('http://mock-embed.test/v1/embeddings');
        expect(capturedCalls[0]!.headers['Authorization']).toBe('Bearer test-key');
    });

    it('S3: chat() 调用 /chat/completions，返回 AIChatResult', async () => {
        mockResponse = {
            ok: true, status: 200,
            json: () => ({ choices: [{ message: { content: '你好！' }, index: 0 }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } }),
        };

        const messages: ChatMessage[] = [{ role: 'user', content: '你好' }];
        const result = await provider.chat(messages);
        expect(result.content).toBe('你好！');
        expect(result.usage?.promptTokens).toBe(5);

        expect(capturedCalls[0]!.url).toBe('http://mock-llm.test/v1/chat/completions');
    });

    it('S6: API 错误 → 抛出类型化错误', async () => {
        mockResponse = {
            ok: false, status: 500,
            json: () => ({ error: { message: 'Internal server error' } }),
        };

        await expect(provider.chat([{ role: 'user', content: 'test' }]))
            .rejects.toThrow(/API 错误 500/);
    });

    it('S6b: 网络超时 → 抛出类型化错误', async () => {
        vi.stubGlobal('fetch', (async (): Promise<Response> => {
            throw new Error('timeout');
        }) as typeof fetch);

        await expect(provider.embed(['test']))
            .rejects.toThrow(/网络错误/);
    });

    it('summarize(): 包装 system prompt + chat()', async () => {
        mockResponse = {
            ok: true, status: 200,
            json: () => ({ choices: [{ message: { content: '总结内容' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
        };

        const result = await provider.summarize('长文本...', '用一句话概括');
        expect(result).toBe('总结内容');

        const body = JSON.parse(capturedCalls[0]!.body) as { messages: { role: string; content: string }[] };
        expect(body.messages[0]!.role).toBe('system');
        expect(body.messages[0]!.content).toContain('用一句话概括');
    });

    it('chat() with tools: 传递 tool specs', async () => {
        mockResponse = {
            ok: true, status: 200,
            json: () => ({ choices: [{ message: { content: '', tool_calls: [{ function: { name: 'retrieval.search', arguments: '{"query":"test"}' } }] } }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
        };

        const result = await provider.chat(
            [{ role: 'user', content: '搜索' }],
            [{ name: 'retrieval.search', description: '检索', inputSchema: {} }],
        );
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0]!.name).toBe('retrieval.search');

        const body = JSON.parse(capturedCalls[0]!.body) as { tools: unknown[] };
        expect(body.tools).toHaveLength(1);
    });

    it('chatStream(): 解析 SSE 增量，产出 delta + final + usage', async () => {
        const sse = [
            'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
            'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
            'data: [DONE]\n\n',
        ].join('');

        vi.stubGlobal('fetch', (async (): Promise<Response> => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(sse));
                    controller.close();
                },
            });
            return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        }) as typeof fetch);

        const chunks: ChatStreamChunk[] = [];
        for await (const chunk of provider.chatStream([{ role: 'user', content: '你好' }])) {
            chunks.push(chunk);
        }

        expect(chunks.map(c => c.delta).join('')).toBe('你好');
        const final = chunks.find(c => c.final);
        expect(final).toBeDefined();
        expect(final!.usage?.promptTokens).toBe(5);
        expect(final!.usage?.completionTokens).toBe(2);
    });

    it('chatStream(): 跨 chunk 边界正确重组（含多字节中文）', async () => {
        const full = 'data: {"choices":[{"delta":{"content":"测试中文"}}]}\n\ndata: [DONE]\n\n';
        const bytes = new TextEncoder().encode(full);
        // 拆成 3 段，故意切断 UTF-8 多字节字符
        const parts = [bytes.slice(0, 20), bytes.slice(20, 40), bytes.slice(40)];

        vi.stubGlobal('fetch', (async (): Promise<Response> => {
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const p of parts) controller.enqueue(p);
                    controller.close();
                },
            });
            return new Response(stream, { status: 200 });
        }) as typeof fetch);

        const chunks: ChatStreamChunk[] = [];
        for await (const chunk of provider.chatStream([{ role: 'user', content: 'x' }])) {
            chunks.push(chunk);
        }
        expect(chunks.map(c => c.delta).join('')).toBe('测试中文');
    });

    it('chatStream(): API 错误 → 抛出类型化错误', async () => {
        vi.stubGlobal('fetch', (async (): Promise<Response> =>
            new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 429 })
        ) as typeof fetch);

        const iterate = async (): Promise<void> => {
            for await (const _ of provider.chatStream([{ role: 'user', content: 'x' }])) {
                void _;
            }
        };
        await expect(iterate()).rejects.toThrow(/API 错误 429/);
    });
});
