/**
 * Single source of truth for database schema definitions
 * All CREATE TABLE statements should reference this file
 */

// [PAT:CLEAN:SINGLE_SOURCE] - Consolidated schema definitions
export const SCHEMA_SQL = {
  // Core tables
  patterns: `
    CREATE TABLE IF NOT EXISTS patterns (
      id                TEXT PRIMARY KEY,
      schema_version    TEXT NOT NULL,
      pattern_version   TEXT NOT NULL DEFAULT '1.0.0',
      type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
      category          TEXT,
      subcategory       TEXT,
      title             TEXT NOT NULL,
      summary           TEXT NOT NULL,
      problem           TEXT,
      solution          TEXT,
      consequences      TEXT,
      implementation    TEXT,
      examples          TEXT,
      confidence        REAL DEFAULT 0.0,
      trust_score       REAL NOT NULL DEFAULT 0.0 CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
      invalid           INTEGER NOT NULL DEFAULT 0,
      invalid_reason    TEXT,
      error_prone       INTEGER DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at      TEXT,
      pattern_digest    TEXT,
      json_canonical    TEXT,
      alpha             REAL DEFAULT 1.0,
      beta              REAL DEFAULT 1.0,
      usage_count       INTEGER DEFAULT 0,
      success_count     INTEGER DEFAULT 0,
      status            TEXT DEFAULT 'active',
      source_repo       TEXT,
      alias             TEXT UNIQUE,
      tags              TEXT,
      keywords          TEXT,
      search_index      TEXT,
      provenance        TEXT NOT NULL DEFAULT 'manual',
      key_insight       TEXT,
      when_to_use       TEXT,
      common_pitfalls   TEXT,
      last_activity_at  TEXT,
      quality_score_cached REAL,
      cache_timestamp   TEXT,
      semver_constraints TEXT,
      quarantine_reason TEXT,
      quarantine_date   TEXT
    )`,

  // Facet tables
  pattern_languages: `
    CREATE TABLE IF NOT EXISTS pattern_languages (
      pattern_id  TEXT NOT NULL,
      lang        TEXT NOT NULL,
      PRIMARY KEY (pattern_id, lang),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_frameworks: `
    CREATE TABLE IF NOT EXISTS pattern_frameworks (
      pattern_id  TEXT NOT NULL,
      framework   TEXT NOT NULL,
      version     TEXT,
      PRIMARY KEY (pattern_id, framework),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_paths: `
    CREATE TABLE IF NOT EXISTS pattern_paths (
      pattern_id  TEXT NOT NULL,
      glob        TEXT NOT NULL,
      PRIMARY KEY (pattern_id, glob),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_repos: `
    CREATE TABLE IF NOT EXISTS pattern_repos (
      pattern_id  TEXT NOT NULL,
      repo_glob   TEXT NOT NULL,
      PRIMARY KEY (pattern_id, repo_glob),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_task_types: `
    CREATE TABLE IF NOT EXISTS pattern_task_types (
      pattern_id  TEXT NOT NULL,
      task_type   TEXT NOT NULL,
      PRIMARY KEY (pattern_id, task_type),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_snippets: `
    CREATE TABLE IF NOT EXISTS pattern_snippets (
      pattern_id  TEXT NOT NULL,
      snippet_id  TEXT NOT NULL,
      snippet_order INTEGER DEFAULT 0,
      is_primary  INTEGER DEFAULT 0,
      PRIMARY KEY (pattern_id, snippet_id),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_envs: `
    CREATE TABLE IF NOT EXISTS pattern_envs (
      pattern_id  TEXT NOT NULL,
      env         TEXT NOT NULL,
      PRIMARY KEY (pattern_id, env),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_tags: `
    CREATE TABLE IF NOT EXISTS pattern_tags (
      pattern_id  TEXT NOT NULL,
      tag         TEXT NOT NULL,
      PRIMARY KEY (pattern_id, tag),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  snippets: `
    CREATE TABLE IF NOT EXISTS snippets (
      snippet_id    TEXT PRIMARY KEY,
      pattern_id    TEXT NOT NULL,
      language      TEXT NOT NULL,
      code          TEXT NOT NULL,
      file_path     TEXT,
      line_start    INTEGER,
      line_end      INTEGER,
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  // Pattern metadata tables
  pattern_metadata: `
    CREATE TABLE IF NOT EXISTS pattern_metadata (
      pattern_id            TEXT PRIMARY KEY,
      implementation_guide  TEXT,
      validation_rules      TEXT,
      performance_impact    TEXT,
      migration_notes       TEXT,
      compatibility_notes   TEXT,
      security_notes        TEXT,
      testing_notes         TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_triggers: `
    CREATE TABLE IF NOT EXISTS pattern_triggers (
      trigger_id    TEXT PRIMARY KEY,
      pattern_id    TEXT NOT NULL,
      trigger_type  TEXT NOT NULL,
      trigger_value TEXT NOT NULL,
      priority      INTEGER DEFAULT 0,
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  pattern_vocab: `
    CREATE TABLE IF NOT EXISTS pattern_vocab (
      pattern_id  TEXT NOT NULL,
      term        TEXT NOT NULL,
      definition  TEXT,
      usage_notes TEXT,
      PRIMARY KEY (pattern_id, term),
      FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
    )`,

  // Task system tables
  tasks: `
    CREATE TABLE IF NOT EXISTS tasks (
      id            TEXT PRIMARY KEY,
      identifier    TEXT,
      title         TEXT NOT NULL,
      type          TEXT,
      status        TEXT DEFAULT 'active',
      phase         TEXT,
      brief         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at  TEXT,
      outcome       TEXT,
      confidence    REAL
    )`,

  task_files: `
    CREATE TABLE IF NOT EXISTS task_files (
      task_id       TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      purpose       TEXT,
      PRIMARY KEY (task_id, file_path),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

  task_similarity: `
    CREATE TABLE IF NOT EXISTS task_similarity (
      task_id       TEXT NOT NULL,
      similar_id    TEXT NOT NULL,
      similarity    REAL NOT NULL,
      PRIMARY KEY (task_id, similar_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

  task_evidence: `
    CREATE TABLE IF NOT EXISTS task_evidence (
      id            TEXT PRIMARY KEY,
      task_id       TEXT NOT NULL,
      type          TEXT NOT NULL,
      content       TEXT NOT NULL,
      metadata      TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

  task_checkpoints: `
    CREATE TABLE IF NOT EXISTS task_checkpoints (
      id            TEXT PRIMARY KEY,
      task_id       TEXT NOT NULL,
      message       TEXT NOT NULL,
      confidence    REAL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,

  // Migration tracking
  migrations: `
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    )`,

  migration_versions: `
    CREATE TABLE IF NOT EXISTS migration_versions (
      version INTEGER PRIMARY KEY,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    )`,
};

// Full-text search tables
export const FTS_SCHEMA_SQL = {
  patterns_fts: `
    CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
      id UNINDEXED,
      type,
      category,
      subcategory,
      title,
      summary,
      problem,
      solution,
      implementation,
      examples,
      content=patterns,
      content_rowid=rowid,
      tokenize='porter'
    )`,

  // FTS triggers
  patterns_fts_triggers: {
    insert: `
      CREATE TRIGGER IF NOT EXISTS patterns_fts_insert AFTER INSERT ON patterns
      BEGIN
        INSERT INTO patterns_fts(id, title, summary, tags, keywords, search_index)
        VALUES (new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END`,

    update: `
      CREATE TRIGGER IF NOT EXISTS patterns_fts_update AFTER UPDATE ON patterns
      BEGIN
        UPDATE patterns_fts 
        SET title = new.title,
            summary = new.summary,
            tags = new.tags,
            keywords = new.keywords,
            search_index = new.search_index
        WHERE id = new.id;
      END`,

    delete: `
      CREATE TRIGGER IF NOT EXISTS patterns_fts_delete AFTER DELETE ON patterns
      BEGIN
        DELETE FROM patterns_fts WHERE id = old.id;
      END`,
  },
};

// Export function to get all schema SQL in order
export function getAllSchemaSql(): string[] {
  const statements: string[] = [];

  // Core tables first
  statements.push(SCHEMA_SQL.patterns);

  // Facet tables
  statements.push(
    SCHEMA_SQL.pattern_languages,
    SCHEMA_SQL.pattern_frameworks,
    SCHEMA_SQL.pattern_paths,
    SCHEMA_SQL.pattern_repos,
    SCHEMA_SQL.pattern_task_types,
    SCHEMA_SQL.pattern_snippets,
    SCHEMA_SQL.pattern_envs,
    SCHEMA_SQL.pattern_tags,
    SCHEMA_SQL.snippets,
  );

  // Metadata tables
  statements.push(
    SCHEMA_SQL.pattern_metadata,
    SCHEMA_SQL.pattern_triggers,
    SCHEMA_SQL.pattern_vocab,
  );

  // Task tables
  statements.push(
    SCHEMA_SQL.tasks,
    SCHEMA_SQL.task_files,
    SCHEMA_SQL.task_similarity,
    SCHEMA_SQL.task_evidence,
    SCHEMA_SQL.task_checkpoints,
  );

  // Migration tables
  statements.push(SCHEMA_SQL.migrations, SCHEMA_SQL.migration_versions);

  // FTS tables and triggers
  statements.push(
    FTS_SCHEMA_SQL.patterns_fts,
    FTS_SCHEMA_SQL.patterns_fts_triggers.insert,
    FTS_SCHEMA_SQL.patterns_fts_triggers.update,
    FTS_SCHEMA_SQL.patterns_fts_triggers.delete,
  );

  return statements;
}

// Export indices creation statements
export const INDICES_SQL = {
  patterns_indices: [
    `CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns(category)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_trust_score ON patterns(trust_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_usage_count ON patterns(usage_count DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_updated_at ON patterns(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_invalid ON patterns(invalid)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_status ON patterns(status)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_alias ON patterns(alias)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_provenance ON patterns(provenance)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_quality ON patterns(quality_score_cached, last_activity_at)`,
    `CREATE INDEX IF NOT EXISTS idx_patterns_quarantine ON patterns(quarantine_date) WHERE quarantine_date IS NOT NULL`,
  ],

  task_indices: [
    `CREATE INDEX IF NOT EXISTS idx_tasks_identifier ON tasks(identifier)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_task_evidence_task_id ON task_evidence(task_id)`,
    `CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task_id ON task_checkpoints(task_id)`,
  ],
};
