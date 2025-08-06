import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import Database from "better-sqlite3";
import { PatternLookupService } from "../../../src/mcp/tools/lookup.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { PackBuilder } from "../../../src/ranking/pack-builder.js";
import type { LookupRequest } from "../../../src/mcp/tools/lookup.js";

describe("Pattern Lookup with Enhanced Metadata (APE-65)", () => {
  let db: Database.Database;
  let repository: PatternRepository;
  let lookupService: PatternLookupService;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(":memory:");

    // Create schema with enhanced fields
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
        source_repo       TEXT,
        alias             TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        status            TEXT DEFAULT 'active',
        tags              TEXT,
        keywords          TEXT,
        search_index      TEXT,
        provenance        TEXT DEFAULT 'manual',
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT
      );

      CREATE TABLE reflections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        brief_id TEXT,
        outcome TEXT CHECK(outcome IN ('success','partial','failure')) NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE snippets (
        snippet_id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT,
        label TEXT,
        file_ref TEXT,
        line_count INTEGER,
        bytes INTEGER,
        FOREIGN KEY (pattern_id) REFERENCES patterns(id)
      );

      CREATE VIRTUAL TABLE patterns_fts USING fts5(
        id UNINDEXED,
        title,
        summary,
        tags,
        keywords,
        search_index,
        tokenize='porter'
      );
    `);

    // Initialize repository with in-memory database
    repository = new PatternRepository({
      dbPath: ":memory:",
    });
    
    // Replace repository's database with our test database
    const dbField = Object.getOwnPropertyDescriptor(repository, "db");
    if (dbField && dbField.value) {
      dbField.value.database = db;
    }

    // Initialize lookup service
    lookupService = new PatternLookupService(repository);
  });

  afterEach(() => {
    db.close();
  });

  it("should return enhanced metadata fields in pattern pack", async () => {
    // Insert test pattern with enhanced metadata
    const pitfalls = JSON.stringify(["Don't mock too deep", "Reset mocks between tests"]);
    
    db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score,
        alpha, beta, usage_count, success_count,
        key_insight, when_to_use, common_pitfalls
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "PAT:TEST:MOCK",
      "CODEBASE",
      "Jest API Mocking Patterns",
      "Mock API calls in Jest tests with proper isolation",
      0.88,
      88,
      12,
      234,
      206,
      "Mock at axios level, not function level",
      "Integration tests with external deps",
      pitfalls
    );

    // Add to FTS index
    db.prepare(`
      INSERT INTO patterns_fts (id, title, summary)
      VALUES (?, ?, ?)
    `).run(
      "PAT:TEST:MOCK",
      "Jest API Mocking Patterns",
      "Mock API calls in Jest tests with proper isolation"
    );

    // Add snippet
    db.prepare(`
      INSERT INTO snippets (snippet_id, pattern_id, content, language)
      VALUES (?, ?, ?, ?)
    `).run(
      "snip123",
      "PAT:TEST:MOCK",
      "jest.mock('axios');\nconst mockAxios = axios as jest.Mocked<typeof axios>;",
      "typescript"
    );

    // Perform lookup
    const request: LookupRequest = {
      task: "testing with mocks",
      max_size: 8192,
    };

    const response = await lookupService.lookup(request);
    
    expect(response).toBeDefined();
    expect(response.pattern_pack).toBeDefined();
    expect(response.pattern_pack.candidates).toHaveLength(1);

    const candidate = response.pattern_pack.candidates[0];
    
    // Check enhanced metadata fields
    expect(candidate.id).toBe("PAT:TEST:MOCK");
    expect(candidate.trust_score).toBeCloseTo(0.88, 1);
    expect(candidate.usage_count).toBe(234);
    expect(candidate.success_rate).toBeCloseTo(0.88, 2);
    expect(candidate.key_insight).toBe("Mock at axios level, not function level");
    expect(candidate.when_to_use).toBe("Integration tests with external deps");
    expect(candidate.common_pitfalls).toEqual(["Don't mock too deep", "Reset mocks between tests"]);
  });

  it("should calculate Wilson score from alpha/beta parameters", async () => {
    // Insert pattern with alpha/beta but no trust_score
    db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary,
        alpha, beta, usage_count, success_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "PAT:WILSON:TEST",
      "CODEBASE",
      "Wilson Score Test",
      "Testing Wilson score calculation",
      40,
      10,
      50,
      40
    );

    // Add to FTS index
    db.prepare(`
      INSERT INTO patterns_fts (id, title, summary)
      VALUES (?, ?, ?)
    `).run(
      "PAT:WILSON:TEST",
      "Wilson Score Test",
      "Testing Wilson score calculation"
    );

    const request: LookupRequest = {
      task: "wilson score",
      max_size: 8192,
    };

    const response = await lookupService.lookup(request);
    const candidate = response.pattern_pack.candidates[0];
    
    // Wilson score for alpha=40, beta=10 should be around 0.67
    expect(candidate.trust_score).toBeDefined();
    expect(candidate.trust_score).toBeGreaterThan(0.6);
    expect(candidate.trust_score).toBeLessThan(0.75);
  });

  it("should handle patterns without enhanced metadata gracefully", async () => {
    // Insert pattern without enhanced metadata
    db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      "PAT:BASIC:TEST",
      "CODEBASE",
      "Basic Pattern",
      "A pattern without enhanced metadata",
      0.5
    );

    // Add to FTS index
    db.prepare(`
      INSERT INTO patterns_fts (id, title, summary)
      VALUES (?, ?, ?)
    `).run(
      "PAT:BASIC:TEST",
      "Basic Pattern",
      "A pattern without enhanced metadata"
    );

    const request: LookupRequest = {
      task: "basic pattern",
      max_size: 8192,
    };

    const response = await lookupService.lookup(request);
    const candidate = response.pattern_pack.candidates[0];
    
    // Should have basic fields but optional enhanced fields may be undefined
    expect(candidate.id).toBe("PAT:BASIC:TEST");
    expect(candidate.trust_score).toBe(0.5);
    expect(candidate.usage_count).toBeUndefined();
    expect(candidate.success_rate).toBeUndefined();
    expect(candidate.key_insight).toBeUndefined();
    expect(candidate.when_to_use).toBeUndefined();
    expect(candidate.common_pitfalls).toBeUndefined();
  });

  it("should parse common_pitfalls as JSON array", async () => {
    // Test with valid JSON array
    db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score,
        common_pitfalls
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "PAT:JSON:ARRAY",
      "CODEBASE",
      "JSON Array Test",
      "Testing JSON array parsing",
      0.7,
      '["First pitfall", "Second pitfall", "Third pitfall"]'
    );

    // Test with plain string (should convert to single-item array)
    db.prepare(`
      INSERT INTO patterns (
        id, type, title, summary, trust_score,
        common_pitfalls
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "PAT:PLAIN:STRING",
      "CODEBASE",
      "Plain String Test",
      "Testing plain string conversion",
      0.6,
      "This is a single pitfall"
    );

    // Add to FTS index
    db.prepare(`
      INSERT INTO patterns_fts (id, title, summary)
      VALUES (?, ?, ?), (?, ?, ?)
    `).run(
      "PAT:JSON:ARRAY", "JSON Array Test", "Testing JSON array parsing",
      "PAT:PLAIN:STRING", "Plain String Test", "Testing plain string conversion"
    );

    const request: LookupRequest = {
      task: "test parsing",
      max_size: 16384,
    };

    const response = await lookupService.lookup(request);
    const candidates = response.pattern_pack.candidates;
    
    const jsonPattern = candidates.find((c) => c.id === "PAT:JSON:ARRAY");
    expect(jsonPattern?.common_pitfalls).toEqual([
      "First pitfall",
      "Second pitfall",
      "Third pitfall"
    ]);

    const stringPattern = candidates.find((c) => c.id === "PAT:PLAIN:STRING");
    expect(stringPattern?.common_pitfalls).toEqual(["This is a single pitfall"]);
  });

  it("should calculate success_rate from success_count and usage_count", async () => {
    // Test with various success/usage combinations
    const patterns = [
      { id: "PAT:PERFECT", success: 100, usage: 100, expected: 1.0 },
      { id: "PAT:GOOD", success: 75, usage: 100, expected: 0.75 },
      { id: "PAT:POOR", success: 10, usage: 100, expected: 0.1 },
      { id: "PAT:UNUSED", success: 0, usage: 0, expected: 0 },
    ];

    for (const pattern of patterns) {
      db.prepare(`
        INSERT INTO patterns (
          id, type, title, summary, trust_score,
          success_count, usage_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        pattern.id,
        "CODEBASE",
        `${pattern.id} Pattern`,
        `Testing success rate ${pattern.expected}`,
        0.5,
        pattern.success,
        pattern.usage
      );

      db.prepare(`
        INSERT INTO patterns_fts (id, title, summary)
        VALUES (?, ?, ?)
      `).run(
        pattern.id,
        `${pattern.id} Pattern`,
        `Testing success rate ${pattern.expected}`
      );
    }

    const request: LookupRequest = {
      task: "success rate testing",
      max_size: 32768,
    };

    const response = await lookupService.lookup(request);
    
    for (const pattern of patterns) {
      const candidate = response.pattern_pack.candidates.find((c) => c.id === pattern.id);
      expect(candidate).toBeDefined();
      if (candidate) {
        expect(candidate.success_rate).toBeCloseTo(pattern.expected, 2);
      }
    }
  });
});