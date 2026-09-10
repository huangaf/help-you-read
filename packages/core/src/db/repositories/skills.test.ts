import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { Skill } from '../types.js';
import { SkillsRepository } from './skills.js';

describe('SkillsRepository', () => {
    let db: Database;
    let repo: SkillsRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:' });
        migrateAll(db);
        repo = new SkillsRepository(db.mainDb);
    });

    function makeSkill(overrides: Partial<Skill> = {}): Skill {
        return { id: 's1', name: 'ria_note', kind: 'prompt', source: 'builtin', access: 'read', tools: ['db.query'], enabled: true, manifestJson: '{"schemaVersion":1}', createdAt: 1000, updatedAt: 1000, ...overrides };
    }

    it('create + get', () => {
        repo.create(makeSkill());
        const fetched = repo.get('s1');
        expect(fetched).not.toBeNull();
        expect(fetched!.name).toBe('ria_note');
        expect(fetched!.enabled).toBe(true);
    });

    it('get: 不存在 → null', () => { expect(repo.get('nope')).toBeNull(); });

    it('update 部分字段', () => {
        repo.create(makeSkill());
        repo.update('s1', { access: 'write' });
        expect(repo.get('s1')!.access).toBe('write');
    });

    it('delete', () => { repo.create(makeSkill()); repo.delete('s1'); expect(repo.get('s1')).toBeNull(); });

    it('getByName', () => {
        repo.create(makeSkill({ id: 's1', name: 'ria_note' }));
        repo.create(makeSkill({ id: 's2', name: 'supermemo' }));
        const fetched = repo.getByName('ria_note');
        expect(fetched).not.toBeNull();
        expect(fetched!.id).toBe('s1');
    });

    it('enabled 布尔转换（DB 存 0/1）', () => {
        repo.create(makeSkill({ enabled: false }));
        expect(repo.get('s1')!.enabled).toBe(false);
    });
});
