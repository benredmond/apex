#!/usr/bin/env node

// [PAT:ESM:DYNAMIC_IMPORT] ★★★★★ - Dynamic import for optional dependencies
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// [PAT:ADAPTER:DELEGATION] ★★★★☆ - Use DatabaseAdapterFactory for compatibility
let adapter, db;
try {
  const { DatabaseAdapterFactory } = await import('../dist/storage/database-adapter.js');
  adapter = await DatabaseAdapterFactory.create('patterns.db');
  db = adapter.getInstance();
} catch (error) {
  console.error('\n❌ Failed to initialize database adapter:');
  console.error('Make sure to run: npm run build');
  console.error('Error:', error.message);
  process.exit(1);
}

console.log('Initializing patterns database...');

// Enable WAL mode
adapter.pragma('journal_mode = WAL');
adapter.pragma('foreign_keys = ON');

// Create patterns table
db.exec(`
  CREATE TABLE IF NOT EXISTS patterns (
    id                TEXT PRIMARY KEY,
    schema_version    TEXT NOT NULL,
    pattern_version   TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL,
    trust_score       REAL NOT NULL CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    source_repo       TEXT,
    tags_csv          TEXT,
    pattern_digest    TEXT NOT NULL,
    json_canonical    BLOB NOT NULL,
    invalid           INTEGER NOT NULL DEFAULT 0,
    invalid_reason    TEXT,
    alpha             REAL DEFAULT 1.0,
    beta              REAL DEFAULT 1.0,
    usage_count       INTEGER DEFAULT 0,
    success_count     INTEGER DEFAULT 0,
    status            TEXT DEFAULT 'active'
  );
`);

// Create facet tables
db.exec(`
  CREATE TABLE IF NOT EXISTS pattern_languages (
    pattern_id  TEXT NOT NULL,
    lang        TEXT NOT NULL,
    PRIMARY KEY (pattern_id, lang),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_frameworks (
    pattern_id  TEXT NOT NULL,
    framework   TEXT NOT NULL,
    semver      TEXT,
    PRIMARY KEY (pattern_id, framework),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_tags (
    pattern_id  TEXT NOT NULL,
    tag         TEXT NOT NULL,
    PRIMARY KEY (pattern_id, tag),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_paths (
    pattern_id  TEXT NOT NULL,
    glob        TEXT NOT NULL,
    PRIMARY KEY (pattern_id, glob),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_repos (
    pattern_id  TEXT NOT NULL,
    repo_glob   TEXT NOT NULL,
    PRIMARY KEY (pattern_id, repo_glob),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_task_types (
    pattern_id  TEXT NOT NULL,
    task_type   TEXT NOT NULL,
    PRIMARY KEY (pattern_id, task_type),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_envs (
    pattern_id  TEXT NOT NULL,
    env         TEXT NOT NULL,
    PRIMARY KEY (pattern_id, env),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pattern_snippets (
    pattern_id  TEXT NOT NULL,
    snippet_id  TEXT NOT NULL,
    content     TEXT NOT NULL,
    language    TEXT,
    PRIMARY KEY (pattern_id, snippet_id),
    FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
  );
`);

// Create indices
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type);
  CREATE INDEX IF NOT EXISTS idx_patterns_trust ON patterns(trust_score DESC);
  CREATE INDEX IF NOT EXISTS idx_patterns_created ON patterns(created_at);
  CREATE INDEX IF NOT EXISTS idx_patterns_invalid ON patterns(invalid);
`);

console.log('✅ Database initialized successfully');

// Show table info
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\nCreated tables:');
tables.forEach(t => console.log(`  - ${t.name}`));

adapter.close();