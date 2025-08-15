/**
 * Migration 015: Project-based pattern isolation
 *
 * This migration prepares the database for project-based isolation by:
 * 1. Adding a source_project column to track pattern origin
 * 2. Adding metadata for migration tracking
 * 3. Creating indices for efficient project-based queries
 *
 * Note: The actual data migration to project-specific databases
 * happens transparently when the new code detects a legacy database.
 */

import type { Migration } from "./types.js";

export const migration: Migration = {
  id: "015-project-isolation",
  version: 15,
  name: "Add project isolation support",

  up: (db) => {
    db.transaction(() => {
      console.log("Adding project isolation support...");

      // Add source_project column to patterns table to track origin
      // This helps when patterns are shared or migrated between projects
      const hasSourceProject = db
        .prepare(
          "SELECT COUNT(*) as count FROM pragma_table_info('patterns') WHERE name = 'source_project'",
        )
        .get() as { count: number };

      if (hasSourceProject.count === 0) {
        db.prepare(
          `
          ALTER TABLE patterns 
          ADD COLUMN source_project TEXT
        `,
        ).run();
        console.log("Added source_project column to patterns table");
      }

      // Add project_path column to track the original project location
      const hasProjectPath = db
        .prepare(
          "SELECT COUNT(*) as count FROM pragma_table_info('patterns') WHERE name = 'project_path'",
        )
        .get() as { count: number };

      if (hasProjectPath.count === 0) {
        db.prepare(
          `
          ALTER TABLE patterns 
          ADD COLUMN project_path TEXT
        `,
        ).run();
        console.log("Added project_path column to patterns table");
      }

      // Create index for efficient project-based queries
      db.prepare(
        `
        CREATE INDEX IF NOT EXISTS idx_patterns_source_project 
        ON patterns(source_project)
      `,
      ).run();
      console.log("Created index on source_project");

      // Add migration metadata table for tracking project migrations
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS project_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_path TEXT NOT NULL,
          target_path TEXT NOT NULL,
          pattern_count INTEGER NOT NULL,
          migrated_at TEXT NOT NULL DEFAULT (datetime('now')),
          migration_type TEXT CHECK(migration_type IN ('auto', 'manual', 'import')) DEFAULT 'auto'
        )
      `,
      ).run();
      console.log("Created project_migrations tracking table");

      // Add project_config table for project-specific settings
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS project_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `,
      ).run();
      console.log("Created project_config table");

      // Store the current project identifier if we can determine it
      try {
        const currentPath = process.cwd();
        db.prepare(
          `
          INSERT OR REPLACE INTO project_config (key, value)
          VALUES ('current_project_path', ?)
        `,
        ).run(currentPath);
        console.log(`Stored current project path: ${currentPath}`);
      } catch (error) {
        console.log("Could not determine current project path");
      }

      console.log("Project isolation support added successfully");
    })();
  },

  down: (db) => {
    db.transaction(() => {
      console.log("Removing project isolation support...");

      // Remove indices
      db.prepare("DROP INDEX IF EXISTS idx_patterns_source_project").run();

      // Note: We don't remove the columns as SQLite doesn't support
      // dropping columns easily and they won't cause issues if left

      // Remove tracking tables
      db.prepare("DROP TABLE IF EXISTS project_migrations").run();
      db.prepare("DROP TABLE IF EXISTS project_config").run();

      console.log("Project isolation support removed");
    })();
  },

  validate: (db) => {
    // Check that source_project column exists
    const hasColumn = db
      .prepare(
        "SELECT COUNT(*) as count FROM pragma_table_info('patterns') WHERE name = 'source_project'",
      )
      .get() as { count: number };

    if (hasColumn.count === 0) {
      throw new Error(
        "Migration validation failed: source_project column not found",
      );
    }

    // Check that tracking tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('project_migrations', 'project_config')",
      )
      .all() as { name: string }[];

    if (tables.length !== 2) {
      throw new Error("Migration validation failed: tracking tables not found");
    }

    return true;
  },
};
