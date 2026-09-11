// AI 层共享类型定义

export interface AIConfig {
    readonly llmBaseUrl: string;
    readonly llmApiKey: string;
    readonly llmModel: string;
    readonly embeddingBaseUrl: string;
    readonly embeddingApiKey: string;
    readonly embeddingModel: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    readonly role: ChatRole;
    readonly content: string;
    readonly citations?: RetrievalHit[] | undefined;
}

export interface AIChatResult {
    readonly content: string;
    readonly toolCalls?: ToolCall[] | undefined;
    readonly usage?: TokenUsage | undefined;
}

export interface ToolCall {
    readonly name: string;
    readonly args: unknown;
}

export interface TokenUsage {
    readonly promptTokens: number;
    readonly completionTokens: number;
}

export interface ToolSpec {
    readonly name: string;
    readonly description: string;
    readonly inputSchema: unknown;
}

export interface ChatOpts {
    readonly temperature?: number | undefined;
    readonly maxTokens?: number | undefined;
}

export interface RetrievalHit {
    readonly cfi: string;
    readonly text: string;
    readonly source: 'fts' | 'vector' | 'hybrid';
    readonly score: number;
}

export interface SearchContext {
    readonly bookId: string;
    readonly topK?: number | undefined;
}
