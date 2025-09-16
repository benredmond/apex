/**
 * Tests for batch pattern processor
 * [PAT:TEST:SCHEMA] ★★★★☆ (45 uses, 88% success) - From cache
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchProcessor } from '../../src/reflection/batch-processor.js';
import type { BatchPattern, EvidenceRef } from '../../src/reflection/types.js';

describe('BatchProcessor', () => {
  beforeEach(() => {
    // Clear console mocks
    vi.clearAllMocks();
  });

  describe('expandBatchPatterns', () => {
    it('should expand single batch pattern to claims', () => {
      const batch: BatchPattern[] = [{
        pattern: 'jwt-authentication',
        outcome: 'worked-perfectly',
        evidence: 'Applied in auth.js:45',
        notes: 'Straightforward application'
      }];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      expect(claims.patterns_used).toHaveLength(1);
      expect(claims.patterns_used[0]).toEqual({
        pattern_id: 'jwt-authentication',
        evidence: expect.arrayContaining([
          expect.objectContaining({
            kind: 'git_lines',
            file: 'reflection-note',
            sha: 'HEAD'
          })
        ]),
        notes: 'Straightforward application'
      });

      expect(claims.trust_updates).toHaveLength(1);
      expect(claims.trust_updates[0]).toEqual({
        pattern_id: 'jwt-authentication',
        outcome: 'worked-perfectly'
      });
    });

    it('should handle multiple patterns', () => {
      const batch: BatchPattern[] = [
        {
          pattern: 'jwt-auth',
          outcome: 'worked-perfectly',
          evidence: 'Applied successfully'
        },
        {
          pattern: 'error-handling',
          outcome: 'worked-with-tweaks',
          notes: 'Needed adaptation'
        }
      ];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      expect(claims.patterns_used).toHaveLength(2);
      expect(claims.trust_updates).toHaveLength(2);
      
      expect(claims.patterns_used[0].pattern_id).toBe('jwt-auth');
      expect(claims.patterns_used[1].pattern_id).toBe('error-handling');
      
      expect(claims.trust_updates[0].outcome).toBe('worked-perfectly');
      expect(claims.trust_updates[1].outcome).toBe('worked-with-tweaks');
    });

    it('should handle structured evidence arrays', () => {
      const structuredEvidence: EvidenceRef[] = [{
        kind: 'git_lines',
        file: 'src/auth.js',
        sha: 'abc123',
        start: 10,
        end: 20
      }];

      const batch: BatchPattern[] = [{
        pattern: 'auth-pattern',
        outcome: 'partial-success',
        evidence: structuredEvidence
      }];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      expect(claims.patterns_used[0].evidence).toEqual(structuredEvidence);
    });

    it('should handle empty batch', () => {
      const claims = BatchProcessor.expandBatchPatterns([]);

      expect(claims.patterns_used).toEqual([]);
      expect(claims.trust_updates).toEqual([]);
      expect(claims.new_patterns).toEqual([]);
      expect(claims.anti_patterns).toEqual([]);
      expect(claims.learnings).toEqual([]);
    });

    it('should handle duplicate patterns with last-wins behavior', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
      const infoSpy = vi.spyOn(console, 'info').mockImplementation();

      const batch: BatchPattern[] = [
        {
          pattern: 'duplicate-pattern',
          outcome: 'worked-perfectly',
          notes: 'First occurrence'
        },
        {
          pattern: 'duplicate-pattern',
          outcome: 'failed-completely',
          notes: 'Second occurrence'
        }
      ];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      // Should only have one entry (last wins)
      expect(claims.patterns_used).toHaveLength(1);
      expect(claims.trust_updates).toHaveLength(1);
      
      // Should use the last values
      expect(claims.patterns_used[0].notes).toBe('Second occurrence');
      expect(claims.trust_updates[0].outcome).toBe('failed-completely');
      
      // Should have warned about conflicting outcomes
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('conflicting outcomes')
      );
      
      // Should log duplicate statistics
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('2 patterns with 1 duplicates')
      );
    });

    it('should warn for large batch sizes', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      const largeBatch: BatchPattern[] = Array(101).fill(null).map((_, i) => ({
        pattern: `pattern-${i}`,
        outcome: 'worked-perfectly' as const
      }));

      BatchProcessor.expandBatchPatterns(largeBatch);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Large batch size (101 patterns)')
      );
    });

    it('should handle missing evidence', () => {
      const batch: BatchPattern[] = [{
        pattern: 'no-evidence-pattern',
        outcome: 'partial-success'
        // No evidence field
      }];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      expect(claims.patterns_used[0].evidence).toEqual([]);
    });

    it('should handle mixed evidence types', () => {
      const batch: BatchPattern[] = [
        {
          pattern: 'string-evidence',
          outcome: 'worked-perfectly',
          evidence: 'Simple string'
        },
        {
          pattern: 'array-evidence',
          outcome: 'worked-with-tweaks',
          evidence: [{
            kind: 'commit',
            sha: 'def456'
          }]
        },
        {
          pattern: 'no-evidence',
          outcome: 'partial-success'
        }
      ];

      const claims = BatchProcessor.expandBatchPatterns(batch);

      expect(claims.patterns_used).toHaveLength(3);
      
      // String evidence should be normalized
      expect(claims.patterns_used[0].evidence).toHaveLength(1);
      expect(claims.patterns_used[0].evidence[0].kind).toBe('git_lines');
      
      // Array evidence should pass through
      expect(claims.patterns_used[1].evidence).toHaveLength(1);
      expect(claims.patterns_used[1].evidence[0].kind).toBe('commit');
      
      // No evidence should be empty array
      expect(claims.patterns_used[2].evidence).toEqual([]);
    });
  });

  describe('normalizeEvidence', () => {
    it('should convert string to structured evidence', () => {
      const evidence = BatchProcessor.normalizeEvidence('Test string');
      
      expect(evidence).toHaveLength(1);
      expect(evidence[0]).toEqual({
        kind: 'git_lines',
        file: 'reflection-note',
        sha: 'HEAD',
        start: 1,
        end: 1,
        snippet_hash: expect.any(String)
      });
    });

    it('should pass through array evidence unchanged', () => {
      const arrayEvidence: EvidenceRef[] = [{
        kind: 'pr',
        number: 123,
        repo: 'test/repo'
      }];
      
      const result = BatchProcessor.normalizeEvidence(arrayEvidence);
      
      expect(result).toStrictEqual(arrayEvidence);
    });

    it('should handle undefined evidence', () => {
      const result = BatchProcessor.normalizeEvidence(undefined);
      expect(result).toEqual([]);
    });

    it('should handle null evidence', () => {
      const result = BatchProcessor.normalizeEvidence(null as any);
      expect(result).toEqual([]);
    });

    it('should handle empty string evidence', () => {
      const result = BatchProcessor.normalizeEvidence('');
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('git_lines');
    });
  });

  describe('estimateProcessingTime', () => {
    it('should estimate time for small batches', () => {
      const time = BatchProcessor.estimateProcessingTime(10);
      expect(time).toBeLessThan(10); // Should be under 10ms
      expect(time).toBeGreaterThan(0);
    });

    it('should estimate time for large batches', () => {
      const time = BatchProcessor.estimateProcessingTime(100);
      expect(time).toBeGreaterThan(5);
      expect(time).toBeLessThan(15); // Should be close to 10ms target
    });

    it('should scale linearly with batch size', () => {
      const time10 = BatchProcessor.estimateProcessingTime(10);
      const time20 = BatchProcessor.estimateProcessingTime(20);
      const time30 = BatchProcessor.estimateProcessingTime(30);
      
      // Check linear scaling
      const diff1 = time20 - time10;
      const diff2 = time30 - time20;
      
      expect(Math.abs(diff1 - diff2)).toBeLessThan(0.1); // Nearly linear
    });
  });
});