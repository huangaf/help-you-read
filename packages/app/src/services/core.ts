// React HTTP 客户端 — 封装 /api/core 调用（浏览器侧）
// 所有 Node.js 依赖操作（DB、Skill、TTS）通过此客户端调用 Vite dev server 的 /api/core 端点
// Engine 和 AI chat 可浏览器直接执行，无需经过此客户端

/** API 响应信封（与 vite-plugin-core.ts 的 dispatchMethod 对应） */
interface ApiResponse<T> {
    ok: boolean;
    data?: T;
    error?: string;
}

/** 流式对话增量块（SSE wire DTO，与 @hyr/core 的 ChatStreamChunk 结构对齐） */
interface ChatStreamChunk {
    delta: string;
    final?: boolean;
    usage?: { promptTokens: number; completionTokens: number };
    citations?: unknown[];
}

/** Core API 客户端 — React 组件通过此类调用后端服务 */
export class CoreClient {
    /**
     * 通用调用方法：POST /api/core，解析响应信封
     */
    async #call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
        const res = await fetch('/api/core', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, params }),
        });

        if (!res.ok) {
            throw new Error(`Core API HTTP 错误: ${res.status} ${res.statusText}`);
        }

        const json = (await res.json()) as ApiResponse<T>;

        if (!json.ok) {
            throw new Error(`Core API 业务错误: ${json.error}`);
        }

        return json.data as T;
    }

    // ============ Books 操作 ============

    importBook(filePath: string): Promise<Record<string, unknown>> {
        return this.#call('importBook', { filePath });
    }

    listBooks(): Promise<Array<Record<string, unknown>>> {
        return this.#call('listBooks');
    }

    getBook(bookId: string): Promise<Record<string, unknown> | null> {
        return this.#call('getBook', { bookId });
    }

    deleteBook(bookId: string): Promise<null> {
        return this.#call('deleteBook', { bookId });
    }

    updateBookProgress(bookId: string, progress: number, currentCfi?: string): Promise<null> {
        return this.#call('updateBookProgress', { bookId, progress, currentCfi });
    }

    // ============ Annotations 操作 ============

    addAnnotation(params: {
        bookId: string; cfi: string; text: string;
        contextBefore?: string; contextAfter?: string;
        color?: string; style?: string; type?: string;
    }): Promise<Record<string, unknown>> {
        return this.#call('addAnnotation', params as unknown as Record<string, unknown>);
    }

    listAnnotations(bookId: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listAnnotations', { bookId });
    }

    updateAnnotation(annotationId: string, partial: Record<string, unknown>): Promise<null> {
        return this.#call('updateAnnotation', { annotationId, partial });
    }

    deleteAnnotation(annotationId: string): Promise<null> {
        return this.#call('deleteAnnotation', { annotationId });
    }

    // ============ Notes 操作 ============

    addNote(params: { bookId: string; title: string; content: string; method?: string; pinned?: boolean }): Promise<Record<string, unknown>> {
        return this.#call('addNote', params as unknown as Record<string, unknown>);
    }

    listNotes(bookId: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listNotes', { bookId });
    }

    pinNote(noteId: string, pinned: boolean): Promise<Record<string, unknown>> {
        return this.#call('pinNote', { noteId, pinned });
    }

    listPinnedNotes(bookId?: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listPinnedNotes', bookId === undefined ? {} : { bookId });
    }

    // ============ Threads / Messages 操作 ============

    addThread(bookId: string, title?: string): Promise<Record<string, unknown>> {
        return this.#call('addThread', { bookId, title });
    }

    listThreads(bookId: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listThreads', { bookId });
    }

    addMessage(params: { threadId: string; role: string; content: string }): Promise<Record<string, unknown>> {
        return this.#call('addMessage', params as unknown as Record<string, unknown>);
    }

    listMessages(threadId: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listMessages', { threadId });
    }

    // ============ Skills 操作 ============

    listSkills(): Promise<Array<Record<string, unknown>>> {
        return this.#call('listSkills');
    }

    addSkill(params: { id: string; manifestJson: string }): Promise<Record<string, unknown>> {
        return this.#call('addSkill', params as unknown as Record<string, unknown>);
    }

    runSkill(params: { skillId: string; bookId?: string; selectedText?: string; cfi?: string; args?: Record<string, unknown> }): Promise<Record<string, unknown>> {
        return this.#call('runSkill', params as unknown as Record<string, unknown>);
    }

    // ============ TTS 操作 ============

    synthesize(text: string, options?: { voice?: string; speed?: number }): Promise<Record<string, unknown>> {
        return this.#call('synthesize', { text, options });
    }

    // ============ Review 操作（SuperMemo）============

    addReviewItem(params: { bookId: string; content: string; cardType?: string }): Promise<Record<string, unknown>> {
        return this.#call('addReviewItem', params as unknown as Record<string, unknown>);
    }

    listDueReviews(): Promise<Array<Record<string, unknown>>> {
        return this.#call('listDueReviews');
    }

    listReviewItems(bookId: string): Promise<Array<Record<string, unknown>>> {
        return this.#call('listReviewItems', { bookId });
    }

    scheduleReview(reviewId: string, params: { quality: number; learningSteps?: number[] }): Promise<Record<string, unknown>> {
        return this.#call('scheduleReview', { reviewId, params });
    }

    // ============ AI 对话（流式 SSE）============

    async *chatStream(params: { threadId: string; bookId: string; userContent: string }): AsyncGenerator<ChatStreamChunk> {
        const res = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });

        if (!res.ok) {
            throw new Error(`Chat stream HTTP 错误: ${res.status} ${res.statusText}`);
        }
        const body = res.body;
        if (!body) throw new Error('Chat stream 缺少响应体');

        const reader = body.getReader();
        const decoder = new TextDecoder('utf-8');
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
                    const payload = extractSseData(frame);
                    if (payload === undefined) continue;
                    if (payload === '[DONE]') return;

                    const parsed: unknown = JSON.parse(payload);
                    if (isErrorFrame(parsed)) {
                        throw new Error(`Chat stream 业务错误: ${parsed.error}`);
                    }
                    yield parsed as ChatStreamChunk;
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // ============ 关闭（仅 Tauri 退出时调用）============

    close(): void {
        // v1: CoreService.close() 由 Vite plugin buildEnd 自动调用，此处无需操作
    }
}

/** 从 SSE 帧中提取 data: 负载（浏览器侧，与 core providers 的解析保持同构） */
function extractSseData(frame: string): string | undefined {
    for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) return line.slice(5).trim();
    }
    return undefined;
}

function isErrorFrame(raw: unknown): raw is { error: string } {
    return typeof raw === 'object' && raw !== null
        && typeof (raw as Record<string, unknown>).error === 'string';
}
