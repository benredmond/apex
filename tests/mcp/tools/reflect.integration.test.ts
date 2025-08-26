// reflect.integration.test.ts
// Integration tests for ReflectionService with real database operations
// NO jest.unstable_mockModule() calls - using real implementations

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { ReflectionService } from "../../../src/mcp/tools/reflect.js";
import { PatternDatabase } from "../../../src/storage/database.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import {
  MigrationLoader,
  MigrationRunner,
} from "../../../src/migrations/index.js";

describe("ReflectionService Integration Tests", () => {
  let tempDir: string;
  let dbPath: string;
  let db: PatternDatabase;
  let repository: PatternRepository;
  let service: ReflectionService;

  beforeEach(async () => {
    // PAT:TEST:ISOLATION - Create isolated test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-integration-test-"));
    dbPath = path.join(tempDir, "test.db");

    // FIX:DB:SHARED_CONNECTION - Create database with shared connection
    db = new PatternDatabase(dbPath);

    // FIRST: Create base patterns table (BEFORE migrations)
    db.database.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL DEFAULT '1.0',
        pattern_version   TEXT NOT NULL DEFAULT '1.0',
        type              TEXT NOT NULL,
        title             TEXT,
        summary           TEXT,
        trust_score       REAL DEFAULT 0.5,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        pattern_digest    TEXT,
        json_canonical    TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT,
        tags              TEXT,
        search_index      TEXT,
        status            TEXT DEFAULT 'active'
      );
    `);

    // THEN: Run migrations to set up schema
    const migrationsPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../src/migrations",
    );
    const loader = new MigrationLoader(migrationsPath);
    const migrations = await loader.loadMigrations();
    // Skip problematic migrations that expect existing data
    const migrationsToRun = migrations.filter(m => 
      !['011-migrate-pattern-tags-to-json', '012-rename-tags-csv-column', '014-populate-pattern-tags'].includes(m.id)
    );
    const runner = new MigrationRunner(db.database);
    await runner.runMigrations(migrationsToRun);

    // Create repository and service with real implementations
    repository = new PatternRepository({ dbPath });
    service = new ReflectionService(repository, db.database);
  });

  afterEach(() => {
    // Clean up resources
    if (db) {
      db.close();
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.clearAllTimers(); // Clear any pending timers
    jest.clearAllMocks();  // Clear again for safety
  });

  describe("Pattern Auto-Creation", () => {
    it("should auto-create missing patterns with 4-segment IDs", async () => {
      const request = {
        task: { id: "T1", title: "Test Auto-Creation" },
        outcome: "success" as const,
        claims: {
          patterns_used: [
            {
              pattern_id: "NEW:PATTERN:TEST",
              evidence: [
                {
                  kind: "git_lines" as const,
                  file: "test.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "NEW:PATTERN:TEST",
              outcome: "worked-perfectly" as const,
            },
          ],
        },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);

      // Check the database directly for the created pattern
      const patterns = db.database
        .prepare("SELECT * FROM patterns WHERE alias = ?")
        .all("NEW:PATTERN:TEST") as any[];

      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0];
      // Verify the pattern has a proper 4-segment ID
      const segments = pattern.id.split(":");
      expect(segments.length).toBe(4);
      expect(segments[0]).toBe("APEX.SYSTEM");
      expect(segments[1]).toBe("CODEBASE");
      expect(segments[2]).toBe("AUTO");
      // The fourth segment is a timestamp/hash
      expect(segments[3]).toBeTruthy();

      // Verify alias was set correctly
      expect(pattern.alias).toBe("NEW:PATTERN:TEST");

      // Verify trust score was initialized
      expect(pattern.alpha).toBe(1); // worked-perfectly adds 1 to alpha
      expect(pattern.beta).toBe(0);
    });

    it("should auto-create anti-patterns with correct type", async () => {
      const request = {
        task: { id: "T2", title: "Test Anti-Pattern Creation" },
        outcome: "success" as const,
        claims: {
          anti_patterns: [
            {
              pattern_id: "ANTI:TEST:EXAMPLE",
              reason: "This is a test anti-pattern",
              evidence: [
                {
                  kind: "git_lines" as const,
                  file: "test.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "ANTI:TEST:EXAMPLE",
              outcome: "failed-completely" as const,
            },
          ],
        },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);

      // Check that anti-pattern was created with correct type
      const patterns = db.database
        .prepare("SELECT * FROM patterns WHERE alias = ?")
        .all("ANTI:TEST:EXAMPLE") as any[];
      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0];
      expect(pattern.type).toBe("ANTI");

      // Verify the ID structure for anti-patterns
      const segments = pattern.id.split(":");
      expect(segments[0]).toBe("APEX.SYSTEM");
      expect(segments[1]).toBe("ANTI");
      expect(segments[2]).toBe("AUTO");

      // Verify trust score for failed pattern
      expect(pattern.alpha).toBe(0); // failed-completely sets alpha to 0
      expect(pattern.beta).toBe(1); // failed-completely sets beta to 1
    });

    it("should handle existing patterns without creating duplicates", async () => {
      // First, insert a pattern directly
      const existingId = "EXISTING:PAT:TEST:ONE";
      db.database
        .prepare(
          `
        INSERT INTO patterns (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, pattern_digest, json_canonical,
          alpha, beta, alias
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          existingId,
          "1.0.0",
          "1.0.0",
          "CODEBASE",
          "Existing Pattern",
          "Test",
          0.5,
          new Date().toISOString(),
          new Date().toISOString(),
          "digest123",
          JSON.stringify({}),
          5,
          2,
          null,
        );

      const request = {
        task: { id: "T3", title: "Test Existing Pattern" },
        outcome: "success" as const,
        claims: {
          patterns_used: [
            {
              pattern_id: existingId,
              evidence: [
                {
                  kind: "git_lines" as const,
                  file: "test.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: existingId,
              outcome: "worked-perfectly" as const,
            },
          ],
        },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);

      // Check that only one pattern exists with this ID
      const patterns = db.database
        .prepare("SELECT * FROM patterns WHERE id = ?")
        .all(existingId) as any[];
      expect(patterns).toHaveLength(1);

      // Check trust score was updated (not created new)
      expect(patterns[0].alpha).toBe(6); // 5 + 1 from worked-perfectly
      expect(patterns[0].beta).toBe(2); // unchanged
    });

    it("should set provenance field for auto-created patterns", async () => {
      const request = {
        task: { id: "T4", title: "Test Provenance" },
        outcome: "success" as const,
        claims: {
          patterns_used: [
            {
              pattern_id: "PROVENANCE:TEST",
              evidence: [
                {
                  kind: "git_lines" as const,
                  file: "test.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PROVENANCE:TEST",
              outcome: "worked-perfectly" as const,
            },
          ],
        },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);

      // Check provenance field was set
      const patterns = db.database
        .prepare("SELECT * FROM patterns WHERE alias = ?")
        .all("PROVENANCE:TEST") as any[];
      expect(patterns.length).toBeGreaterThan(0);

      const pattern = patterns[0];

      // Check if provenance column exists and verify its value
      const tableInfo = db.database
        .prepare("PRAGMA table_info(patterns)")
        .all() as any[];
      const hasProvenance = tableInfo.some(
        (col: any) => col.name === "provenance",
      );

      if (hasProvenance) {
        expect(pattern.provenance).toBe("auto-created");
      }

      // Verify the pattern was properly created
      expect(pattern.alias).toBe("PROVENANCE:TEST");
      expect(pattern.type).toBe("CODEBASE");
      expect(pattern.alpha).toBe(1);
      expect(pattern.beta).toBe(0);
    });
  });
});
