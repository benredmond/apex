/**
 * Tests for migration 001-consolidate-patterns
 * Ensures it handles missing patterns table correctly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import * as path from "path";
import { migration } from "../../dist/migrations/001-consolidate-patterns.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Migration 001-consolidate-patterns", () => {
  const testDbPath = path.join(__dirname, "test-001.db");
  let db;

  beforeEach(() => {
    // Clean up any existing test database
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // File doesn't exist, ignore
    }
    // Create new database for each test
    db = new Database(testDbPath);
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

  describe("Fresh database (no patterns table)", () => {
    it("should not fail when patterns table doesn't exist", () => {
      // Run migration on empty database
      expect(() => migration.up(db)).not.toThrow();
      
      // Verify it logged the skip message
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);
      
      // Run migration again to capture logs
      migration.up(db);
      console.log = originalLog;
      
      expect(logs.some(log => log.includes("patterns table doesn't exist"))).toBe(true);
    });

    it("should handle pattern_drafts table not existing", () => {
      // Run migration with no tables
      expect(() => migration.up(db)).not.toThrow();
      
      // Should complete without errors
      const logs = [];
      const originalLog = console.log;
      console.log = (msg) => logs.push(msg);
      
      migration.up(db);
      console.log = originalLog;
      
      expect(logs.some(log => log.includes("Found 0 drafts to migrate"))).toBe(true);
      expect(logs.some(log => log.includes("Migration completed successfully"))).toBe(true);
    });
  });

  describe("Existing patterns table", () => {
    beforeEach(() => {
      // Create patterns table with minimal schema
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
          source_repo TEXT,
          tags TEXT,
          pattern_digest TEXT NOT NULL,
          json_canonical BLOB NOT NULL,
          invalid INTEGER NOT NULL DEFAULT 0,
          invalid_reason TEXT
        )
      `);
    });

    it("should add missing columns to patterns table", () => {
      // Verify columns don't exist yet
      let columns = db.pragma("table_info(patterns)");
      let columnNames = columns.map(c => c.name);
      
      expect(columnNames).not.toContain("alpha");
      expect(columnNames).not.toContain("beta");
      expect(columnNames).not.toContain("usage_count");
      expect(columnNames).not.toContain("success_count");
      expect(columnNames).not.toContain("status");
      
      // Run migration
      migration.up(db);
      
      // Verify columns were added
      columns = db.pragma("table_info(patterns)");
      columnNames = columns.map(c => c.name);
      
      expect(columnNames).toContain("alpha");
      expect(columnNames).toContain("beta");
      expect(columnNames).toContain("usage_count");
      expect(columnNames).toContain("success_count");
      expect(columnNames).toContain("status");
      
      // Verify default values
      const alphaCol = columns.find(c => c.name === "alpha");
      expect(alphaCol?.dflt_value).toBe("1.0");
      
      const statusCol = columns.find(c => c.name === "status");
      expect(statusCol?.dflt_value).toBe('"active"');
    });

    it("should be idempotent - running twice should not fail", () => {
      // Run migration once
      migration.up(db);
      
      // Run migration again - should not fail
      expect(() => migration.up(db)).not.toThrow();
      
      // Verify columns still exist and weren't duplicated
      const columns = db.pragma("table_info(patterns)");
      const alphaColumns = columns.filter(c => c.name === "alpha");
      
      expect(alphaColumns.length).toBe(1); // Only one alpha column
    });
  });

  describe("Migration with pattern_drafts", () => {
    beforeEach(() => {
      // Create both tables
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
          source_repo TEXT,
          tags TEXT,
          pattern_digest TEXT NOT NULL,
          json_canonical BLOB NOT NULL,
          invalid INTEGER NOT NULL DEFAULT 0,
          invalid_reason TEXT
        )
      `);
      
      db.exec(`
        CREATE TABLE pattern_drafts (
          draft_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT'
        )
      `);
    });

    it("should migrate drafts to patterns table", () => {
      // Insert a draft
      const draftData = {
        id: "PAT:TEST:EXAMPLE",
        title: "Test Pattern",
        summary: "A test pattern for migration",
        snippets: [],
        evidence: []
      };
      
      db.prepare(`
        INSERT INTO pattern_drafts (draft_id, kind, json, created_at, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        "draft:test-001",
        "PATTERN",
        JSON.stringify(draftData),
        new Date().toISOString(),
        "DRAFT"
      );
      
      // Run migration
      migration.up(db);
      
      // Verify pattern was created
      const patterns = db.prepare("SELECT * FROM patterns WHERE id = ?").all("PAT:TEST:EXAMPLE");
      expect(patterns.length).toBe(1);
      
      const pattern = patterns[0];
      expect(pattern.title).toBe("Test Pattern");
      expect(pattern.summary).toBe("A test pattern for migration");
      expect(pattern.type).toBe("CODEBASE");
      expect(pattern.trust_score).toBe(0.5);
      expect(pattern.alpha).toBe(1.0);
      expect(pattern.beta).toBe(1.0);
      expect(pattern.usage_count).toBe(0);
      expect(pattern.success_count).toBe(0);
      expect(pattern.status).toBe("draft");
      
      // Verify draft was marked as approved
      const draft = db.prepare("SELECT status FROM pattern_drafts WHERE draft_id = ?")
        .get("draft:test-001");
      expect(draft.status).toBe("APPROVED");
    });

    it("should handle anti-patterns correctly", () => {
      // Insert an anti-pattern draft
      const draftData = {
        id: "ANTI:TEST:BAD",
        title: "Bad Pattern",
        summary: "An anti-pattern to avoid",
        snippets: [],
        evidence: []
      };
      
      db.prepare(`
        INSERT INTO pattern_drafts (draft_id, kind, json, created_at, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        "draft:anti-001",
        "ANTI_PATTERN",
        JSON.stringify(draftData),
        new Date().toISOString(),
        "DRAFT"
      );
      
      // Run migration
      migration.up(db);
      
      // Verify anti-pattern was created with correct type
      const pattern = db.prepare("SELECT * FROM patterns WHERE id = ?")
        .get("ANTI:TEST:BAD");
      
      expect(pattern.type).toBe("ANTI");
      expect(pattern.title).toBe("Bad Pattern");
    });

    it("should handle malformed drafts gracefully", () => {
      // Insert a malformed draft
      db.prepare(`
        INSERT INTO pattern_drafts (draft_id, kind, json, created_at, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        "draft:bad-001",
        "PATTERN",
        "{ invalid json",
        new Date().toISOString(),
        "DRAFT"
      );
      
      // Capture console.error
      const errors = [];
      const originalError = console.error;
      console.error = (msg) => errors.push(msg);
      
      // Run migration - should not throw
      expect(() => migration.up(db)).not.toThrow();
      
      console.error = originalError;
      
      // Should have logged error
      expect(errors.some(err => err.includes("Failed to migrate draft"))).toBe(true);
      
      // Other drafts should still be marked as approved
      const draft = db.prepare("SELECT status FROM pattern_drafts WHERE draft_id = ?")
        .get("draft:bad-001");
      expect(draft.status).toBe("APPROVED"); // Still marked as processed
    });
  });

  describe("Rollback (down migration)", () => {
    beforeEach(() => {
      // Set up database with migrated state
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
          json_canonical BLOB NOT NULL,
          alpha REAL DEFAULT 1.0,
          beta REAL DEFAULT 1.0,
          usage_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active'
        )
      `);
      
      // Insert a pattern with draft status
      db.prepare(`
        INSERT INTO patterns (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, pattern_digest, json_canonical, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "PAT:TEST", "1.0", "1.0", "CODEBASE", "Test", "Test pattern",
        0.5, new Date().toISOString(), new Date().toISOString(),
        "abc123", '{"test": true}', "draft"
      );
    });

    it("should remove draft patterns on rollback", () => {
      // Verify pattern exists
      let patterns = db.prepare("SELECT * FROM patterns WHERE status = 'draft'").all();
      expect(patterns.length).toBe(1);
      
      // Run rollback
      migration.down(db);
      
      // Verify draft pattern was removed
      patterns = db.prepare("SELECT * FROM patterns WHERE status = 'draft'").all();
      expect(patterns.length).toBe(0);
    });

    it("should revert pattern_drafts status on rollback", () => {
      // Create pattern_drafts table with approved drafts
      db.exec(`
        CREATE TABLE pattern_drafts (
          draft_id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'DRAFT'
        )
      `);
      
      db.prepare("INSERT INTO pattern_drafts (draft_id, status) VALUES (?, ?)")
        .run("draft:001", "APPROVED");
      
      // Run rollback
      migration.down(db);
      
      // Verify status was reverted
      const draft = db.prepare("SELECT status FROM pattern_drafts WHERE draft_id = ?")
        .get("draft:001");
      expect(draft.status).toBe("DRAFT");
    });

    it("should handle missing pattern_drafts table on rollback", () => {
      // No pattern_drafts table
      
      // Should not throw
      expect(() => migration.down(db)).not.toThrow();
    });
  });
});