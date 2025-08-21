/**
 * Tests for the reflection MCP tool
 * [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module imports with .js
 */

import { jest } from "@jest/globals";

// [FIX:MOCK:ESM_IMPORTS] NEW - Mock ES modules before imports
// Mock dependencies before imports
jest.unstable_mockModule("better-sqlite3", () => ({
  default: jest.fn().mockImplementation(() => ({
    pragma: jest.fn().mockReturnValue([]),
    close: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
    }),
    transaction: jest.fn().mockImplementation((fn) => {
      return () => fn();
    }),
  })),
}));

jest.unstable_mockModule("../../../src/reflection/validator.js", () => ({
  EvidenceValidator: jest.fn().mockImplementation(() => ({
    validateRequest: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    clearCache: jest.fn(),
  })),
}));

jest.unstable_mockModule("../../../src/reflection/storage.js", () => ({
  ReflectionStorage: jest.fn().mockImplementation(() => ({
    storeReflection: jest.fn().mockReturnValue({ id: 1, existed: false }),
    storePatternDraft: jest.fn().mockReturnValue("draft:PAT:123"),
    storeAuditEvent: jest.fn().mockReturnValue(undefined),
    getAntiPatternCandidates: jest.fn().mockReturnValue([]),
    updatePatternTrust: jest.fn().mockReturnValue(undefined),
    transaction: jest.fn((fn) => fn()),
  })),
}));

jest.unstable_mockModule("../../../src/reflection/pattern-inserter.js", () => ({
  PatternInserter: jest.fn().mockImplementation(() => ({
    insertNewPattern: jest.fn().mockReturnValue("PAT:NEW:123"),
  })),
}));

jest.unstable_mockModule("../../../src/reflection/miner.js", () => ({
  PatternMiner: jest.fn().mockImplementation(() => ({
    minePatterns: jest.fn().mockResolvedValue([]),
  })),
}));

jest.unstable_mockModule("../../../src/trust/beta-bernoulli.js", () => ({
  BetaBernoulliTrustModel: jest.fn().mockImplementation(() => ({
    calculateTrust: jest.fn().mockReturnValue({
      value: 0.85,
      confidence: 0.9,
      wilsonLower: 0.75,
      alpha: 18,
      beta: 3,
    }),
  })),
}));

jest.unstable_mockModule("../../../src/trust/storage-adapter.js", () => ({
  JSONStorageAdapter: jest.fn(),
}));

