import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import { migration008 } from "../../src/migrations/008-add-pattern-metadata-fields.js";

describe("Migration 008: Add pattern metadata fields", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create patterns table with basic schema
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
        json_canonical    TEXT NOT NULL,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0
      )
    `);

    // Create reflections table for index test
    db.exec(`
      CREATE TABLE IF NOT EXISTS reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        brief_id TEXT,
        outcome TEXT CHECK(outcome IN ('success','partial','failure')) NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("should add metadata columns to patterns table", () => {
    // Check columns don't exist before migration
    const beforeInfo = db.prepare("PRAGMA table_info(patterns)").all() as Array<{
      name: string;
    }>;
    const beforeColumns = new Set(beforeInfo.map((col) => col.name));
    expect(beforeColumns.has("key_insight")).toBe(false);
    expect(beforeColumns.has("when_to_use")).toBe(false);
    expect(beforeColumns.has("common_pitfalls")).toBe(false);

    // Run migration
    migration008.up(db);

    // Check columns exist after migration
    const afterInfo = db.prepare("PRAGMA table_info(patterns)").all() as Array<{
      name: string;
      type: string;
    }>;
    const afterColumns = new Map(afterInfo.map((col) => [col.name, col.type]));
    
    expect(afterColumns.has("key_insight")).toBe(true);
    expect(afterColumns.get("key_insight")).toBe("TEXT");
    
    expect(afterColumns.has("when_to_use")).toBe(true);
    expect(afterColumns.get("when_to_use")).toBe("TEXT");
    
    expect(afterColumns.has("common_pitfalls")).toBe(true);
    expect(afterColumns.get("common_pitfalls")).toBe("TEXT");
  });

  it("should handle duplicate migration gracefully", () => {
    // Run migration twice
    migration008.up(db);
    migration008.up(db);

    // Check columns still exist and aren't duplicated
    const info = db.prepare("PRAGMA table_info(patterns)").all() as Array<{
      name: string;
    }>;
    const columnCounts = new Map<string, number>();
    info.forEach((col) => {
      columnCounts.set(col.name, (columnCounts.get(col.name) || 0) + 1);
    });

    expect(columnCounts.get("key_insight")).toBe(1);
    expect(columnCounts.get("when_to_use")).toBe(1);
    expect(columnCounts.get("common_pitfalls")).toBe(1);
  });

  it("should validate migration correctly", () => {
    // Validate before migration - should be invalid
    const beforeValidation = migration008.validate?.(db) ?? false;
    expect(beforeValidation).toBe(false);

    // Run migration
    migration008.up(db);

    // Validate after migration - should be valid
    const afterValidation = migration008.validate?.(db) ?? false;
    expect(afterValidation).toBe(true);
  });

  it("should allow inserting data with new columns", () => {
    // Run migration
    migration008.up(db);

    // Insert a pattern with enhanced metadata
    const stmt = db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, pattern_digest, json_canonical,
        key_insight, when_to_use, common_pitfalls
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    const pitfalls = JSON.stringify(["Don't mock too deep", "Reset mocks between tests"]);
    
    stmt.run(
      "PAT:TEST:MOCK",
      "1.0",
      "1.0",
      "CODEBASE",
      "Jest API Mocking",
      "Mock API calls in Jest tests",
      0.88,
      new Date().toISOString(),
      new Date().toISOString(),
      "digest123",
      "{}",
      "Mock at axios level, not function level",
      "Integration tests with external deps",
      pitfalls
    );

    // Query the inserted pattern
    const pattern = db.prepare("SELECT * FROM patterns WHERE id = ?").get("PAT:TEST:MOCK") as any;
    
    expect(pattern).toBeDefined();
    expect(pattern.key_insight).toBe("Mock at axios level, not function level");
    expect(pattern.when_to_use).toBe("Integration tests with external deps");
    expect(pattern.common_pitfalls).toBe(pitfalls);
  });

  it("should handle null values in new columns", () => {
    // Run migration
    migration008.up(db);

    // Insert a pattern without enhanced metadata
    const stmt = db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, pattern_digest, json_canonical
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      "PAT:BASIC:TEST",
      "1.0",
      "1.0",
      "CODEBASE",
      "Basic Pattern",
      "A basic pattern",
      0.5,
      new Date().toISOString(),
      new Date().toISOString(),
      "digest456",
      "{}"
    );

    // Query the inserted pattern
    const pattern = db.prepare("SELECT * FROM patterns WHERE id = ?").get("PAT:BASIC:TEST") as any;
    
    expect(pattern).toBeDefined();
    expect(pattern.key_insight).toBeNull();
    expect(pattern.when_to_use).toBeNull();
    expect(pattern.common_pitfalls).toBeNull();
  });
});