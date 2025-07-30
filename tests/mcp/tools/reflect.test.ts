/**
 * Tests for the reflection MCP tool
 * [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module imports with .js
 */

import { jest } from '@jest/globals';
import { ReflectionService } from '../../../src/mcp/tools/reflect.js';
import { PatternRepository } from '../../../src/storage/repository.js';
import { ReflectRequest } from '../../../src/reflection/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies
jest.mock('../../../src/reflection/validator.js', () => ({
  EvidenceValidator: jest.fn().mockImplementation(() => ({
    validateRequest: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    clearCache: jest.fn(),
  })),
}));

jest.mock('../../../src/reflection/storage.js', () => ({
  ReflectionStorage: jest.fn().mockImplementation(() => ({
    storeReflection: jest.fn().mockResolvedValue({ id: 1, existed: false }),
    storePatternDraft: jest.fn().mockResolvedValue('draft:PAT:123'),
    storeAuditEvent: jest.fn().mockResolvedValue(undefined),
    getAntiPatternCandidates: jest.fn().mockResolvedValue([]),
    transaction: jest.fn((fn) => fn()),
  })),
}));

jest.mock('../../../src/reflection/miner.js', () => ({
  PatternMiner: jest.fn().mockImplementation(() => ({
    minePatterns: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('../../../src/trust/beta-bernoulli.js', () => ({
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

jest.mock('../../../src/trust/storage-adapter.js', () => ({
  JSONStorageAdapter: jest.fn(),
}));

describe('ReflectionService', () => {
  let service: ReflectionService;
  let mockRepository: PatternRepository;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-test-'));

    // Create mock repository
    mockRepository = {
      get: jest.fn().mockResolvedValue({
        id: 'TEST:PATTERN',
        trust_score: 0.8,
      }),
      update: jest.fn().mockResolvedValue(true),
    } as any;

    service = new ReflectionService(mockRepository, path.join(tempDir, 'test.db'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('reflect', () => {
    it('should process a valid reflection request', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [{
            pattern_id: 'TEST:PATTERN',
            evidence: [{
              kind: 'commit',
              sha: 'a'.repeat(40),
            }],
          }],
          trust_updates: [{
            pattern_id: 'TEST:PATTERN',
            delta: { alpha: 1, beta: 0 },
          }],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.persisted).toBe(true);
      expect(response.outcome).toBe('success');
      expect(response.accepted?.trust_updates).toHaveLength(1);
      expect(response.accepted?.trust_updates[0]).toMatchObject({
        pattern_id: 'TEST:PATTERN',
        applied_delta: { alpha: 1, beta: 0 },
        wilson_lb_after: 0.75,
      });
    });

    it('should handle dry run requests', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
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

    it('should handle validation errors', async () => {
      const invalidRequest = {
        task: { id: 'TASK-123' }, // Missing title
        outcome: 'invalid', // Invalid outcome
      };

      const response = await service.reflect(invalidRequest);

      expect(response.ok).toBe(false);
      expect(response.persisted).toBe(false);
      expect(response.rejected.length).toBeGreaterThan(0);
    });

    it('should create pattern drafts', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [],
          new_patterns: [{
            title: 'New pattern',
            summary: 'A new pattern discovered',
            snippets: [],
            evidence: [{ kind: 'commit', sha: 'a'.repeat(40) }],
          }],
          anti_patterns: [{
            title: 'Anti-pattern',
            reason: 'This approach failed',
            evidence: [{ kind: 'commit', sha: 'b'.repeat(40) }],
          }],
          trust_updates: [],
        },
        options: {},
      };

      const response = await service.reflect(request);

      expect(response.ok).toBe(true);
      expect(response.drafts_created).toHaveLength(2);
      expect(response.drafts_created[0].kind).toBe('NEW_PATTERN');
      expect(response.drafts_created[1].kind).toBe('ANTI_PATTERN');
    });

    it('should handle partial outcomes with default trust deltas', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'partial',
        claims: {
          patterns_used: [{
            pattern_id: 'TEST:PATTERN',
            evidence: [],
          }],
          trust_updates: [{
            pattern_id: 'TEST:PATTERN',
            delta: { alpha: 0, beta: 0 }, // No explicit delta
          }],
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

    it('should include explain information when requested', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [],
          trust_updates: [],
        },
        options: { return_explain: true },
      };

      const response = await service.reflect(request);

      expect(response.explain).toBeDefined();
      expect(response.explain?.validators).toContain('git_lines');
      expect(response.explain?.validators).toContain('pattern_exists');
    });

    it('should track metrics', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
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

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      (mockRepository.get as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [{
            pattern_id: 'TEST:PATTERN',
            evidence: [],
          }],
          trust_updates: [],
        },
        options: {},
      };

      await expect(service.reflect(request)).rejects.toThrow('DB error');
    });
  });
});