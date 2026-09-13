// BookIndexer：书籍内容索引（chunk → embed → 写入 chunks + chunks_vec）
// RAG 前置：检索前须先索引，否则 HybridRetriever 恒返回空。

import type { SqliteDb } from '../db/sqlite.js';
import { loadVecExtension, ensureChunksVecTable } from '../db/vec.js';
import { TextChunker } from './chunker.js';
import type { ChunkerOptions } from './chunker.js';

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export interface IndexMeta {
    readonly modelKind?: string | undefined;
    readonly modelId?: string | undefined;
    readonly endpoint?: string | undefined;
}

const DEFAULT_CHUNKER: ChunkerOptions = { maxTokens: 500, overlap: 50 };

export class BookIndexer {
    #db: SqliteDb;
    #chunker: TextChunker;

    constructor(db: SqliteDb, chunkerOptions: ChunkerOptions = DEFAULT_CHUNKER) {
        this.#db = db;
        this.#chunker = new TextChunker(chunkerOptions);
        loadVecExtension(db);
    }

    async index(bookId: string, text: string, embed: EmbedFn, meta?: IndexMeta): Promise<number> {
        const chunks = this.#chunker.chunk(text);
        if (chunks.length === 0) return 0;

        const embeddings = await embed(chunks.map(c => c.content));
        const dimension = embeddings[0]?.length ?? 0;
        if (dimension === 0) throw new Error('INDEX_NO_EMBEDDING: embedding 为空');

        ensureChunksVecTable(this.#db, dimension);

        const now = Date.now();
        const existingIds = this.#db.prepare('SELECT id FROM chunks WHERE book_id = ?').all(bookId) as { id: string }[];
        const deleteVec = this.#db.prepare('DELETE FROM chunks_vec WHERE chunk_id = ?');
        for (const row of existingIds) deleteVec.run(row.id);
        this.#db.prepare('DELETE FROM chunks WHERE book_id = ?').run(bookId);

        const insertChunk = this.#db.prepare(
            'INSERT INTO chunks (id, book_id, content, token_count, embedding, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const insertVec = this.#db.prepare('INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, ?)');

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]!;
            const vec = embeddings[i];
            if (!vec || vec.length !== dimension) {
                throw new Error(`INDEX_DIM_MISMATCH: 第 ${i} 个 embedding 维度不一致（期望 ${dimension}，实际 ${vec?.length ?? 0}）`);
            }
            const id = `${bookId}#${i}`;
            const buffer = Buffer.from(new Float32Array(vec).buffer);
            insertChunk.run(id, bookId, chunk.content, chunk.tokenCount, buffer, now);
            insertVec.run(id, buffer);
        }

        this.#db.prepare(
            'INSERT OR REPLACE INTO vector_index_provenance (book_id, model_kind, model_id, endpoint, dimensions, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(bookId, meta?.modelKind ?? null, meta?.modelId ?? null, meta?.endpoint ?? null, dimension, now);

        return chunks.length;
    }
}
