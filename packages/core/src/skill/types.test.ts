// 技能系统共享类型 — TDD 测试（Phase 4）

import { describe, it, expect } from 'vitest';
import { accessOrder, canAccess, SKILL_KINDS, ACCESS_LEVELS } from './types.js';
import type { AccessLevel } from './types.js';

describe('skill/types', () => {
  it('S1: accessOrder 排序正确（none < read < write < full）', () => {
    expect(accessOrder('none')).toBe(0);
    expect(accessOrder('read')).toBe(1);
    expect(accessOrder('write')).toBe(2);
    expect(accessOrder('full')).toBe(3);
  });

  it('S2: SkillKind valid values', () => {
    expect(SKILL_KINDS).toEqual(['prompt', 'agent', 'script']);
  });

  it('S3: ACCESS_LEVELS valid values', () => {
    expect(ACCESS_LEVELS).toEqual(['none', 'read', 'write', 'full']);
  });

  it('S4: accessOrder 非法值抛类型化错误', () => {
    const invalidLevel = 'invalid' as unknown as AccessLevel;
    expect(() => accessOrder(invalidLevel)).toThrow('SKILL_INVALID_ACCESS');
  });

  it('S5: canAccess — full 可调用任何 access', () => {
    // canAccess(skillAccess, toolAccess): skill 的 access >= tool 的 access 才放行
    expect(canAccess('full', 'none')).toBe(true);
    expect(canAccess('full', 'read')).toBe(true);
    expect(canAccess('full', 'write')).toBe(true);
    expect(canAccess('full', 'full')).toBe(true);
  });

  it('S6: canAccess — none 不可调用 read/write/full', () => {
    expect(canAccess('none', 'read')).toBe(false);
    expect(canAccess('none', 'write')).toBe(false);
    expect(canAccess('none', 'full')).toBe(false);
  });

  it('S7: canAccess — read 可调用 none/read，不可调用 write/full', () => {
    expect(canAccess('read', 'none')).toBe(true);
    expect(canAccess('read', 'read')).toBe(true);
    expect(canAccess('read', 'write')).toBe(false);
    expect(canAccess('read', 'full')).toBe(false);
  });

  it('S8: canAccess — write 可调用 none/read/write，不可调用 full', () => {
    expect(canAccess('write', 'none')).toBe(true);
    expect(canAccess('write', 'read')).toBe(true);
    expect(canAccess('write', 'write')).toBe(true);
    expect(canAccess('write', 'full')).toBe(false);
  });
});
