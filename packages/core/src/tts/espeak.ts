// eSpeakNG 本地引擎（Phase 5）
// spawn espeak-ng CLI，文本作为命令行参数，WAV 从 stdout 收集

import { spawn } from 'node:child_process';
import type { Voice, AudioChunk, TTSEngine } from './types.js';

/** TTS 引擎类型化错误 */
export class TTSEngineError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(`${code}: ${message}`);
        this.code = code;
    }
}

/** 默认语速（wps） */
const DEFAULT_SPEED = 175;

/** synthesize 选项 */
export interface SynthesizeOpts {
    signal?: AbortSignal | undefined;
    speed?: number | undefined;
}

/**
 * eSpeakNG 本地 TTS 引擎。
 * v1：spawn espeak-ng，文本作为 CLI 参数，WAV 从 stdout 收集。
 */
export class EspeakEngine implements TTSEngine {
    readonly id = 'espeak-ng';
    readonly label = 'eSpeakNG（本地离线）';

    async voices(): Promise<Voice[]> {
        const raw = await this.#runCli(['--voices']);
        return this.#parseVoices(raw);
    }

    synthesize(text: string, voice?: string, opts?: SynthesizeOpts): AsyncIterable<AudioChunk> {
        const speed = opts?.speed ?? DEFAULT_SPEED;
        const signal = opts?.signal;

        return {
            [Symbol.asyncIterator]: () => this.#synthesizeIter(text, voice ?? 'cmn', speed, signal),
        };
    }

    // ============ 私有方法 ============

    /** spawn espeak-ng，收集 stdout 为 string */
    #runCli(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            let child;
            try {
                child = spawn('espeak-ng', args);
            } catch (e: unknown) {
                reject(new TTSEngineError('TTS_SPAWN_FAILED', e instanceof Error ? e.message : String(e)));
                return;
            }

            let output = '';
            child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });

            child.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'ENOENT') {
                    reject(new TTSEngineError('TTS_NOT_INSTALLED', 'espeak-ng 未安装。请执行: sudo apt install espeak-ng'));
                } else {
                    reject(new TTSEngineError('TTS_SPAWN_FAILED', err.message));
                }
            });

            child.on('close', (code: number) => {
                if (code === 0) resolve(output);
                else reject(new TTSEngineError('TTS_CLI_ERROR', `espeak-ng exit ${code}`));
            });
        });
    }

    /** 解析 --voices 表格输出为 Voice[] */
    #parseVoices(raw: string): Voice[] {
        const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('pitch') && !l.startsWith('---'));
        const voices: Voice[] = [];
        for (const line of lines) {
            // 格式: "    0   185    175 ng   cmn        Mandarin Chinese"
            const match = line.match(/^\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
            if (!match) continue;
            // espeak-ng --voices 列: pid, dph, rate, ngml, lang, name
            const lang = match[5];
            const name = match[6];
            if (lang === undefined || name === undefined) continue;
            voices.push({ id: lang, label: name.trim(), lang });
        }
        return voices;
    }

    /** 合成迭代器：spawn → stdout collect → yield WAV */
    #synthesizeIter(text: string, voice: string, speed: number, signal?: AbortSignal): AsyncIterator<AudioChunk> {
        let done = false;

        const iter: AsyncIterator<AudioChunk> = {
            next: (): Promise<IteratorResult<AudioChunk>> => {
                if (done) return Promise.resolve({ done: true, value: undefined });
                done = true;

                return new Promise<IteratorResult<AudioChunk>>((resolve, reject) => {
                    let child;
                    try {
                        const args = ['-v', voice, '-s', String(speed), '--stdout', '--', text];
                        child = spawn('espeak-ng', args);
                    } catch (e: unknown) {
                        reject(new TTSEngineError('TTS_SPAWN_FAILED', e instanceof Error ? e.message : String(e)));
                        return;
                    }

                    // abort 支持（含已 aborted 的竞态处理）
                    if (signal) {
                        if (signal.aborted) {
                            reject(new TTSEngineError('TTS_ABORTED', '合成已取消'));
                            return;
                        }
                        const onAbort = () => child.kill();
                        signal.addEventListener('abort', onAbort, { once: true });
                    }

                    // 收集 stdout（WAV bytes）
                    const chunks: Buffer[] = [];
                    child.stdout?.on('data', (c: Buffer) => { chunks.push(c); });

                    child.on('error', (err: NodeJS.ErrnoException) => {
                        if (err.code === 'ENOENT') {
                            reject(new TTSEngineError('TTS_NOT_INSTALLED', 'espeak-ng 未安装。请执行: sudo apt install espeak-ng'));
                        } else {
                            reject(new TTSEngineError('TTS_SPAWN_FAILED', err.message));
                        }
                    });

                    child.on('close', (code: number | null) => {
                        if (signal?.aborted || code === null) {
                            reject(new TTSEngineError('TTS_ABORTED', '合成已取消'));
                        } else if (code === 0 && chunks.length > 0) {
                            const wav = Buffer.concat(chunks);
                            resolve({ done: false, value: { data: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.length), format: 'wav' } });
                        } else if (code === 0) {
                            resolve({ done: true, value: undefined });
                        } else {
                            reject(new TTSEngineError('TTS_CLI_ERROR', `espeak-ng exit ${code}`));
                        }
                    });
                });
            },
            return: (): Promise<IteratorResult<AudioChunk>> => {
                done = true;
                return Promise.resolve({ done: true, value: undefined });
            },
        };

        return iter;
    }
}
