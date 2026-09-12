// CoreService — Node.js 侧核心服务（Vite dev server 进程内运行）
// 职责：双库 + 迁移 + repos + AIProvider(适配 ChatProvider) + SkillRuntime/CapabilityCatalog + EspeakEngine
// 浏览器不可直接 import（依赖 node:sqlite / child_process），通过 Vite 插件暴露 HTTP API

import {
    Database,
    migrateAll,
    BooksRepository,
    AnnotationsRepository,
    NotesRepository,
    ThreadsRepository,
    MessagesRepository,
    SkillsRepository,
    ReadingSessionsRepository,
    MethodArtifactRepository,
    ReviewItemsRepository,
    ChunksRepository,
    ProvenanceRepository,
    OpenAICompatibleProvider,
    TextChunker,
    HybridRetriever,
    SkillRuntime,
    CapabilityCatalog,
    EspeakEngine,
    parseSkillManifest,
    sm2Schedule,
} from '@hyr/core';

import type {
    AIConfig,
    ChatMessage,
    ReviewItem,
} from '@hyr/core';

// ============ 类型定义（本文件内部使用）============

/** CoreService 构造选项 */
export interface CoreServiceOptions {
    /** SQLite 数据目录（main.db / local.db 存放路径） */
    dataDir: string;
    /** AI provider 配置（oMLX endpoint + model names） */
    aiConfig: AIConfig;
}

/** ChatProvider 适配层：将 OpenAICompatibleProvider 包装为 SkillRuntime 可消费的 ChatProvider */
class ChatProviderAdapter {
    #provider: OpenAICompatibleProvider;

    constructor(provider: OpenAICompatibleProvider) {
        this.#provider = provider;
    }

    /**
     * 实现 ChatProvider.chat(messages, opts?) → { content, toolCalls? }
     * OpenAICompatibleProvider.chat 签名为 (messages, tools?, opts?) → AIChatResult
     * 适配策略：从 opts.tools 提取工具列表传入 provider，将 AIChatResult 映射为 ChatResponse
     */
    async chat(
        messages: ReadonlyArray<{ readonly role: string; readonly content: string }>,
        opts?: Record<string, unknown>
    ): Promise<{ content: string; toolCalls?: ReadonlyArray<{ readonly name: string; readonly args: unknown }> }> {
        // 从 opts 提取 tools（SkillRuntime 通过 opts.tools 传递工具规格）
        const tools = (opts?.tools as { name: string; description?: string; inputSchema?: unknown }[] | undefined) ?? [];

        const result = await this.#provider.chat(
            messages.map(m => ({ role: m.role, content: m.content })),
            tools.length > 0 ? tools : undefined,
            { temperature: opts?.temperature as number | undefined }
        );

        return {
            content: result.content,
            toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        };
    }
}

// ============ CoreService 类 ============

export class CoreService {
    #db: Database;
    #books: BooksRepository;
    #annotations: AnnotationsRepository;
    #notes: NotesRepository;
    #threads: ThreadsRepository;
    #messages: MessagesRepository;
    #skills: SkillsRepository;
    #sessions: ReadingSessionsRepository;
    #artifacts: MethodArtifactRepository;
    #reviews: ReviewItemsRepository;
    #chunks: ChunksRepository;
    #provenance: ProvenanceRepository;

    #aiProvider: OpenAICompatibleProvider;
    #catalog: CapabilityCatalog;
    #runtime: SkillRuntime;
    #ttsEngine: EspeakEngine;

