/**
 * Tests for evidence validator
 * [PAT:TEST:BEHAVIOR_OVER_INTERNALS] ★★★☆☆ (3 uses) - Test API behavior
 */

import { jest } from '@jest/globals';
import { EvidenceValidator } from '../../src/reflection/validator.js';
import { PatternRepository } from '../../src/storage/repository.js';
import { ReflectRequest, ValidationErrorCode } from '../../src/reflection/types.js';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

describe('EvidenceValidator', () => {
  let validator: EvidenceValidator;
  let mockRepository: PatternRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      get: jest.fn().mockResolvedValue({ id: 'TEST:PATTERN', trust_score: 0.8 }),
    } as any;

    validator = new EvidenceValidator(mockRepository, {
      allowedRepoUrls: ['https://github.com/test-org/'],
      gitRepoPath: '/test/repo',
      cacheEnabled: false, // Disable cache for tests
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateRequest', () => {
    it('should validate a valid request', async () => {
      // Mock git command for commit validation
      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockGit as any);

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

      const result = await validator.validateRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing patterns', async () => {
      (mockRepository.get as jest.Mock).mockResolvedValueOnce(null);

      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [{
            pattern_id: 'MISSING:PATTERN',
            evidence: [],
          }],
          trust_updates: [],
        },
        options: {},
      };

      const result = await validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.PATTERN_NOT_FOUND);
    });

    it('should detect duplicate trust updates', async () => {
      const request: ReflectRequest = {
        task: { id: 'TASK-123', title: 'Test task' },
        outcome: 'success',
        claims: {
          patterns_used: [],
          trust_updates: [
            { pattern_id: 'TEST:PATTERN', delta: { alpha: 1, beta: 0 } },
            { pattern_id: 'TEST:PATTERN', delta: { alpha: 1, beta: 0 } },
          ],
        },
        options: {},
      };

      const result = await validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.DUPLICATE_TRUST_UPDATE);
    });
  });

  describe('validateEvidence', () => {
    it('should validate commit evidence', async () => {
      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockGit as any);

      const result = await validator.validateEvidence({
        kind: 'commit',
        sha: 'a'.repeat(40),
      });

      expect(result.valid).toBe(true);
      expect((child_process.spawn as jest.Mock)).toHaveBeenCalledWith(
        'git',
        ['cat-file', '-e', 'a'.repeat(40)],
        expect.any(Object)
      );
    });

    it('should reject invalid SHA format', async () => {
      const result = await validator.validateEvidence({
        kind: 'commit',
        sha: 'invalid-sha',
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.MALFORMED_EVIDENCE);
    });

    it('should validate PR evidence', async () => {
      const result = await validator.validateEvidence({
        kind: 'pr',
        number: 123,
        repo: 'https://github.com/test-org/test-repo',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject PR from disallowed repo', async () => {
      const result = await validator.validateEvidence({
        kind: 'pr',
        number: 123,
        repo: 'https://github.com/other-org/repo',
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.PR_NOT_FOUND);
    });

    it('should validate git_lines evidence', async () => {
      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock)
        .mockReturnValueOnce(mockGit as any) // cat-file check
        .mockReturnValueOnce(createMockGitProcess('line1\nline2\nline3\n') as any); // show file

      const result = await validator.validateEvidence({
        kind: 'git_lines',
        file: 'test.ts',
        sha: 'a'.repeat(40),
        start: 1,
        end: 3,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject git_lines with invalid line range', async () => {
      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock)
        .mockReturnValueOnce(mockGit as any) // cat-file check
        .mockReturnValueOnce(createMockGitProcess('line1\nline2\n') as any); // show file

      const result = await validator.validateEvidence({
        kind: 'git_lines',
        file: 'test.ts',
        sha: 'a'.repeat(40),
        start: 1,
        end: 5, // Beyond file length
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.LINE_RANGE_NOT_FOUND);
    });
  });

  describe('caching', () => {
    it('should cache successful validations', async () => {
      const validatorWithCache = new EvidenceValidator(mockRepository, {
        cacheEnabled: true,
        cacheTTL: 1000,
      });

      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockGit as any);

      const evidence = {
        kind: 'commit' as const,
        sha: 'a'.repeat(40),
      };

      // First call
      await validatorWithCache.validateEvidence(evidence);
      expect((child_process.spawn as jest.Mock)).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await validatorWithCache.validateEvidence(evidence);
      expect((child_process.spawn as jest.Mock)).toHaveBeenCalledTimes(1);
    });

    it('should clear cache on demand', async () => {
      const validatorWithCache = new EvidenceValidator(mockRepository, {
        cacheEnabled: true,
      });

      const mockGit = createMockGitProcess();
      (child_process.spawn as jest.Mock).mockReturnValue(mockGit as any);

      const evidence = {
        kind: 'commit' as const,
        sha: 'a'.repeat(40),
      };

      await validatorWithCache.validateEvidence(evidence);
      validatorWithCache.clearCache();
      await validatorWithCache.validateEvidence(evidence);

      expect((child_process.spawn as jest.Mock)).toHaveBeenCalledTimes(2);
    });
  });
});

// Helper to create mock git process
function createMockGitProcess(stdout = '', exitCode = 0): EventEmitter {
  const proc = new EventEmitter();
  (proc as any).stdout = new EventEmitter();
  (proc as any).stderr = new EventEmitter();

  process.nextTick(() => {
    if (stdout) {
      (proc as any).stdout.emit('data', stdout);
    }
    proc.emit('close', exitCode);
  });

  return proc;
}