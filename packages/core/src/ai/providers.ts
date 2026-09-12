import type { AIConfig, ChatMessage, AIChatResult, ChatStreamChunk, ToolSpec, ChatOpts, TokenUsage } from './types.js';

export class AIProviderError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

export class OpenAICompatibleProvider {
    #config: AIConfig;

    constructor(config: AIConfig) {
        this.#config = config;
    }

    async chat(messages: ChatMessage[], tools?: ToolSpec[], opts?: ChatOpts): Promise<AIChatResult> {
        const body: Record<string, unknown> = {
            model: this.#config.llmModel,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
        };

        if (tools && tools.length > 0) {
            body.tools = tools.map(t => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
            }));
        }

        if (opts?.temperature !== undefined) body.temperature = opts.temperature;
        if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

        const response = await this.#fetch(
            `${this.#config.llmBaseUrl}/chat/completions`,
            this.#config.llmApiKey,
            body,
        );

        return this.#parseChatResponse(response);
    }

    async summarize(text: string, instruction?: string): Promise<string> {
        const systemPrompt = instruction ? `请总结以下文本。要求：${instruction}` : '请总结以下文本。';
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
        ];
        const result = await this.chat(messages);
        return result.content;
    }

    async embed(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const response = await this.#fetch(
            `${this.#config.embeddingBaseUrl}/embeddings`,
            this.#config.embeddingApiKey,
            { model: this.#config.embeddingModel, input: texts },
        );

        const data = response.data as { embedding: number[]; index: number }[];
        // 按 index 排序（API 可能乱序返回）
        data.sort((a, b) => a.index - b.index);
        return data.map(d => d.embedding);
    }

    async #fetch(url: string, apiKey: string, body: Record<string, unknown>): Promise<any> {
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            throw new AIProviderError('NETWORK_ERROR', `网络错误: ${e instanceof Error ? e.message : String(e)}`);
        }

        if (!response.ok) {
            const errBody = await response.json().catch(() => null);
            const msg = errBody?.error?.message ?? errBody?.message ?? response.statusText;
            throw new AIProviderError(`API_ERROR_${response.status}`, `API 错误 ${response.status}: ${msg}`);
        }

        return response.json();
    }

    async #fetchRaw(url: string, apiKey: string, body: Record<string, unknown>): Promise<Response> {
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            throw new AIProviderError('NETWORK_ERROR', `网络错误: ${e instanceof Error ? e.message : String(e)}`);
        }

        if (!response.ok) {
            const errBody: unknown = await response.json().catch(() => null);
            const msg = errorMessage(errBody) ?? response.statusText;
            throw new AIProviderError(`API_ERROR_${response.status}`, `API 错误 ${response.status}: ${msg}`);
        }

        return response;
    }

    async *chatStream(messages: ChatMessage[], tools?: ToolSpec[], opts?: ChatOpts): AsyncGenerator<ChatStreamChunk> {
        const body: Record<string, unknown> = {
            model: this.#config.llmModel,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: true,
        };

        if (tools && tools.length > 0) {
            body.tools = tools.map(t => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
            }));
        }
        if (opts?.temperature !== undefined) body.temperature = opts.temperature;
        if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

        const response = await this.#fetchRaw(
            `${this.#config.llmBaseUrl}/chat/completions`,
            this.#config.llmApiKey,
            body,
        );

        const stream = response.body;
        if (!stream) throw new AIProviderError('PARSE_ERROR', '流式响应缺少 body');

        let usage: TokenUsage | undefined;
        for await (const payload of sseDataPayloads(stream)) {
            if (payload === '[DONE]') break;

            let raw: unknown;
            try {
                raw = JSON.parse(payload);
            } catch (e) {
                throw new AIProviderError('PARSE_ERROR', `SSE 负载解析失败: ${e instanceof Error ? e.message : String(e)}`);
            }

            const chunk = parseStreamChunk(raw);
            if (chunk.usage) usage = chunk.usage;
            if (chunk.delta) yield { delta: chunk.delta };
        }

        yield usage ? { delta: '', final: true, usage } : { delta: '', final: true };
    }

    #parseChatResponse(data: any): AIChatResult {
        const choice = data.choices?.[0];
        if (!choice) throw new AIProviderError('PARSE_ERROR', '响应格式错误: 缺少 choices');

        const toolCalls = (choice.message?.tool_calls ?? []).map((tc: any) => ({
            name: tc.function?.name ?? tc.name,
            args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : tc.args,
        }));

        const usage: TokenUsage | undefined = data.usage
            ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 }
            : undefined;

        return { content: choice.message?.content ?? '', toolCalls, usage };
    }
}

/** 解析 SSE 字节流，逐条产出 data: 负载（兼容跨 chunk 边界与多字节字符） */
async function* sseDataPayloads(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const decoder = new TextDecoder('utf-8');
    const reader = stream.getReader();
    let buffer = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const payload = extractDataPayload(frame);
                if (payload !== undefined) yield payload;
            }
        }
    } finally {
        reader.releaseLock();
    }
    buffer += decoder.decode();
    if (buffer.trim() !== '') {
        const payload = extractDataPayload(buffer);
        if (payload !== undefined) yield payload;
    }
}

function extractDataPayload(frame: string): string | undefined {
    for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) return line.slice(5).trim();
    }
    return undefined;
}

interface ParsedStreamChunk {
    readonly delta: string;
    readonly usage?: TokenUsage | undefined;
}

function parseStreamChunk(raw: unknown): ParsedStreamChunk {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new AIProviderError('PARSE_ERROR', 'SSE 负载不是 JSON 对象');
    }
    const map = raw as Record<string, unknown>;

    let delta = '';
    const choices = map.choices;
    if (Array.isArray(choices) && choices.length > 0) {
        const first: unknown = choices[0];
        if (typeof first === 'object' && first !== null) {
            const deltaObj = (first as Record<string, unknown>).delta;
            if (typeof deltaObj === 'object' && deltaObj !== null) {
                const content = (deltaObj as Record<string, unknown>).content;
                if (typeof content === 'string') delta = content;
            }
        }
    }

    const usage = parseUsage(map.usage);
    return usage ? { delta, usage } : { delta };
}

function parseUsage(raw: unknown): TokenUsage | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const map = raw as Record<string, unknown>;
    const promptTokens = toNonNegInt(map.prompt_tokens);
    const completionTokens = toNonNegInt(map.completion_tokens);
    if (promptTokens === undefined || completionTokens === undefined) return undefined;
    return { promptTokens, completionTokens };
}

function toNonNegInt(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

function errorMessage(raw: unknown): string | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const map = raw as Record<string, unknown>;
    const err = map.error;
    if (typeof err === 'object' && err !== null) {
        const m = (err as Record<string, unknown>).message;
        if (typeof m === 'string') return m;
    }
    if (typeof map.message === 'string') return map.message;
    return undefined;
}
