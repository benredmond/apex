/**
 * Migration to add missing schema tables
 * These tables are created in fresh database but missing from migrations
 */

import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "016-add-missing-schema-tables",
  version: 16,
  name: "Add missing schema tables (pattern_snippets, snippets, task_checkpoints)",

  up: (db: Database.Database) => {
    db.transaction(() => {
      console.log("Adding missing schema tables...");

      // Create pattern_snippets table if it doesn't exist
      const patternSnippetsExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='pattern_snippets'",
        )
        .get();

      if (!patternSnippetsExists) {
        db.exec(`
          CREATE TABLE pattern_snippets (
            pattern_id  TEXT NOT NULL,
            snippet_id  TEXT NOT NULL,
            content     TEXT NOT NULL,
            language    TEXT,
            PRIMARY KEY (pattern_id, snippet_id),
            FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
          )
        `);
        console.log("Created pattern_snippets table");
      }

      // Create snippets table if it doesn't exist
      const snippetsExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='snippets'",
        )
        .get();

      if (!snippetsExists) {
        db.exec(`
          CREATE TABLE snippets (
            snippet_id    TEXT PRIMARY KEY,
            pattern_id    TEXT NOT NULL,
            label         TEXT,
            language      TEXT,
            file_ref      TEXT,
            line_count    INTEGER,
            bytes         INTEGER,
            FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
          )
        `);
        console.log("Created snippets table");
      }

      // Create task_checkpoints table if it doesn't exist
      const taskCheckpointsExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='task_checkpoints'",
        )
        .get();

      if (!taskCheckpointsExists) {
        db.exec(`
          CREATE TABLE task_checkpoints (
            id            TEXT PRIMARY KEY,
            task_id       TEXT NOT NULL,
            phase         TEXT NOT NULL,
            message       TEXT NOT NULL,
            confidence    REAL DEFAULT 0.5,
            created_at    TEXT NOT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          )
        `);
        
        // Create index for task_checkpoints
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_task_checkpoints_task ON task_checkpoints(task_id, created_at)",
        );
        
        console.log("Created task_checkpoints table");
      }

      console.log("Missing schema tables added successfully");
    })();
  },

  down: (db: Database.Database) => {
    db.transaction(() => {
      // Drop indexes first
      db.exec("DROP INDEX IF EXISTS idx_task_checkpoints_task");
      
      // Drop tables
      db.exec("DROP TABLE IF EXISTS pattern_snippets");
      db.exec("DROP TABLE IF EXISTS snippets");
      db.exec("DROP TABLE IF EXISTS task_checkpoints");

      console.log("Rolled back missing schema tables");
    })();
  },

  validate: (db: Database.Database): boolean => {
    try {
      // Check all tables exist
      const tables = ["pattern_snippets", "snippets", "task_checkpoints"];
      
      for (const tableName of tables) {
        const table = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(tableName);
        if (!table) {
          console.error(`Validation failed: ${tableName} table not found`);
          return false;
        }
      }

      // Check index exists
      const index = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_task_checkpoints_task'",
        )
        .get();
      if (!index) {
        console.error("Validation failed: idx_task_checkpoints_task index not found");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Validation error:", error);
      return false;
    }
  },
};