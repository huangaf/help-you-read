import type { SqliteDb } from '../db/sqlite.js';
import type { RetrievalHit, SearchContext } from './types.js';

const RRF_K = 60;

export class HybridRetriever {
    #db: SqliteDb;

    constructor(db: SqliteDb) {
        this.#db = db;
    }

    async search(query: string, ctx: SearchContext, queryEmbedding?: number[]): Promise<RetrievalHit[]> {
        const ftsHits = this.#searchFts(query, ctx);
        const vecHits = queryEmbedding ? this.#searchVec(ctx, queryEmbedding) : [];

        if (ftsHits.length === 0 && vecHits.length === 0) return [];

        const fused = this.#rrfFuse(ftsHits, vecHits);
        return fused.slice(0, ctx.topK ?? 10);
    }

    #searchFts(query: string, ctx: SearchContext): { cfi: string; score: number }[] {
        try {
            const rows = this.#db.prepare(
                `SELECT id, content FROM chunks WHERE book_id = ? AND content LIKE ? ORDER BY length(content) ASC`
            ).all(ctx.bookId, `%${query}%`) as { id: string; content: string }[];

            return rows
                .map(r => ({ cfi: r.id, score: 1.0 }))
                .sort((a, b) => a.cfi.localeCompare(b.cfi));
        } catch {
            return [];
        }
    }

    #searchVec(ctx: SearchContext, queryEmbedding: number[]): { cfi: string; score: number }[] {
        try {
            const jsonVec = JSON.stringify(queryEmbedding);
            const rows = this.#db.prepare(
                `SELECT chunk_id, distance FROM chunks_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance`
            ).all(jsonVec, ctx.topK ?? 10) as { chunk_id: string; distance: number }[];

            return rows.map(r => ({ cfi: r.chunk_id, score: 1 / (r.distance + 1) }));
        } catch {
            return [];
        }
    }

    #rrfFuse(ftsHits: { cfi: string; score: number }[], vecHits: { cfi: string; score: number }[]): RetrievalHit[] {
        const scores = new Map<string, { score: number; sources: string[] }>();

        for (const [hits, source] of [[ftsHits, 'fts'], [vecHits, 'vector']] as const) {
            hits.sort((a, b) => b.score - a.score);
            hits.forEach((h, rank) => {
                const existing = scores.get(h.cfi);
                const rrfScore = 1 / (RRF_K + rank + 1);
                if (existing) {
                    existing.score += rrfScore;
                    if (!existing.sources.includes(source)) existing.sources.push(source);
                } else {
                    scores.set(h.cfi, { score: rrfScore, sources: [source] });
                }
            });
        }

        const results: RetrievalHit[] = [];
        for (const [cfi, data] of scores) {
            const text = this.#db.prepare('SELECT content FROM chunks WHERE id = ?').get(cfi) as { content: string } | undefined;
            results.push({
                cfi,
                text: text?.content ?? '',
                source: data.sources.length === 1 ? (data.sources[0]! as 'fts' | 'vector') : 'hybrid',
                score: data.score,
            });
        }

        results.sort((a, b) => b.score - a.score);
        return results;
    }
}
