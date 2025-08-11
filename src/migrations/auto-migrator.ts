/**
 * Auto-migration system for APEX
 * Transparently applies migrations without user intervention
 */

import Database from "better-sqlite3";
import { MigrationRunner } from "./MigrationRunner.js";
import { MigrationLoader } from "./MigrationLoader.js";
import { ApexConfig } from "../config/apex-config.js";
import chalk from "chalk";
import ora from "ora";

export class AutoMigrator {
  private db: Database.Database;
  private runner: MigrationRunner;
  private loader: MigrationLoader;

  constructor(dbPath: string = ApexConfig.getDbPath()) {
    this.db = new Database(dbPath);
    this.runner = new MigrationRunner(this.db);
    this.loader = new MigrationLoader();
  }

  /**
   * Auto-apply any pending migrations
   * Silent unless there's an error
   */
  async autoMigrate(options: { silent?: boolean } = {}): Promise<boolean> {
    try {
      // Check if migrations table exists
      this.ensureMigrationsTable();

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

      // Apply migrations
      try {
        await this.runner.runMigrations(migrations);
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
      this.db.close();
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
   * Quick check if migrations are needed
   */
  static async needsMigration(dbPath?: string): Promise<boolean> {
    const migrator = new AutoMigrator(dbPath);
    try {
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
      migrator.db.close();
    }
  }
}
