/**
 * Tests for the reflection MCP tool
 * [PAT:TEST:MCP_TOOLS] - Comprehensive test coverage for reflection tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ReflectionService } from "../../../src/mcp/tools/reflect.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { initTestDatabase } from "../../helpers/vitest-db.js";
import type Database from "better-sqlite3";

describe("Reflection MCP Tool", () => {
  let db: Database.Database;
  let cleanup: () => Promise<void>;
  let repository: PatternRepository;
  let reflectionService: ReflectionService;

  beforeEach(async () => {
    // Initialize test database with migrations
    const result = await initTestDatabase();
    db = result.db;
    cleanup = result.cleanup;

    // Create repository using the factory method with the db path
    repository = await PatternRepository.create({ dbPath: result.dbPath });

    // Get the database adapter from the repository
    const dbAdapter = repository.getDatabase();

    reflectionService = new ReflectionService(repository, dbAdapter, {
      gitRepoPath: process.cwd(),
      enableMining: false, // Disable mining for simpler tests
    });

    // Insert test patterns for reflection
    await insertTestPatterns(repository);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("Valid reflections", () => {
    it("should handle valid reflection with patterns_used and trust updates", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-1",
          title: "Implement authentication",
        },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "PAT:AUTH:JWT",
              evidence: [
                {
                  kind: "git_lines",
                  file: "src/auth.ts",
                  sha: "HEAD",
                  start: 10,
                  end: 20,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:AUTH:JWT",
              outcome: "worked-perfectly",
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.request_id).toBeDefined();
      expect(response.latency_ms).toBeGreaterThanOrEqual(0);
      expect(response.trust_updates_processed).toBeGreaterThan(0);
    });

    it("should handle preprocessing fixes for evidence kind", async () => {
      // Send "code_lines" which should be preprocessed to "git_lines"
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-2",
          title: "Fix bug",
        },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "PAT:API:ERROR_HANDLING",
              evidence: [
                {
                  kind: "code_lines", // This will be preprocessed to git_lines
                  file: "src/api.ts",
                  sha: "HEAD",
                  start: 5,
                  end: 15,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:API:ERROR_HANDLING",
              outcome: "worked-with-tweaks",
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.request_id).toBeDefined();
      expect(response.preprocessing_corrections).toBeGreaterThan(0);
    });

    it("should handle missing SHA by adding default HEAD", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-3",
          title: "Add feature",
        },
        outcome: "partial",
        claims: {
          patterns_used: [
            {
              pattern_id: "PAT:TEST:UNIT",
              evidence: [
                {
                  kind: "git_lines",
                  file: "tests/unit.test.ts",
                  // Missing sha - should be preprocessed to "HEAD"
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:TEST:UNIT",
              outcome: "partial-success",
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.request_id).toBeDefined();
    });

    it("should validate evidence with git_lines format", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-4",
          title: "Refactor code",
        },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "PAT:REFACTOR:EXTRACT",
              evidence: [
                {
                  kind: "git_lines",
                  file: "src/service.ts",
                  sha: "a".repeat(40), // Valid 40-char SHA
                  start: 10,
                  end: 50,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:REFACTOR:EXTRACT",
              delta: {
                alpha: 1,
                beta: 0,
              },
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.trust_updates_processed).toBeGreaterThan(0);
    });

    it("should handle batch patterns format", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-5",
          title: "Multiple pattern fixes",
        },
        outcome: "success",
        batch_patterns: [
          {
            pattern: "PAT:AUTH:JWT",
            outcome: "worked-perfectly",
            notes: "JWT auth worked great",
          },
          {
            pattern: "PAT:API:ERROR_HANDLING",
            outcome: "worked-with-tweaks",
            notes: "Needed minor adjustments",
          },
        ],
      });

      expect(response).toBeDefined();
      expect(response.request_id).toBeDefined();
    });

    it("should handle learnings and new patterns", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-6",
          title: "Discover new pattern",
        },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [],
          learnings: [
            {
              assertion: "Always validate input before database queries",
              evidence: [
                {
                  kind: "git_lines",
                  file: "src/validation.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 20,
                },
              ],
            },
          ],
          new_patterns: [
            {
              title: "Input Validation Pattern",
              summary: "Validate all inputs before database operations",
              snippets: [
                {
                  snippet_id: "snippet-1",
                  language: "typescript",
                  source_ref: {
                    kind: "git_lines",
                    file: "src/validation.ts",
                    sha: "HEAD",
                    start: 1,
                    end: 10,
                  },
                },
              ],
              evidence: [
                {
                  kind: "git_lines",
                  file: "src/validation.ts",
                  sha: "HEAD",
                  start: 1,
                  end: 20,
                },
              ],
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.request_id).toBeDefined();
    });

    it("should handle different trust update outcomes", async () => {
      const outcomes = [
        "worked-perfectly",
        "worked-with-tweaks",
        "partial-success",
        "failed-minor-issues",
        "failed-completely",
      ] as const;

      for (const outcome of outcomes) {
        const response = await reflectionService.reflect({
          task: {
            id: `test-task-outcome-${outcome}`,
            title: `Test ${outcome}`,
          },
          outcome: "success",
          claims: {
            patterns_used: [
              {
                pattern_id: "PAT:TEST:PATTERN",
                evidence: [
                  {
                    kind: "git_lines",
                    file: "test.ts",
                    sha: "HEAD",
                    start: 1,
                    end: 5,
                  },
                ],
              },
            ],
            trust_updates: [
              {
                pattern_id: "PAT:TEST:PATTERN",
                outcome: outcome,
              },
            ],
          },
        });

        expect(response).toBeDefined();
        expect(response.trust_updates_processed).toBeGreaterThan(0);
      }
    });

    it("should handle commit and PR evidence types", async () => {
      const response = await reflectionService.reflect({
        task: {
          id: "test-task-7",
          title: "Test different evidence types",
        },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "PAT:GIT:WORKFLOW",
              evidence: [
                {
                  kind: "commit",
                  sha: "a".repeat(40),
                },
                {
                  kind: "pr",
                  number: 123,
                  repo: "https://github.com/user/repo",
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:GIT:WORKFLOW",
              outcome: "worked-perfectly",
            },
          ],
        },
      });

      expect(response).toBeDefined();
      expect(response.trust_updates_processed).toBeGreaterThan(0);
    });
  });

  describe("Invalid reflections", () => {
    it("should throw error for missing required fields", async () => {
      await expect(reflectionService.reflect({})).rejects.toThrow();
    });

    it("should throw error for invalid task structure", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            // Missing required 'title' field
            id: "test-1",
          },
          outcome: "success",
        }),
      ).rejects.toThrow();
    });

    it("should throw error for invalid outcome", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            id: "test-1",
            title: "Test",
          },
          outcome: "invalid-outcome" as any,
        }),
      ).rejects.toThrow();
    });

    it("should throw error for invalid evidence kind", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            id: "test-1",
            title: "Test",
          },
          outcome: "success",
          claims: {
            patterns_used: [
              {
                pattern_id: "PAT:TEST",
                evidence: [
                  {
                    kind: "invalid_kind" as any,
                    file: "test.ts",
                  },
                ],
              },
            ],
            trust_updates: [],
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw error for invalid SHA format", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            id: "test-1",
            title: "Test",
          },
          outcome: "success",
          claims: {
            patterns_used: [
              {
                pattern_id: "PAT:TEST",
                evidence: [
                  {
                    kind: "git_lines",
                    file: "test.ts",
                    sha: "invalid-sha-format", // Invalid SHA
                    start: 1,
                    end: 10,
                  },
                ],
              },
            ],
            trust_updates: [],
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw error for missing evidence in trust update", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            id: "test-1",
            title: "Test",
          },
          outcome: "success",
          claims: {
            patterns_used: [
              {
                pattern_id: "PAT:TEST",
                evidence: [], // Empty evidence array
              },
            ],
            trust_updates: [
              {
                pattern_id: "PAT:TEST",
                outcome: "worked-perfectly",
              },
            ],
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw error for trust update without delta or outcome", async () => {
      await expect(
        reflectionService.reflect({
          task: {
            id: "test-1",
            title: "Test",
          },
          outcome: "success",
          claims: {
            patterns_used: [
              {
                pattern_id: "PAT:TEST",
                evidence: [
                  {
                    kind: "git_lines",
                    file: "test.ts",
                    sha: "HEAD",
                    start: 1,
                    end: 5,
                  },
                ],
              },
            ],
            trust_updates: [
              {
                pattern_id: "PAT:TEST",
                // Missing both delta and outcome
              },
            ],
          },
        }),
      ).rejects.toThrow();
    });
  });
});

/**
 * Helper to insert test patterns into the repository
 */
