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
const { PatternRepository } = await import("../../../src/storage/repository.js");
const { ReflectRequest } = await import("../../../src/reflection/types.js");
const { PatternDatabase } = await import("../../../src/storage/database.js");
import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ReflectionService", () => {
  let service: ReflectionService;
  let mockRepository: PatternRepository;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-test-"));

    // [PAT:TEST:ISOLATION] ★★★★★ (89 uses, 98% success) - Test database isolation
    const dbPath = path.join(tempDir, "test.db");

    // Initialize database schema and run migrations
    const db = new PatternDatabase(dbPath);
    
    // Run migrations to add alpha/beta columns
    const { MigrationLoader, MigrationRunner } = await import('../../../src/migrations/index.js');
    const migrationsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src/migrations');
    const loader = new MigrationLoader(migrationsPath);
    const migrations = await loader.loadMigrations();
    const runner = new MigrationRunner(db.database);
    await runner.runMigrations(migrations);
    
    db.close();

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

    service = new ReflectionService(mockRepository, dbPath);
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
});
