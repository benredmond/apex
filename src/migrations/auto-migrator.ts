/**
 * Auto-migration system for APEX
 * Transparently applies migrations without user intervention
 */

import { DatabaseAdapterFactory, type DatabaseAdapter } from "../storage/database-adapter.js";
import { MigrationRunner } from "./MigrationRunner.js";
import { MigrationLoader } from "./MigrationLoader.js";
import { MigrationLock } from "./migration-lock.js";
import { ApexConfig } from "../config/apex-config.js";
import chalk from "chalk";
import ora from "ora";

export class AutoMigrator {
  private db: any; // The raw database instance from adapter.getInstance()
  private adapter: DatabaseAdapter | null = null;
  private dbPath: string;
  private runner: MigrationRunner;
  private loader: MigrationLoader;
  private initialized: boolean = false;

  constructor(dbPath?: string) {
    // Use provided path or fall back to legacy sync method
    this.dbPath = dbPath || ApexConfig.getDbPath();
    // Defer database initialization to allow async factory pattern
    this.loader = new MigrationLoader();
  }

  /**
   * Initialize database connection if not already initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    // [PAT:ADAPTER:DELEGATION] ★★★★☆ (12 uses, 92% success) - Use factory for database creation
    this.adapter = await DatabaseAdapterFactory.create(this.dbPath);
    this.db = this.adapter.getInstance();
    this.runner = new MigrationRunner(this.adapter);
    this.initialized = true;
  }

  /**
   * Auto-apply any pending migrations
   * Silent unless there's an error
   */
  async autoMigrate(options: { silent?: boolean } = {}): Promise<boolean> {
    // Ensure database is initialized
    await this.ensureInitialized();
    
    // Get database path for lock file
    const finalPath = this.dbPath;
    const lock = new MigrationLock(finalPath);

    // Try to acquire migration lock
    if (!lock.tryAcquire()) {
      if (!options.silent) {
        console.log("Another process is running migrations, waiting...");
      }

      // Wait for lock to be available (max 30 seconds)
      const lockAvailable = await lock.waitForLock(30000);

      if (!lockAvailable) {
        const lockInfo = lock.getLockInfo();
        if (!options.silent) {
          console.error(chalk.red("Failed to acquire migration lock"));
          if (lockInfo) {
            console.error(
              chalk.yellow(
                `Lock held by process ${lockInfo.pid} for ${Math.floor(lockInfo.age / 1000)}s`,
              ),
            );
          }
        }
        return false;
      }

      // Try to acquire again after waiting
      if (!lock.tryAcquire()) {
        if (!options.silent) {
          console.error(
            chalk.red("Failed to acquire migration lock after waiting"),
          );
        }
        return false;
      }
    }

    try {
      // Check if this is a fresh database
      const isFreshDb = this.isFreshDatabase();

      if (isFreshDb) {
        // Fresh install - create full schema directly
        if (!options.silent) {
          console.log("Fresh database detected - creating schema directly...");
        }
        this.createFullSchema();
        this.markAllMigrationsAsApplied();
        return true;
      }

      // Existing database - run migrations normally
      this.ensureMigrationsTable();

      // Ensure patterns table exists before running migrations
      this.ensurePatternsTable();

      // Load all migrations
      const migrations = await this.loader.loadMigrations();

      // Check for pending
      const status = this.runner.getStatus(migrations);
      const pending = status.pending;

      if (pending.length === 0) {
        return true; // Nothing to do
      }

      // Show progress if not silent
      let spinner: any = null;
      if (!options.silent) {
        spinner = ora(
          `Updating database (${pending.length} updates)...`,
        ).start();
      }

      // Apply migrations with force flag to handle checksum mismatches from rebuilds
      try {
        await this.runner.runMigrations(migrations, { force: true });
      } catch (error) {
        if (spinner) {
          spinner.fail(chalk.red("Database update failed"));
        }
        console.error(
          chalk.red("\nError:"),
          ApexConfig.ERROR_MESSAGES.MIGRATION_FAILED,
        );
        return false;
      }

      if (spinner) {
        spinner.succeed(chalk.green(`Database updated successfully`));
      }

      return true;
    } catch (error) {
      if (!options.silent) {
        console.error(chalk.red("Auto-migration failed:"), error);
      }
      return false;
    } finally {
      // Always release lock and close database
      lock.release();
      if (this.db && this.adapter) {
        this.adapter.close();
      }
    }
  }

