/**
 * Migration 013: Add quality metadata columns to patterns table
 * [APE-29] Pattern Quality & Freshness System
 */

import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "013-add-quality-metadata",
  version: 13,
  name: "Add quality metadata columns to patterns table",

  up: (db: Database.Database) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      console.log("Adding quality metadata columns to patterns table...");

      // Check if columns already exist
      const columns = (db.pragma("table_info(patterns)") as any[]).map((col: any) => col.name);
      
      if (!columns.includes("last_activity_at")) {
        db.exec("ALTER TABLE patterns ADD COLUMN last_activity_at TEXT");
        console.log("Added last_activity_at column");
      }
      
      if (!columns.includes("quality_score_cached")) {
        db.exec("ALTER TABLE patterns ADD COLUMN quality_score_cached REAL");
        console.log("Added quality_score_cached column");
      }
      
      if (!columns.includes("cache_timestamp")) {
        db.exec("ALTER TABLE patterns ADD COLUMN cache_timestamp TEXT");
        console.log("Added cache_timestamp column");
      }
      
      if (!columns.includes("semver_constraints")) {
        db.exec("ALTER TABLE patterns ADD COLUMN semver_constraints TEXT");
        console.log("Added semver_constraints column");
      }
      
      if (!columns.includes("quarantine_reason")) {
        db.exec("ALTER TABLE patterns ADD COLUMN quarantine_reason TEXT");
        console.log("Added quarantine_reason column");
      }
      
      if (!columns.includes("quarantine_date")) {
        db.exec("ALTER TABLE patterns ADD COLUMN quarantine_date TEXT");
        console.log("Added quarantine_date column");
      }

      // Create indexes for quality score queries
      db.exec("CREATE INDEX IF NOT EXISTS idx_patterns_quality_score ON patterns(quality_score_cached)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_patterns_last_activity ON patterns(last_activity_at)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_patterns_quarantine ON patterns(quarantine_reason)");
      console.log("Created quality indexes");

      // Initialize last_activity_at from existing data
      db.exec(`
        UPDATE patterns 
        SET last_activity_at = created_at
        WHERE last_activity_at IS NULL
      `);
      console.log("Initialized last_activity_at from existing data");
    })();
  },

  down: (db: Database.Database) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      console.log("Removing quality metadata indexes...");
      
      // Remove indexes
      db.exec("DROP INDEX IF EXISTS idx_patterns_quality_score");
      db.exec("DROP INDEX IF EXISTS idx_patterns_last_activity");
      db.exec("DROP INDEX IF EXISTS idx_patterns_quarantine");
      
      // Note: SQLite doesn't support DROP COLUMN directly
      // Would need to recreate table without these columns
      console.log("Note: Columns not removed (SQLite limitation). Indexes removed.");
    })();
  }
};
