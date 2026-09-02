/**
 * 共享类型定义
 *
 * 与《docs/详细设计.md》第 2 节「数据模型（SQLite）」一一对应，
 * 字段命名采用 TypeScript 惯例的 camelCase（SQLite 列为 snake_case）。
 */

// ---------------------------------------------------------------------------
// 枚举型（联合类型）
// ---------------------------------------------------------------------------

/** 书籍阅读状态 */
export type BookStatus = 'unread' | 'reading' | 'finished' | 'archived';

/** 宝塔式分级：1 浏览 / 2 精读 / 3 最爱 */
export type BookGrade = 1 | 2 | 3;

/** 书籍格式 */
export type BookFormat = 'epub' | 'pdf' | 'txt';

/** 高亮颜色（五色） */
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

/** RIA 便签类型：I 重述 / A1 关联经验 / A2 行动计划 */
export type NoteType = 'I' | 'A1' | 'A2';

/** 便签状态（A2 行动状态）：active 进行中 / done 完成 / archived 归档 */
export type NoteStatus = 'active' | 'done' | 'archived';

/** FSRS 卡片状态：0 新卡 / 1 学习 / 2 复习 / 3 再学习 */
export type CardState = 0 | 1 | 2 | 3;

/** FSRS 复习打分：again 忘记 / hard 模糊 / good 记得 / easy 轻松 */
export type ReviewGrade = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// 数据表对应类型
// ---------------------------------------------------------------------------

/** 书籍（books 表） */
export interface Book {
  id: string;
  title: string;
  author: string | null;
  coverPath: string | null;
  format: BookFormat;
  filePath: string;
  /** 文件哈希（去重用） */
  fileHash: string | null;
  status: BookStatus;
  grade: BookGrade;
  totalChapters: number | null;
  createdAt: string;
  updatedAt: string;
}

/** 章节（chapters 表） */
export interface Chapter {
  id: string;
  bookId: string;
  /** 章节序号（从 0 开始，同书内唯一） */
  index: number;
  title: string;
  /** 章节全文 */
  content: string;
  charCount: number | null;
}

/** 高亮（highlights 表） */
export interface Highlight {
  id: string;
  bookId: string;
  chapterId: string | null;
  color: HighlightColor;
  /** 原文摘录 */
  quote: string;
  /** 批注 */
  note: string | null;
  /** EPUB 定位（epubcfi） */
  cfi: string | null;
  /** 页码/段落引用 */
  pageRef: string | null;
  createdAt: string;
  updatedAt: string;
}

/** RIA 便签（notes 表） */
export interface Note {
  id: string;
  bookId: string;
  highlightId: string | null;
  chapterId: string | null;
  type: NoteType;
  content: string;
  /** 关联原文 */
  sourceQuote: string | null;
  status: NoteStatus;
  createdAt: string;
  updatedAt: string;
}

/** 读书档案（麦肯锡，reading_archives 表） */
export interface ReadingArchive {
  id: string;
  bookId: string;
  /** 读书目的（读前填写） */
  purpose: string | null;
  /** 核心收获 */
  keyTakeaways: string | null;
  /** 行动计划 */
  actionPlan: string | null;
  /** 输出记录（读书笔记/书评/实践） */
  output: string | null;
  /** AI 起草内容（可编辑） */
  aiDraft: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 闪卡（cards 表，间隔重复） */
export interface Card {
  id: string;
  bookId: string;
  sourceHighlightId: string | null;
  sourceNoteId: string | null;
  question: string;
  answer: string;
  /** 下次到期时间 */
  dueAt: string;
  /** 当前间隔（天） */
  intervalDays: number;
  /** FSRS stability */
  stability: number;
  /** FSRS difficulty */
  difficulty: number;
  /** FSRS state */
  state: CardState;
  reps: number;
  lapses: number;
  createdAt: string;
  updatedAt: string;
}

/** 阅读会话统计（reading_sessions 表） */
export interface ReadingSession {
  id: string;
  bookId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  chapterId: string | null;
}

/** 思维模型标签（芒格，mental_models 表） */
export interface MentalModel {
  id: string;
  /** 如：复利、护城河、逆向思维 */
  name: string;
  description: string | null;
}

/** 高亮 × 思维模型 关联（highlight_mental_models 表） */
export interface HighlightMentalModel {
  highlightId: string;
  modelId: string;
}

// ---------------------------------------------------------------------------
// API / 交互相关类型
// ---------------------------------------------------------------------------

/** AI 对话请求（POST /api/books/:id/chat） */
export interface ChatRequest {
  /** 用户问题 */
  question: string;
  /** 当前阅读位置（epubcfi） */
  location: string | null;
  /** 选中文本 */
  selection: string | null;
}

/** RIA 便签 AI 生成结果（ai/ria） */
export interface RiaResult {
  I: string;
  A1_question: string;
  A2: string;
}

// ---------------------------------------------------------------------------
// 解析器输出（parser 层，入库前）
// ---------------------------------------------------------------------------

/** 解析出的章节（parseEpub 输出） */
export interface ParsedChapter {
  /** 章节序号（从 0 开始，同书内唯一） */
  index: number;
  title: string;
  /** 章节全文 */
  content: string;
  /** 章节起始 CFI（epubcfi）；无法提供时为 null */
  cfi: string | null;
}

/** 解析出的书（parseEpub 输出，入库前） */
export interface ParsedBook {
  title: string;
  author: string | null;
  chapters: ParsedChapter[];
}

// ---------------------------------------------------------------------------
// db 解耦接口（parser 胶水层所需的最小接口）
// ---------------------------------------------------------------------------

/** 建书入参（id 由调用方生成，时间戳由数据层生成） */
export type CreateBookInput = Omit<Book, 'createdAt' | 'updatedAt'>;

/**
 * importEpubToDb 所需的最小 db 接口（与 W1-T-db 解耦）。
 * 约定与 W1-T-db 一致：createBook(...) 返回 Book；
 * insertChapter({bookId,index,title,content,charCount}) 返回 Chapter。
 * src/lib/db 就绪后可直接传入其实例（或薄适配层）。
 */
export interface EpubImportDb {
  /** 按文件哈希查书（去重用） */
  findBookByFileHash(hash: string): Book | null;
  /** 建书 */
  createBook(input: CreateBookInput): Book;
  /** 插章 */
  insertChapter(input: {
    bookId: string;
    index: number;
    title: string;
    content: string;
    charCount: number | null;
  }): Chapter;
}
