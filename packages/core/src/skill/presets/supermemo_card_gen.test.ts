import { describe, it, expect } from 'vitest';
import { parseSkillManifest } from '../manifest.js';
import type { SkillManifest } from '../types.js';

describe('supermemo_card_gen preset', () => {
    it('S1: parseSkillManifest 解析成功（结构合法）', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        const parsed: SkillManifest = parseSkillManifest(supermemoCardGen);
        expect(parsed.kind).toBe('agent');
        expect(parsed.access).toBe('write');
    });

    it('S2: tools 白名单包含 reader.getSelection + retrieval.search', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.tools).toEqual(['reader.getSelection', 'retrieval.search']);
    });

    it('S3: description 包含卡片生成指令（question/answer/context）', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.description).toContain('question');
        expect(supermemoCardGen.description).toContain('answer');
        expect(supermemoCardGen.description).toContain('context');
    });

    it('S4: id = supermemo_card_gen, source = builtin', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.id).toBe('supermemo_card_gen');
        expect(supermemoCardGen.source).toBe('builtin');
    });

    it('S5: schemaVersion = 1', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.schemaVersion).toBe(1);
    });

    it('S6: name 为中文（UI 展示用）', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.name).toBe('复习卡生成');
    });

    it('S7: description 指导 AI 输出严格 JSON（不附加解释文字）', async () => {
        const { supermemoCardGen } = await import('./supermemo_card_gen.js');
        expect(supermemoCardGen.description).toContain('JSON');
    });
});
