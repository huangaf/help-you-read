// eSpeakNG 本地引擎 — TDD 测试（Phase 5）

import { describe, it, expect, vi } from 'vitest';
import type { AudioChunk } from './types.js';

// mock node:child_process（ESM 兼容，vi.hoisted 确保 factory 执行前初始化）
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as [string, string[], unknown])),
}));

import { EspeakEngine, TTSEngineError } from './espeak.js';

// 辅助：构造 mock spawn 返回值（模拟 child_process 子进程）
function mockChildProcess(opts: { stdoutData?: string; exitCode?: number; error?: Error }): void {
  const { Readable } = require('stream');
  mockSpawn.mockImplementation((_cmd: string, _args?: string[]) => {
    const stream = new Readable({ read() {} });
    if (opts.stdoutData) {
      process.nextTick(() => { stream.push(opts.stdoutData); });
    }
    process.nextTick(() => { stream.push(null); });

    const child = {
      stdout: stream,
      stdin: { write: (_d: string) => {}, end: () => {} },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'close') {
          stream.on('end', () => handler(opts.exitCode ?? 0));
        } else if (event === 'error') {
          if (opts.error) process.nextTick(() => handler(opts.error));
        } else {
          // 'data' 等事件由 stream 自身处理
        }
        return child;
      },
      kill: () => { stream.destroy(); },
    };
    return child;
  });
}

describe('tts/espeak', () => {
  it('S1: synthesize() 正确传递 CLI 参数（voice, speed）', async () => {
    const capturedArgs: string[] = [];
    mockSpawn.mockImplementation((cmd: string, args: string[]) => {
      capturedArgs.push(...args);
      const { Readable } = require('stream');
      const stream = new Readable({ read() {} });
      process.nextTick(() => { stream.push(null); });
      const child = {
        stdout: stream,
        stdin: { write: (_d: string) => {}, end: () => {} },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') stream.on('end', () => handler(0));
          return child;
        },
        kill: () => { stream.destroy(); },
      };
      return child;
    });

    const engine = new EspeakEngine();
    // 迭代（不关心数据，只验证参数）
    for await (const _ of engine.synthesize('你好', 'cmn', { speed: 200 })) {
      // 验证参数传递
      expect(capturedArgs).toContain('-v');
      const vIdx = capturedArgs.indexOf('-v');
      expect(capturedArgs[vIdx + 1]).toBe('cmn');
      const sIdx = capturedArgs.indexOf('-s');
      expect(capturedArgs[sIdx + 1]).toBe('200');
    }
  });

  it('S2: voices() 解析 espeak-ng --voices 输出', async () => {
    const fakeVoicesOutput = [
      'pitch   dph   rate  ngml  lang       name',
      '------- ---- ---- ---- ---------- --------------------------',
      '    0   185    175 ng   cmn        Mandarin Chinese',
      '    0   185    175 ng   yue        Cantonese',
      '    0   185    175 ng   en         English (US)',
    ].join('\n');

    mockChildProcess({ stdoutData: fakeVoicesOutput });
    const engine = new EspeakEngine();
    const voices = await engine.voices();
    expect(voices).toHaveLength(3);
    expect(voices[0]?.id).toBe('cmn');
    expect(voices[0]?.label).toBe('Mandarin Chinese');
    expect(voices[1]?.id).toBe('yue');
  });

  it('S3: 引擎未安装 → 抛出 TTSEngineError（不崩溃）', async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn espeak-ng ENOENT');
    });

    const engine = new EspeakEngine();
    await expect(engine.voices()).rejects.toThrow(TTSEngineError);
  });

  it('S4: synthesize() 返回 AudioChunk format=wav', async () => {
    const fakeWav = Buffer.from([1, 2, 3, 4]);
    mockChildProcess({ stdoutData: fakeWav.toString('binary') });

    const engine = new EspeakEngine();
    const chunks: AudioChunk[] = [];
    for await (const chunk of engine.synthesize('测试文本')) {
      chunks.push(chunk);
    }
    expect(chunks[0]?.format).toBe('wav');
  });

  it('S5: synthesize() 支持 AbortSignal 取消', async () => {
    const controller = new AbortController();
    const { Readable } = require('stream');

    let closeHandler: ((code: number | null) => void) | undefined;

    mockSpawn.mockImplementation((_cmd: string, _args?: string[]) => {
      const stream = new Readable({ read() {} });

      const child = {
        stdout: stream,
        stdin: { write: (_d: string) => {}, end: () => {} },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'close') {
            closeHandler = handler as (code: number | null) => void;
            stream.on('end', () => closeHandler!(0));
          }
          return child;
        },
        kill: () => { if (closeHandler) closeHandler(null); },
      };
      return child;
    });

    const engine = new EspeakEngine();
    const iterator = engine.synthesize('长文本', 'cmn', { signal: controller.signal });
    const iter = iterator[Symbol.asyncIterator]();

    // 在第一个 chunk 到来前取消
    controller.abort();
    await expect(iter.next()).rejects.toThrow(TTSEngineError);
  });
});