async function insertTestPatterns(repository: PatternRepository): Promise<void> {
  const now = new Date().toISOString();
  const testPatterns = [
    {
      id: "PAT:AUTH:JWT",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "JWT Authentication",
      summary: "JWT-based authentication pattern",
      trust_score: 0.8,
      usage_count: 5,
      success_count: 4,
      created_at: now,
      updated_at: now,
      tags: ["auth", "jwt"],
      pattern_digest: "test-digest-jwt",
      json_canonical: JSON.stringify({ title: "JWT Auth" }),
    },
    {
      id: "PAT:API:ERROR_HANDLING",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "API Error Handling",
      summary: "Structured error handling for APIs",
      trust_score: 0.85,
      usage_count: 10,
      success_count: 9,
      created_at: now,
      updated_at: now,
      tags: ["api", "error"],
      pattern_digest: "test-digest-error",
      json_canonical: JSON.stringify({ title: "Error Handling" }),
    },
    {
      id: "PAT:TEST:UNIT",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "TEST" as const,
      title: "Unit Testing Pattern",
      summary: "Unit testing best practices",
      trust_score: 0.9,
      usage_count: 20,
      success_count: 19,
      created_at: now,
      updated_at: now,
      tags: ["test", "unit"],
      pattern_digest: "test-digest-unit",
      json_canonical: JSON.stringify({ title: "Unit Testing" }),
    },
    {
      id: "PAT:REFACTOR:EXTRACT",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "Extract Method Refactoring",
      summary: "Extract method refactoring pattern",
      trust_score: 0.75,
      usage_count: 8,
      success_count: 6,
      created_at: now,
      updated_at: now,
      tags: ["refactor"],
      pattern_digest: "test-digest-refactor",
      json_canonical: JSON.stringify({ title: "Extract Method" }),
    },
    {
      id: "PAT:TEST:PATTERN",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "TEST" as const,
      title: "Test Pattern",
      summary: "Generic test pattern for testing",
      trust_score: 0.5,
      usage_count: 2,
      success_count: 1,
      created_at: now,
      updated_at: now,
      tags: ["test"],
      pattern_digest: "test-digest-pattern",
      json_canonical: JSON.stringify({ title: "Test Pattern" }),
    },
    {
      id: "PAT:GIT:WORKFLOW",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "Git Workflow Pattern",
      summary: "Git workflow best practices",
      trust_score: 0.95,
      usage_count: 25,
      success_count: 24,
      created_at: now,
      updated_at: now,
      tags: ["git", "workflow"],
      pattern_digest: "test-digest-git",
      json_canonical: JSON.stringify({ title: "Git Workflow" }),
    },
  ];

  for (const pattern of testPatterns) {
    await repository.create(pattern);
  }
}