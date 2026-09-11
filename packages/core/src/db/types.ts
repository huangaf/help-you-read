// 数据层 Entity 类型定义（从 DDL 字段推导，供 repository + 上层消费）

// ============ main.db（可同步）============

export interface Book {
    readonly id: string;
    readonly filePath: string;
    readonly format: string; // 'epub' | 'pdf'（v2+）
    readonly title: string;
    readonly author?: string | undefined;
    readonly publisher?: string | undefined;
    readonly language?: string | undefined;
    readonly isbn?: string | undefined;
    readonly description?: string | undefined;
    readonly coverUrl?: string | undefined;
    readonly publishDate?: string | undefined;
    readonly rating?: number | undefined;
    readonly tags: string[]; // JSON（v1 反范式）
    readonly progress: number; // 0.0-1.0
    readonly currentCfi?: string | undefined;
    readonly addedAt: number; // epoch ms
    readonly lastOpenedAt?: number | undefined;
    readonly updatedAt: number;
}

export interface Annotation {
    readonly id: string;
    readonly bookId: string;
    readonly cfi: string;
    readonly text: string;
    readonly contextBefore?: string | undefined; // ★ 离线 AI 依据
    readonly contextAfter?: string | undefined;
    readonly color: string; // 'yellow' | 'green' | ...
    readonly style: string; // 'highlight' | 'underline'
    readonly type: string; // 'annotation' | 'note'
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface Note {
    readonly id: string;
    readonly bookId: string;
    readonly highlightId?: string | undefined; // 可挂 annotation
    readonly cfi?: string | undefined;
    readonly title: string;
    readonly content: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface Thread {
    readonly id: string;
    readonly bookId?: string | undefined; // 可独立于书（全局对话）
    readonly title?: string | undefined;
    readonly memorySummary?: string | undefined; // 滚动记忆（控 token）
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface Message {
    readonly id: string;
    readonly threadId: string;
    readonly role: string; // 'user' | 'assistant' | 'system'
    readonly content: string;
    readonly citations: unknown[]; // RetrievalHit[]（JSON）
    readonly toolCalls: unknown[]; // ToolCall[]（JSON）
    readonly reasoning?: string | undefined;
    readonly partsOrder: number;
    readonly createdAt: number;
}

export interface Skill {
    readonly id: string;
    readonly name: string; // UNIQUE
    readonly description?: string | undefined;
    readonly icon?: string | undefined;
    readonly kind: string; // 'prompt' | 'agent' | 'script'
    readonly source: string; // 'builtin' | 'user' | 'imported'
    readonly access: string; // 'none' | 'read' | 'write' | 'full'
    readonly tools: string[]; // Capability Catalog 白名单（JSON）
    readonly enabled: boolean;
    readonly manifestJson: string; // 完整 SkillManifest JSON
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface ReadingSession {
    readonly id: string;
    readonly bookId: string;
    readonly startedAt: number;
    readonly endedAt?: number | undefined;
    readonly totalActiveTime: number; // ms
    readonly pagesRead: number;
    readonly state: string; // 'active' | 'paused' | 'ended'
    readonly updatedAt: number;
}

export interface MethodArtifact {
    readonly id: string;
    readonly bookId: string;
    readonly method: string; // 'ria_note' | ...（v1 仅 ria_note）
    readonly content: string; // JSON（方法特定结构）
    readonly idempotencyKey?: string | undefined;
    readonly helpful: boolean;
    readonly dismissed: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface ReviewItem {
    readonly id: string;
    readonly bookId: string;
    readonly sourceArtifactId?: string | undefined; // 关联 method_artifact
    readonly question: string;
    readonly answer: string;
    readonly context?: string | undefined;
    readonly dueDate: number; // epoch ms
    readonly intervalDays: number;
    readonly easeFactor: number; // SM-2 默认 2.5
    readonly lapses: number;
    readonly retrievalCount: number;
    readonly lastReviewedAt?: number | undefined;
    readonly createdAt: number;
    readonly updatedAt: number;
}

// ============ local.db（本地专用，不同步）============

export interface Chunk {
    readonly id: string;
    readonly bookId: string;
    readonly chapterIndex?: number | undefined;
    readonly chapterTitle?: string | undefined;
    readonly content: string;
    readonly tokenCount?: number | undefined;
    readonly startCfi?: string | undefined;
    readonly endCfi?: string | undefined;
    readonly segmentCfis?: string[] | undefined; // JSON（子段 CFI 列表）
    readonly embedding?: Uint8Array | Float32Array | undefined; // 向量（BLOB）
    readonly updatedAt: number;
}

export interface VectorIndexProvenance {
    readonly bookId: string; // PRIMARY KEY（一书一模型）
    readonly modelKind: string; // 'local' | 'api'
    readonly modelId: string;
    readonly endpoint?: string | undefined;
    readonly dimensions: number;
    readonly createdAt: number;
}

// ============ 同步相关（v2+）============
export interface SchemaMigration {
    readonly version: number;
    readonly description: string;
    readonly appliedAt?: number | undefined; // epoch ms（null = 未应用）
}
