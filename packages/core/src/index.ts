// @hyr/core — 共享核心（零 UI 依赖，可被桌面/移动/Web 复用）
// Phase2: db (schema + repositories + migrations) — ✓ 已实现
// Phase3: ai (providers + retrieval) — 未开始
// Phase4: skill (manifest + catalog + runtime + presets) — 未开始
// Phase5: tts (TTSEngine abstraction + local impl) — 未开始

export { Database, type DatabaseOptions } from './db/index.js';
export { MigrationRunner, migrateAll, type Migration } from './db/migrations.js';
export { MAIN_DB_MIGRATIONS, LOCAL_DB_MIGRATIONS, SCHEMA_MIGRATIONS_DDL } from './db/schema.js';
export { BooksRepository } from './db/repositories/books.js';
export { AnnotationsRepository } from './db/repositories/annotations.js';
export { NotesRepository } from './db/repositories/notes.js';
export { ThreadsRepository } from './db/repositories/threads.js';
export { MessagesRepository } from './db/repositories/messages.js';
export { SkillsRepository } from './db/repositories/skills.js';
export { ReadingSessionsRepository } from './db/repositories/reading_sessions.js';
export { MethodArtifactRepository } from './db/repositories/method_artifact.js';
export { ReviewItemsRepository } from './db/repositories/review_items.js';
export type { Book, Annotation, Note, Thread, Message, Skill, ReadingSession, MethodArtifact, ReviewItem, Chunk, VectorIndexProvenance, SchemaMigration } from './db/types.js';
