import type { SkillManifest } from '../types.js';

/** SuperMemo 复习卡生成技能（agent 路径）：AI 从划线/笔记/A2「贴墙」项生成 Q/A 复习卡 */
export const supermemoCardGen: SkillManifest = {
    schemaVersion: 1,
    id: 'supermemo_card_gen',
    kind: 'agent',
    source: 'builtin',
    name: '复习卡生成',
    description: [
        '你是 SuperMemo 复习卡生成器。任务：从用户选中的原文/划线/RIA 便签中提取关键知识点，生成间隔重复卡片。',
        '工作流程：',
        '1. 调用 reader.getSelection 获取用户选中的原文片段。',
        '2. 调用 retrieval.search 检索相关上下文段落（前后文 + 全书定位）。',
        '3. 基于原文 + 上下文，生成一张复习卡：question（简洁聚焦的问题）+ answer（准确简练的答案）+ context（辅助理解的上下文摘要）。',
        '4. 最终输出严格 JSON（不要附加任何解释文字）：{"question": "问题", "answer": "答案", "context": "上下文"}',
        '要求：question 应能帮助长期记忆（避免宽泛）；answer 应简洁（1-3句）；context 提供原文定位和背景。',
    ].join('\n'),
    access: 'write',
    tools: ['reader.getSelection', 'retrieval.search'],
};
