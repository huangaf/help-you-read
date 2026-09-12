import type { SkillManifest } from '../types.js';

/** RIA 便签技能（agent 路径）：AI 多轮工具调用生成 Read/Interpret/Appraise 三段式笔记 */
export const riaNote: SkillManifest = {
    schemaVersion: 1,
    id: 'ria_note',
    kind: 'agent',
    source: 'builtin',
    name: 'RIA 便签',
    description: [
        '你是 RIA 读书笔记生成器。RIA = Read（原文摘录）+ Interpret（解读）+ Appraise（评价）。',
        '工作流程：',
        '1. 调用 reader.getSelection 获取用户选中的原文片段（作为 R）。',
        '2. 调用 retrieval.search 检索与选中片段相关的上下文段落（辅助理解）。',
        '3. 基于 R + 上下文，生成 I（解读：用通俗语言解释原文含义、背景、逻辑）和 A（评价：指出原文的优缺点，并给出可操作的应用建议）。',
        '4. 最终输出严格 JSON（不要附加任何解释文字）：{"R": "原文摘录", "I": "解读内容", "A": "评价与应用建议"}',
    ].join('\n'),
    access: 'write',
    tools: ['reader.getSelection', 'retrieval.search'],
};
