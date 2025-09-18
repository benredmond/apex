/**
 * Auto-migration system for APEX
 * Transparently applies migrations without user intervention
 */

import {
  DatabaseAdapterFactory,
  type DatabaseAdapter,
  type Statement,
  type StatementResult,
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
  private externalAdapter?: DatabaseAdapter;
  private usingExternalAdapter: boolean = false;

  constructor(dbPathOrAdapter?: string | DatabaseAdapter | any) {
    this.loader = new MigrationLoader();

    if (dbPathOrAdapter && typeof dbPathOrAdapter !== "string") {
      const adapter = this.normalizeAdapter(dbPathOrAdapter);
      this.externalAdapter = adapter;
      this.adapter = adapter;
      this.db = adapter.getInstance();
      this.runner = new MigrationRunner(adapter);
      this.initialized = true;
      this.usingExternalAdapter = true;
      // Default path only used when lock needed; skip for external adapters
      this.dbPath = ApexConfig.getDbPath();
    } else {
      // Use provided path or fall back to legacy sync method
      this.dbPath =
        typeof dbPathOrAdapter === "string"
          ? dbPathOrAdapter
          : ApexConfig.getDbPath();
    }
  }

  /**
   * Initialize database connection if not already initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    if (this.externalAdapter) {
      this.adapter = this.externalAdapter;
      this.db = this.externalAdapter.getInstance();
      this.runner = new MigrationRunner(this.externalAdapter);
      this.initialized = true;
      return;
    }

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
    const useLock = !this.usingExternalAdapter && finalPath !== ":memory:";
    const lock = useLock ? new MigrationLock(finalPath) : null;

    if (lock) {
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
    }

    try {
      // Check if this is a fresh database
      const isFreshDb = this.isFreshDatabase();

      if (isFreshDb) {
        // Fresh install - create full schema directly
        if (!options.silent) {
          console.log("Fresh database detected - creating schema directly...");
        }
        await this.createFullSchema();
        await this.markAllMigrationsAsApplied();
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
      lock?.release();
      if (this.db && this.adapter && !this.usingExternalAdapter) {
        this.adapter.close();
      }
    }
  }

  /**
   * Legacy alias maintained for compatibility with Jest-era tests
   */
  async migrate(options: { silent?: boolean } = {}): Promise<boolean> {
    return this.autoMigrate(options);
  }

  async rollback(
    targetVersion: number,
    options: { dryRun?: boolean } = {},
  ): Promise<void> {
    await this.ensureInitialized();

    if (!this.runner) {
      throw new Error("Migration runner not initialized");
    }

    const migrations = await this.loader.loadMigrations();
    if (!migrations.length) {
      console.warn("AutoMigrator: No migrations loaded while marking as applied");
    }
    const rollbackTarget = Math.max(targetVersion - 1, 0);
    await this.runner.rollbackMigrations(migrations, rollbackTarget, options);
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
  private async createFullSchema(): Promise<void> {
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
  private async markAllMigrationsAsApplied(): Promise<void> {
    const now = new Date().toISOString();
    const migrations = await this.loader.loadMigrations();

    if (!migrations.length) {
      console.warn(
        "AutoMigrator: No migrations loaded while marking as applied",
      );
    }

    if (!this.adapter) {
      throw new Error("AutoMigrator adapter not initialized");
    }

    this.adapter.exec("BEGIN");
    try {
      const stmt = this.adapter.prepare(
        "INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)",
      );

      for (const migration of migrations) {
        stmt.run(
          migration.version,
          migration.id,
          migration.name,
          migration.checksum ?? "fresh-install",
          now,
          0,
        );
      }

      this.adapter.exec("COMMIT");
    } catch (error) {
      this.adapter.exec("ROLLBACK");
      throw error;
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

  private normalizeAdapter(candidate: any): DatabaseAdapter {
    if (this.isDatabaseAdapter(candidate)) {
      return candidate;
    }
    if (this.looksLikeLegacyDatabase(candidate)) {
      return this.createAdapterFromLegacyInstance(candidate);
    }

    throw new Error(
      "AutoMigrator: Unsupported database instance provided. Expected DatabaseAdapter or compatible database object.",
    );
  }

  private isDatabaseAdapter(value: any): value is DatabaseAdapter {
    return (
      value &&
      typeof value === "object" &&
      typeof value.prepare === "function" &&
      typeof value.exec === "function" &&
      typeof value.transaction === "function" &&
      typeof value.close === "function" &&
      typeof value.getInstance === "function"
    );
  }

  private looksLikeLegacyDatabase(value: any): boolean {
    return value && typeof value.prepare === "function";
  }

  private createAdapterFromLegacyInstance(instance: any): DatabaseAdapter {
    const wrapStatement = (stmt: any): Statement => ({
      run: (...params: any[]): StatementResult => {
        const result = stmt.run(...params) || {};
        return {
          changes: result.changes ?? 0,
          lastInsertRowid: result.lastInsertRowid ?? 0,
        };
      },
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
    });

    return {
      prepare: (sql: string) => wrapStatement(instance.prepare(sql)),
      exec: (sql: string) => instance.exec(sql),
      pragma: (pragmaString: string) =>
        typeof instance.pragma === "function"
          ? instance.pragma(pragmaString)
          : undefined,
      transaction: <T>(fn: () => T) => {
        if (typeof instance.transaction === "function") {
          return instance.transaction(fn);
        }
        return () => {
          instance.exec("BEGIN");
          try {
            const result = fn();
            instance.exec("COMMIT");
            return result;
          } catch (error) {
            instance.exec("ROLLBACK");
            throw error;
          }
        };
      },
      close: () => {
        if (typeof instance.close === "function") {
          instance.close();
        }
      },
      isNodeSqlite: () => false,
      getInstance: () => instance,
      supportsFTSTriggers: () => true,
    };
  }
}
