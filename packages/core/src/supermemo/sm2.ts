/**
 * SM-2 间隔复习算法（SuperMemo-2）
 * v1 调度引擎：纯函数，零外部依赖。
 */

const DAY_MS = 86_400_000;
const EF_MIN = 1.3;

export interface SM2Input {
    easeFactor: number;
    intervalDays: number;
    score: number;
    retrievalCount?: number | undefined;
}

export interface SM2Result {
    easeFactor: number;
    intervalDays: number;
    dueDateMs: number;
    lapses: number;
    retrievalCount: number;
}

export function sm2Schedule(input: SM2Input, nowMs?: number): SM2Result {
    const score = input.score;

    // EF 更新公式：EF' = EF + (1.00 - 1.25 * (5-Q) * (3/(6+Q)))
    const efDelta = 1.0 - 1.25 * (5 - score) * (3 / (6 + score));
    let ef = input.easeFactor + efDelta;

    // EF 下限约束（SuperMemo 标准）
    if (ef < EF_MIN) ef = EF_MIN;

    let intervalDays: number;
    let lapses = 0;

    if (score >= 3) {
        // 成功回忆：间隔按新 EF 增长
        intervalDays = Math.max(1, Math.round(input.intervalDays * ef));
    } else {
        // 回忆失败（Q=0,1,2）：间隔重置为 1
        intervalDays = 1;
        // Q=0 算 lapse（完全忘记）
        if (score === 0) lapses = 1;
    }

    const retrievalCount = (input.retrievalCount ?? 0) + 1;
    const dueDateMs = (nowMs ?? Date.now()) + intervalDays * DAY_MS;

    return { easeFactor: ef, intervalDays, dueDateMs, lapses, retrievalCount };
}
