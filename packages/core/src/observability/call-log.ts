// CallLogger：AI/skill/TTS 调用可观测（local.db call_log 表）
// local-first：日志存 local.db（不同步），供性能/成本分析查询

import type { SqliteDb } from '../db/sqlite.js';

export type CallCategory = 'ai_chat' | 'ai_embed' | 'skill_run' | 'tts';

export interface CallLogEntry {
    readonly category: CallCategory;
    readonly method: string;
    readonly durationMs: number;
    readonly inputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
    readonly outcome: string;
    readonly detail?: Record<string, unknown> | undefined;
}

export interface CallLogRow extends CallLogEntry {
    readonly id: string;
    readonly ts: number;
}

export interface CallLogQuery {
    readonly category?: CallCategory | undefined;
    readonly method?: string | undefined;
    readonly sinceTs?: number | undefined;
    readonly limit?: number | undefined;
}

export class CallLogger {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    log(entry: CallLogEntry): void {
        const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this.#db.prepare(
            'INSERT OR IGNORE INTO call_log (id, ts, category, method, duration_ms, input_tokens, output_tokens, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            id,
            Date.now(),
            entry.category,
            entry.method,
            entry.durationMs,
            entry.inputTokens ?? 0,
            entry.outputTokens ?? 0,
            entry.outcome,
            JSON.stringify(entry.detail ?? {}),
        );
    }

    query(filters?: CallLogQuery): CallLogRow[] {
        const where: string[] = [];
        const values: (string | number)[] = [];
        if (filters?.category !== undefined) { where.push('category = ?'); values.push(filters.category); }
        if (filters?.method !== undefined) { where.push('method = ?'); values.push(filters.method); }
        if (filters?.sinceTs !== undefined) { where.push('ts >= ?'); values.push(filters.sinceTs); }

        const sql = `SELECT * FROM call_log${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ts DESC LIMIT ?`;
        values.push(filters?.limit ?? 100);

        const rows = this.#db.prepare(sql).all(...values) as Record<string, unknown>[];
        return rows.map(r => ({
            id: r.id as string,
            ts: r.ts as number,
            category: r.category as CallCategory,
            method: r.method as string,
            durationMs: r.duration_ms as number,
            inputTokens: (r.input_tokens as number) ?? 0,
            outputTokens: (r.output_tokens as number) ?? 0,
            outcome: r.outcome as string,
            detail: r.detail ? (JSON.parse(r.detail as string) as Record<string, unknown>) : undefined,
        }));
    }
}