    constructor(opts: CoreServiceOptions) {
        // 1. 双库初始化 + 迁移
        const mainDbPath = `${opts.dataDir}/main.db`;
        const localDbPath = `${opts.dataDir}/local.db`;

        this.#db = new Database({ mainDbPath, localDbPath });
        migrateAll(this.#db);

        // 2. Repositories（接收 SqliteDb handle）
        const mainHandle = this.#db.mainDb;
        const localHandle = this.#db.localDb!;

        this.#books = new BooksRepository(mainHandle);
        this.#annotations = new AnnotationsRepository(mainHandle);
        this.#notes = new NotesRepository(mainHandle);
        this.#threads = new ThreadsRepository(mainHandle);
        this.#messages = new MessagesRepository(mainHandle);
        this.#skills = new SkillsRepository(mainHandle);
        this.#sessions = new ReadingSessionsRepository(mainHandle);
        this.#artifacts = new MethodArtifactRepository(mainHandle);
        this.#reviews = new ReviewItemsRepository(mainHandle);
        this.#chunks = new ChunksRepository(localHandle);
        this.#provenance = new ProvenanceRepository(localHandle);

        // 3. AI Provider + ChatProvider 适配
        this.#aiProvider = new OpenAICompatibleProvider(opts.aiConfig);

        // 4. SkillRuntime + CapabilityCatalog
        this.#catalog = new CapabilityCatalog();
        const chatAdapter = new ChatProviderAdapter(this.#aiProvider);
        this.#runtime = new SkillRuntime({ catalog: this.#catalog, provider: chatAdapter });

        // 5. TTS Engine
        this.#ttsEngine = new EspeakEngine();

        // 6. 注册内置工具（execute 回调）
        this.#registerBuiltinTools();
    }

    // ============ 内置工具注册 ============

    /**
     * 注册 v1 内置工具到 CapabilityCatalog：
     * - reader.getSelection: 获取当前选中文本（通过 window.getSelection，在 Node 侧模拟为从 ctx.args 读取）
     * - retrieval.search: Hybrid RAG 检索（FTS5 + 向量 RRF）
     */
    #registerBuiltinTools(): void {
        // reader.getSelection: 从 SkillRunContext.args.selectedText 读取（UI 侧已提取好传入）
        this.#catalog.register({
            name: 'reader.getSelection',
            description: '获取用户当前在阅读器中选中的文本片段',
            access: 'read',
            inputSchema: {},
            execute: (args: unknown) => {
                const a = args as Record<string, unknown>;
                const selectedText = (a?.selectedText as string) ?? '';
                return JSON.stringify({ text: selectedText });
            },
        });

