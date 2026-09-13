import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../db/index.js';
import { migrateAll } from '../db/migrations.js';
import { CallLogger } from './call-log.js';

describe('CallLogger', () => {
    let db: Database;
    let logger: CallLogger;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:', localDbPath: ':memory:' });
        migrateAll(db);
        logger = new CallLogger(db.localDb!);
    });

    it('log(): 写入调用记录，query 可读回', () => {
        logger.log({ category: 'ai_chat', method: 'chat', durationMs: 1234, inputTokens: 10, outputTokens: 20, outcome: 'success' });
        const rows = logger.query();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.category).toBe('ai_chat');
        expect(rows[0]!.durationMs).toBe(1234);
        expect(rows[0]!.inputTokens).toBe(10);
        expect(rows[0]!.outcome).toBe('success');
    });

    it('query(): 按 category 过滤', () => {
        logger.log({ category: 'ai_chat', method: 'chat', durationMs: 1, outcome: 'success' });
        logger.log({ category: 'tts', method: 'synthesize', durationMs: 2, outcome: 'success' });
        const chat = logger.query({ category: 'ai_chat' });
        expect(chat).toHaveLength(1);
        expect(chat[0]!.category).toBe('ai_chat');
    });

    it('log(): 失败结果带 error code + detail', () => {
        logger.log({ category: 'skill_run', method: 'ria_note', durationMs: 5, outcome: 'API_ERROR_429', detail: { message: 'rate limited' } });
        const rows = logger.query({ category: 'skill_run' });
        expect(rows[0]!.outcome).toBe('API_ERROR_429');
        expect(rows[0]!.detail?.message).toBe('rate limited');
    });
});
