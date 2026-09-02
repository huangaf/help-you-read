/**
 * 读书档案生成（M1 场景 S6）
 *
 * 基于全书章节内容，使用 AI 生成结构化读书档案：
 * - summary: 全书摘要
 * - keyTakeaways: 3-5 条核心收获
 * - actionPlan: 2-3 条行动计划
 * - output: 输出建议
 */
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateStructured } from './client';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 读书档案生成结果 */
export const ArchiveSchema = z.object({
  summary: z.string().describe('全书核心内容总结，100-200 字'),
  keyTakeaways: z.array(z.string())
    .min(3).max(5)
    .describe('3-5 条核心收获，每条 20-50 字'),
  actionPlan: z.array(z.string())
    .min(2).max(3)
    .describe('2-3 条可执行的行动计划，每条 10-30 字'),
  output: z.string().describe('输出建议，推荐适合的输出形式')
});

export type ArchiveResult = z.infer<typeof ArchiveSchema>;

/** 章节输入 */
export interface ArchiveChapter {
  title: string;
  content: string;
}

/** 书籍输入 */
export interface ArchiveBookInput {
  title: string;
  author: string | null;
  chapters: ArchiveChapter[];
}

/** 生成选项 */
export interface GenerateArchiveOptions {
  /** 最多处理的前 N 章，默认 5 */
  maxChapters?: number;
  /** 每章最多取前 N 字，默认 500 */
  charsPerChapter?: number;
}

// ---------------------------------------------------------------------------
// 核心逻辑
// ---------------------------------------------------------------------------

/**
 * 生成读书档案
 *
 * @param book 书籍信息（书名、作者、章节）
 * @param opts 生成选项
 * @returns 结构化档案结果
 */
export async function generateArchive(
  book: ArchiveBookInput,
  opts?: GenerateArchiveOptions
): Promise<ArchiveResult> {
  const maxChapters = opts?.maxChapters ?? 5;
  const charsPerChapter = opts?.charsPerChapter ?? 500;

  // 读取 Prompt 模板
  const templatePath = path.join(process.cwd(), 'src', 'prompts', 'archive.md');
  const template = fs.readFileSync(templatePath, 'utf-8');

  // 处理章节：截断到 maxChapters 章，每章 charsPerChapter 字
  const processedChapters = book.chapters
    .slice(0, maxChapters)
    .map(chapter => {
      const truncatedContent = chapter.content.slice(0, charsPerChapter);
      return `### ${chapter.title}\n${truncatedContent}`;
    })
    .join('\n\n');

  // 替换占位符
  const prompt = template
    .replace('{title}', book.title)
    .replace('{author}', book.author ?? '未知')
    .replace('{chapters}', processedChapters);

  // 调用 AI 生成结构化输出
  const result = await generateStructured(ArchiveSchema, prompt);

  return result;
}