        // retrieval.search: Hybrid RAG 检索（需要 localDb 中的 chunks + embeddings）
        this.#catalog.register({
            name: 'retrieval.search',
            description: '混合检索（FTS5 全文 + 向量相似度 RRF 融合），返回相关文本片段',
            access: 'read',
            inputSchema: { type: 'object', properties: { query: { type: 'string' }, bookId: { type: 'string' } } },
            execute: async (args: unknown) => {
                const a = args as Record<string, unknown>;
                const query = (a?.query as string) ?? '';
                const bookId = (a?.bookId as string) ?? '';

                // 使用 HybridRetriever 执行检索
                const retriever = new HybridRetriever(this.#db.localDb!);

                // 生成查询向量
                const embeddings = await this.#aiProvider.embed([query]);
                const queryVector = embeddings[0];

                if (!queryVector) {
                    return JSON.stringify({ hits: [], error: 'embedding 生成失败' });
                }

                const hits = await retriever.search({ query, bookId, queryVector });
                return JSON.stringify({ hits });
            },
        });
    }

    // ============ Books 操作 ============

    async importBook(filePath: string): Promise<Record<string, unknown>> {
        const book = this.#books.get(filePath);
        if (book) {
            return this.#toBookJson(book);
        }

        // 浏览器导入模式：`browser:` 前缀表示虚拟路径（EPUB 数据由 Engine.loadBook({type:'data'}) 处理）
        // Tauri 模式：真实文件系统路径，可读取文件提取 metadata
        const isBrowserImport = filePath.startsWith('browser:');

        // 从路径/文件名提取 title
        const rawName = isBrowserImport ? filePath.slice(8) : (filePath.split('/').pop() ?? 'unknown');
        const title = rawName.replace(/\.epub$/i, '') || '未知';

        const now = Date.now();
        const newBook = {
            id: filePath, // v1: 用文件路径作为 bookId（简化）
            filePath,
            format: 'epub',
            title: filePath.split('/').pop()?.replace(/\.epub$/i, '') ?? '未知',
            author: undefined as string | undefined,
            publisher: undefined as string | undefined,
            language: undefined as string | undefined,
            isbn: undefined as string | undefined,
            description: undefined as string | undefined,
            coverUrl: undefined as string | undefined,
            publishDate: undefined as string | undefined,
            rating: null as number | null,
            tags: [] as string[],
            progress: 0,
            currentCfi: null as string | null,
            addedAt: now,
            lastOpenedAt: undefined as number | undefined,
            updatedAt: now,
        };

        this.#books.create(newBook);
        return this.#toBookJson(newBook);
    }

    listBooks(): Array<Record<string, unknown>> {
        const books = this.#books.list();
        return books.map(b => this.#toBookJson(b));
    }

    getBook(bookId: string): Record<string, unknown> | null {
        const book = this.#books.get(bookId);
        return book ? this.#toBookJson(book) : null;
    }

    deleteBook(bookId: string): void {
        this.#books.delete(bookId);
    }

    updateBookProgress(bookId: string, progress: number, currentCfi?: string): void {
        const partial: Record<string, unknown> = { progress, updatedAt: Date.now() };
        if (currentCfi !== undefined) partial.currentCfi = currentCfi;
        this.#books.update(bookId, partial);
    }

    // ============ Annotations 操作 ============

    addAnnotation(params: {
        bookId: string; cfi: string; text: string;
        contextBefore?: string; contextAfter?: string;
        color?: string; style?: string; type?: string;
    }): Record<string, unknown> {
        const now = Date.now();
        const annotation = {
            id: `ann_${now}_${Math.random().toString(36).slice(2, 8)}`,
            bookId: params.bookId,
            cfi: params.cfi,
            text: params.text,
            contextBefore: params.contextBefore,
            contextAfter: params.contextAfter,
            color: params.color ?? 'yellow',
            style: params.style ?? 'highlight',
            type: params.type ?? 'default',
            createdAt: now,
            updatedAt: now,
        };
        this.#annotations.create(annotation);
        return this.#toAnnotationJson(annotation);
    }

    listAnnotations(bookId: string): Array<Record<string, unknown>> {
        const annotations = this.#annotations.findByBookId(bookId);
        return annotations.map(a => this.#toAnnotationJson(a));
    }

    updateAnnotation(annotationId: string, partial: Record<string, unknown>): void {
        this.#annotations.update(annotationId, partial);
    }

    deleteAnnotation(annotationId: string): void {
        this.#annotations.delete(annotationId);
    }

    // ============ Notes 操作 ============

    addNote(params: { bookId: string; title: string; content: string; method?: string; pinned?: boolean }): Record<string, unknown> {
        const now = Date.now();
        const note = {
            id: `note_${now}_${Math.random().toString(36).slice(2, 8)}`,
            bookId: params.bookId,
            title: params.title,
            content: params.content,
            method: params.method ?? 'ria',
            pinned: params.pinned ?? false,
            createdAt: now,
            updatedAt: now,
        };
        this.#notes.create(note);
        return this.#toNoteJson(note);
    }

    listNotes(bookId: string): Array<Record<string, unknown>> {
        const notes = this.#notes.findByBookId(bookId);
        return notes.map(n => this.#toNoteJson(n));
    }

    pinNote(noteId: string, pinned: boolean): Record<string, unknown> {
        const note = this.#notes.get(noteId);
        if (!note) throw new Error(`NOTE_NOT_FOUND: ${noteId}`);
        this.#notes.setPinned(noteId, pinned);
        return this.#toNoteJson({ ...note, pinned });
    }

    listPinnedNotes(bookId?: string): Array<Record<string, unknown>> {
        return this.#notes.listPinned(bookId).map(n => this.#toNoteJson(n));
    }

    // ============ Threads / Messages 操作 ============

    addThread(bookId: string, title?: string): Record<string, unknown> {
        const now = Date.now();
        const thread = {
            id: `thread_${now}_${Math.random().toString(36).slice(2, 8)}`,
            bookId,
            title: title ?? '新对话',
            createdAt: now,
            updatedAt: now,
        };
        this.#threads.create(thread);
        return this.#toThreadJson(thread);
    }

    listThreads(bookId: string): Array<Record<string, unknown>> {
        const threads = this.#threads.findByBookId(bookId);
        return threads.map(t => this.#toThreadJson(t));
    }

    addMessage(params: { threadId: string; role: string; content: string }): Record<string, unknown> {
        const now = Date.now();
        const message = {
            id: `msg_${now}_${Math.random().toString(36).slice(2, 8)}`,
            threadId: params.threadId,
            role: params.role,
            content: params.content,
            createdAt: now,
        };
        this.#messages.create(message);
        return this.#toMessageJson(message);
    }

    listMessages(threadId: string): Array<Record<string, unknown>> {
        const messages = this.#messages.findByThreadId(threadId);
        return messages.map(m => this.#toMessageJson(m));
    }

    // ============ Skills 操作 ============

    listSkills(): Array<Record<string, unknown>> {
        const skills = this.#skills.list();
        return skills.map(s => this.#toSkillJson(s));
    }

    addSkill(params: { id: string; manifestJson: string }): Record<string, unknown> {
        const now = Date.now();
        const skill = {
            id: params.id,
            name: params.id, // v1 简化：用 id 作为 name（后续从 manifest 解析）
            kind: 'prompt', // 需要从 manifestJson 解析
            access: 'full',
            source: 'user' as const,
            manifestJson: params.manifestJson,
            enabled: true,
            createdAt: now,
            updatedAt: now,
        };
        this.#skills.create(skill);

        // 注册到 CapabilityCatalog（解析 manifest → 提取 tools）
        try {
            const manifest = parseSkillManifest(params.manifestJson);
            this.#catalog.register(manifest);
        } catch {
            // manifest 解析失败不影响 skill 存储，仅 catalog 注册跳过
        }

        return this.#toSkillJson(skill);
    }

    runSkill(params: { skillId: string; bookId?: string; selectedText?: string; cfi?: string; args?: Record<string, unknown> }): Promise<Record<string, unknown>> {
        const ctx = {
            skillId: params.skillId,
            bookId: params.bookId,
            selectedText: params.selectedText,
            cfi: params.cfi,
            args: params.args,
        };

        // 从 catalog 获取 manifest
        const manifest = this.#catalog.resolve(params.skillId);
        if (!manifest) {
            return Promise.resolve({ ok: false, error: `SKILL_NOT_FOUND: ${params.skillId}` });
        }

        return this.#runtime.run(manifest, ctx).then(result => ({ ok: result.ok, data: result.data, error: result.error }));
    }

    // ============ TTS 操作 ============

    async synthesize(text: string, options?: { voice?: string; speed?: number }): Promise<Record<string, unknown>> {
        const result = await this.#ttsEngine.synthesize(text, options);
        return { audioPath: result.audioPath, duration: result.duration };
    }

    // ============ Review 操作（SuperMemo）============

    addReviewItem(params: { bookId: string; content: string; cardType?: string }): Record<string, unknown> {
        const now = Date.now();
        const item: ReviewItem = {
            id: `review_${now}_${Math.random().toString(36).slice(2, 8)}`,
            bookId: params.bookId,
            question: params.content,
            answer: '',
            dueDate: now + 86400000, // 1 天后
            intervalDays: 1,
            easeFactor: 2.5,
            lapses: 0,
            retrievalCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.#reviews.create(item);
        return this.#toReviewJson(item);
    }

    listDueReviews(): Array<Record<string, unknown>> {
        const items = this.#reviews.listDue(Date.now());
        return items.map(r => this.#toReviewJson(r));
    }

    listReviewItems(bookId: string): Array<Record<string, unknown>> {
        return this.#reviews.listByBook(bookId).map(r => this.#toReviewJson(r));
    }

    scheduleReview(reviewId: string, params: { quality: number; learningSteps?: number[] }): Record<string, unknown> {
        const item = this.#reviews.get(reviewId);
        if (!item) throw new Error(`REVIEW_NOT_FOUND: ${reviewId}`);

        const now = Date.now();
        const result = sm2Schedule({
            easeFactor: item.easeFactor,
            intervalDays: item.intervalDays,
            score: params.quality,
        }, now);

        this.#reviews.update(reviewId, {
            intervalDays: result.intervalDays,
            easeFactor: result.easeFactor,
            lapses: params.quality === 0 ? item.lapses + 1 : item.lapses,
            retrievalCount: item.retrievalCount + 1,
            dueDate: now + result.intervalDays * 86400000,
            lastReviewedAt: now,
            updatedAt: now,
        });

        const updated = this.#reviews.get(reviewId)!;
        return this.#toReviewJson(updated);
    }

    // ============ 关闭 ============

    close(): void {
        this.#db.close();
    }

    // ============ 序列化辅助（DB row → JSON-safe 对象）============

    #toBookJson(b: { id: string; filePath: string; format: string; title: string; author?: string; publisher?: string; language?: string; isbn?: string; description?: string; coverUrl?: string; publishDate?: string; rating: number | null; tags: unknown; progress: number; currentCfi: string | null; addedAt: number; lastOpenedAt?: number; updatedAt: number }): Record<string, unknown> {
        return {
            id: b.id, filePath: b.filePath, format: b.format, title: b.title,
            author: b.author ?? null, publisher: b.publisher ?? null, language: b.language ?? null,
            isbn: b.isbn ?? null, description: b.description ?? null, coverUrl: b.coverUrl ?? null,
            publishDate: b.publishDate ?? null, rating: b.rating,
            tags: b.tags, progress: b.progress, currentCfi: b.currentCfi ?? null,
            addedAt: b.addedAt, lastOpenedAt: b.lastOpenedAt ?? null, updatedAt: b.updatedAt,
        };
    }

    #toAnnotationJson(a: { id: string; bookId: string; cfi: string; text: string; contextBefore?: string; contextAfter?: string; color: string; style: string; type: string; createdAt: number; updatedAt: number }): Record<string, unknown> {
        return {
            id: a.id, bookId: a.bookId, cfi: a.cfi, text: a.text,
            contextBefore: a.contextBefore ?? null, contextAfter: a.contextAfter ?? null,
            color: a.color, style: a.style, type: a.type,
            createdAt: a.createdAt, updatedAt: a.updatedAt,
        };
    }

    #toNoteJson(n: { id: string; bookId: string; title: string; content: string; method?: string; pinned?: boolean; createdAt: number; updatedAt: number }): Record<string, unknown> {
        return { id: n.id, bookId: n.bookId, title: n.title, content: n.content, method: n.method ?? null, pinned: n.pinned ?? false, createdAt: n.createdAt, updatedAt: n.updatedAt };
    }

    #toThreadJson(t: { id: string; bookId: string; title?: string; createdAt: number; updatedAt: number }): Record<string, unknown> {
        return { id: t.id, bookId: t.bookId, title: t.title ?? null, createdAt: t.createdAt, updatedAt: t.updatedAt };
    }

    #toMessageJson(m: { id: string; threadId: string; role: string; content: string; createdAt: number }): Record<string, unknown> {
        return { id: m.id, threadId: m.threadId, role: m.role, content: m.content, createdAt: m.createdAt };
    }

    #toSkillJson(s: { id: string; name: string; kind: string; access: string; source: string; manifestJson: string; enabled: boolean; createdAt: number; updatedAt: number }): Record<string, unknown> {
        return { id: s.id, name: s.name, kind: s.kind, access: s.access, source: s.source, manifestJson: s.manifestJson, enabled: s.enabled, createdAt: s.createdAt, updatedAt: s.updatedAt };
    }

    #toReviewJson(r: ReviewItem): Record<string, unknown> {
        return {
            id: r.id, bookId: r.bookId,
            question: r.question, answer: r.answer,
            context: r.context ?? null,
            dueDate: r.dueDate, intervalDays: r.intervalDays, easeFactor: r.easeFactor,
            lapses: r.lapses, retrievalCount: r.retrievalCount,
            lastReviewedAt: r.lastReviewedAt ?? null,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
        };
    }
}
