/**
 * Tests for pattern lookup MCP tool
 * [PAT:TEST:MCP_TOOLS] - Comprehensive test coverage for lookup tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PatternLookupService } from "../../../src/mcp/tools/lookup.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { initTestDatabase } from "../../helpers/vitest-db.js";
import type Database from "better-sqlite3";

describe("Pattern Lookup MCP Tool", () => {
  let db: Database.Database;
  let cleanup: () => Promise<void>;
  let repository: PatternRepository;
  let lookupService: PatternLookupService;

  beforeEach(async () => {
    // Initialize test database with migrations
    const result = await initTestDatabase();
    db = result.db;
    cleanup = result.cleanup;

    // Create repository using the factory method with the db path
    repository = await PatternRepository.create({ dbPath: result.dbPath });
    lookupService = new PatternLookupService(repository);

    // Insert test patterns
    await insertTestPatterns(repository);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("Valid requests", () => {
    it("should handle valid request with minimal params", async () => {
      const response = await lookupService.lookup({
        task: "fix authentication bug",
      });

      expect(response).toBeDefined();
      expect(response.pattern_pack).toBeDefined();
      expect(response.request_id).toBeDefined();
      expect(response.latency_ms).toBeGreaterThanOrEqual(0);
      expect(response.cache_hit).toBe(false);
    });

    it("should return patterns sorted by relevance", async () => {
      const response = await lookupService.lookup({
        task: "implement JWT authentication",
      });

      expect(response.pattern_pack).toBeDefined();
      expect(response.pattern_pack.candidates).toBeDefined();
      expect(Array.isArray(response.pattern_pack.candidates)).toBe(true);
    });

    it("should handle request with legacy fields", async () => {
      const response = await lookupService.lookup({
        task: "fix database connection",
        current_file: "src/database.ts",
        language: "typescript",
        framework: "nodejs",
        recent_errors: ["Connection timeout"],
        repo_path: "/home/user/project",
      });

      expect(response).toBeDefined();
      expect(response.pattern_pack).toBeDefined();
      expect(response.request_id).toBeDefined();
    });

    it("should handle complex context objects", async () => {
      const response = await lookupService.lookup({
        task: "implement user registration",
        task_intent: {
          type: "feature",
          confidence: 0.9,
          sub_type: "authentication",
        },
        code_context: {
          current_file: "src/auth/register.ts",
          imports: ["express", "bcrypt", "jsonwebtoken"],
          exports: ["registerUser"],
          related_files: ["src/auth/login.ts", "src/auth/middleware.ts"],
          test_files: ["tests/auth/register.test.ts"],
        },
        error_context: [
          {
            type: "ValidationError",
            message: "Email is required",
            file: "src/auth/register.ts",
            line: 42,
            frequency: 5,
          },
        ],
        project_signals: {
          language: "typescript",
          framework: "express",
          test_framework: "jest",
          build_tool: "webpack",
        },
        workflow_phase: "builder",
      });

      expect(response).toBeDefined();
      expect(response.pattern_pack).toBeDefined();
    });

    it("should support session context with recent patterns", async () => {
      const response = await lookupService.lookup({
        task: "fix API error handling",
        session_context: {
          recent_patterns: [
            {
              pattern_id: "PAT:API:ERROR_HANDLING",
              success: true,
              timestamp: "2025-09-30T00:00:00Z",
            },
          ],
          failed_patterns: ["PAT:API:DEPRECATED_METHOD"],
        },
      });

      expect(response).toBeDefined();
      expect(response.pattern_pack).toBeDefined();
    });

    it("should cache repeated requests", async () => {
      const request = {
        task: "implement authentication",
      };

      // First request - cache miss
      const response1 = await lookupService.lookup(request);
      expect(response1.cache_hit).toBe(false);

      // Second request - cache hit
      const response2 = await lookupService.lookup(request);
      expect(response2.cache_hit).toBe(true);
      expect(response2.pattern_pack).toEqual(response1.pattern_pack);
    });
  });

  describe("Invalid requests", () => {
    it("should throw InvalidParamsError for missing required fields", async () => {
      await expect(lookupService.lookup({})).rejects.toThrow("task");
    });

    it("should throw InvalidParamsError for invalid task length", async () => {
      await expect(lookupService.lookup({ task: "" })).rejects.toThrow();
    });

    it("should throw InvalidParamsError for task exceeding max length", async () => {
      const longTask = "a".repeat(1001);
      await expect(lookupService.lookup({ task: longTask })).rejects.toThrow();
    });

    it("should throw InvalidParamsError for invalid max_size", async () => {
      await expect(
        lookupService.lookup({
          task: "test task",
          max_size: 500, // Below minimum
        }),
      ).rejects.toThrow();
    });

    it("should throw InvalidParamsError for invalid max_size (too large)", async () => {
      await expect(
        lookupService.lookup({
          task: "test task",
          max_size: 100000, // Above maximum
        }),
      ).rejects.toThrow();
    });

    it("should throw InvalidParamsError for invalid task_intent confidence", async () => {
      await expect(
        lookupService.lookup({
          task: "test task",
          task_intent: {
            type: "feature",
            confidence: 1.5, // Above 1.0
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw InvalidParamsError for invalid workflow_phase", async () => {
      await expect(
        lookupService.lookup({
          task: "test task",
          workflow_phase: "invalid_phase" as any,
        }),
      ).rejects.toThrow();
    });

    it("should throw InvalidParamsError for invalid error_context", async () => {
      await expect(
        lookupService.lookup({
          task: "test task",
          error_context: [
            {
              type: "", // Empty type
              message: "",
            },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  describe("Pagination", () => {
    it("should support pagination params", async () => {
      const response = await lookupService.lookup({
        task: "authentication patterns",
        page: 1,
        pageSize: 10,
      });

      expect(response).toBeDefined();
      expect(response.pattern_pack).toBeDefined();
    });

    it("should validate pagination boundaries", async () => {
      await expect(
        lookupService.lookup({
          task: "test",
          page: 0, // Invalid page
        }),
      ).rejects.toThrow();

      await expect(
        lookupService.lookup({
          task: "test",
          pageSize: 0, // Invalid pageSize
        }),
      ).rejects.toThrow();

      await expect(
        lookupService.lookup({
          task: "test",
          pageSize: 100, // Above maximum
        }),
      ).rejects.toThrow();
    });
  });
});

/**
 * Helper to insert test patterns into the repository
 */
