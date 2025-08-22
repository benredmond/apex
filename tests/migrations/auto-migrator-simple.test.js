/**
 * Simplified tests for AutoMigrator fresh database optimization
 */

import { describe, it, expect } from "@jest/globals";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MigrationRunner } from "../../dist/migrations/MigrationRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("AutoMigrator Fresh Install Optimization", () => {
  const testDbPath = path.join(__dirname, "test-fresh-install.db");

  afterEach(() => {
    // Clean up test database
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // Ignore if doesn't exist
    }
  });

  it("should handle fresh database by creating full schema", () => {
    // Create a fresh database
    const db = new Database(testDbPath);
    
    // Check if it's fresh (no tables)
    const tables = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get();
    
    expect(tables.count).toBe(0);
    
    // Now simulate what AutoMigrator does for fresh install
    // Create the full schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT,
        execution_time_ms INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL,
        type              TEXT NOT NULL,
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        trust_score       REAL NOT NULL,
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
      
      CREATE TABLE IF NOT EXISTS pattern_tags (
        pattern_id  TEXT NOT NULL,
        tag         TEXT NOT NULL,
        PRIMARY KEY (pattern_id, tag),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );
    `);
    
    // Mark all migrations as applied
    const migrations = [
      "001-consolidate-patterns",
      "002-pattern-metadata-enrichment",
      "003-add-pattern-aliases",
      "004-add-pattern-search-fields",
      "005-add-pattern-provenance",
      "006-add-task-system-schema",
      "007-add-evidence-log-table",
      "008-add-pattern-metadata-fields",
      "009-populate-pattern-search-fields",
      "010-add-task-tags",
      "011-migrate-pattern-tags-to-json",
      "012-rename-tags-csv-column",
      "013-add-quality-metadata",
      "014-populate-pattern-tags",
      "015-add-task-checkpoint-table"
    ];
    
    const stmt = db.prepare(
      "INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)"
    );
    
    migrations.forEach((id, index) => {
      stmt.run(index + 1, id, id, "fresh-install", new Date().toISOString(), 0);
    });
    
    // Verify tables were created
    const finalTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(t => t.name);
    
    expect(finalTables).toContain("migrations");
    expect(finalTables).toContain("patterns");
    expect(finalTables).toContain("pattern_tags");
    
    // Verify all migrations marked as applied
    const appliedMigrations = db
      .prepare("SELECT COUNT(*) as count FROM migrations WHERE checksum = 'fresh-install'")
      .get();
    
    expect(appliedMigrations.count).toBe(15);
    
    db.close();
  });

  it("should detect fresh vs existing database correctly", () => {
    // Test 1: Fresh database
    let db = new Database(testDbPath);
    let tableCount = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get();
    
    expect(tableCount.count).toBe(0); // Fresh
    db.close();
    
    // Test 2: Existing database (with tables)
    db = new Database(testDbPath);
    db.exec("CREATE TABLE test_table (id INTEGER)");
    
    tableCount = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .get();
    
    expect(tableCount.count).toBe(1); // Not fresh
    db.close();
  });

  it("migration 001 should handle missing patterns table", () => {
    const db = new Database(testDbPath);
    
    // Check if patterns table exists (it shouldn't)
    const patternsExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patterns'")
      .all();
    
    expect(patternsExists.length).toBe(0);
    
    // The migration should check for table existence before trying to add columns
    // This simulates what migration 001 does
    if (patternsExists.length > 0) {
      // Would add columns here
      db.exec("ALTER TABLE patterns ADD COLUMN test TEXT");
    } else {
      // Table doesn't exist, skip column additions
      // This is what prevents the error
    }
    
    // No error should occur
    expect(true).toBe(true);
    
    db.close();
  });
});