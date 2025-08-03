// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import path from "path";
import fs from "fs-extra";
import os from "os";
import {
  PatternRepository,
  createPatternRepository,
} from "../../src/storage/index.js";

describe("PatternRepository", () => {
  let tempDir: string;
  let repository: PatternRepository;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `apex-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Create repository with test configuration
    repository = await createPatternRepository({
      dbPath: path.join(tempDir, "test.db"),
      patternsDir: path.join(tempDir, "patterns"),
      watchDebounce: 50, // Faster for tests
    });
  });

  afterEach(async () => {
    // Clean up
    await repository.shutdown();
    await fs.remove(tempDir);
  });

  describe("CRUD operations", () => {
    it("should create a pattern", async () => {
      const pattern = {
        id: "TEST:CRUD:CREATE",
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST" as const,
        title: "Test Pattern",
        summary: "A test pattern for CRUD operations",
        trust_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["test", "crud"],
        pattern_digest: "",
        json_canonical: "",
      };

      const created = await repository.create(pattern);
      expect(created.id).toBe(pattern.id);

      // Verify it was saved
      const retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.title).toBe(pattern.title);
    });

    it("should update a pattern", async () => {
      const pattern = {
        id: "TEST:CRUD:UPDATE",
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST" as const,
        title: "Original Title",
        summary: "Original summary",
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["test"],
        pattern_digest: "",
        json_canonical: "",
      };

      await repository.create(pattern);

      const updated = await repository.update(pattern.id, {
        title: "Updated Title",
        trust_score: 0.9,
      });

      expect(updated.title).toBe("Updated Title");
      expect(updated.trust_score).toBe(0.9);
      expect(updated.summary).toBe("Original summary"); // Unchanged
    });

    it("should delete a pattern", async () => {
      const pattern = {
        id: "TEST:CRUD:DELETE",
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST" as const,
        title: "To Delete",
        summary: "This will be deleted",
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["test"],
        pattern_digest: "",
        json_canonical: "",
      };

      await repository.create(pattern);

      // Verify it exists
      let retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeTruthy();

      // Delete it
      await repository.delete(pattern.id);

      // Verify it's gone
      retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Query operations", () => {
    beforeEach(async () => {
      // Create test patterns
      const patterns = [
        {
          id: "TEST:QUERY:JS1",
          type: "LANG" as const,
          title: "JavaScript Pattern 1",
          summary: "Test pattern for JavaScript",
          tags: ["javascript", "async"],
        },
        {
          id: "TEST:QUERY:JS2",
          type: "LANG" as const,
          title: "JavaScript Pattern 2",
          summary: "Another JS pattern",
          tags: ["javascript", "promises"],
        },
        {
          id: "TEST:QUERY:TS1",
          type: "LANG" as const,
          title: "TypeScript Pattern",
          summary: "Pattern for TypeScript",
          tags: ["typescript", "types"],
        },
        {
          id: "TEST:QUERY:ANTI1",
          type: "ANTI" as const,
          title: "Anti-pattern Example",
          summary: "What not to do",
          tags: ["antipattern"],
        },
      ];

      for (const p of patterns) {
        await repository.create({
          ...p,
          schema_version: "0.3",
          pattern_version: "1.0.0",
          trust_score: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pattern_digest: "",
          json_canonical: "",
        });
      }
    });

    it("should lookup patterns by type", async () => {
      const result = await repository.lookup({
        type: ["LANG"],
      });

      expect(result.patterns.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.patterns.every((p) => p.type === "LANG")).toBe(true);
    });

    it("should search patterns by text", async () => {
      // [FIX:API:METHOD_CONSISTENCY] - Use searchText() for text-based search
      const results = await repository.searchText("JavaScript");

      expect(results.length).toBe(2);
      expect(results.every((p) => p.title.includes("JavaScript"))).toBe(true);
    });

    it("should find patterns by facets", async () => {
      const results = await repository.findByFacets({
        type: "LANG",
        tags: ["javascript"],
      });

      expect(results.length).toBe(2);
      expect(results.every((p) => p.tags.includes("javascript"))).toBe(true);
    });
  });

  describe("File watching", () => {
    it("should detect new pattern files", async () => {
      const patternPath = path.join(tempDir, "patterns", "TEST_WATCH_NEW.yaml");
      const patternData = {
        id: "TEST:WATCH:NEW",
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST",
        title: "Watch Test",
        summary: "Testing file watching",
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["test", "watch"],
      };

      // Write file after a delay to ensure watcher is ready
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.writeFile(patternPath, JSON.stringify(patternData, null, 2));

      // Wait for file watcher to process - increased timeout for reliability
      await new Promise((resolve) => setTimeout(resolve, 500));

      const pattern = await repository.get("TEST:WATCH:NEW");
      expect(pattern).toBeTruthy();
      expect(pattern?.title).toBe("Watch Test");
    });
  });

  describe("Validation", () => {
    it("should validate patterns", async () => {
      // Create a valid pattern
      const validPath = path.join(tempDir, "patterns", "VALID.yaml");
      await fs.writeFile(
        validPath,
        JSON.stringify(
          {
            id: "TEST:VALID:PATTERN",
            schema_version: "0.3",
            pattern_version: "1.0.0",
            type: "TEST",
            title: "Valid Pattern",
            summary: "This is valid",
            trust_score: 0.8,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            tags: [],
          },
          null,
          2,
        ),
      );

      // Create an invalid pattern
      const invalidPath = path.join(tempDir, "patterns", "INVALID.yaml");
      await fs.writeFile(
        invalidPath,
        JSON.stringify(
          {
            id: "TEST:INVALID:PATTERN",
            // Missing required fields
            type: "INVALID_TYPE",
          },
          null,
          2,
        ),
      );

      const results = await repository.validate();

      const valid = results.filter((r) => r.valid);
      const invalid = results.filter((r) => !r.valid);

      expect(valid.length).toBeGreaterThan(0);
      expect(invalid.length).toBeGreaterThan(0);
      expect(invalid[0].errors).toBeDefined();
    });
  });

  describe("list() method", () => {
    beforeEach(async () => {
      // Create test patterns with varying trust scores and types
      const patterns = [
        {
          id: "FIX:API:HIGH_TRUST",
          type: "FAILURE" as const,
          trust_score: 0.9,
          tags: ["api", "fix"],
        },
        {
          id: "PAT:TEST:MID_TRUST",
          type: "TEST" as const,
          trust_score: 0.6,
          tags: ["test", "pattern"],
        },
        {
          id: "ANTI:CODE:LOW_TRUST",
          type: "ANTI" as const,
          trust_score: 0.3,
          tags: ["anti", "code"],
        },
        {
          id: "FIX:DB:RECENT",
          type: "FAILURE" as const,
          trust_score: 0.7,
          tags: ["database", "fix"],
        },
      ];

      for (const partial of patterns) {
        const pattern = {
          ...partial,
          schema_version: "0.3",
          pattern_version: "1.0.0",
          title: `Test ${partial.id}`,
          summary: `Summary for ${partial.id}`,
          created_at: new Date(Date.now() - 1000 * 60 * (5 - patterns.indexOf(partial))).toISOString(),
          updated_at: new Date().toISOString(),
          pattern_digest: "",
          json_canonical: "",
        };
        await repository.create(pattern);
      }
    });

    it("should list all patterns with default options", async () => {
      const patterns = await repository.list();
      expect(patterns.length).toBe(4);
      // Should be ordered by trust_score DESC by default
      expect(patterns[0].id).toBe("FIX:API:HIGH_TRUST");
      expect(patterns[1].id).toBe("FIX:DB:RECENT");
    });

    it("should apply limit and offset", async () => {
      const patterns = await repository.list({ limit: 2, offset: 1 });
      expect(patterns.length).toBe(2);
      expect(patterns[0].id).toBe("FIX:DB:RECENT");
      expect(patterns[1].id).toBe("PAT:TEST:MID_TRUST");
    });

    it("should filter by type", async () => {
      const patterns = await repository.list({
        filter: { type: ["FAILURE"] },
      });
      expect(patterns.length).toBe(2);
      expect(patterns.every((p) => p.type === "FAILURE")).toBe(true);
    });

    it("should filter by minimum trust score", async () => {
      const patterns = await repository.list({
        filter: { minTrust: 0.6 },
      });
      expect(patterns.length).toBe(3);
      expect(patterns.every((p) => p.trust_score >= 0.6)).toBe(true);
    });

    it("should filter by tags", async () => {
      const patterns = await repository.list({
        filter: { tags: ["fix"] },
      });
      expect(patterns.length).toBe(2);
      expect(patterns[0].id).toBe("FIX:API:HIGH_TRUST");
      expect(patterns[1].id).toBe("FIX:DB:RECENT");
    });

    it("should order by different fields", async () => {
      const patterns = await repository.list({
        orderBy: "created_at",
        order: "asc",
      });
      expect(patterns[0].id).toBe("FIX:API:HIGH_TRUST");
      expect(patterns[patterns.length - 1].id).toBe("FIX:DB:RECENT");
    });
  });

  describe("search() method migration", () => {
    it("should maintain lookup behavior via search()", async () => {
      // Create test pattern
      const pattern = {
        id: "TEST:SEARCH:SEMANTIC",
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST" as const,
        title: "Semantic Search Test",
        summary: "Testing semantic search functionality",
        trust_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["semantic", "search"],
        pattern_digest: "",
        json_canonical: "",
      };
      await repository.create(pattern);

      // Test that search() works like lookup()
      const result = await repository.search({
        type: ["TEST"],
        k: 10,
      });

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.query.type).toEqual(["TEST"]);
    });

    it("should show deprecation warning for lookup()", async () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      
      await repository.lookup({ k: 10 });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("PatternRepository.lookup() is deprecated")
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe("getByIdOrAlias() method (APE-44)", () => {
    beforeEach(async () => {
      // Create test patterns with aliases
      const patterns = [
        {
          id: "PAT:ALIAS:TEST1",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "CODEBASE" as const,
          title: "Better-SQLite3 Synchronous Transactions",
          summary: "Use synchronous transactions for better-sqlite3",
          trust_score: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["database", "sqlite"],
          pattern_digest: "hash1",
          json_canonical: JSON.stringify({ test: "data" }),
          alias: "better-sqlite3-synchronous-transactions",
        },
        {
          id: "PAT:ALIAS:TEST2",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "CODEBASE" as const,
          title: "ES Module Import Pattern",
          summary: "Always use .js extensions for ES modules",
          trust_score: 0.9,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["modules", "import"],
          pattern_digest: "hash2",
          json_canonical: JSON.stringify({ test: "data" }),
          alias: "es-module-import-pattern",
        },
      ];

      for (const pattern of patterns) {
        await repository.create(pattern);
      }
    });

    it("should find pattern by exact ID", async () => {
      const pattern = await repository.getByIdOrAlias("PAT:ALIAS:TEST1");
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe("PAT:ALIAS:TEST1");
      expect(pattern?.title).toBe("Better-SQLite3 Synchronous Transactions");
    });

    it("should find pattern by alias", async () => {
      const pattern = await repository.getByIdOrAlias("better-sqlite3-synchronous-transactions");
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe("PAT:ALIAS:TEST1");
      expect(pattern?.alias).toBe("better-sqlite3-synchronous-transactions");
    });

    it("should find pattern by exact title match", async () => {
      const pattern = await repository.getByIdOrAlias("ES Module Import Pattern");
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe("PAT:ALIAS:TEST2");
    });

    it("should find pattern by case-insensitive title match", async () => {
      const pattern = await repository.getByIdOrAlias("es module import pattern");
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe("PAT:ALIAS:TEST2");
      expect(pattern?.title).toBe("ES Module Import Pattern");
    });

    it("should return null for non-existent pattern", async () => {
      const pattern = await repository.getByIdOrAlias("non-existent-pattern");
      expect(pattern).toBeNull();
    });

    it("should cache patterns after lookup", async () => {
      // First lookup by alias
      const pattern1 = await repository.getByIdOrAlias("es-module-import-pattern");
      expect(pattern1).toBeDefined();

      // Second lookup by ID should hit cache
      const pattern2 = await repository.get("PAT:ALIAS:TEST2");
      expect(pattern2).toBeDefined();
      expect(pattern2).toEqual(pattern1);
    });

    it("should prioritize ID match over alias or title", async () => {
      // Create a pattern with ID that looks like an alias
      const confusingPattern = {
        id: "better-sqlite3-synchronous-transactions", // ID looks like alias
        schema_version: "0.3",
        pattern_version: "1.0.0",
        type: "TEST" as const,
        title: "Confusing Pattern",
        summary: "This pattern has an ID that looks like an alias",
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ["test"],
        pattern_digest: "hash3",
        json_canonical: JSON.stringify({ test: "data" }),
        alias: "confusing-pattern",
      };
      await repository.create(confusingPattern);

      // Should find the confusing pattern by its ID, not PAT:ALIAS:TEST1 by alias
      const pattern = await repository.getByIdOrAlias("better-sqlite3-synchronous-transactions");
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe("better-sqlite3-synchronous-transactions");
      expect(pattern?.title).toBe("Confusing Pattern");
    });
  });
});
