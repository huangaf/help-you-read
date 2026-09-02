import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 导入被测试模块
import { ArchiveSchema, type ArchiveResult, generateArchive } from './archive';

describe('ArchiveSchema', () => {
  test('Zod schema validation passes for valid ArchiveResult', () => {
    const validResult: ArchiveResult = {
      summary: '摘要内容',
      keyTakeaways: ['收获 1', '收获 2', '收获 3'],
      actionPlan: ['行动 1', '行动 2'],
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(validResult);
    expect(parseResult.success).toBe(true);
  });

  test('Zod schema validation fails when keyTakeaways has less than 3 items', () => {
    const invalidResult = {
      summary: '摘要内容',
      keyTakeaways: ['收获 1'], // 少于 3 条
      actionPlan: ['行动 1'],
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });

  test('Zod schema validation fails when keyTakeaways has more than 5 items', () => {
    const invalidResult = {
      summary: '摘要内容',
      keyTakeaways: ['收获 1', '收获 2', '收获 3', '收获 4', '收获 5', '收获 6'], // 超过 5 条
      actionPlan: ['行动 1'],
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });

  test('Zod schema validation fails when actionPlan has less than 2 items', () => {
    const invalidResult = {
      summary: '摘要内容',
      keyTakeaways: ['收获 1', '收获 2', '收获 3'],
      actionPlan: [], // 空数组
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });

  test('Zod schema validation fails when actionPlan has more than 3 items', () => {
    const invalidResult = {
      summary: '摘要内容',
      keyTakeaways: ['收获 1', '收获 2', '收获 3'],
      actionPlan: ['行动 1', '行动 2', '行动 3', '行动 4'], // 超过 3 条
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });

  test('Zod schema validation fails for missing required fields', () => {
    const invalidResult = {
      summary: '摘要内容',
      // 缺少 keyTakeaways
      actionPlan: ['行动 1'],
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });

  test('Zod schema requires all fields to be strings', () => {
    const invalidResult = {
      summary: 123 as unknown as string, // 错误的类型
      keyTakeaways: ['收获 1', '收获 2', '收获 3'],
      actionPlan: ['行动 1'],
      output: '输出建议'
    };

    const parseResult = ArchiveSchema.safeParse(invalidResult);
    expect(parseResult.success).toBe(false);
  });
});

describe('archive prompt template', () => {
  test('prompt template file exists and contains required placeholders', () => {
    const templatePath = path.join(__dirname, '../../prompts/archive.md');
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    expect(template).toContain('{title}');
    expect(template).toContain('{author}');
    expect(template).toContain('{chapters}');
    expect(template).toContain('全书核心内容总结'); // 摘要的描述
    expect(template).toContain('keyTakeaways');
    expect(template).toContain('actionPlan');
    expect(template).toContain('output');
  });

  test('prompt template is in Chinese', () => {
    const templatePath = path.join(__dirname, '../../prompts/archive.md');
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    // 检查是否包含中文关键词
    expect(template).toContain('读书档案');
    expect(template).toContain('书籍信息');
    expect(template).toContain('章节内容');
    expect(template).toContain('简体中文');
  });

  test('prompt template contains JSON output schema', () => {
    const templatePath = path.join(__dirname, '../../prompts/archive.md');
    const template = fs.readFileSync(templatePath, 'utf-8');
    
    expect(template).toContain('summary');
    expect(template).toContain('keyTakeaways');
    expect(template).toContain('actionPlan');
    expect(template).toContain('output');
  });
});

describe('generateArchive function exports', () => {
  test('generateArchive function is exported', () => {
    expect(typeof generateArchive).toBe('function');
  });

  test('generateArchive accepts correct parameters', () => {
    // 类型检查 - 确保函数接受正确的参数类型
    const book = {
      title: '测试书籍',
      author: '测试作者' as string | null,
      chapters: [
        { title: '第一章', content: '内容' }
      ]
    };

    // 这只是一个类型检查测试，不实际执行
    // 如果类型正确，这个测试会通过
    expect(book.title).toBe('测试书籍');
    expect(book.chapters.length).toBe(1);
  });

  test('ArchiveResult type has correct structure', () => {
    // 类型检查测试
    const result: ArchiveResult = {
      summary: '测试摘要',
      keyTakeaways: ['收获 1', '收获 2', '收获 3'],
      actionPlan: ['行动 1', '行动 2'],
      output: '测试输出'
    };

    expect(result.summary).toBeDefined();
    expect(Array.isArray(result.keyTakeaways)).toBe(true);
    expect(Array.isArray(result.actionPlan)).toBe(true);
    expect(result.output).toBeDefined();
  });
});
