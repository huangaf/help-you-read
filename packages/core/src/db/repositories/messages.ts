import type { SqliteDb } from '../sqlite.js';
import type { Message } from '../types.js';

export class MessagesRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(m: Message): void {
        this.#db.prepare(
            `INSERT INTO messages (id, thread_id, role, content, citations, tool_calls, reasoning, parts_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(m.id, m.threadId, m.role, m.content, JSON.stringify(m.citations), JSON.stringify(m.toolCalls), m.reasoning ?? null, m.partsOrder, m.createdAt);
    }

    get(id: string): Message | null {
        const row = this.#db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Message>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.threadId !== undefined) { sets.push('thread_id = ?'); values.push(partial.threadId); }
        if (partial.role !== undefined) { sets.push('role = ?'); values.push(partial.role); }
        if (partial.content !== undefined) { sets.push('content = ?'); values.push(partial.content); }
        if (partial.citations !== undefined) { sets.push('citations = ?'); values.push(JSON.stringify(partial.citations)); }
        if (partial.toolCalls !== undefined) { sets.push('tool_calls = ?'); values.push(JSON.stringify(partial.toolCalls)); }
        if (partial.reasoning !== undefined) { sets.push('reasoning = ?'); values.push(partial.reasoning); }
        if (partial.partsOrder !== undefined) { sets.push('parts_order = ?'); values.push(partial.partsOrder); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM messages WHERE id = ?').run(id); }

    findByThreadId(threadId: string): Message[] {
        const rows = this.#db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY parts_order').all(threadId) as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): Message {
        return {
            id: row.id as string, threadId: row.thread_id as string,
            role: row.role as string, content: row.content as string,
            citations: JSON.parse(row.citations as string),
            toolCalls: JSON.parse(row.tool_calls as string),
            reasoning: (row.reasoning as string) ?? undefined,
            partsOrder: row.parts_order as number,
            createdAt: row.created_at as number,
        };
    }
}
