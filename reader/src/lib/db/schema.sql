-- ============================================================================
-- SQLite 数据库结构
-- 与《docs/详细设计.md》第 2.1 节「表结构」、第 2.2 节「关键索引」完全一致。
-- 使用 IF NOT EXISTS 保证初始化幂等（可重复执行）。
-- ============================================================================

-- 书籍
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,            -- uuid
  title TEXT NOT NULL,
  author TEXT,
  cover_path TEXT,
  format TEXT NOT NULL,           -- epub/pdf/txt
  file_path TEXT NOT NULL,
  file_hash TEXT UNIQUE,          -- 去重
  status TEXT DEFAULT 'unread',   -- unread/reading/finished/archived
  grade INTEGER DEFAULT 1,        -- 宝塔式分级 1浏览/2精读/3最爱
  total_chapters INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 章节
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  index INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,          -- 章节全文
  char_count INTEGER,
  UNIQUE(book_id, index)
);

-- 高亮
CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE,
  color TEXT DEFAULT 'yellow',    -- yellow/green/blue/pink/purple
  quote TEXT NOT NULL,            -- 原文摘录
  note TEXT,                      -- 批注
  cfi TEXT,                       -- EPUB 定位（epubcfi）
  page_ref TEXT,                  -- 页码/段落引用
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- RIA 便签
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE CASCADE,
  type TEXT NOT NULL,             -- I / A1 / A2
  content TEXT NOT NULL,
  source_quote TEXT,              -- 关联原文
  status TEXT DEFAULT 'active',   -- active/done/archived（A2 行动状态）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 读书档案（麦肯锡）
CREATE TABLE IF NOT EXISTS reading_archives (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
  purpose TEXT,                   -- 读书目的（读前）
  key_takeaways TEXT,             -- 核心收获
  action_plan TEXT,               -- 行动计划
  output TEXT,                    -- 输出记录
  ai_draft TEXT,                  -- AI 起草内容（可编辑）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 闪卡（间隔重复）
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  source_highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  source_note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  due_at TEXT NOT NULL,           -- 下次到期时间
  interval_days REAL DEFAULT 0,   -- 当前间隔
  stability REAL DEFAULT 0,       -- FSRS stability
  difficulty REAL DEFAULT 5,      -- FSRS difficulty
  state INTEGER DEFAULT 0,        -- FSRS state (0=new,1=learning,2=review,3=relearning)
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 阅读会话统计
CREATE TABLE IF NOT EXISTS reading_sessions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER,
  chapter_id TEXT
);

-- 思维模型标签（芒格）
CREATE TABLE IF NOT EXISTS mental_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,      -- 如：复利、护城河、逆向思维
  description TEXT
);

CREATE TABLE IF NOT EXISTS highlight_mental_models (
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES mental_models(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, model_id)
);

-- AI 配置
CREATE TABLE IF NOT EXISTS ai_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================================
-- 关键索引（详细设计.md 第 2.2 节）
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id);
CREATE INDEX IF NOT EXISTS idx_notes_book_type ON notes(book_id, type);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_at);
CREATE INDEX IF NOT EXISTS idx_sessions_book_time ON reading_sessions(book_id, started_at);