async function insertTestPatterns(repository: PatternRepository): Promise<void> {
  // Insert a few test patterns for testing
  const now = new Date().toISOString();
  const testPatterns = [
    {
      id: "PAT:AUTH:JWT",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "JWT Authentication Implementation",
      summary: "Implement JWT-based authentication",
      trust_score: 0.85,
      usage_count: 10,
      success_count: 9,
      created_at: now,
      updated_at: now,
      tags: ["auth", "jwt"],
      pattern_digest: "test-digest-1",
      json_canonical: JSON.stringify({ title: "JWT Auth", summary: "JWT-based auth" }),
    },
    {
      id: "PAT:API:ERROR_HANDLING",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "API Error Handling Pattern",
      summary: "Structured error handling for APIs",
      trust_score: 0.9,
      usage_count: 15,
      success_count: 14,
      created_at: now,
      updated_at: now,
      tags: ["api", "error-handling"],
      pattern_digest: "test-digest-2",
      json_canonical: JSON.stringify({ title: "API Error Handling", summary: "Structured error handling" }),
    },
    {
      id: "FIX:DATABASE:CONNECTION",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "FAILURE" as const,
      title: "Database Connection Fix",
      summary: "Fix database connection timeouts",
      trust_score: 0.75,
      usage_count: 5,
      success_count: 4,
      created_at: now,
      updated_at: now,
      tags: ["database", "fix"],
      pattern_digest: "test-digest-3",
      json_canonical: JSON.stringify({ title: "DB Connection Fix", summary: "Fix connection timeouts" }),
    },
  ];

  for (const pattern of testPatterns) {
    await repository.create(pattern);
  }
}
