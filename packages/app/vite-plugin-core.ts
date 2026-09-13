// Vite 插件：在 dev server 中注册 POST /api/core 端点，分发到 CoreService 方法
// 浏览器不可直接 import @hyr/core（依赖 node:sqlite / child_process），通过此插件桥接

import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CoreService, type CoreServiceOptions } from './core-service.js';

/** 中间件函数签名（Connect 风格，避免依赖 connect 包） */
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void> | void;

/**
 * 创建 core API 插件。
 * 在 Vite dev server 启动时初始化 CoreService，注册 POST /api/core 中间件。
 *
 * @param options - CoreService 构造选项（dataDir + aiConfig）
 */
export function coreApiPlugin(options: CoreServiceOptions): Plugin {
    let service: CoreService | null = null;

    return {
        name: 'hyr-core-api',

        configureServer(server) {
            // 懒初始化 CoreService（首次请求时创建，避免 dev server 启动阻塞）
            const getService = (): CoreService => {
                if (!service) {
                    service = new CoreService(options);
                    console.log(`[hyr-core-api] CoreService 已初始化 (dataDir: ${options.dataDir})`);
                }
                return service;
            };

            // 注册 POST /api/core 中间件（仅拦截该路径）
            const middleware: Middleware = async (req, res) => {
                // 解析请求体: { method, params }
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk as Buffer);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
                    method: string;
                    params?: unknown;
                };

                try {
                    const svc = getService();
                    const { method, params } = body;

                    // 分派到 CoreService 对应方法
                    const result = await dispatchMethod(svc, method, params);

                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ ok: true, data: result }));
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 200; // 业务错误仍返回 200，通过 ok=false 传递
                    res.end(JSON.stringify({ ok: false, error: message }));
                }
            };

            server.middlewares.use('/api/core', middleware);

            // 注册 POST /api/chat/stream 中间件（SSE 流式对话；独立于 /api/core）
            const chatStreamMiddleware: Middleware = async (req, res) => {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk as Buffer);
                }
                const params = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as {
                    threadId: string;
                    bookId: string;
                    userContent: string;
                };

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                try {
                    const svc = getService();
                    for await (const chunk of svc.chatStream(params)) {
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                    res.write('data: [DONE]\n\n');
                    res.end();
                } catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
                    res.end();
                }
            };

            server.middlewares.use('/api/chat/stream', chatStreamMiddleware);
        },

        // dev server 关闭时清理 CoreService（释放 SQLite 连接）
        close: () => {
            service?.close();
            service = null;
        },
    };
}

/**
 * 方法分派表：将 HTTP method 字符串映射到 CoreService 方法调用
 */
async function dispatchMethod(
    svc: CoreService,
    method: string,
    params: unknown
): Promise<unknown> {
    const p = (params ?? {}) as Record<string, unknown>;

    switch (method) {
        // Books
        case 'importBook': return svc.importBook(p.filePath as string);
        case 'listBooks': return svc.listBooks();
        case 'getBook': return svc.getBook(p.bookId as string);
        case 'deleteBook': svc.deleteBook(p.bookId as string); return null;
        case 'updateBookProgress':
            svc.updateBookProgress(p.bookId as string, p.progress as number, p.currentCfi as string | undefined);
            return null;

        // Annotations
        case 'addAnnotation': return svc.addAnnotation(p as Parameters<typeof svc.addAnnotation>[0]);
        case 'listAnnotations': return svc.listAnnotations(p.bookId as string);
        case 'updateAnnotation':
            svc.updateAnnotation(p.annotationId as string, p.partial as Record<string, unknown>);
            return null;
        case 'deleteAnnotation': svc.deleteAnnotation(p.annotationId as string); return null;

        // Notes
        case 'addNote': return svc.addNote(p as Parameters<typeof svc.addNote>[0]);
        case 'listNotes': return svc.listNotes(p.bookId as string);
        case 'pinNote': return svc.pinNote(p.noteId as string, p.pinned as boolean);
        case 'listPinnedNotes': return svc.listPinnedNotes(p.bookId as string | undefined);

        // Threads / Messages
        case 'addThread': return svc.addThread(p.bookId as string, p.title as string | undefined);
        case 'listThreads': return svc.listThreads(p.bookId as string);
        case 'addMessage': return svc.addMessage(p as Parameters<typeof svc.addMessage>[0]);
        case 'listMessages': return svc.listMessages(p.threadId as string);

        // Skills
        case 'listSkills': return svc.listSkills();
        case 'addSkill': return svc.addSkill(p as Parameters<typeof svc.addSkill>[0]);
        case 'runSkill': return await svc.runSkill(p as Parameters<typeof svc.runSkill>[0]);

        // TTS
        case 'synthesize': return await svc.synthesize(p.text as string, p.options as { voice?: string; speed?: number } | undefined);

        // Review (SuperMemo)
        case 'addReviewItem': return svc.addReviewItem(p as Parameters<typeof svc.addReviewItem>[0]);
        case 'listDueReviews': return svc.listDueReviews();
        case 'listReviewItems': return svc.listReviewItems(p.bookId as string);
        case 'scheduleReview': return svc.scheduleReview(p.reviewId as string, p as { quality: number; learningSteps?: number[] });

        // AI 对话 / RAG 索引
        case 'chat': return await svc.chat(p as Parameters<typeof svc.chat>[0]);
        case 'indexBook': return await svc.indexBook(p as Parameters<typeof svc.indexBook>[0]);

        default:
            throw new Error(`UNKNOWN_METHOD: 未知方法 "${method}"`);
    }
}
