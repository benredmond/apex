/**
 * Migration: Fix FTS trigger schema mismatches
 * 
 * Problem: Databases may have old FTS triggers that reference columns
 * that no longer exist in the patterns table (like category, subcategory,
 * problem, solution, implementation, examples).
 * 
 * Solution: Drop and recreate FTS triggers with the correct column set.
 */

import type { Migration } from "./types.js";
import type Database from "better-sqlite3";

export const migration018FixFtsTriggerSchema: Migration = {
  id: "018-fix-fts-trigger-schema",
  version: 18,
  name: "fix-fts-trigger-schema",
  
  up: async (db: Database.Database): Promise<void> => {
    // Drop all existing FTS-related triggers
    // These might reference old columns that no longer exist
    db.exec(`
      DROP TRIGGER IF EXISTS patterns_fts_insert;
      DROP TRIGGER IF EXISTS patterns_fts_update;
      DROP TRIGGER IF EXISTS patterns_fts_delete;
      DROP TRIGGER IF EXISTS patterns_ai;
      DROP TRIGGER IF EXISTS patterns_ad;
      DROP TRIGGER IF EXISTS patterns_au;
    `);
    
    // Recreate triggers with correct column mappings
    // These match the current FTS table schema: (id, title, summary, tags, keywords, search_index)
    db.exec(`
      CREATE TRIGGER patterns_ai AFTER INSERT ON patterns BEGIN
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;
    `);
    
    db.exec(`
      CREATE TRIGGER patterns_ad AFTER DELETE ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
      END;
    `);
    
    db.exec(`
      CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
      END;
    `);
    
    // Verify triggers were created
    const triggers = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='trigger' 
      AND tbl_name='patterns' 
      AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
    `).all() as { name: string }[];
    
    if (triggers.length !== 3) {
      throw new Error(`Expected 3 FTS triggers, found ${triggers.length}`);
    }
  },
  
  down: async (db: Database.Database): Promise<void> => {
    // Rollback: Remove the triggers (they'll be recreated by the database init)
    db.exec(`
      DROP TRIGGER IF EXISTS patterns_ai;
      DROP TRIGGER IF EXISTS patterns_ad;
      DROP TRIGGER IF EXISTS patterns_au;
    `);
  },
  
  // This migration is always safe to run
  checksum: "fix-fts-triggers-v1",
};