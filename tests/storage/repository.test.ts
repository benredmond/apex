// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { fileURLToPath } from "url";
import {
  PatternRepository, createPatternRepository,
  createPatternRepository, createPatternRepository,
} from "../../src/storage/repository.ts";

// ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip due to Jest ESM "module is already linked" error
// This is a known limitation with Jest's experimental VM modules
// when importing from index files that re-export modules.
// See: https://github.com/nodejs/node/issues/35889
describe.skip("PatternRepository - SKIPPED: Jest ESM module linking issue", () => {
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
    
    // Get the internal database
    const db = (repository as any).db.database;
    
    // FIRST: Create base patterns table (BEFORE migrations)
    db.exec(`
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
    
    // THEN: Run migrations (with problematic ones skipped)
    const { MigrationRunner } = await import("../../src/migrations/MigrationRunner.js");
    const { MigrationLoader } = await import("../../src/migrations/MigrationLoader.js");
    
    const migrationRunner = new MigrationRunner(db);
    const loader = new MigrationLoader(path.resolve(__dirname, "../../src/migrations"));
    const migrations = await loader.loadMigrations();
    
    // Skip problematic migrations that expect existing data
    const migrationsToRun = migrations.filter(m => 
      !['011-migrate-pattern-tags-to-json', '012-rename-tags-csv-column', '014-populate-pattern-tags'].includes(m.id)
    );
    
    await migrationRunner.runMigrations(migrationsToRun);
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
        pattern_digest: "test-digest",
        json_canonical: JSON.stringify({}),
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
        pattern_digest: "test-digest",
        json_canonical: JSON.stringify({}),
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
        pattern_digest: "test-digest",
        json_canonical: JSON.stringify({}),
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
          pattern_digest: "test-digest",
          json_canonical: JSON.stringify({}),
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
          pattern_digest: "test-digest",
          json_canonical: JSON.stringify({}),
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
        pattern_digest: "test-digest",
        json_canonical: JSON.stringify({}),
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

  describe("Metadata Loading Methods", () => {
    beforeEach(async () => {
      // Create test patterns with metadata
      const patterns = [
        {
          id: "PAT:META:TEST1",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "CODEBASE" as const,
          title: "Pattern with Metadata",
          summary: "Test pattern with metadata, triggers, and vocab",
          trust_score: 0.9,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["test", "metadata"],
          pattern_digest: "hash1",
          json_canonical: JSON.stringify({ test: "data" }),
        },
        {
          id: "PAT:META:TEST2",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "CODEBASE" as const,
          title: "Pattern without Metadata",
          summary: "Test pattern without extra metadata",
          trust_score: 0.5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["test"],
          pattern_digest: "hash2",
          json_canonical: JSON.stringify({ test: "data" }),
        },
      ];

      for (const pattern of patterns) {
        await repository.create(pattern);
      }

      // Add metadata for TEST1
      const db = (repository as any).db;
      db.prepare(`
        INSERT INTO pattern_metadata (pattern_id, key, value, created_at)
        VALUES (?, ?, ?, ?)
      `).run("PAT:META:TEST1", "difficulty", "medium", new Date().toISOString());
      
      db.prepare(`
        INSERT INTO pattern_metadata (pattern_id, key, value, created_at)
        VALUES (?, ?, ?, ?)
      `).run("PAT:META:TEST1", "time_estimate", "30min", new Date().toISOString());

      // Add triggers for TEST1
      db.prepare(`
        INSERT INTO pattern_triggers (pattern_id, trigger_type, trigger_value, regex, priority)
        VALUES (?, ?, ?, ?, ?)
      `).run("PAT:META:TEST1", "error", "TypeError", 0, 100);
      
      db.prepare(`
        INSERT INTO pattern_triggers (pattern_id, trigger_type, trigger_value, regex, priority)
        VALUES (?, ?, ?, ?, ?)
      `).run("PAT:META:TEST1", "keyword", "async.*await", 1, 50);

      // Add vocab for TEST1
      db.prepare(`
        INSERT INTO pattern_vocab (pattern_id, term, term_type, weight)
        VALUES (?, ?, ?, ?)
      `).run("PAT:META:TEST1", "promise", "noun", 0.8);
      
      db.prepare(`
        INSERT INTO pattern_vocab (pattern_id, term, term_type, weight)
        VALUES (?, ?, ?, ?)
      `).run("PAT:META:TEST1", "async", "tech", 0.9);
    });

    describe("getMetadata", () => {
      it("should load metadata for patterns", async () => {
        const metadata = await repository.getMetadata(["PAT:META:TEST1", "PAT:META:TEST2"]);
        
        // Check TEST1 has metadata
        expect(metadata.has("PAT:META:TEST1")).toBe(true);
        const test1Metadata = metadata.get("PAT:META:TEST1")!;
        expect(test1Metadata).toHaveLength(2);
        expect(test1Metadata.find(m => m.key === "difficulty")?.value).toBe("medium");
        expect(test1Metadata.find(m => m.key === "time_estimate")?.value).toBe("30min");
        
        // Check TEST2 has no metadata
        expect(metadata.has("PAT:META:TEST2")).toBe(false);
      });

      it("should handle empty pattern list", async () => {
        const metadata = await repository.getMetadata([]);
        expect(metadata.size).toBe(0);
      });

      it("should handle non-existent patterns", async () => {
        const metadata = await repository.getMetadata(["NON:EXISTENT:PATTERN"]);
        expect(metadata.size).toBe(0);
      });
    });

    describe("getTriggers", () => {
      it("should load triggers for patterns", async () => {
        const triggers = await repository.getTriggers(["PAT:META:TEST1", "PAT:META:TEST2"]);
        
        // Check TEST1 has triggers
        expect(triggers.has("PAT:META:TEST1")).toBe(true);
        const test1Triggers = triggers.get("PAT:META:TEST1")!;
        expect(test1Triggers).toHaveLength(2);
        
        // Check triggers are ordered by priority DESC
        expect(test1Triggers[0].priority).toBe(100);
        expect(test1Triggers[0].trigger_value).toBe("TypeError");
        expect(test1Triggers[0].regex).toBe(false);
        
        expect(test1Triggers[1].priority).toBe(50);
        expect(test1Triggers[1].trigger_value).toBe("async.*await");
        expect(test1Triggers[1].regex).toBe(true);
        
        // Check TEST2 has no triggers
        expect(triggers.has("PAT:META:TEST2")).toBe(false);
      });

      it("should convert regex field from 0/1 to boolean", async () => {
        const triggers = await repository.getTriggers(["PAT:META:TEST1"]);
        const test1Triggers = triggers.get("PAT:META:TEST1")!;
        
        expect(typeof test1Triggers[0].regex).toBe("boolean");
        expect(typeof test1Triggers[1].regex).toBe("boolean");
      });
    });

    describe("getVocab", () => {
      it("should load vocab for patterns", async () => {
        const vocab = await repository.getVocab(["PAT:META:TEST1", "PAT:META:TEST2"]);
        
        // Check TEST1 has vocab
        expect(vocab.has("PAT:META:TEST1")).toBe(true);
        const test1Vocab = vocab.get("PAT:META:TEST1")!;
        expect(test1Vocab).toHaveLength(2);
        
        // Check vocab is ordered by weight DESC
        expect(test1Vocab[0].weight).toBe(0.9);
        expect(test1Vocab[0].term).toBe("async");
        expect(test1Vocab[0].term_type).toBe("tech");
        
        expect(test1Vocab[1].weight).toBe(0.8);
        expect(test1Vocab[1].term).toBe("promise");
        expect(test1Vocab[1].term_type).toBe("noun");
        
        // Check TEST2 has no vocab
        expect(vocab.has("PAT:META:TEST2")).toBe(false);
      });
    });
  });

  describe("Enhanced FTS5 Search", () => {
    beforeEach(async () => {
      // Create test patterns with searchable content
      const patterns = [
        {
          id: "PAT:FTS:TEST1",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "CODEBASE" as const,
          title: "Async/Await Error Handling",
          summary: "Handle errors in async functions properly",
          trust_score: 0.9,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["async", "error-handling"],
          keywords: "promise rejection try catch",
          search_index: "typescript javascript node",
          pattern_digest: "hash1",
          json_canonical: JSON.stringify({ test: "data" }),
        },
        {
          id: "PAT:FTS:TEST2",
          schema_version: "0.3",
          pattern_version: "1.0.0",
          type: "TEST" as const,
          title: "Mock Testing Pattern",
          summary: "Proper mocking for unit tests",
          trust_score: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ["testing", "mock"],
          keywords: "jest vitest stub spy",
          search_index: "unit integration e2e",
          pattern_digest: "hash2",
          json_canonical: JSON.stringify({ test: "data" }),
        },
      ];

      for (const pattern of patterns) {
        await repository.create(pattern);
      }
    });

    it("should search patterns using FTS5", async () => {
      const result = await repository.search({
        task: "async error handling",
        k: 10,
      });

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].id).toBe("PAT:FTS:TEST1");
    });

    it("should filter by type in FTS search", async () => {
      const result = await repository.search({
        task: "testing",
        type: "TEST",
        k: 10,
      });

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].id).toBe("PAT:FTS:TEST2");
    });

    it("should filter by tags in FTS search", async () => {
      const result = await repository.search({
        task: "mock",
        tags: ["testing"],
        k: 10,
      });

      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].id).toBe("PAT:FTS:TEST2");
    });

    it("should fall back to facet search when no text query", async () => {
      const result = await repository.search({
        task: "",
        type: ["TEST"] as Pattern["type"][],
        k: 10,
      });

      // Should still find TEST type pattern
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns.some(p => p.type === "TEST")).toBe(true);
    });

    it("should handle special FTS characters", async () => {
      // Should not throw error with quotes
      const result = await repository.search({
        task: 'test "with quotes"',
        k: 10,
      });

      expect(result).toBeDefined();
    });
  });
});
