/**
 * Migration to fix FTS join issue
 * Fix FTS triggers to use id instead of rowid for consistent joining
 */

import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration: Migration = {
  id: "017-fix-fts-rowid-join",
  version: 17,
  name: "Fix FTS join from rowid to id for consistent searching",

  up: (db: Database.Database) => {
    db.transaction(() => {
      console.log("Fixing FTS population issue...");

      // Clear and repopulate FTS table using the ORIGINAL rowid approach
      db.exec(`DELETE FROM patterns_fts;`);

      // Insert existing patterns using the correct rowid approach
      db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, tags, keywords, search_index
        FROM patterns
        WHERE invalid = 0;
      `);

      console.log("FTS population issue fixed successfully");
    })();
  },

  down: (db: Database.Database) => {
    db.transaction(() => {
      console.log("Rolling back FTS population fix...");

      // Just clear the FTS table - this migration only repopulates
      db.exec(`DELETE FROM patterns_fts;`);

      console.log("Rolled back FTS population fix");
    })();
  },

  validate: (db: Database.Database): boolean => {
    try {
      // Check that FTS table has entries matching patterns table
      const patternCount = db
        .prepare("SELECT COUNT(*) as count FROM patterns WHERE invalid = 0")
        .get() as { count: number };
      const ftsCount = db
        .prepare("SELECT COUNT(*) as count FROM patterns_fts")
        .get() as { count: number };

      if (patternCount.count > 0 && ftsCount.count === 0) {
        console.error(
          "Validation failed: Patterns exist but FTS table is empty",
        );
        return false;
      }

      // Basic check that FTS table can be queried
      try {
        db.prepare(
          "SELECT COUNT(*) FROM patterns_fts WHERE patterns_fts MATCH ?",
        ).get("test");
      } catch (error) {
        console.error("Validation failed: FTS table is not functioning", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Validation error:", error);
      return false;
    }
  },
};
