// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs-extra';
import type { Pattern, Migration } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PatternDatabase {
  private db: Database.Database;
  private statements: Map<string, Database.Statement> = new Map();

  constructor(dbPath: string = '.apex/patterns.db') {
    // Ensure directory exists
    fs.ensureDirSync(path.dirname(dbPath));
    
    this.db = new Database(dbPath);
    
    // Enable WAL mode for concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('temp_store = MEMORY');
    
    // Initialize schema
    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    // Core pattern table
    this.db.exec(`
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
        invalid_reason    TEXT
      );
    `);

    // Facet tables
    this.db.exec(`
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

      CREATE TABLE IF NOT EXISTS pattern_tags (
        pattern_id  TEXT NOT NULL,
        tag         TEXT NOT NULL,
        PRIMARY KEY (pattern_id, tag),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS snippets (
        snippet_id    TEXT PRIMARY KEY,
        pattern_id    TEXT NOT NULL,
        label         TEXT,
        language      TEXT,
        file_ref      TEXT,
        line_count    INTEGER,
        bytes         INTEGER,
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );
    `);

    // Full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        content=''
      );
    `);

    // FTS triggers
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS patterns_ai AFTER INSERT ON patterns BEGIN
        INSERT INTO patterns_fts (rowid, id, title, summary)
        VALUES (new.rowid, new.id, new.title, new.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS patterns_ad AFTER DELETE ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary);
      END;

      CREATE TRIGGER IF NOT EXISTS patterns_au AFTER UPDATE OF title, summary ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary);
        INSERT INTO patterns_fts (rowid, id, title, summary)
        VALUES (new.rowid, new.id, new.title, new.summary);
      END;
    `);

    // Schema versioning
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '0.3');
    `);

    // Migrations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id         TEXT PRIMARY KEY,
        sql        TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    // Create indices
    this.createIndices();
  }

  private createIndices(): void {
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_digest ON patterns(pattern_digest)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_invalid ON patterns(invalid)',
      'CREATE INDEX IF NOT EXISTS idx_langs_lang ON pattern_languages(lang)',
      'CREATE INDEX IF NOT EXISTS idx_frameworks_fw ON pattern_frameworks(framework)',
      'CREATE INDEX IF NOT EXISTS idx_paths_glob ON pattern_paths(glob)',
      'CREATE INDEX IF NOT EXISTS idx_repos_glob ON pattern_repos(repo_glob)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_type ON pattern_task_types(task_type)',
      'CREATE INDEX IF NOT EXISTS idx_envs_env ON pattern_envs(env)',
      'CREATE INDEX IF NOT EXISTS idx_tags_tag ON pattern_tags(tag)',
    ];

    for (const idx of indices) {
      this.db.exec(idx);
    }
  }

  private prepareStatements(): void {
    // Prepare commonly used statements
    this.statements.set('getPattern', this.db.prepare(
      'SELECT * FROM patterns WHERE id = ? AND invalid = 0'
    ));

    this.statements.set('upsertPattern', this.db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, source_repo, tags_csv,
        pattern_digest, json_canonical, invalid, invalid_reason
      ) VALUES (
        @id, @schema_version, @pattern_version, @type, @title, @summary,
        @trust_score, @created_at, @updated_at, @source_repo, @tags_csv,
        @pattern_digest, @json_canonical, @invalid, @invalid_reason
      )
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        pattern_version = excluded.pattern_version,
        type = excluded.type,
        title = excluded.title,
        summary = excluded.summary,
        trust_score = excluded.trust_score,
        updated_at = excluded.updated_at,
        source_repo = excluded.source_repo,
        tags_csv = excluded.tags_csv,
        pattern_digest = excluded.pattern_digest,
        json_canonical = excluded.json_canonical,
        invalid = excluded.invalid,
        invalid_reason = excluded.invalid_reason
    `));

    this.statements.set('deletePattern', this.db.prepare(
      'DELETE FROM patterns WHERE id = ?'
    ));

    this.statements.set('searchPatterns', this.db.prepare(`
      SELECT p.id, p.title, p.summary, bm25(patterns_fts) AS rank
      FROM patterns_fts
      JOIN patterns p ON p.rowid = patterns_fts.rowid
      WHERE patterns_fts MATCH ?
      AND p.invalid = 0
      ORDER BY rank
      LIMIT ?
    `));
  }

  public transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  public getStatement(name: string): Database.Statement {
    const stmt = this.statements.get(name);
    if (!stmt) {
      throw new Error(`Statement ${name} not found`);
    }
    return stmt;
  }

  public prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public close(): void {
    this.db.close();
  }

  // Migration support
  public async runMigrations(migrations: Migration[]): Promise<void> {
    const applied = this.db.prepare('SELECT id FROM migrations').all() as { id: string }[];
    const appliedIds = new Set(applied.map(m => m.id));

    for (const migration of migrations) {
      if (!appliedIds.has(migration.id)) {
        const transaction = this.db.transaction(() => {
          this.db.exec(migration.sql);
          this.db.prepare('INSERT INTO migrations (id, sql, applied_at) VALUES (?, ?, ?)')
            .run(migration.id, migration.sql, new Date().toISOString());
        });
        transaction();
      }
    }
  }

  public getSchemaVersion(): string {
    const result = this.db.prepare('SELECT value FROM schema_meta WHERE key = ?')
      .get('schema_version') as { value: string };
    return result?.value || '0.1';
  }
}