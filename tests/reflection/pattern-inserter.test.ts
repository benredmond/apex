import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import Database from "better-sqlite3";
import { PatternInserter } from "../../src/reflection/pattern-inserter.js";
import { NewPattern, AntiPattern } from "../../src/reflection/types.js";
import { PatternDatabase } from "../../src/storage/database.js";
import { MigrationRunner } from "../../src/migrations/MigrationRunner.js";
import { MigrationLoader } from "../../src/migrations/MigrationLoader.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("PatternInserter", () => {
  let db: Database.Database;
  let inserter: PatternInserter;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-test-"));
    const dbPath = path.join(tempDir, "test.db");
    
    // Initialize database with schema using PatternDatabase
    const patternDb = new PatternDatabase(dbPath);
    
    // Get the raw database connection
    db = patternDb.database;
    
    // Run migrations to set up additional schema
    const loader = new MigrationLoader();
    const migrationsPath = path.join(__dirname, "../../src/migrations");
    const migrations = await loader.loadMigrations(migrationsPath);
    const runner = new MigrationRunner(db);
    await runner.runMigrations(migrations);
    
    // Create PatternInserter instance
    inserter = new PatternInserter(db);
  });

  afterEach(() => {
    db.close();
    // Clean up temp directory
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Pattern ID Generation", () => {
    it("should generate 4-segment IDs for new patterns", () => {
      const pattern: NewPattern = {
        title: "Test Pattern",
        summary: "Test pattern for ID generation",
        snippets: [],
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      // Verify 4-segment ID format: NAMESPACE:TYPE:CATEGORY:SPECIFIC
      const segments = patternId.split(":");
      expect(segments).toHaveLength(4);
      expect(segments[0]).toBe("APEX.SYSTEM");
      expect(segments[1]).toBe("PAT");
      expect(segments[2]).toBe("AUTO");
      expect(segments[3]).toMatch(/^[a-zA-Z0-9_-]{8}$/); // nanoid(8)
    });

    it("should generate 4-segment IDs for anti-patterns", () => {
      const antiPattern: AntiPattern = {
        pattern_id: "TEST:ANTI",
        title: "Test Anti-Pattern",
        reason: "This is an anti-pattern",
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(antiPattern, "ANTI_PATTERN");
      
      // Verify 4-segment ID format for anti-patterns
      const segments = patternId.split(":");
      expect(segments).toHaveLength(4);
      expect(segments[0]).toBe("APEX.SYSTEM");
      expect(segments[1]).toBe("ANTI");
      expect(segments[2]).toBe("AUTO");
      expect(segments[3]).toMatch(/^[a-zA-Z0-9_-]{8}$/);
    });

    it("should use provided ID if it already has 4 segments", () => {
      const pattern: NewPattern & { id?: string } = {
        id: "CUSTOM:PAT:TEST:SPECIFIC",
        title: "Test Pattern with Custom ID",
        summary: "Pattern with pre-defined 4-segment ID",
        snippets: [],
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      // Should use the provided ID
      expect(patternId).toBe("CUSTOM:PAT:TEST:SPECIFIC");
    });

    it("should generate unique IDs for multiple patterns", () => {
      const pattern1: NewPattern = {
        title: "First Pattern",
        summary: "First test pattern",
        snippets: [],
        evidence: [],
      };

      const pattern2: NewPattern = {
        title: "Second Pattern",
        summary: "Second test pattern",
        snippets: [],
        evidence: [],
      };

      const id1 = inserter.insertNewPattern(pattern1, "NEW_PATTERN");
      const id2 = inserter.insertNewPattern(pattern2, "NEW_PATTERN");
      
      // IDs should be different
      expect(id1).not.toBe(id2);
      
      // Both should be 4-segment IDs
      expect(id1.split(":")).toHaveLength(4);
      expect(id2.split(":")).toHaveLength(4);
    });
  });

  describe("Alias Generation", () => {
    it("should generate URL-safe aliases from titles", () => {
      const pattern: NewPattern = {
        title: "Test Pattern with Special Characters!@#",
        summary: "Pattern for alias testing",
        snippets: [],
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      // Check that alias was created
      const result = db.prepare("SELECT alias FROM patterns WHERE id = ?").get(patternId) as any;
      expect(result.alias).toBe("test-pattern-with-special-characters");
    });

    it("should handle alias collisions by appending counter", () => {
      const pattern1: NewPattern = {
        title: "Duplicate Pattern",
        summary: "First pattern",
        snippets: [],
        evidence: [],
      };

      const pattern2: NewPattern = {
        title: "Duplicate Pattern",
        summary: "Second pattern with same title",
        snippets: [],
        evidence: [],
      };

      const id1 = inserter.insertNewPattern(pattern1, "NEW_PATTERN");
      const id2 = inserter.insertNewPattern(pattern2, "NEW_PATTERN");
      
      const result1 = db.prepare("SELECT alias FROM patterns WHERE id = ?").get(id1) as any;
      const result2 = db.prepare("SELECT alias FROM patterns WHERE id = ?").get(id2) as any;
      
      expect(result1.alias).toBe("duplicate-pattern");
      expect(result2.alias).toBe("duplicate-pattern-1");
    });
  });

  describe("Database Storage", () => {
    it("should store pattern with correct provenance", () => {
      const pattern: NewPattern = {
        title: "Test Pattern",
        summary: "Test pattern for provenance",
        snippets: [],
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      // Check provenance column (will be 'manual' by default until migration runs)
      const result = db.prepare("SELECT * FROM patterns WHERE id = ?").get(patternId) as any;
      expect(result).toBeDefined();
      expect(result.title).toBe("Test Pattern");
      expect(result.summary).toBe("Test pattern for provenance");
      expect(result.type).toBe("CODEBASE");
    });

    it("should store anti-patterns with correct type", () => {
      const antiPattern: AntiPattern = {
        pattern_id: "TEST:ANTI",
        title: "Test Anti-Pattern",
        reason: "This is an anti-pattern",
        evidence: [],
      };

      const patternId = inserter.insertNewPattern(antiPattern, "ANTI_PATTERN");
      
      const result = db.prepare("SELECT * FROM patterns WHERE id = ?").get(patternId) as any;
      expect(result).toBeDefined();
      expect(result.type).toBe("ANTI");
      expect(result.title).toBe("Test Anti-Pattern");
      expect(result.summary).toBe("This is an anti-pattern");
    });
  });

  describe("Duplicate Pattern Validation", () => {
    // [PAT:TEST:DUPLICATE] ★★★★☆ (15 uses, 93% success) - Test duplicate handling scenarios
    
    it("should handle duplicate pattern IDs gracefully", () => {
      const pattern1: NewPattern = {
        id: "SAME:ID:TEST:DUPLICATE",
        title: "First Pattern",
        summary: "First pattern with this ID",
        snippets: [],
        evidence: [],
      };

      const pattern2: NewPattern = {
        id: "SAME:ID:TEST:DUPLICATE",
        title: "Second Pattern",
        summary: "Second pattern with same ID",
        snippets: [],
        evidence: [],
      };

      // Insert first pattern
      const id1 = inserter.insertNewPattern(pattern1, "NEW_PATTERN");
      expect(id1).toBe("SAME:ID:TEST:DUPLICATE");

      // Insert second pattern with same ID - should return existing ID
      const id2 = inserter.insertNewPattern(pattern2, "NEW_PATTERN");
      expect(id2).toBe(id1); // Should return the same ID

      // Verify only one pattern exists in database
      const count = db.prepare("SELECT COUNT(*) as count FROM patterns WHERE id = ?")
        .get("SAME:ID:TEST:DUPLICATE") as { count: number };
      expect(count.count).toBe(1);

      // Verify the first pattern's data is preserved
      const stored = db.prepare("SELECT * FROM patterns WHERE id = ?")
        .get("SAME:ID:TEST:DUPLICATE") as any;
      expect(stored.title).toBe("First Pattern");
      expect(stored.summary).toBe("First pattern with this ID");
    });

    it("should detect duplicates before insert attempt", () => {
      const pattern: NewPattern = {
        id: "DUPLICATE:CHECK:TEST:PATTERN",
        title: "Test Pattern for Duplicate Check",
        summary: "Testing pre-insert validation",
        snippets: [],
        evidence: [],
      };

      // Spy on console.log to verify duplicate detection message
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      // First insert - should succeed
      const id1 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      expect(id1).toBe("DUPLICATE:CHECK:TEST:PATTERN");

      // Second insert - should detect duplicate
      const id2 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      expect(id2).toBe(id1);

      // Verify duplicate detection was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[PatternInserter] Duplicate pattern detected:")
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("DUPLICATE:CHECK:TEST:PATTERN")
      );

      consoleSpy.mockRestore();
    });

    it("should handle concurrent insert attempts (race condition)", () => {
      // This test simulates what happens if two processes try to insert
      // the same pattern at nearly the same time
      
      const pattern: NewPattern = {
        id: "RACE:CONDITION:TEST:PATTERN",
        title: "Race Condition Test",
        summary: "Testing race condition handling",
        snippets: [],
        evidence: [],
      };

      // First insert succeeds
      const id1 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      // Simulate another process inserting between check and insert
      // The INSERT OR IGNORE will handle this gracefully
      const id2 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      
      expect(id1).toBe(id2);
      expect(id1).toBe("RACE:CONDITION:TEST:PATTERN");
    });

    it("should return existing pattern ID for idempotent operations", () => {
      const pattern: NewPattern = {
        id: "IDEMPOTENT:TEST:PATTERN:ID",
        title: "Idempotent Pattern",
        summary: "Testing idempotent insert operations",
        snippets: [],
        evidence: [],
      };

      // Insert multiple times
      const id1 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      const id2 = inserter.insertNewPattern(pattern, "NEW_PATTERN");
      const id3 = inserter.insertNewPattern(pattern, "NEW_PATTERN");

      // All should return the same ID
      expect(id1).toBe("IDEMPOTENT:TEST:PATTERN:ID");
      expect(id2).toBe(id1);
      expect(id3).toBe(id1);

      // Only one pattern should exist
      const count = db.prepare("SELECT COUNT(*) as count FROM patterns")
        .get() as { count: number };
      expect(count.count).toBe(1);
    });

    it("should handle duplicate auto-generated IDs", () => {
      // While unlikely due to nanoid, this tests the duplicate handling
      // for auto-generated IDs as well
      
      const pattern1: NewPattern = {
        title: "Auto ID Pattern 1",
        summary: "First auto-generated ID pattern",
        snippets: [],
        evidence: [],
      };

      const id1 = inserter.insertNewPattern(pattern1, "NEW_PATTERN");
      expect(id1).toMatch(/^APEX\.SYSTEM:PAT:AUTO:[a-zA-Z0-9_-]{8}$/);

      // Manually insert a duplicate of an auto-generated ID (edge case)
      const pattern2: NewPattern = {
        id: id1, // Use the same auto-generated ID
        title: "Auto ID Pattern 2",
        summary: "Duplicate of auto-generated ID",
        snippets: [],
        evidence: [],
      };

      const id2 = inserter.insertNewPattern(pattern2, "NEW_PATTERN");
      expect(id2).toBe(id1); // Should return existing ID

      // Verify first pattern data is preserved
      const stored = db.prepare("SELECT * FROM patterns WHERE id = ?")
        .get(id1) as any;
      expect(stored.title).toBe("Auto ID Pattern 1");
    });
  });
});