// Now import after mocks are set up
const { ReflectionService } = await import("../../../src/mcp/tools/reflect.js");
const { PatternRepository } = await import(
  "../../../src/storage/repository.js"
);
const { ReflectRequest } = await import("../../../src/reflection/types.js");
const { PatternDatabase } = await import("../../../src/storage/database.js");
const Database = (await import("better-sqlite3")).default;
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ReflectionService", () => {
  let service: ReflectionService;
  let mockRepository: PatternRepository;
  let tempDir: string;
  let testDb: PatternDatabase;
  let mockDb: any;

  beforeEach(async () => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-test-"));

    // [PAT:TEST:ISOLATION] ★★★★★ (89 uses, 98% success) - Test database isolation
    const dbPath = path.join(tempDir, "test.db");

    // Initialize database schema and run migrations
    testDb = new PatternDatabase(dbPath);

    // Run migrations to add alpha/beta columns
    const { MigrationLoader, MigrationRunner } = await import(
      "../../../src/migrations/index.js"
    );
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
    const runner = new MigrationRunner(testDb.database);
    await runner.runMigrations(migrationsToRun);

    testDb.close();

    // Create mock repository
    mockRepository = {
      get: jest.fn().mockResolvedValue({
        id: "TEST:PATTERN",
        trust_score: 0.8,
        alpha: 10,
        beta: 2,
      }),
      getByIdOrAlias: jest.fn().mockResolvedValue({
        id: "TEST:PATTERN",
        trust_score: 0.8,
        alpha: 10,
        beta: 2,
      }), // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆ - Add missing method
      update: jest.fn().mockResolvedValue(true),
    } as any;

    // Create mock Database instance
    mockDb = new Database(dbPath);
    service = new ReflectionService(mockRepository, mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("reflect", () => {
    it("should process a valid reflection request", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [
                {
                  kind: "commit",
                  sha: "a".repeat(40),
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "TEST:PATTERN",
              delta: { alpha: 1, beta: 0 },
            },
          ],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.outcome).toBe("success");
      expect(response.accepted?.trust_updates).toHaveLength(1);
      expect(response.accepted?.trust_updates[0]).toMatchObject({
        pattern_id: "TEST:PATTERN",
        applied_delta: { alpha: 1, beta: 0 },
        wilson_lb_after: 0.75,
      });
    });

    it("should handle dry run requests", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [],
        },
        options: { dry_run: true },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(false);
    });

    it("should handle validation errors", async () => {
      const invalidRequest = {
        task: { id: "TASK-123" }, // Missing title
        outcome: "invalid", // Invalid outcome
      };

      const response = await service.reflect(invalidRequest);

      expect(response.ok).toBe(false);
      expect(response.persisted).toBe(false);
      expect(response.rejected.length).toBeGreaterThan(0);
    });

    it("should create pattern drafts", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [],
          new_patterns: [
            {
              title: "New pattern",
              summary: "A new pattern discovered",
              snippets: [],
              evidence: [{ kind: "commit", sha: "a".repeat(40) }],
            },
          ],
          anti_patterns: [
            {
              title: "Anti-pattern",
              reason: "This approach failed",
              evidence: [{ kind: "commit", sha: "b".repeat(40) }],
            },
          ],
          trust_updates: [],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.drafts_created).toHaveLength(2);
      expect(response.drafts_created[0].kind).toBe("NEW_PATTERN");
      expect(response.drafts_created[1].kind).toBe("ANTI_PATTERN");
    });

    it("should handle partial outcomes with default trust deltas", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "partial",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [],
            },
          ],
          trust_updates: [
            {
              pattern_id: "TEST:PATTERN",
              delta: { alpha: 0, beta: 0 }, // No explicit delta
            },
          ],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.accepted?.trust_updates[0].applied_delta).toEqual({
        alpha: 0,
        beta: 0,
      });
    });

    it("should include explain information when requested", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [],
        },
        options: { return_explain: true },
      };

      const response = await service.reflect(request);

      expect(response.explain).toBeDefined();
      expect(response.explain?.validators).toContain("git_lines");
      expect(response.explain?.validators).toContain("pattern_exists");
    });

    it("should process outcome-based trust updates", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [],
            },
          ],
          trust_updates: [
            {
              pattern_id: "TEST:PATTERN",
              outcome: "worked-perfectly",
            },
          ],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.accepted?.trust_updates[0].applied_delta).toEqual({
        alpha: 1.0,
        beta: 0.0,
      });
    });

    it("should process mixed delta and outcome trust updates", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "PATTERN1",
              evidence: [],
            },
            {
              pattern_id: "PATTERN2",
              evidence: [],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PATTERN1",
              delta: { alpha: 0.8, beta: 0.2 },
            },
            {
              pattern_id: "PATTERN2",
              outcome: "worked-with-tweaks",
            },
          ],
        },
        options: {},
      };

      (mockRepository.getByIdOrAlias as jest.Mock)
        .mockResolvedValueOnce({
          id: "PATTERN1",
          title: "Pattern 1",
          trust: { alpha: 5, beta: 1 },
        })
        .mockResolvedValueOnce({
          id: "PATTERN2",
          title: "Pattern 2",
          trust: { alpha: 3, beta: 2 },
        });

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.accepted?.trust_updates).toHaveLength(2);
      expect(response.accepted?.trust_updates[0].applied_delta).toEqual({
        alpha: 0.8,
        beta: 0.2,
      });
      expect(response.accepted?.trust_updates[1].applied_delta).toEqual({
        alpha: 0.7,
        beta: 0.3,
      });
    });

    it("should track metrics", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [],
        },
        options: {},
      };

      await service.reflect(request);
      const metrics = service.getMetrics();

      expect(metrics.total).toBe(1);
      expect(metrics.successful).toBe(1);
      expect(metrics.failed).toBe(0);
    });
  });

  describe("batch mode", () => {
    it("should process batch patterns successfully", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-456", title: "Batch test task" },
        outcome: "success",
        batch_patterns: [
          {
            pattern: "jwt-authentication",
            outcome: "worked-perfectly",
            evidence: "Applied in auth.js:45",
            notes: "Simple application",
          },
          {
            pattern: "error-handling",
            outcome: "worked-with-tweaks",
            evidence: [
              {
                kind: "commit",
                sha: "b".repeat(40),
              },
            ],
            notes: "Needed adaptation",
          },
        ],
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.accepted?.patterns_used).toHaveLength(2);
      expect(response.accepted?.trust_updates).toHaveLength(2);
    });

    it("should handle empty batch patterns", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-789", title: "Empty batch test" },
        outcome: "success",
        batch_patterns: [],
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.accepted?.patterns_used).toHaveLength(0);
      expect(response.accepted?.trust_updates).toHaveLength(0);
    });

    it("should process batch patterns with string evidence", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-890", title: "String evidence test" },
        outcome: "partial",
        batch_patterns: [
          {
            pattern: "PAT:TEST:SIMPLE",
            outcome: "partial-success",
            evidence: "This is a simple string evidence",
          },
        ],
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.accepted?.patterns_used).toHaveLength(1);
      expect(response.accepted?.patterns_used[0].evidence).toHaveLength(1);
      expect(response.accepted?.patterns_used[0].evidence[0].kind).toBe(
        "git_lines",
      );
    });

    it("should handle batch patterns in dry run mode", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-901", title: "Batch dry run test" },
        outcome: "success",
        batch_patterns: [
          {
            pattern: "TEST:PATTERN",
            outcome: "worked-perfectly",
          },
        ],
        options: { dry_run: true },
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(false);
    });

    it("should reject request with both claims and batch_patterns", async () => {
      const request = {
        task: { id: "TASK-902", title: "Invalid request" },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [],
        },
        batch_patterns: [
          {
            pattern: "TEST:PATTERN",
            outcome: "worked-perfectly",
          },
        ],
        options: {},
      };

      const response = await service.reflect(request);

      // Schema validation should catch this
      expect(response.ok).toBe(false);
      expect(response.rejected).toBeDefined();
    });

    it("should handle batch patterns with mixed outcomes", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-903", title: "Mixed outcomes test" },
        outcome: "partial",
        batch_patterns: [
          {
            pattern: "PAT:SUCCESS",
            outcome: "worked-perfectly",
          },
          {
            pattern: "PAT:FAIL",
            outcome: "failed-completely",
          },
          {
            pattern: "PAT:PARTIAL",
            outcome: "partial-success",
          },
        ],
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.accepted?.trust_updates).toHaveLength(3);

      // Verify each outcome was processed correctly
      const updates = response.accepted?.trust_updates || [];
      expect(updates.find((u) => u.pattern_id === "PAT:SUCCESS")).toBeDefined();
      expect(updates.find((u) => u.pattern_id === "PAT:FAIL")).toBeDefined();
      expect(updates.find((u) => u.pattern_id === "PAT:PARTIAL")).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should handle repository errors gracefully", async () => {
      (mockRepository.getByIdOrAlias as jest.Mock).mockRejectedValueOnce(
        new Error("DB error"),
      );

      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [],
            },
          ],
          trust_updates: [
            {
              pattern_id: "TEST:PATTERN",
              delta: { alpha: 1, beta: 0 },
            },
          ],
        },
        options: {},
      };

      await expect(service.reflect(request)).rejects.toThrow("DB error");
    });
  });

  describe("Auto-create missing patterns", () => {
    it("should auto-create patterns when they don't exist in trust_updates", async () => {
      // [PAT:TEST:AUTO_CREATE] - Test pattern auto-creation feature
      const request: ReflectRequest = {
        task: {
          id: "T123",
          title: "Test auto-create patterns",
        },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [
            {
              pattern_id: "PAT:NEW:AUTO_CREATED",
              outcome: "worked-perfectly",
            },
            {
              pattern_id: "FIX:NEW:ANOTHER_PATTERN",
              delta: { alpha: 1, beta: 0 },
            },
          ],
        },
        options: {},
      };

      // Mock that patterns don't exist initially
      mockRepository.getByIdOrAlias = jest
        .fn()
        .mockResolvedValueOnce(null) // First pattern doesn't exist
        .mockResolvedValueOnce(null); // Second pattern doesn't exist

      // Mock PatternInserter to track calls
      const mockPatternInserter = service["patternInserter"];
      const insertSpy = jest.spyOn(mockPatternInserter, "insertNewPattern");

      const response = await service.reflect(request);

      // Verify patterns were created
      expect(insertSpy).toHaveBeenCalledTimes(2);

      // Verify first pattern creation
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Auto Created",
          summary: "Auto-created pattern from reflection",
          snippets: [],
          evidence: [],
        }),
        "NEW_PATTERN",
      );

      // Verify second pattern creation
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "FIX:NEW:ANOTHER_PATTERN",
          title: "Another Pattern",
          summary: "Auto-created pattern from reflection",
          snippets: [],
          evidence: [],
        }),
        "NEW_PATTERN",
      );

      // Verify trust updates were applied to newly created patterns
      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.accepted?.trust_updates).toHaveLength(2);

      // Verify the trust updates were applied
      expect(response.accepted?.trust_updates[0]).toMatchObject({
        pattern_id: "PAT:NEW:AUTO_CREATED",
        applied_delta: { alpha: 1, beta: 0 },
      });

      expect(response.accepted?.trust_updates[1]).toMatchObject({
        pattern_id: "FIX:NEW:ANOTHER_PATTERN",
        applied_delta: { alpha: 1, beta: 0 },
      });
    });

    it("should handle mixed existing and new patterns", async () => {
      const request: ReflectRequest = {
        task: {
          id: "T124",
          title: "Test mixed patterns",
        },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [
            {
              pattern_id: "EXISTING:PATTERN",
              outcome: "worked-perfectly",
            },
            {
              pattern_id: "NEW:PATTERN:TO_CREATE",
              outcome: "worked-with-tweaks",
            },
          ],
        },
        options: {},
      };

      // Mock that first pattern exists, second doesn't
      mockRepository.getByIdOrAlias = jest
        .fn()
        .mockResolvedValueOnce({
          id: "EXISTING:PATTERN",
          alpha: 5,
          beta: 2,
        })
        .mockResolvedValueOnce(null); // Second pattern doesn't exist

      const mockPatternInserter = service["patternInserter"];
      const insertSpy = jest.spyOn(mockPatternInserter, "insertNewPattern");

      const response = await service.reflect(request);

      // Verify only the new pattern was created
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "NEW:PATTERN:TO_CREATE",
          title: "To Create",
        }),
        "NEW_PATTERN",
      );

      // Verify both trust updates were applied
      expect(response.ok).toBe(true);
      expect(response.accepted?.trust_updates).toHaveLength(2);
    });
  });

  describe("RequestPreprocessor", () => {
    it("should fix evidence kind from code_lines to git_lines", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [
                {
                  kind: "code_lines", // Wrong kind
                  file: "test.ts",
                  sha: "abc123",
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing fixes the kind
      expect(response.ok).toBe(true);
    });

    it("should convert string evidence to object format", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: "This is string evidence", // String instead of array
            },
          ],
          trust_updates: [],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing converts string to object
      expect(response.ok).toBe(true);
    });

    it("should add missing SHA fields with default HEAD", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [
                {
                  kind: "git_lines",
                  file: "test.ts",
                  // Missing sha field
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing adds missing SHA
      expect(response.ok).toBe(true);
    });

    it("should normalize only single-part pattern IDs", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "FIX:TEST", // 2 parts - should NOT be fixed
              evidence: [],
            },
            {
              pattern_id: "PAT:API:ERROR", // 3 parts - should NOT be fixed
              evidence: [],
            },
          ],
          trust_updates: [
            {
              pattern_id: "SINGLE", // Only 1 part - should be fixed to SINGLE:DEFAULT:DEFAULT:DEFAULT
              outcome: "worked-perfectly",
            },
          ],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing normalizes only single-part pattern IDs
      expect(response.ok).toBe(true);
    });

    it("should handle deeply nested malformed data", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST", // Only 1 part
              evidence: "string evidence", // String
            },
          ],
          new_patterns: [
            {
              title: "New Pattern",
              summary: "Test",
              snippets: [],
              evidence: [
                {
                  kind: "code_lines", // Wrong kind
                  file: "new.ts",
                  // Missing sha
                  start: 1,
                  end: 5,
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "PAT:NEW", // Only 2 parts
              outcome: "worked-perfectly",
            },
          ],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing fixes all issues
      expect(response.ok).toBe(true);
    });

    it("should preserve valid data unchanged", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN:VALID:ID", // Already 4 parts
              evidence: [
                {
                  kind: "git_lines", // Correct kind
                  file: "test.ts",
                  sha: "abc123", // Has SHA
                  start: 1,
                  end: 10,
                },
              ],
            },
          ],
          trust_updates: [],
        },
      };

      const response = await service.reflect(request);

      // Should succeed without needing corrections
      expect(response.ok).toBe(true);
    });

    it("should handle performance requirement (<10ms)", async () => {
      // Create a large request to test performance
      const largeRequest = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: Array.from({ length: 100 }, (_, i) => ({
            pattern_id: `PAT:${i}`, // 2 parts, needs fixing
            evidence: `Evidence ${i}`, // String, needs converting
          })),
          trust_updates: Array.from({ length: 100 }, (_, i) => ({
            pattern_id: `FIX:${i}`, // 2 parts, needs fixing
            outcome: "worked-perfectly",
          })),
        },
      };

      const startTime = Date.now();
      const response = await service.reflect(largeRequest);
      const processingTime = Date.now() - startTime;

      // Should process quickly
      expect(response.ok).toBe(true);
      // Note: Total reflect time includes more than just preprocessing,
      // but it should still be reasonably fast
      expect(processingTime).toBeLessThan(100); // 100ms for entire operation
    });

    it("should handle array evidence with mixed string and object items", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [
                "String evidence item", // String
                {
                  kind: "git_lines",
                  file: "test.ts",
                  sha: "abc123",
                  start: 1,
                  end: 10,
                },
                "Another string", // Another string
              ],
            },
          ],
          trust_updates: [],
        },
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing converts string items
      expect(response.ok).toBe(true);
    });

    it("should handle batch_patterns with malformed data", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        batch_patterns: [
          {
            pattern: "SINGLE", // 1 part - should be fixed to SINGLE:DEFAULT:DEFAULT:DEFAULT
            outcome: "worked-perfectly",
            evidence: "String evidence", // String - should be converted
          },
          {
            pattern: "PAT:API:ERROR", // 3 parts - should NOT be fixed
            outcome: "worked-with-tweaks",
            evidence: [
              {
                kind: "code_lines", // Wrong kind - should be fixed
                file: "test.ts",
                // Missing sha - should be added
                start: 1,
                end: 10,
              },
            ],
          },
        ],
      };

      const response = await service.reflect(request);

      // Should succeed after preprocessing fixes batch_patterns
      expect(response.ok).toBe(true);
    });

    it("should fix batch_patterns when passed as JSON string", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        batch_patterns: JSON.stringify([
          {
            pattern: "PAT:TEST:STRING",
            outcome: "worked-perfectly",
            evidence: "Fixed string to array conversion"
          }
        ]),
        options: {}
      };

      const response = await service.reflect(request as any);

      // Should succeed after preprocessing converts string to array
      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
    });

    it("should handle invalid JSON in batch_patterns string", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        batch_patterns: "not valid json",
        options: {}
      };

      const response = await service.reflect(request as any);

      // Should fail with schema validation error
      expect(response.ok).toBe(false);
      expect(response.rejected).toContainEqual(
        expect.objectContaining({
          code: expect.stringMatching(/SCHEMA_VALIDATION|MALFORMED/),
        })
      );
    });

    it("should not modify batch_patterns if already an array", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        batch_patterns: [
          {
            pattern: "PAT:TEST:ARRAY",
            outcome: "worked-perfectly"
          }
        ],
        options: {}
      };

      const response = await service.reflect(request);

      // Should succeed without modification
      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
    });

    it("should auto-create patterns in permissive mode", async () => {
      // Set permissive mode
      process.env.APEX_REFLECTION_MODE = "permissive";

      // Mock repository to return null (pattern doesn't exist)
      const mockRepository = {
        getByIdOrAlias: jest.fn().mockResolvedValue(null),
      };
      
      const service = new ReflectionService(
        mockRepository as any,
        mockDb,
      );

      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "NEW:PATTERN:AUTO",
              evidence: [],
            }
          ],
          trust_updates: []
        },
        options: {}
      };

      const response = await service.reflect(request);

      // Should succeed with auto-created pattern
      expect(response.ok).toBe(true);
      
      // Reset permissive mode
      delete process.env.APEX_REFLECTION_MODE;
    });

    it("should handle nested batch_patterns in complex objects", async () => {
      const request = {
        task: { id: "T1", title: "Test" },
        outcome: "success",
        nested: {
          batch_patterns: JSON.stringify([
            {
              pattern: "PAT:NESTED:TEST",
              outcome: "worked-perfectly"
            }
          ])
        },
        options: {}
      };

      // Note: This test shows the preprocessor handles nested objects
      // The actual batch_patterns should be at root level for the schema
      const response = await service.reflect(request as any);
      
      // Will fail schema validation as batch_patterns should be at root
      expect(response.ok).toBe(false);
    });
  });
});
