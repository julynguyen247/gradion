import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  book_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_step INTEGER NOT NULL DEFAULT 0 CHECK(completed_step BETWEEN 0 AND 5),
  active_step TEXT CHECK(active_step IN ('STYLE','CHARACTERS','PORTRAITS','CHAPTERS','ILLUSTRATIONS')),
  step_state TEXT NOT NULL DEFAULT 'IDLE' CHECK(step_state IN ('IDLE','RUNNING','FAILED')),
  step_started_at INTEGER,
  last_error TEXT,
  style TEXT,
  gemini_file_name TEXT,
  gemini_file_uri TEXT,
  book_interaction_id TEXT,
  text_interaction_id TEXT,
  image_interaction_id TEXT,
  chapter_image_context_ready INTEGER NOT NULL DEFAULT 0 CHECK(chapter_image_context_ready IN (0,1))
);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 1),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','DONE','FAILED')),
  portrait_path TEXT,
  image_interaction_id TEXT,
  UNIQUE(project_id, position)
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position = 0),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','RUNNING','DONE','FAILED')),
  illustration_path TEXT,
  image_interaction_id TEXT,
  UNIQUE(project_id, position)
);
`;

export function createDatabase(filename: string): SqliteDatabase {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const database = new Database(filename);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(SCHEMA);
  return database;
}
