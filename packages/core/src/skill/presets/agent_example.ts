// v1 预置技能：agent 路径示例（Phase 4）
// 演示多轮工具调用循环的完整流程

import type { SkillManifest } from '../types.js';

/** agent 示例：通过工具调用获取上下文后生成分析（Phase 5 将替换为真实 RIA/SuperMemo） */
export const agentExample: SkillManifest = {
    schemaVersion: 1,
    id: 'agent_example',
    kind: 'agent',
    source: 'builtin',
    name: '上下文分析（示例）',
    description: '通过检索工具获取相关段落，然后生成结构化分析，用于验证 agent 执行路径',
    access: 'read',
    tools: ['retrieval.search'],
};
