import { describe, it, expect } from 'vitest';
import { parseSkillManifest } from '../manifest.js';
import type { SkillManifest } from '../types.js';

describe('ria_note preset', () => {
    it('S1: parseSkillManifest 解析成功（结构合法）', async () => {
        const { riaNote } = await import('./ria_note.js');
        const parsed: SkillManifest = parseSkillManifest(riaNote);
        expect(parsed.kind).toBe('agent');
        expect(parsed.access).toBe('write');
    });

    it('S2: tools 白名单包含 reader.getSelection + retrieval.search', async () => {
        const { riaNote } = await import('./ria_note.js');
        expect(riaNote.tools).toEqual(['reader.getSelection', 'retrieval.search']);
    });

    it('S3: description 包含 RIA 三段式指令（作为 agent system prompt）', async () => {
        const { riaNote } = await import('./ria_note.js');
        expect(riaNote.description).toContain('Read');
        expect(riaNote.description).toContain('Interpret');
        expect(riaNote.description).toContain('Appraise');
    });

    it('S4: id = ria_note, source = builtin', async () => {
        const { riaNote } = await import('./ria_note.js');
        expect(riaNote.id).toBe('ria_note');
        expect(riaNote.source).toBe('builtin');
    });

    it('S5: schemaVersion = 1', async () => {
        const { riaNote } = await import('./ria_note.js');
        expect(riaNote.schemaVersion).toBe(1);
    });

    it('S6: name/description 为中文（UI 展示用）', async () => {
        const { riaNote } = await import('./ria_note.js');
        expect(riaNote.name).toBe('RIA 便签');
    });
});
