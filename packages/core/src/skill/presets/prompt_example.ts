// v1 预置技能：prompt 路径示例（Phase 4）
// 演示模板渲染 → AI chat 的完整流程

import type { SkillManifest } from '../types.js';

/** prompt 示例：基于选中原文生成摘要（Phase 5 将替换为真实 RIA 模板） */
export const promptExample: SkillManifest = {
    schemaVersion: 1,
    id: 'prompt_example',
    kind: 'prompt',
    source: 'builtin',
    name: '摘要生成（示例）',
    description: '基于选中原文生成简洁摘要，用于验证 prompt 执行路径',
    access: 'read',
    tools: [],
    prompt: { inline: '请基于以下原文生成一句话摘要：\n{{selectedText}}' },
};
