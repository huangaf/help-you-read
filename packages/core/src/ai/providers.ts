import type { AIConfig, ChatMessage, AIChatResult, ToolSpec, ChatOpts, TokenUsage } from './types.js';

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
