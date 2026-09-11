// v1 建表 DDL（11 表：9 main + 2 local）+ schema_migrations
// 承 docs/技术方案.md §4 DDL

export const MAIN_DB_MIGRATIONS: ReadonlyArray<{ version: number; description: string; sql: string }> = [
    {
        version: 1,
        description: 'v1 initial schema — main.db（9表）',
        sql: `
CREATE TABLE IF NOT EXISTS books(
  id TEXT PRIMARY KEY, file_path TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'epub',
  title TEXT NOT NULL, author TEXT, publisher TEXT, language TEXT, isbn TEXT,
  description TEXT, cover_url TEXT, publish_date TEXT, rating REAL,
  tags TEXT NOT NULL DEFAULT '[]',
  progress REAL DEFAULT 0, current_cfi TEXT, added_at INTEGER NOT NULL, last_opened_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS annotations(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  cfi TEXT NOT NULL, text TEXT NOT NULL,
  context_before TEXT, context_after TEXT,
  color TEXT DEFAULT 'yellow', style TEXT DEFAULT 'highlight', type TEXT DEFAULT 'annotation',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  highlight_id TEXT REFERENCES annotations(id) ON DELETE SET NULL,
  cfi TEXT, title TEXT NOT NULL, content TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS threads(
  id TEXT PRIMARY KEY, book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  title TEXT, memory_summary TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL,
  citations TEXT DEFAULT '[]', tool_calls TEXT DEFAULT '[]', reasoning TEXT, parts_order INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skills(
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, icon TEXT,
  kind TEXT NOT NULL DEFAULT 'prompt',
  source TEXT NOT NULL DEFAULT 'user',
  access TEXT NOT NULL DEFAULT 'none',
  tools TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_sessions(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL, ended_at INTEGER, total_active_time INTEGER DEFAULT 0,
  pages_read INTEGER DEFAULT 0, state TEXT DEFAULT 'active', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS method_artifact(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  content TEXT NOT NULL,
  idempotency_key TEXT,
  helpful INTEGER DEFAULT 0, dismissed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS review_items(
  id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  source_artifact_id TEXT REFERENCES method_artifact(id) ON DELETE SET NULL,
  question TEXT NOT NULL, answer TEXT NOT NULL, context TEXT,
  due_date INTEGER NOT NULL, interval_days REAL DEFAULT 1, ease_factor REAL DEFAULT 2.5,
  lapses INTEGER DEFAULT 0, retrieval_count INTEGER DEFAULT 0, last_reviewed_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
`,
    },
];

export const LOCAL_DB_MIGRATIONS: ReadonlyArray<{ version: number; description: string; sql: string }> = [
    {
        version: 1,
        description: 'v1 initial schema — local.db（2表）',
        sql: `
 CREATE TABLE IF NOT EXISTS chunks(
   id TEXT PRIMARY KEY, book_id TEXT NOT NULL,
   chapter_index INTEGER, chapter_title TEXT, content TEXT NOT NULL, token_count INTEGER,
   start_cfi TEXT, end_cfi TEXT, segment_cfis TEXT DEFAULT '[]',
   embedding BLOB,
   updated_at INTEGER NOT NULL
 );
CREATE TABLE IF NOT EXISTS vector_index_provenance(
  book_id TEXT PRIMARY KEY, model_kind TEXT, model_id TEXT, endpoint TEXT, dimensions INTEGER, created_at INTEGER NOT NULL
);
`,
    },
];

// schema_migrations 表（双库各一份）
export const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations(
  version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at INTEGER
);
`;
