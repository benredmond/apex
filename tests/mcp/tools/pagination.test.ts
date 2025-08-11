import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import { PatternLookupService } from "../../../src/mcp/tools/lookup.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { PatternDiscoverer } from "../../../src/mcp/tools/discover.js";
import type { LookupRequest } from "../../../src/mcp/tools/lookup.js";
import type { DiscoverRequest } from "../../../src/mcp/tools/discover.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Pagination Functionality (Task OVPyryTppa-NzUXpo205T)", () => {
  let repository: PatternRepository;
  let lookupService: PatternLookupService;
  let discoverService: PatternDiscoverer;

  beforeEach(async () => {
    // Initialize repository with in-memory database
    repository = new PatternRepository({ dbPath: ":memory:" });

    // Get the internal database
    const db = (repository as any).db.database;

    // Run ALL migrations to create required tables
    const { MigrationRunner } = await import("../../../src/migrations/migrations/MigrationRunner.js");
    const { MigrationLoader } = await import("../../../src/migrations/migrations/MigrationLoader.js");
    
    const migrationRunner = new MigrationRunner(db);
    const loader = new MigrationLoader();
    
    // Load all migrations
    const migrationsDir = path.resolve(__dirname, "../../../src/migrations/migrations");
    const migrations = loader.loadMigrations(migrationsDir);
    
    // Run pending migrations
    const status = migrationRunner.getStatus(migrations);
    for (const migration of status.pending) {
      migrationRunner.apply(migration);
    }

    // Create additional test schema if needed
    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
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

    // Insert 20 test patterns for pagination testing
    for (let i = 1; i <= 20; i++) {
      const id = `TEST:PATTERN:${i.toString().padStart(2, '0')}`;
      db.prepare(`
        INSERT INTO patterns (id, type, title, summary, trust_score, tags, keywords, search_index)
        VALUES (?, 'CODEBASE', ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        `Test Pattern ${i}`,
        `Test pattern ${i} for pagination testing`,
        0.5 + (i * 0.02), // Varying trust scores
        JSON.stringify([`tag${i}`, 'pagination']),
        `keyword${i} test pagination`,
        `test pattern ${i} pagination functionality`
      );
      
      // Add to FTS index
      db.prepare(`
        INSERT INTO patterns_fts (id, title, summary, tags, keywords, search_index)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        `Test Pattern ${i}`,
        `Test pattern ${i} for pagination testing`,
        JSON.stringify([`tag${i}`, 'pagination']),
        `keyword${i} test pagination`,
        `test pattern ${i} pagination functionality`
      );
      
      // Add snippet
      db.prepare(`
        INSERT INTO snippets (snippet_id, pattern_id, content, language)
        VALUES (?, ?, ?, ?)
      `).run(
        `snip${i}`,
        id,
        `// Test snippet ${i}\nconsole.log("Pattern ${i}");`,
        'javascript'
      );
    }

    // Initialize services with the repository we already created
    lookupService = new PatternLookupService(repository);
    discoverService = new PatternDiscoverer(repository);
  });

  afterEach(() => {
    // Repository will handle database cleanup
  });

  describe("PatternLookupService Pagination", () => {
    it("should return first page with default page size", async () => {
      const request: LookupRequest = {
        task: "test pagination functionality",
        page: 1,
        pageSize: 5
      };

      const response = await lookupService.lookup(request);
      
      expect(response.pagination).toBeDefined();
      expect(response.pagination?.page).toBe(1);
      expect(response.pagination?.pageSize).toBe(5);
      expect(response.pagination?.totalItems).toBeGreaterThan(0);
      expect(response.pagination?.hasNext).toBe(true);
      expect(response.pagination?.hasPrev).toBe(false);
      expect(response.pattern_pack.candidates.length).toBeLessThanOrEqual(5);
    });

    it("should return second page", async () => {
      const request: LookupRequest = {
        task: "test pagination functionality",
        page: 2,
        pageSize: 5
      };

      const response = await lookupService.lookup(request);
      
      expect(response.pagination).toBeDefined();
      expect(response.pagination?.page).toBe(2);
      expect(response.pagination?.hasPrev).toBe(true);
    });

    it("should return last page correctly", async () => {
      const request: LookupRequest = {
        task: "test pagination functionality",
        page: 4,
        pageSize: 5
      };

      const response = await lookupService.lookup(request);
      
      expect(response.pagination).toBeDefined();
      expect(response.pagination?.page).toBe(4);
      expect(response.pagination?.hasNext).toBe(false);
      expect(response.pagination?.hasPrev).toBe(true);
    });

    it("should maintain backward compatibility without pagination", async () => {
      const request: LookupRequest = {
        task: "test pagination functionality"
      };

      const response = await lookupService.lookup(request);
      
      expect(response.pagination).toBeUndefined();
      expect(response.pattern_pack.candidates.length).toBeGreaterThan(0);
    });

    it("should apply pagination after ranking", async () => {
      // First get unpaginated results to verify ranking
      const unpaginatedRequest: LookupRequest = {
        task: "test pagination functionality"
      };
      const unpaginatedResponse = await lookupService.lookup(unpaginatedRequest);
      
      // Then get first page
      const paginatedRequest: LookupRequest = {
        task: "test pagination functionality",
        page: 1,
        pageSize: 3
      };
      const paginatedResponse = await lookupService.lookup(paginatedRequest);
      
      // First 3 patterns in paginated should match first 3 in unpaginated
      if (unpaginatedResponse.pattern_pack.candidates.length >= 3) {
        for (let i = 0; i < 3; i++) {
          expect(paginatedResponse.pattern_pack.candidates[i].id)
            .toBe(unpaginatedResponse.pattern_pack.candidates[i].id);
        }
      }
    });

    it("should cache paginated responses separately", async () => {
      const request1: LookupRequest = {
        task: "test pagination functionality",
        page: 1,
        pageSize: 5
      };

      const request2: LookupRequest = {
        task: "test pagination functionality",
        page: 2,
        pageSize: 5
      };

      const response1 = await lookupService.lookup(request1);
      const response2 = await lookupService.lookup(request2);
      
      expect(response1.cache_hit).toBe(false);
      expect(response2.cache_hit).toBe(false);
      
      // Same request should hit cache
      const response1Cached = await lookupService.lookup(request1);
      expect(response1Cached.cache_hit).toBe(true);
      expect(response1Cached.pagination?.page).toBe(1);
    });
  });

  describe("PatternDiscoverer Pagination", () => {
    it("should return first page with pagination info", async () => {
      const request: DiscoverRequest = {
        query: "test pagination",
        page: 1,
        pageSize: 5
      };

      const response = await discoverService.discover(request);
      
      expect(response.pagination).toBeDefined();
      expect(response.pagination?.page).toBe(1);
      expect(response.pagination?.pageSize).toBe(5);
      expect(response.pagination?.totalItems).toBeGreaterThan(0);
      expect(response.pagination?.hasNext).toBe(true);
      expect(response.pagination?.hasPrev).toBe(false);
      expect(response.patterns.length).toBeLessThanOrEqual(5);
    });

    it("should navigate through pages", async () => {
      const page1: DiscoverRequest = {
        query: "test pagination",
        page: 1,
        pageSize: 3
      };

      const page2: DiscoverRequest = {
        query: "test pagination",
        page: 2,
        pageSize: 3
      };

      const response1 = await discoverService.discover(page1);
      const response2 = await discoverService.discover(page2);
      
      // Pages should have different content
      const ids1 = response1.patterns.map(p => p.pattern.id);
      const ids2 = response2.patterns.map(p => p.pattern.id);
      
      const overlap = ids1.filter(id => ids2.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("should maintain backward compatibility with max_results", async () => {
      const request: DiscoverRequest = {
        query: "test pagination",
        max_results: 7
      };

      const response = await discoverService.discover(request);
      
      expect(response.pagination).toBeUndefined();
      expect(response.patterns.length).toBeLessThanOrEqual(7);
    });

    it("should apply pagination after scoring and ranking", async () => {
      const request: DiscoverRequest = {
        query: "test pagination",
        page: 1,
        pageSize: 5,
        min_score: 0.1
      };

      const response = await discoverService.discover(request);
      
      // All returned patterns should meet min_score
      response.patterns.forEach(p => {
        expect(p.score).toBeGreaterThanOrEqual(0.1);
      });
      
      // Patterns should be in descending score order
      for (let i = 1; i < response.patterns.length; i++) {
        expect(response.patterns[i-1].score).toBeGreaterThanOrEqual(response.patterns[i].score);
      }
    });

    it("should handle empty pages gracefully", async () => {
      const request: DiscoverRequest = {
        query: "test pagination",
        page: 100,
        pageSize: 5
      };

      const response = await discoverService.discover(request);
      
      expect(response.patterns.length).toBe(0);
      expect(response.pagination?.page).toBe(100);
      expect(response.pagination?.hasNext).toBe(false);
      expect(response.pagination?.hasPrev).toBe(true);
    });
  });

  describe("Cache Integration", () => {
    it("should include pagination info in cached responses", async () => {
      const request: LookupRequest = {
        task: "test pagination functionality",
        page: 1,
        pageSize: 5
      };

      const response1 = await lookupService.lookup(request);
      expect(response1.cache_hit).toBe(false);
      expect(response1.pagination).toBeDefined();

      // Second request should hit cache with pagination info
      const response2 = await lookupService.lookup(request);
      expect(response2.cache_hit).toBe(true);
      expect(response2.pagination).toEqual(response1.pagination);
    });
  });
});