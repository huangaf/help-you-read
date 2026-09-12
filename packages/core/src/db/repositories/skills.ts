import type { SqliteDb } from '../sqlite.js';
import type { Skill } from '../types.js';

export class SkillsRepository {
    #db: SqliteDb;
    constructor(db: SqliteDb) { this.#db = db; }

    create(s: Skill): void {
        this.#db.prepare(
            `INSERT INTO skills (id, name, description, icon, kind, source, access, tools, enabled, manifest_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(s.id, s.name, s.description ?? null, s.icon ?? null, s.kind, s.source, s.access,
            s.tools !== undefined ? JSON.stringify(s.tools) : '[]',
            s.enabled ? 1 : 0,
            s.manifestJson ?? '{}',
            s.createdAt, s.updatedAt);
    }

    get(id: string): Skill | null {
        const row = this.#db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    update(id: string, partial: Partial<Skill>): void {
        const sets: string[] = []; const values: (string | number | null)[] = [];
        if (partial.name !== undefined) { sets.push('name = ?'); values.push(partial.name); }
        if (partial.description !== undefined) { sets.push('description = ?'); values.push(partial.description); }
        if (partial.icon !== undefined) { sets.push('icon = ?'); values.push(partial.icon); }
        if (partial.kind !== undefined) { sets.push('kind = ?'); values.push(partial.kind); }
        if (partial.source !== undefined) { sets.push('source = ?'); values.push(partial.source); }
        if (partial.access !== undefined) { sets.push('access = ?'); values.push(partial.access); }
        if (partial.tools !== undefined) { sets.push('tools = ?'); values.push(JSON.stringify(partial.tools)); }
        if (partial.enabled !== undefined) { sets.push('enabled = ?'); values.push(partial.enabled ? 1 : 0); }
        if (partial.manifestJson !== undefined) { sets.push('manifest_json = ?'); values.push(partial.manifestJson); }
        if (partial.updatedAt !== undefined) { sets.push('updated_at = ?'); values.push(partial.updatedAt); }
        if (!sets.length) return;
        this.#db.prepare(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    }

    delete(id: string): void { this.#db.prepare('DELETE FROM skills WHERE id = ?').run(id); }

    getByName(name: string): Skill | null {
        const row = this.#db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.#toEntity(row);
    }

    list(): Skill[] {
        const rows = this.#db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all() as Record<string, unknown>[];
        return rows.map(r => this.#toEntity(r));
    }

    #toEntity(row: Record<string, unknown>): Skill {
        return {
            id: row.id as string, name: row.name as string,
            description: (row.description as string) ?? undefined,
            icon: (row.icon as string) ?? undefined,
            kind: row.kind as string, source: row.source as string, access: row.access as string,
            tools: row.tools ? JSON.parse(row.tools as string) : [],
            enabled: (row.enabled as number | undefined) === 1,
            manifestJson: row.manifest_json ? (row.manifest_json as string) : '{}',
            createdAt: row.created_at as number, updatedAt: row.updated_at as number,
        };
    }
}
