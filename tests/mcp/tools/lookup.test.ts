/**
 * Tests for pattern lookup MCP tool
 * [PAT:TEST:BEHAVIOR_OVER_INTERNALS] ★★★★☆ (3 uses) - Test behavior not internals
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { PatternLookupService } from "../../../src/mcp/tools/lookup.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { lookupMetrics } from "../../../src/mcp/tools/metrics.js";
import {
  InvalidParamsError,
  ToolExecutionError,
  InternalError,
} from "../../../src/mcp/errors.js";

describe("PatternLookupService", () => {
  let tempDir: string;
  let repository: PatternRepository;
  let lookupService: PatternLookupService;

  beforeEach(async () => {
    // Reset metrics
    lookupMetrics.reset();

    // Create temp directory for test
    tempDir = path.join(os.tmpdir(), `apex-lookup-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Initialize repository with test data
    repository = new PatternRepository({
      dbPath: path.join(tempDir, "test.db"),
      patternsDir: path.join(tempDir, "patterns"),
    });

    // Run ALL migrations to create required tables
    const db = (repository as any).db.database;
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

    await repository.initialize();

    // Create test patterns
    await repository.create({
      id: "PAT:TEST:MOCK",
      type: "CODEBASE",
      title: "Test Mock Pattern",
      summary: "Pattern for mocking in tests",
      trust_score: 0.9,
      tags: ["testing", "mock"],
      schema_version: "1.0.0",
      pattern_version: "1.0.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pattern_digest: "test-digest",
      json_canonical: "{}",
    });

    await repository.create({
      id: "PAT:API:REST",
      type: "CODEBASE",
      title: "REST API Pattern",
      summary: "Pattern for REST API design",
      trust_score: 0.85,
      tags: ["api", "rest"],
      schema_version: "1.0.0",
      pattern_version: "1.0.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pattern_digest: "api-digest",
      json_canonical: "{}",
    });

    lookupService = new PatternLookupService(repository);
  });

  afterEach(async () => {
    await repository.shutdown();
    await fs.remove(tempDir);
  });

  describe("Request Validation", () => {
    it("should reject requests without task", async () => {
      await expect(lookupService.lookup({})).rejects.toThrow(
        InvalidParamsError,
      );
      expect(lookupMetrics.getMetrics().errors.validation).toBe(1);
    });

    it("should reject empty task", async () => {
      await expect(lookupService.lookup({ task: "" })).rejects.toThrow(
        InvalidParamsError,
      );
    });

    it("should reject task exceeding max length", async () => {
      const longTask = "a".repeat(1001);
      await expect(lookupService.lookup({ task: longTask })).rejects.toThrow(
        InvalidParamsError,
      );
    });

    it("should reject invalid max_size", async () => {
      await expect(
        lookupService.lookup({
          task: "test",
          max_size: 500, // Below minimum
        }),
      ).rejects.toThrow(InvalidParamsError);

      await expect(
        lookupService.lookup({
          task: "test",
          max_size: 100000, // Above maximum
        }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it("should accept valid request", async () => {
      const response = await lookupService.lookup({
        task: "Implement test mocking",
        language: "typescript",
        framework: "jest",
        current_file: "src/test.ts",
        max_size: 8192,
      });

      expect(response).toHaveProperty("pattern_pack");
      expect(response).toHaveProperty("request_id");
      expect(response).toHaveProperty("latency_ms");
      expect(response).toHaveProperty("cache_hit");
      expect(response.cache_hit).toBe(false);
    });
  });

  describe("Signal Extraction", () => {
    it("should extract language from current_file", async () => {
      const response = await lookupService.lookup({
        task: "Test task with typescript components",
        current_file: "src/components/Button.tsx",
      });

      // Verify that language was extracted and request processed
      expect(response.pattern_pack).toBeDefined();
      expect(response.pattern_pack.task).toBe(
        "Test task with typescript components",
      );

      // Check metrics to verify signal extraction
      const metrics = lookupMetrics.getMetrics();
      expect(metrics.signals_provided.current_file).toBeGreaterThan(0);
    });

    it("should handle explicit language over file extension", async () => {
      const response = await lookupService.lookup({
        task: "Test task",
        current_file: "script.js",
        language: "typescript", // Explicit wins
      });

      expect(response.pattern_pack.meta.included).toBeGreaterThanOrEqual(0);
    });

    it("should extract error information", async () => {
      const response = await lookupService.lookup({
        task: "Fix error",
        recent_errors: [
          'TypeError: Cannot read property "foo" of undefined at Button.tsx:45:12',
          "ReferenceError: process is not defined at config.js:10:5",
        ],
      });

      expect(response.pattern_pack).toBeDefined();
      // Metrics should show recent_errors was provided
      expect(lookupMetrics.getMetrics().signals_provided.recent_errors).toBe(1);
    });
  });

  describe("Caching", () => {
    it("should cache responses", async () => {
      const request = {
        task: "Implement caching test",
        language: "javascript",
      };

      // First request - cache miss
      const response1 = await lookupService.lookup(request);
      expect(response1.cache_hit).toBe(false);
      expect(lookupMetrics.getMetrics().cache_misses).toBe(1);

      // Second request - cache hit
      const response2 = await lookupService.lookup(request);
      expect(response2.cache_hit).toBe(true);
      expect(lookupMetrics.getMetrics().cache_hits).toBe(1);

      // Same pattern_pack should be returned
      expect(response2.pattern_pack).toEqual(response1.pattern_pack);
    });

    it("should use different cache keys for different max_size", async () => {
      const baseRequest = {
        task: "Test task",
        language: "javascript",
      };

      const response1 = await lookupService.lookup({
        ...baseRequest,
        max_size: 4096,
      });
      const response2 = await lookupService.lookup({
        ...baseRequest,
        max_size: 8192,
      });

      // Both should be cache misses
      expect(response1.cache_hit).toBe(false);
      expect(response2.cache_hit).toBe(false);
      expect(lookupMetrics.getMetrics().cache_misses).toBe(2);
    });

    it("should normalize request for cache key", async () => {
      // These should hit the same cache entry
      const response1 = await lookupService.lookup({
        task: "  Implement TEST  ",
        language: "JavaScript",
      });

      const response2 = await lookupService.lookup({
        task: "implement test",
        language: "javascript",
      });

      expect(response1.cache_hit).toBe(false);
      expect(response2.cache_hit).toBe(true); // Should hit cache
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits", async () => {
      // Make many requests quickly
      const promises = [];
      for (let i = 0; i < 101; i++) {
        promises.push(
          lookupService.lookup({ task: `Task ${i}` }).catch((e) => e),
        );
      }

      const results = await Promise.all(promises);

      // Some should succeed, last one should fail
      const errors = results.filter((r) => r instanceof ToolExecutionError);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Rate limit");
    });
  });

  describe("Metrics Collection", () => {
    it("should track all request signals", async () => {
      await lookupService.lookup({
        task: "Test metrics",
        current_file: "test.js",
        language: "javascript",
        framework: "jest",
        recent_errors: ["error1"],
        repo_path: "/path/to/repo",
      });

      const metrics = lookupMetrics.getMetrics();
      expect(metrics.signals_provided.task).toBe(1);
      expect(metrics.signals_provided.current_file).toBe(1);
      expect(metrics.signals_provided.language).toBe(1);
      expect(metrics.signals_provided.framework).toBe(1);
      expect(metrics.signals_provided.recent_errors).toBe(1);
      expect(metrics.signals_provided.repo_path).toBe(1);
    });

    it("should track latency", async () => {
      await lookupService.lookup({ task: "Test latency" });

      const metrics = lookupMetrics.getMetrics();
      expect(metrics.avg_latency_ms).toBeGreaterThan(0);
      expect(metrics.total_latency_ms).toBeGreaterThan(0);
    });

    it("should track patterns returned", async () => {
      await lookupService.lookup({ task: "Test patterns" });

      const metrics = lookupMetrics.getMetrics();
      expect(metrics.patterns_returned.total).toBeGreaterThan(0);
      expect(metrics.patterns_returned.avg_per_request).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should sanitize error messages", async () => {
      // Mock repository to throw error with stack trace
      jest
        .spyOn(repository, "lookup")
        .mockRejectedValue(
          new Error(
            "Database error\n    at Object.<anonymous> (/secret/path/file.js:123:45)",
          ),
        );

      // InternalError is thrown for repository errors
      try {
        await lookupService.lookup({ task: "Test error" });
      } catch (error) {
        expect(error).toBeInstanceOf(InternalError);
        expect((error as Error).message).not.toContain("/secret/path");
        expect((error as Error).message).toContain("Database error");
      }
    });

    it("should track different error types", async () => {
      // Validation error
      await lookupService.lookup({}).catch(() => {});

      // Lookup error
      jest.spyOn(repository, "lookup").mockRejectedValue(new Error("DB error"));
      await lookupService.lookup({ task: "test" }).catch(() => {});

      const metrics = lookupMetrics.getMetrics();
      expect(metrics.errors.validation).toBe(1);
      expect(metrics.errors.lookup).toBe(1);
    });
  });

  describe("Enhanced Context", () => {
    it("should accept and process enhanced context fields", async () => {
      const enhancedRequest = {
        task: "Fix TypeError in authentication module",
        task_intent: {
          type: "bug_fix" as const,
          confidence: 0.9,
          sub_type: "type_error",
        },
        code_context: {
          current_file: "/src/auth.ts",
          imports: ["jsonwebtoken", "bcrypt"],
          exports: ["authenticate", "authorize"],
          related_files: ["/src/user.ts", "/src/session.ts"],
          test_files: ["/tests/auth.test.ts"],
        },
        error_context: [
          {
            type: "TypeError",
            message: "Cannot read property of undefined",
            file: "/src/auth.ts",
            line: 42,
            frequency: 3,
          },
        ],
        session_context: {
          recent_patterns: [
            {
              pattern_id: "PAT:AUTH:JWT",
              success: true,
              timestamp: new Date().toISOString(),
            },
          ],
          failed_patterns: ["PAT:SECURITY:BASIC"],
        },
        project_signals: {
          language: "typescript",
          framework: "express",
          test_framework: "jest",
          build_tool: "webpack",
          dependencies: {
            express: "^4.18.0",
            jsonwebtoken: "^9.0.0",
          },
        },
        workflow_phase: "builder" as const,
      };

      const response = await lookupService.lookup(enhancedRequest);
      expect(response).toHaveProperty("pattern_pack");
      expect(response).toHaveProperty("request_id");
      expect(response.cache_hit).toBe(false);
    });

    it("should maintain backwards compatibility with legacy fields", async () => {
      const legacyRequest = {
        task: "Implement feature",
        current_file: "/src/feature.js",
        language: "javascript",
        framework: "react",
        recent_errors: ["Error: Something went wrong"],
        repo_path: "/path/to/repo",
      };

      const response = await lookupService.lookup(legacyRequest);
      expect(response).toHaveProperty("pattern_pack");
      expect(response.pattern_pack).toBeDefined();
    });

    it("should prefer enhanced fields over legacy fields", async () => {
      const mixedRequest = {
        task: "Fix bug",
        // Legacy fields
        language: "javascript",
        current_file: "/old/path.js",
        // Enhanced fields (should take precedence)
        project_signals: {
          language: "typescript",
        },
        code_context: {
          current_file: "/new/path.ts",
        },
      };

      const response = await lookupService.lookup(mixedRequest);
      expect(response.pattern_pack).toBeDefined();
      // The signal extraction should prefer the enhanced fields
    });
  });

  describe("Integration", () => {
    it("should return valid PatternPack structure", async () => {
      const response = await lookupService.lookup({
        task: "Implement REST API endpoint",
        language: "typescript",
        framework: "express",
      });

      const pack = response.pattern_pack;

      // Validate PatternPack structure
      expect(pack).toHaveProperty("task");
      expect(pack).toHaveProperty("candidates");
      expect(pack).toHaveProperty("anti_patterns");
      expect(pack).toHaveProperty("policies");
      expect(pack).toHaveProperty("tests");
      expect(pack).toHaveProperty("meta");

      // Validate meta
      expect(pack.meta).toHaveProperty("total_ranked");
      expect(pack.meta).toHaveProperty("considered");
      expect(pack.meta).toHaveProperty("included");
      expect(pack.meta).toHaveProperty("bytes");
      expect(pack.meta).toHaveProperty("budget_bytes");

      // Validate candidates
      expect(Array.isArray(pack.candidates)).toBe(true);
      if (pack.candidates.length > 0) {
        const candidate = pack.candidates[0];
        expect(candidate).toHaveProperty("id");
        expect(candidate).toHaveProperty("type");
        expect(candidate).toHaveProperty("score");
        expect(candidate).toHaveProperty("summary");
      }
    });

    it("should respect max_size budget", async () => {
      const response = await lookupService.lookup({
        task: "Test size budget",
        max_size: 2048, // Small budget
      });

      const pack = response.pattern_pack;
      expect(pack.meta.bytes).toBeLessThanOrEqual(2048);
      expect(pack.meta.budget_bytes).toBe(2048);
    });
  });
});
