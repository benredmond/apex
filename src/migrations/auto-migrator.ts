/**
 * Auto-migration system for APEX
 * Transparently applies migrations without user intervention
 */

import {
  DatabaseAdapterFactory,
  type DatabaseAdapter,
} from "../storage/database-adapter.js";
import { MigrationRunner } from "./MigrationRunner.js";
import { MigrationLoader } from "./MigrationLoader.js";
import { MigrationLock } from "./migration-lock.js";
import { ApexConfig } from "../config/apex-config.js";
import {
  getAllSchemaSql,
  INDICES_SQL,
  SCHEMA_SQL,
} from "../storage/schema-constants.js";
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
        version INTEGER PRIMARY KEY,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT,
        applied_at TEXT NOT NULL,
        execution_time_ms INTEGER
      )
    `);
  }

  /**
   * Ensure patterns table exists with minimal schema
   * This allows migrations to add columns incrementally
   */
  private ensurePatternsTable(): void {
    // [PAT:CLEAN:SINGLE_SOURCE] - Use centralized schema from schema-constants.ts
    // This ensures consistency between fresh installs and migrations
    this.db.exec(SCHEMA_SQL.patterns);

    // Also create pattern_tags table
    this.db.exec(SCHEMA_SQL.pattern_tags);
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
   * [PAT:CLEAN:SINGLE_SOURCE] - Use centralized schema definitions
   */
  private createFullSchema(): void {
    // Create migrations table first
    this.ensureMigrationsTable();

    // Get all schema SQL statements from centralized source
    const schemaSql = getAllSchemaSql();

    // Execute each schema statement
    for (const statement of schemaSql) {
      this.db.exec(statement);
    }

    // Create all indices
    for (const indexSql of INDICES_SQL.patterns_indices) {
      this.db.exec(indexSql);
    }

    for (const indexSql of INDICES_SQL.task_indices) {
      this.db.exec(indexSql);
    }

    console.log("Full schema created from centralized definitions");
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
        id: "015-project-isolation",
        name: "Add project isolation support",
      },
      {
        version: 16,
        id: "016-add-missing-schema-tables",
        name: "Add missing schema tables",
      },
      {
        version: 17,
        id: "017-fix-fts-rowid-join",
        name: "Fix FTS join from rowid to id",
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
