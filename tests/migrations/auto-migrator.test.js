/**
 * Tests for AutoMigrator with fresh database optimization
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Temporarily disabled due to ESM module linking issue
// import { AutoMigrator } from "../../src/migrations/auto-migrator.ts";
const { AutoMigrator } = await import("../../src/migrations/auto-migrator.ts");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("AutoMigrator", () => {
  const testDbPath = path.join(__dirname, "test-auto-migrator.db");
  let db;

  beforeEach(() => {
    // Clean up any existing test database
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // File doesn't exist, ignore
    }
  });

  afterEach(() => {
    // Clean up
    if (db && db.open) {
      db.close();
    }
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // File doesn't exist, ignore
    }
  });

  describe("Fresh Database Installation", () => {
    it("should create full schema directly for fresh database", async () => {
      // Dynamic import to avoid module linking issues
      
      const migrator = new AutoMigrator(testDbPath);
      
      // Mock console.log to capture output
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);
      
      try {
        const result = await migrator.autoMigrate({ silent: false });
        expect(result).toBe(true);
        
        // Should detect fresh database
        expect(logs.some(log => log.includes("Fresh database detected"))).toBe(true);
      } finally {
        console.log = originalLog;
      }
      
      // Verify all tables were created
      db = new Database(testDbPath);
      
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all();
      
      const tableNames = tables.map(t => t.name);
      
      // Verify core tables exist
      expect(tableNames).toContain("patterns");
      expect(tableNames).toContain("migrations");
      expect(tableNames).toContain("tasks");
      expect(tableNames).toContain("task_evidence");
      expect(tableNames).toContain("task_checkpoints");
      expect(tableNames).toContain("pattern_tags");
      expect(tableNames).toContain("pattern_metadata");
    });

    it("should mark all migrations as applied for fresh database", async () => {
      
      const migrator = new AutoMigrator(testDbPath);
      
      await migrator.autoMigrate({ silent: true });
      
      db = new Database(testDbPath);
      
      // Check that all migrations are marked as applied
      const migrations = db
        .prepare("SELECT version, id, checksum FROM migrations ORDER BY version")
        .all();
      
      expect(migrations.length).toBe(15); // We have 15 migrations
      expect(migrations[0].id).toBe("001-consolidate-patterns");
      expect(migrations[14].id).toBe("015-add-task-checkpoint-table");
      
      // All should have checksum = 'fresh-install'
      const freshInstalls = migrations.filter(m => m.checksum === 'fresh-install');
      expect(freshInstalls.length).toBe(15);
    });

    it("should have all columns in patterns table for fresh install", async () => {
      
      const migrator = new AutoMigrator(testDbPath);
      
      await migrator.autoMigrate({ silent: true });
      
      db = new Database(testDbPath);
      
      // Get all columns from patterns table
      const columns = db.pragma("table_info(patterns)");
      const columnNames = columns.map(c => c.name);
      
      // Verify all expected columns exist
      const expectedColumns = [
        "id", "schema_version", "pattern_version", "type", "title", "summary",
        "trust_score", "created_at", "updated_at", "source_repo", "tags",
        "pattern_digest", "json_canonical", "invalid", "invalid_reason",
        "alias", "keywords", "search_index", "alpha", "beta", "usage_count",
        "success_count", "status", "provenance", "key_insight", "when_to_use",
        "common_pitfalls", "last_activity_at", "quality_score_cached",
        "cache_timestamp", "semver_constraints", "quarantine_reason", "quarantine_date"
      ];
      
      for (const col of expectedColumns) {
        expect(columnNames).toContain(col);
      }
    });
  });

  describe("Existing Database Migration", () => {
    beforeEach(() => {
      // Create a database with just migrations table (simulating old database)
      db = new Database(testDbPath);
      
      // Create migrations table manually
      db.exec(`
        CREATE TABLE migrations (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          checksum TEXT,
          execution_time_ms INTEGER
        )
      `);
      
      // Add first two migrations as already applied
      db.prepare(`
        INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        1,
        "001-consolidate-patterns",
        "Consolidate pattern drafts into patterns table",
        "test-checksum",
        new Date().toISOString(),
        10
      );
      
      db.prepare(`
        INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        2,
        "002-pattern-metadata-enrichment",
        "Add pattern metadata enrichment tables",
        "test-checksum",
        new Date().toISOString(),
        10
      );
      
      // Create a minimal patterns table (as if created by old version)
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          pattern_version TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          trust_score REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          pattern_digest TEXT NOT NULL,
          json_canonical BLOB NOT NULL
        )
      `);
      
      db.close();
    });

    it("should not treat existing database as fresh", async () => {
      
      const migrator = new AutoMigrator(testDbPath);
      
      // Mock console.log to check output
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);
      
      try {
        await migrator.autoMigrate({ silent: false });
        
        // Should NOT say "Fresh database detected"
        expect(logs.some(log => log.includes("Fresh database detected"))).toBe(false);
        // Should find pending migrations
        expect(logs.some(log => log.includes("pending migrations"))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    it("should run only pending migrations on existing database", async () => {
      
      const migrator = new AutoMigrator(testDbPath);
      
      const result = await migrator.autoMigrate({ silent: true });
      expect(result).toBe(true);
      
      // Verify migrations were applied
      db = new Database(testDbPath);
      
      const migrations = db
        .prepare("SELECT COUNT(*) as count FROM migrations")
        .get();
      
      // Should have all 15 migrations after running
      expect(migrations.count).toBe(15);
      
      // Check that migrations 3-15 don't have 'fresh-install' checksum
      const laterMigrations = db
        .prepare("SELECT checksum FROM migrations WHERE version > 2")
        .all();
      
      laterMigrations.forEach(m => {
        expect(m.checksum).not.toBe('fresh-install');
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty database correctly", async () => {
      
      const migrator = new AutoMigrator(testDbPath);
      
      const result = await migrator.autoMigrate({ silent: true });
      expect(result).toBe(true);
      
      // Verify patterns table was created
      db = new Database(testDbPath);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patterns'")
        .all();
      
      expect(tables.length).toBe(1);
    });

    it("should be idempotent - running twice should not fail", async () => {
      
      
      const migrator1 = new AutoMigrator(testDbPath);
      const result1 = await migrator1.autoMigrate({ silent: true });
      expect(result1).toBe(true);
      
      // Run again
      const migrator2 = new AutoMigrator(testDbPath);
      const result2 = await migrator2.autoMigrate({ silent: true });
      expect(result2).toBe(true);
      
      // Verify no duplicate migrations
      db = new Database(testDbPath);
      const migrations = db
        .prepare("SELECT version, COUNT(*) as count FROM migrations GROUP BY version HAVING count > 1")
        .all();
      
      expect(migrations.length).toBe(0); // No duplicates
    });
  });
});