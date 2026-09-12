import { describe, it, expect } from 'vitest';
import { sm2Schedule } from './sm2.js';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 8, 11); // 固定基准时间（2026-09-11）

describe('sm2Schedule', () => {
    // S1: Q=5（完美回忆）→ EF +1.0，interval 按新 EF 增长
    it('S1: score=5 → easeFactor +1.0, interval = round(interval × newEF)', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 5 }, NOW);
        expect(r.easeFactor).toBeCloseTo(3.5, 10); // 2.5 + 1.0
        expect(r.intervalDays).toBe(35);              // round(10 × 3.5)
        expect(r.dueDateMs).toBe(NOW + 35 * DAY_MS);
    });

    // S2: Q=0（完全忘记）→ lapse，interval 重置为 1，EF 下降（clamp to 1.3）
    it('S2: score=0 → lapse, intervalDays=1, EF 下降', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 0 }, NOW);
        expect(r.lapses).toBe(1);
        expect(r.intervalDays).toBe(1);                // lapse 重置
        expect(r.easeFactor).toBeCloseTo(1.3, 10);   // raw=0.375, clamped to EF_MIN
        expect(r.dueDateMs).toBe(NOW + DAY_MS);
    });

    // S3: EF 下限约束（不会低于 1.3）
    it('S3: EF 下限 = 1.3（多次 score=0 不跌破）', () => {
        let ef = 1.5;
        for (let i = 0; i < 3; i++) {
            const r = sm2Schedule({ easeFactor: ef, intervalDays: 1, score: 0 }, NOW);
            ef = r.easeFactor;
        }
        expect(ef).toBeGreaterThanOrEqual(1.3);
    });

    // S4: Q=3（刚好及格，首次成功）→ interval = 1
    it('S4: score=3, intervalDays=0 → intervalDays=1（首次成功）', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 0, score: 3 }, NOW);
        expect(r.lapses).toBe(0); // Q>=3 不算 lapse
        expect(r.intervalDays).toBe(1);
        expect(r.easeFactor).toBeCloseTo(2.5 + (1 - 1.25 * 2 * 3 / 9), 10);
        expect(r.dueDateMs).toBe(NOW + DAY_MS);
    });

    // S5: 多次复习后 interval 累积增长（Q=5 连续）
    it('S5: 连续 score=5 → interval 指数增长', () => {
        let ef = 2.5;
        let interval = 1;
        for (let i = 0; i < 3; i++) {
            const r = sm2Schedule({ easeFactor: ef, intervalDays: interval, score: 5 }, NOW);
            ef = r.easeFactor;
            interval = r.intervalDays;
        }
        // EF: 2.5→3.5→4.5→5.5
        // interval: 1→round(1×3.5)=4? 不对，应该用 max(1, round(interval*EF))
        // 第1次: interval=1, newEF=3.5, newInterval=max(1, round(1*3.5))=4
        // 第2次: interval=4, newEF=4.5, newInterval=max(1, round(4*4.5))=18
        // 第3次: interval=18, newEF=5.5, newInterval=max(1, round(18*5.5))=99
        expect(ef).toBeCloseTo(5.5, 10);
        expect(interval).toBe(99);
    });

    // S6: Q=1（勉强回忆）→ 非 lapse，EF 小幅下降
    it('S6: score=1 → EF 下降但不算 lapse', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 1 }, NOW);
        expect(r.lapses).toBe(0); // Q>=1 不算 lapse（只有 Q=0 算）
        expect(r.easeFactor).toBeCloseTo(2.5 + (1 - 1.25 * 4 * 3 / 7), 10);
        expect(r.intervalDays).toBe(1); // Q<3 → interval 重置为 1
    });

    // S7: 自定义 nowMs → dueDate 正确偏移
    it('S7: 传入自定义 nowMs → dueDate = now + interval×DAY_MS', () => {
        const customNow = Date.UTC(2026, 10, 1); // 2026-11-01
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 7, score: 4 }, customNow);
        expect(r.dueDateMs).toBe(customNow + r.intervalDays * DAY_MS);
    });

    // S8: retrievalCount 递增
    it('S8: 每次复习 retrievalCount +1', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 4, retrievalCount: 3 }, NOW);
        expect(r.retrievalCount).toBe(4);
    });

    // S9: Q=2（困难回忆）→ 非 lapse，EF 小幅下降
    it('S9: score=2 → EF 下降但不算 lapse', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 2 }, NOW);
        expect(r.lapses).toBe(0); // Q>=1 不算 lapse（只有 Q=0 算）
        expect(r.easeFactor).toBeCloseTo(2.5 + (1 - 1.25 * 3 * 3 / 8), 10);
        expect(r.intervalDays).toBe(1); // Q<3 → interval 重置为 1
    });

    // S10: score=4 → EF +0.625, interval = round(interval × newEF)
    it('S10: score=4 → EF +0.625, interval 增长', () => {
        const r = sm2Schedule({ easeFactor: 2.5, intervalDays: 10, score: 4 }, NOW);
        expect(r.easeFactor).toBeCloseTo(3.125, 10); // 2.5 + 0.625
        expect(r.intervalDays).toBe(31);                // round(10 × 3.125)
        expect(r.lapses).toBe(0);
    });
});
