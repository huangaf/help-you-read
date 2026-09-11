// SkillManifest 校验 — TDD 测试（Phase 4）

import { describe, it, expect } from 'vitest';
import { parseSkillManifest, SkillManifestError } from './manifest.js';

describe('skill/manifest', () => {
  it('S1: 合法完整 manifest → 解析成功', () => {
    const raw = {
      schemaVersion: 1,
      id: 'ria_note',
      kind: 'prompt',
      source: 'builtin',
      name: 'RIA 便签',
      description: '生成 R-I-A 三层笔记',
      access: 'read',
      tools: ['reader.getSelection'],
      prompt: { inline: '请基于 {{selectedText}} 生成 R/I/A' },
    };
    const result = parseSkillManifest(raw);
    expect(result.id).toBe('ria_note');
    expect(result.kind).toBe('prompt');
    expect(result.access).toBe('read');
    expect(result.tools).toEqual(['reader.getSelection']);
  });

  it('S2: 缺少必填字段 id → 抛 SkillManifestError', () => {
    const raw = {
      schemaVersion: 1,
      // 缺少 id
      kind: 'prompt',
      source: 'builtin',
      name: '测试',
      description: '描述',
      access: 'none',
      tools: [],
    };
    expect(() => parseSkillManifest(raw)).toThrow(SkillManifestError);
  });

  it('S3: 非法 kind 值 → 抛 SkillManifestError', () => {
    const raw = {
      schemaVersion: 1,
      id: 'test_skill',
      kind: 'invalid_kind', // 不合法
      source: 'builtin',
      name: '测试',
      description: '描述',
      access: 'none',
      tools: [],
    };
    expect(() => parseSkillManifest(raw)).toThrow(SkillManifestError);
  });

  it('S4: 非法 access 值 → 抛 SkillManifestError', () => {
    const raw = {
      schemaVersion: 1,
      id: 'test_skill',
      kind: 'prompt',
      source: 'builtin',
      name: '测试',
      description: '描述',
      access: 'superadmin', // 不合法
      tools: [],
    };
    expect(() => parseSkillManifest(raw)).toThrow(SkillManifestError);
  });

  it('S5: kind=script 需包含 script 配置', () => {
    const raw = {
      schemaVersion: 1,
      id: 'script_skill',
      kind: 'script',
      source: 'builtin',
      name: '脚本技能',
      description: '通过 Node 执行',
      access: 'full',
      tools: [],
      // 缺少 script 配置
    };
    expect(() => parseSkillManifest(raw)).toThrow(SkillManifestError);
  });

  it('S6: kind=prompt 需包含 prompt 配置（inline 或 path）', () => {
    const raw = {
      schemaVersion: 1,
      id: 'prompt_skill',
      kind: 'prompt',
      source: 'builtin',
      name: '提示技能',
      description: '通过 AI 生成',
      access: 'read',
      tools: [],
      // 缺少 prompt 配置
    };
    expect(() => parseSkillManifest(raw)).toThrow(SkillManifestError);
  });

  it('S7: tools 含非法工具名（不在 catalog）→ 警告但不阻断', () => {
    // 注意：S7 是运行时 catalog 检查，不是 manifest 校验层面
    // manifest 层只验证 tools 是 string[]
    const raw = {
      schemaVersion: 1,
      id: 'test_skill',
      kind: 'agent',
      source: 'user',
      name: '测试',
      description: '描述',
      access: 'write',
      tools: ['nonexistent_tool'],
    };
    // agent 不需要 prompt/script 配置，解析应成功
    const result = parseSkillManifest(raw);
    expect(result.tools).toEqual(['nonexistent_tool']);
  });

  it('S8: 非对象输入 → 抛 SkillManifestError', () => {
    expect(() => parseSkillManifest('not_an_object')).toThrow(SkillManifestError);
  });

  it('S9: 从 JSON string 解析（DB manifestJson 字段）', () => {
    const json = JSON.stringify({
      schemaVersion: 1,
      id: 'db_skill',
      kind: 'prompt',
      source: 'builtin',
      name: 'DB 技能',
      description: '从数据库读取的 manifest',
      access: 'read',
      tools: ['reader.getSelection'],
      prompt: { inline: '{{selectedText}}' },
    });
    const result = parseSkillManifest(json);
    expect(result.id).toBe('db_skill');
  });
});