  /**
   * Ensure migrations tracking table exists
   */
  private ensureMigrationsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Ensure patterns table exists with minimal schema
   * This allows migrations to add columns incrementally
   */
  private ensurePatternsTable(): void {
    // Create patterns table with minimal required columns
    // Migrations will add additional columns as needed
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
        tags              TEXT,
        pattern_digest    TEXT NOT NULL,
        json_canonical    BLOB NOT NULL,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT
      )
    `);

    // Also create pattern_tags table needed by migration 014
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_tags (
        pattern_id  TEXT NOT NULL,
        tag         TEXT NOT NULL,
        PRIMARY KEY (pattern_id, tag),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      )
    `);
  }

  /**
   * Check if this is a fresh database with no tables
   */
  private isFreshDatabase(): boolean {
    const tables = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number };
    return tables.count === 0;
  }

  /**
   * Create the full current schema for fresh installs
   * This avoids running all migrations sequentially
   */
  private createFullSchema(): void {
    // Create migrations table first
    this.ensureMigrationsTable();

    // Create the complete current schema as of the latest migration
    // This is the final schema after all migrations have been applied
    this.db.exec(`
      -- Core patterns table with all columns
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
        tags              TEXT,
        pattern_digest    TEXT NOT NULL,
        json_canonical    BLOB NOT NULL,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT,
        alias             TEXT UNIQUE,
        keywords          TEXT,
        search_index      TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        status            TEXT DEFAULT 'active',
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
      );

      -- Facet tables
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

      CREATE TABLE IF NOT EXISTS pattern_snippets (
        pattern_id  TEXT NOT NULL,
        snippet_id  TEXT NOT NULL,
        content     TEXT NOT NULL,
        language    TEXT,
        PRIMARY KEY (pattern_id, snippet_id),
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

      -- Pattern metadata tables
      CREATE TABLE IF NOT EXISTS pattern_metadata (
        pattern_id            TEXT PRIMARY KEY,
        implementation_guide  TEXT,
        testing_notes         TEXT,
        performance_impact    TEXT,
        security_notes        TEXT,
        migration_path        TEXT,
        deprecation_notice    TEXT,
        related_patterns      TEXT,
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pattern_triggers (
        trigger_id    TEXT PRIMARY KEY,
        pattern_id    TEXT NOT NULL,
        trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('error', 'context', 'file', 'task')),
        trigger_value TEXT NOT NULL,
        confidence    REAL DEFAULT 0.5,
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pattern_vocab (
        pattern_id  TEXT NOT NULL,
        term        TEXT NOT NULL,
        term_type   TEXT NOT NULL CHECK (term_type IN ('concept', 'technology', 'action', 'entity')),
        importance  REAL DEFAULT 0.5,
        PRIMARY KEY (pattern_id, term),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );

      -- Task system tables
      CREATE TABLE IF NOT EXISTS tasks (
        id            TEXT PRIMARY KEY,
        identifier    TEXT,
        title         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active',
        type          TEXT,
        brief         TEXT,
        context       TEXT,
        phase         TEXT DEFAULT 'ARCHITECT',
        outcome       TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        completed_at  TEXT,
        tags          TEXT
      );

      CREATE TABLE IF NOT EXISTS task_files (
        task_id       TEXT NOT NULL,
        file_path     TEXT NOT NULL,
        operation     TEXT NOT NULL,
        PRIMARY KEY (task_id, file_path),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_similarity (
        task_id       TEXT NOT NULL,
        similar_id    TEXT NOT NULL,
        similarity    REAL NOT NULL,
        PRIMARY KEY (task_id, similar_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_evidence (
        id            TEXT PRIMARY KEY,
        task_id       TEXT NOT NULL,
        type          TEXT NOT NULL,
        content       TEXT NOT NULL,
        metadata      TEXT,
        created_at    TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id            TEXT PRIMARY KEY,
        task_id       TEXT NOT NULL,
        phase         TEXT NOT NULL,
        message       TEXT NOT NULL,
        confidence    REAL DEFAULT 0.5,
        metadata      TEXT,
        created_at    TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- Create all indexes
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_alias ON patterns(alias);
      CREATE INDEX IF NOT EXISTS idx_pattern_type ON patterns(type);
      CREATE INDEX IF NOT EXISTS idx_pattern_trust ON patterns(trust_score);
      CREATE INDEX IF NOT EXISTS idx_pattern_status ON patterns(status);
      CREATE INDEX IF NOT EXISTS idx_pattern_provenance ON patterns(provenance);
      CREATE INDEX IF NOT EXISTS idx_pattern_quality ON patterns(quality_score_cached, last_activity_at);
      CREATE INDEX IF NOT EXISTS idx_pattern_quarantine ON patterns(quarantine_date) WHERE quarantine_date IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pattern_metadata_trigger ON pattern_triggers(trigger_type, trigger_value);
      CREATE INDEX IF NOT EXISTS idx_pattern_vocab_term ON pattern_vocab(term);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_tasks_identifier ON tasks(identifier);
      CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase);
      CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks(tags);
      CREATE INDEX IF NOT EXISTS idx_task_evidence_task ON task_evidence(task_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task ON task_checkpoints(task_id, created_at);

      -- Full-text search with expanded fields from migration 004
      CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        tags,
        keywords,
        search_index,
        tokenize='unicode61'
      );
      
      -- FTS synchronization triggers (critical for search functionality)
      CREATE TRIGGER IF NOT EXISTS patterns_ai AFTER INSERT ON patterns BEGIN
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;
      
      CREATE TRIGGER IF NOT EXISTS patterns_ad AFTER DELETE ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
      END;
      
      CREATE TRIGGER IF NOT EXISTS patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;
    `);
  }

  /**
   * Mark all migrations as applied for fresh database
   */
  private markAllMigrationsAsApplied(): void {
    const now = new Date().toISOString();

    // Get all migration files
    const migrations = [
      {
        version: 1,
        id: "001-consolidate-patterns",
        name: "Consolidate pattern drafts into patterns table",
      },
      {
        version: 2,
        id: "002-pattern-metadata-enrichment",
        name: "Add pattern metadata enrichment tables",
      },
      {
        version: 3,
        id: "003-add-pattern-aliases",
        name: "Add human-readable aliases to patterns",
      },
      {
        version: 4,
        id: "004-add-pattern-search-fields",
        name: "Add enhanced search fields to patterns table",
      },
      {
        version: 5,
        id: "005-add-pattern-provenance",
        name: "Add provenance tracking to patterns",
      },
      {
        version: 6,
        id: "006-add-task-system-schema",
        name: "Add task system database schema",
      },
      {
        version: 7,
        id: "007-add-evidence-log-table",
        name: "Add task evidence log table",
      },
      {
        version: 8,
        id: "008-add-pattern-metadata-fields",
        name: "Add enhanced metadata fields to patterns table",
      },
      {
        version: 9,
        id: "009-populate-pattern-search-fields",
        name: "Populate search fields from json_canonical",
      },
      {
        version: 10,
        id: "010-add-task-tags",
        name: "Add tags column to tasks table",
      },
      {
        version: 11,
        id: "011-migrate-pattern-tags-to-json",
        name: "Migrate pattern tags from CSV to JSON format",
      },
      {
        version: 12,
        id: "012-rename-tags-csv-column",
        name: "Rename tags_csv column to tags",
      },
      {
        version: 13,
        id: "013-add-quality-metadata",
        name: "Add quality metadata columns to patterns table",
      },
      {
        version: 14,
        id: "014-populate-pattern-tags",
        name: "Populate pattern_tags table from JSON tags data",
      },
      {
        version: 15,
        id: "015-add-task-checkpoint-table",
        name: "Add task checkpoint tracking table",
      },
    ];

    const stmt = this.db.prepare(
      "INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)",
    );

    for (const migration of migrations) {
      stmt.run(
        migration.version,
        migration.id,
        migration.name,
        "fresh-install",
        now,
        0,
      );
    }
  }

  /**
   * Quick check if migrations are needed
   */
  static async needsMigration(dbPath?: string): Promise<boolean> {
    const migrator = new AutoMigrator(dbPath);
    try {
      // Ensure database is initialized
      await migrator.ensureInitialized();
      
      migrator.ensureMigrationsTable();
      const migrations = await migrator.loader.loadMigrations();

      const status = migrator.runner.getStatus(migrations);
      if (status.pending.length > 0) {
        return true;
      }
      return false;
    } catch {
      return true; // Assume migration needed if check fails
    } finally {
      if (migrator.db) {
        migrator.db.close();
      }
    }
  }
}
