import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import { PatternRepository } from "../../../src/storage/repository.js";
import { PatternLookupService } from "../../../src/mcp/tools/lookup.js";
import { ReflectionStorage } from "../../../src/reflection/storage.js";

describe("APE-65: Pattern Metadata Performance", () => {
  let db: Database.Database;
  let repository: PatternRepository;
  let lookupService: PatternLookupService;
  let reflectionStorage: ReflectionStorage;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Apply migration 008 schema
    db.exec(`
      CREATE TABLE patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL DEFAULT '1.0',
        pattern_version   TEXT NOT NULL DEFAULT '1.0',
        type              TEXT NOT NULL,
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        trust_score       REAL NOT NULL DEFAULT 0.5,
        created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        pattern_digest    TEXT NOT NULL DEFAULT 'test',
        json_canonical    TEXT NOT NULL DEFAULT '{}',
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT,
        tags              TEXT,
        search_index      TEXT
      );

      CREATE TABLE reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        brief_id TEXT,
        outcome TEXT CHECK(outcome IN ('success','partial','failure')) NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_reflections_pattern_task 
      ON reflections(json_extract(json, '$.claims.patterns_used[0].pattern_id'), created_at DESC);

      CREATE VIRTUAL TABLE patterns_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        tags,
        search_index,
        tokenize='porter'
      );
    `);

    // Initialize repository with test database
    repository = new PatternRepository({ dbPath: ":memory:" });
    
    // Replace the internal database
    const dbAccessor = repository.getDatabase();
    if (dbAccessor) {
      // Close the default database and use our test one
      dbAccessor.close();
    }
    // Inject our test database
    (repository as any).db = { database: db };

    lookupService = new PatternLookupService(repository);
    reflectionStorage = new ReflectionStorage(db);
  });

  afterEach(() => {
    db.close();
  });

  it("should extract pattern metadata within 500ms for 100 patterns", async () => {
    // Insert 100 test patterns with full metadata
    const insertStmt = db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score,
        alpha, beta, usage_count, success_count,
        key_insight, when_to_use, common_pitfalls, tags, search_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFts = db.prepare(`
      INSERT INTO patterns_fts (id, title, summary, tags, search_index)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Batch insert patterns
    const insertBatch = db.transaction(() => {
      for (let i = 1; i <= 100; i++) {
        const id = `PAT:TEST:${i.toString().padStart(3, '0')}`;
        const title = `Test Pattern ${i}`;
        const summary = `Summary for pattern ${i} with various keywords`;
        const tags = `test,pattern,batch,perf${i % 10}`;
        const searchIndex = `${title} ${summary} ${tags}`;
        const pitfalls = JSON.stringify([
          `Pitfall 1 for pattern ${i}`,
          `Pitfall 2 for pattern ${i}`
        ]);

        insertStmt.run(
          id, "CODEBASE", title, summary, 0.5 + (i / 200),
          10 + i, 5, 100 + i, 80 + i,
          `Key insight for pattern ${i}`,
          `Use when scenario ${i}`,
          pitfalls,
          tags,
          searchIndex
        );

        insertFts.run(id, title, summary, tags, searchIndex);
      }
    });

    insertBatch();

    // Insert some reflection data for last_used_task lookup
    const reflectionStmt = db.prepare(`
      INSERT INTO reflections (task_id, outcome, json)
      VALUES (?, ?, ?)
    `);

    for (let i = 1; i <= 20; i++) {
      const patternId = `PAT:TEST:${i.toString().padStart(3, '0')}`;
      const reflection = {
        claims: {
          patterns_used: [{ pattern_id: patternId }]
        }
      };
      reflectionStmt.run(`TASK-${i}`, 'success', JSON.stringify(reflection));
    }

    // Measure pattern extraction performance
    const startTime = Date.now();

    // Perform a lookup that will trigger metadata extraction
    const response = await lookupService.lookup({
      task: "test pattern batch performance",
      max_size: 32768, // Large size to include many patterns
    });

    const duration = Date.now() - startTime;

    // Verify performance requirement
    expect(duration).toBeLessThan(500);
    
    // Verify we got patterns with metadata
    expect(response.pattern_pack).toBeDefined();
    expect(response.pattern_pack.candidates.length).toBeGreaterThan(0);
    
    // Check that metadata fields are populated
    const firstCandidate = response.pattern_pack.candidates[0];
    if (firstCandidate) {
      expect(firstCandidate.trust_score).toBeDefined();
      expect(firstCandidate.usage_count).toBeDefined();
      expect(firstCandidate.key_insight).toBeDefined();
      expect(firstCandidate.when_to_use).toBeDefined();
      expect(firstCandidate.common_pitfalls).toBeDefined();
    }

    console.log(`Pattern extraction for ${response.pattern_pack.candidates.length} patterns took ${duration}ms`);
  });

  it("should efficiently update pattern usage statistics", () => {
    // Insert test patterns
    const insertStmt = db.prepare(`
      INSERT INTO patterns (id, type, title, summary, usage_count, success_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i <= 50; i++) {
      insertStmt.run(
        `PAT:USAGE:${i}`,
        "CODEBASE",
        `Usage Pattern ${i}`,
        `Testing usage statistics ${i}`,
        0,
        0
      );
    }

    // Measure batch update performance
    const startTime = Date.now();

    // Simulate 50 pattern usage updates
    const updateStmt = db.prepare(`
      UPDATE patterns 
      SET 
        usage_count = COALESCE(usage_count, 0) + 1,
        success_count = COALESCE(success_count, 0) + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const batchUpdate = db.transaction(() => {
      for (let i = 1; i <= 50; i++) {
        const wasSuccessful = Math.random() > 0.2; // 80% success rate
        updateStmt.run(wasSuccessful ? 1 : 0, `PAT:USAGE:${i}`);
      }
    });

    batchUpdate();

    const duration = Date.now() - startTime;

    // Should complete batch updates very quickly
    expect(duration).toBeLessThan(50);

    // Verify updates were applied
    const pattern = db.prepare("SELECT * FROM patterns WHERE id = ?").get("PAT:USAGE:1") as any;
    expect(pattern.usage_count).toBe(1);
    
    console.log(`Batch update of 50 pattern usage stats took ${duration}ms`);
  });

  it("should efficiently query patterns with metadata filters", () => {
    // Insert patterns with varying metadata
    const insertStmt = db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score,
        usage_count, success_count, key_insight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 1; i <= 200; i++) {
      insertStmt.run(
        `PAT:QUERY:${i}`,
        i % 3 === 0 ? "ANTI" : "CODEBASE",
        `Query Pattern ${i}`,
        `Pattern for query testing ${i}`,
        0.3 + (i / 300),
        i * 2,
        Math.floor(i * 1.8),
        i % 5 === 0 ? `Important insight ${i}` : null
      );
    }

    // Test complex query performance
    const startTime = Date.now();

    // Query patterns with multiple conditions
    const results = db.prepare(`
      SELECT 
        id, title, trust_score, usage_count, success_count,
        CAST(success_count AS REAL) / NULLIF(usage_count, 0) as success_rate,
        key_insight
      FROM patterns
      WHERE 
        type = 'CODEBASE'
        AND trust_score > 0.5
        AND usage_count > 100
        AND key_insight IS NOT NULL
      ORDER BY trust_score DESC
      LIMIT 20
    `).all();

    const duration = Date.now() - startTime;

    // Complex queries should still be fast
    expect(duration).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);

    console.log(`Complex metadata query returned ${results.length} results in ${duration}ms`);
  });
});