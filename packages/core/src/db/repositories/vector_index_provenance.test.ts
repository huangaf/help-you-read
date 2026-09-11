import { describe, it, expect, beforeEach } from 'vitest';
import { Database } from '../index.js';
import { migrateAll } from '../migrations.js';
import type { VectorIndexProvenance } from '../types.js';
import { ProvenanceRepository } from './vector_index_provenance.js';

function makeProvenance(overrides: Partial<VectorIndexProvenance> = {}): VectorIndexProvenance {
    return {
        bookId: 'b1',
        modelKind: 'local',
        modelId: 'Qwen3-Embedding-0.6B-8bit',
        dimensions: 1024,
        createdAt: 1000,
        ...overrides,
    };
}

describe('ProvenanceRepository', () => {
    let db: Database;
    let repo: ProvenanceRepository;

    beforeEach(() => {
        db = new Database({ mainDbPath: ':memory:', localDbPath: ':memory:' });
        migrateAll(db);
        db.mainDb.exec("INSERT INTO books(id, file_path, format, title, tags, progress, added_at, updated_at) VALUES ('b1', '/test.epub', 'epub', '测试书', '[]', 0, 1000, 1000)");
        repo = new ProvenanceRepository(db.localDb!);
    });

    it('create + get', () => {
        repo.create(makeProvenance());
        const fetched = repo.get('b1');
        expect(fetched).not.toBeNull();
        expect(fetched!.modelId).toBe('Qwen3-Embedding-0.6B-8bit');
        expect(fetched!.dimensions).toBe(1024);
    });

    it('get: 不存在 → null', () => {
        expect(repo.get('nope')).toBeNull();
    });

    it('upsert（同 bookId 覆盖）', () => {
        repo.create(makeProvenance({ modelId: 'old-model' }));
        repo.upsert(makeProvenance({ modelId: 'new-model', dimensions: 512 }));
        const fetched = repo.get('b1');
        expect(fetched!.modelId).toBe('new-model');
        expect(fetched!.dimensions).toBe(512);
    });

    it('delete', () => {
        repo.create(makeProvenance());
        repo.delete('b1');
        expect(repo.get('b1')).toBeNull();
    });

    it('getByBookId: 返回该书嵌入出处', () => {
        repo.create(makeProvenance({ bookId: 'b1' }));
        const result = repo.getByBookId('b1');
        expect(result).not.toBeNull();
        expect(result!.modelKind).toBe('local');
    });

    it('isStale: 模型变更判定', () => {
        repo.create(makeProvenance({ modelId: 'old-model' }));
        expect(repo.isStale('b1', { modelId: 'old-model' })).toBe(false);
        expect(repo.isStale('b1', { modelId: 'new-model' })).toBe(true);
    });
});
