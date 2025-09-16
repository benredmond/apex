/**
 * Tests for pattern alias migration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migration } from "../../src/migrations/003-add-pattern-aliases.js";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { nanoid } from "nanoid";

describe("003-add-pattern-aliases migration", () => {
  let db: Database.Database;
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create temp directory for test database
    testDir = path.join(os.tmpdir(), `apex-test-${nanoid()}`);
    fs.ensureDirSync(testDir);
    dbPath = path.join(testDir, "test.db");

    // Create test database
    db = new Database(dbPath);
    
    // Create patterns table (minimal schema for testing)
    db.exec(`
      CREATE TABLE patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL,
        type              TEXT NOT NULL,
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        trust_score       REAL NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        pattern_digest    TEXT NOT NULL,
        json_canonical    BLOB NOT NULL,
        invalid           INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Insert test patterns
    const insertStmt = db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, pattern_digest, json_canonical
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      "PAT:TEST1",
      "1.0.0",
      "1.0.0",
      "CODEBASE",
      "Better-SQLite3 Synchronous Transactions",
      "Use synchronous transactions",
      0.8,
      "2024-01-01",
      "2024-01-01",
      "hash1",
      JSON.stringify({ test: "data" })
    );

    insertStmt.run(
      "PAT:TEST2",
      "1.0.0",
      "1.0.0",
      "CODEBASE",
      "ES Module Import Pattern",
      "Always use .js extensions",
      0.9,
      "2024-01-01",
      "2024-01-01",
      "hash2",
      JSON.stringify({ test: "data" })
    );

    // Pattern with special characters
    insertStmt.run(
      "PAT:TEST3",
      "1.0.0",
      "1.0.0",
      "ANTI",
      "Don't Use async/await in SQLite Transactions!!!",
      "This causes SQLITE_BUSY errors",
      0.5,
      "2024-01-01",
      "2024-01-01",
      "hash3",
      JSON.stringify({ test: "data" })
    );
  });

  afterEach(() => {
    db.close();
    fs.removeSync(testDir);
  });

  describe("up migration", () => {
    it("should add alias column to patterns table", () => {
      migration.up(db);

      const columns = db.pragma("table_info(patterns)") as any[];
      const aliasColumn = columns.find(col => col.name === "alias");
      
      expect(aliasColumn).toBeDefined();
      expect(aliasColumn.type).toBe("TEXT");
    });

    it("should create unique index on alias column", () => {
      migration.up(db);

      const indices = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pattern_alias'"
      ).all();
      
      expect(indices.length).toBe(1);
    });

    it("should generate aliases for existing patterns", () => {
      migration.up(db);

      const patterns = db.prepare("SELECT id, title, alias FROM patterns").all() as any[];
      
      expect(patterns[0].alias).toBe("better-sqlite3-synchronous-transactions");
      expect(patterns[1].alias).toBe("es-module-import-pattern");
      expect(patterns[2].alias).toBe("don-t-use-async-await-in-sqlite-transactions");
    });

    it("should handle duplicate aliases by appending counter", () => {
      // Insert pattern with duplicate title
      db.prepare(`
        INSERT INTO patterns (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, pattern_digest, json_canonical
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "PAT:DUPLICATE",
        "1.0.0",
        "1.0.0",
        "CODEBASE",
        "Better-SQLite3 Synchronous Transactions", // Same as TEST1
        "Another sync pattern",
        0.7,
        "2024-01-01",
        "2024-01-01",
        "hash4",
        JSON.stringify({ test: "data" })
      );

      migration.up(db);

      const patterns = db.prepare(
        "SELECT id, alias FROM patterns WHERE title LIKE '%Better-SQLite3%' ORDER BY id"
      ).all() as any[];
      
      // Find patterns by ID to ensure correct expectations
      const test1 = patterns.find(p => p.id === "PAT:TEST1");
      const duplicate = patterns.find(p => p.id === "PAT:DUPLICATE");
      
      expect(test1.alias).toBe("better-sqlite3-synchronous-transactions");
      expect(duplicate.alias).toBe("better-sqlite3-synchronous-transactions-1");
    });

    it("should handle very long titles by truncating", () => {
      const longTitle = "A".repeat(150);
      db.prepare(`
        INSERT INTO patterns (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, pattern_digest, json_canonical
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "PAT:LONG",
        "1.0.0",
        "1.0.0",
        "CODEBASE",
        longTitle,
        "Long pattern",
        0.5,
        "2024-01-01",
        "2024-01-01",
        "hash5",
        JSON.stringify({ test: "data" })
      );

      migration.up(db);

      const pattern = db.prepare("SELECT alias FROM patterns WHERE id = ?").get("PAT:LONG") as any;
      expect(pattern.alias.length).toBe(100);
      expect(pattern.alias).toBe("a".repeat(100));
    });
  });

  describe("down migration", () => {
    it("should clear aliases and remove index", () => {
      migration.up(db);
      migration.down(db);

      // Check index removed
      const indices = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pattern_alias'"
      ).all();
      expect(indices.length).toBe(0);

      // Check aliases cleared
      const patterns = db.prepare("SELECT alias FROM patterns").all() as any[];
      patterns.forEach(p => {
        expect(p.alias).toBeNull();
      });
    });
  });

  describe("validate", () => {
    it("should return true when migration is applied successfully", () => {
      migration.up(db);
      expect(migration.validate(db)).toBe(true);
    });

    it("should return false when alias column is missing", () => {
      expect(migration.validate(db)).toBe(false);
    });

    it("should return false when index is missing", () => {
      migration.up(db);
      db.exec("DROP INDEX idx_pattern_alias");
      expect(migration.validate(db)).toBe(false);
    });

    it("should return false when patterns have null aliases", () => {
      migration.up(db);
      db.prepare("UPDATE patterns SET alias = NULL WHERE id = ?").run("PAT:TEST1");
      expect(migration.validate(db)).toBe(false);
    });
  });
});