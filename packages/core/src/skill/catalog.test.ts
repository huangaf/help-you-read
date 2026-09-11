// CapabilityCatalog — TDD 测试（Phase 4）

import { describe, it, expect } from 'vitest';
import { CapabilityCatalog } from './catalog.js';
import type { CapabilityTool, AccessLevel } from './types.js';

describe('skill/catalog', () => {
  // 构造测试用工具
  function makeTool(overrides: Partial<CapabilityTool> = {}): CapabilityTool {
    return {
      name: 'test_tool',
      description: '测试工具',
      access: 'read' as AccessLevel,
      inputSchema: undefined,
      ...overrides,
    };
  }

  it('S1: register + resolve 往返一致', () => {
    const catalog = new CapabilityCatalog();
    const tool = makeTool({ name: 'reader.getSelection', description: '获取选中原文' });
    catalog.register(tool);

    const resolved = catalog.resolve('reader.getSelection');
    expect(resolved).not.toBeNull();
    expect(resolved!.name).toBe('reader.getSelection');
  });

  it('S2: resolve 不存在的工具名 → null', () => {
    const catalog = new CapabilityCatalog();
    expect(catalog.resolve('nonexistent_tool')).toBeNull();
  });

  it('S3: full access 可调用任何 access level 的工具', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'tool_none', access: 'none' }));
    catalog.register(makeTool({ name: 'tool_read', access: 'read' }));
    catalog.register(makeTool({ name: 'tool_write', access: 'write' }));
    catalog.register(makeTool({ name: 'tool_full', access: 'full' }));

    // full 可以调用所有
    expect(catalog.checkAccess('full', catalog.resolve('tool_none')!)).toBe(true);
    expect(catalog.checkAccess('full', catalog.resolve('tool_read')!)).toBe(true);
    expect(catalog.checkAccess('full', catalog.resolve('tool_write')!)).toBe(true);
    expect(catalog.checkAccess('full', catalog.resolve('tool_full')!)).toBe(true);
  });

  it('S4: none access 不可调用 read/write/full 工具', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'tool_read', access: 'read' }));
    catalog.register(makeTool({ name: 'tool_write', access: 'write' }));
    catalog.register(makeTool({ name: 'tool_full', access: 'full' }));

    expect(catalog.checkAccess('none', catalog.resolve('tool_read')!)).toBe(false);
    expect(catalog.checkAccess('none', catalog.resolve('tool_write')!)).toBe(false);
    expect(catalog.checkAccess('none', catalog.resolve('tool_full')!)).toBe(false);
  });

  it('S5: read access 可调用 none/read，不可调用 write/full', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'tool_none', access: 'none' }));
    catalog.register(makeTool({ name: 'tool_read', access: 'read' }));
    catalog.register(makeTool({ name: 'tool_write', access: 'write' }));
    catalog.register(makeTool({ name: 'tool_full', access: 'full' }));

    expect(catalog.checkAccess('read', catalog.resolve('tool_none')!)).toBe(true);
    expect(catalog.checkAccess('read', catalog.resolve('tool_read')!)).toBe(true);
    expect(catalog.checkAccess('read', catalog.resolve('tool_write')!)).toBe(false);
    expect(catalog.checkAccess('read', catalog.resolve('tool_full')!)).toBe(false);
  });

  it('S6: list() 返回所有已注册工具', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'tool_a' }));
    catalog.register(makeTool({ name: 'tool_b' }));

    const tools = catalog.list();
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['tool_a', 'tool_b']);
  });

  it('S7: getToolsForSkill — 按 manifest.tools 白名单过滤', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'allowed_tool', access: 'read' }));
    catalog.register(makeTool({ name: 'disallowed_tool', access: 'read' }));

    // 只允许 allowed_tool
    const result = catalog.getToolsForSkill(['allowed_tool']);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('allowed_tool');
  });

  it('S8: getToolsForSkill — 白名单含未注册工具名 → 跳过（不报错）', () => {
    const catalog = new CapabilityCatalog();
    catalog.register(makeTool({ name: 'registered_tool' }));

    // 包含一个未注册的工具名
    const result = catalog.getToolsForSkill(['registered_tool', 'unregistered_tool']);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('registered_tool');
  });
});
