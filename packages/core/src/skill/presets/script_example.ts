// v1 预置技能：script 路径示例（Phase 4）
// 演示 Node vm 沙箱执行的完整流程

import type { SkillManifest } from '../types.js';

/** script 示例：通过 vm 执行受信脚本，计算选中原文的字符统计（Phase 5 将替换为真实逻辑） */
export const scriptExample: SkillManifest = {
    schemaVersion: 1,
    id: 'script_example',
    kind: 'script',
    source: 'builtin',
    name: '文本统计（示例）',
    description: '通过 Node vm 执行受信脚本，统计选中原文的字数和句子数，用于验证 script 执行路径',
    access: 'none',
    tools: [],
    script: { enabled: true, runtime: 'node' },
};
