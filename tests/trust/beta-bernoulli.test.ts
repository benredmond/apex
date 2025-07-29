/**
 * Unit tests for Beta-Bernoulli Trust Model
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BetaBernoulliTrustModel } from '../../src/trust/beta-bernoulli.js';
import { MemoryStorageAdapter } from '../../src/trust/storage-adapter.js';
import { TrustScore, TrustUpdate } from '../../src/trust/types.js';

describe('BetaBernoulliTrustModel', () => {
  let storage: MemoryStorageAdapter;
  let model: BetaBernoulliTrustModel;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    model = new BetaBernoulliTrustModel(storage, {
      defaultAlpha: 1,
      defaultBeta: 1,
      defaultHalfLife: 90,
    });
  });

  describe('calculateTrust', () => {
    it('should calculate trust score for new pattern', () => {
      const trust = model.calculateTrust(0, 0);
      
      expect(trust.value).toBe(0.5); // Uniform prior
      expect(trust.confidence).toBeLessThan(0.5); // Low confidence
      expect(trust.samples).toBe(0);
      expect(trust.alpha).toBe(1);
      expect(trust.beta).toBe(1);
      expect(trust.interval[0]).toBeLessThan(trust.value);
      expect(trust.interval[1]).toBeGreaterThan(trust.value);
    });

    it('should calculate trust score with successes', () => {
      const trust = model.calculateTrust(8, 2);
      
      expect(trust.value).toBeCloseTo(0.75, 2); // (1+8)/(1+8+1+2) = 9/12
      expect(trust.confidence).toBeGreaterThan(0.5); // Higher confidence
      expect(trust.samples).toBe(10);
      expect(trust.alpha).toBe(9);
      expect(trust.beta).toBe(3);
    });

    it('should calculate trust score with failures', () => {
      const trust = model.calculateTrust(2, 8);
      
      expect(trust.value).toBeCloseTo(0.25, 2); // (1+2)/(1+2+1+8) = 3/12
      expect(trust.confidence).toBeGreaterThan(0.5);
      expect(trust.samples).toBe(10);
    });

    it('should handle extreme values', () => {
      const highTrust = model.calculateTrust(100, 0);
      expect(highTrust.value).toBeGreaterThan(0.95);
      expect(highTrust.confidence).toBeGreaterThan(0.9);
      
      const lowTrust = model.calculateTrust(0, 100);
      expect(lowTrust.value).toBeLessThan(0.05);
      expect(lowTrust.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('updateTrust', () => {
    beforeEach(() => {
      storage.addPattern({
        id: 'test-pattern',
        type: 'TEST',
        trust: {
          alpha: 5,
          beta: 3,
          lastUpdated: new Date().toISOString(),
          decayApplied: false,
        },
      });
    });

    it('should update trust with success', async () => {
      const trust = await model.updateTrust('test-pattern', true);
      
      expect(trust.alpha).toBe(6); // 5 + 1
      expect(trust.beta).toBe(3); // unchanged
      expect(trust.value).toBeCloseTo(0.667, 2); // 6/9
    });

    it('should update trust with failure', async () => {
      const trust = await model.updateTrust('test-pattern', false);
      
      expect(trust.alpha).toBe(5); // unchanged
      expect(trust.beta).toBe(4); // 3 + 1
      expect(trust.value).toBeCloseTo(0.556, 2); // 5/9
    });

    it('should throw error for non-existent pattern', async () => {
      await expect(model.updateTrust('non-existent', true)).rejects.toThrow();
    });

    it('should apply decay for old updates', async () => {
      // Set last update to 30 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      
      storage.addPattern({
        id: 'old-pattern',
        type: 'TEST',
        trust: {
          alpha: 10,
          beta: 5,
          lastUpdated: oldDate.toISOString(),
          decayApplied: false,
        },
      });

      const trust = await model.updateTrust('old-pattern', true);
      
      // With 90-day half-life, 30 days should decay by factor ~0.794
      expect(trust.alpha).toBeLessThan(11); // Less than 10 + 1 due to decay
      expect(trust.alpha).toBeGreaterThan(8); // But not too much decay
    });
  });

  describe('getConfidenceInterval', () => {
    beforeEach(() => {
      storage.addPattern({
        id: 'test-pattern',
        type: 'TEST',
        trust: {
          alpha: 10,
          beta: 5,
          lastUpdated: new Date().toISOString(),
          decayApplied: false,
        },
      });
    });

    it('should return 95% confidence interval', async () => {
      const interval = await model.getConfidenceInterval('test-pattern');
      
      expect(interval).toHaveLength(2);
      expect(interval[0]).toBeLessThan(0.667); // Lower than mean
      expect(interval[1]).toBeGreaterThan(0.667); // Higher than mean
      expect(interval[0]).toBeGreaterThan(0); // Valid probability
      expect(interval[1]).toBeLessThan(1); // Valid probability
    });

    it('should cache confidence intervals', async () => {
      const interval1 = await model.getConfidenceInterval('test-pattern');
      const interval2 = await model.getConfidenceInterval('test-pattern');
      
      expect(interval1).toEqual(interval2);
    });
  });

  describe('batchUpdate', () => {
    beforeEach(() => {
      storage.addPattern({
        id: 'pattern1',
        type: 'TEST',
        trust: { alpha: 3, beta: 2, lastUpdated: new Date().toISOString(), decayApplied: false },
      });
      storage.addPattern({
        id: 'pattern2',
        type: 'TEST',
        trust: { alpha: 5, beta: 5, lastUpdated: new Date().toISOString(), decayApplied: false },
      });
    });

    it('should process batch updates', async () => {
      const updates: TrustUpdate[] = [
        { patternId: 'pattern1', outcome: true },
        { patternId: 'pattern1', outcome: false },
        { patternId: 'pattern2', outcome: true },
        { patternId: 'pattern2', outcome: true },
      ];

      const result = await model.batchUpdate(updates);
      
      expect(result.updated).toBe(4);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.errors).toBeUndefined();

      // Check updated values
      const pattern1 = await storage.getPattern('pattern1');
      expect(pattern1?.trust.alpha).toBe(4); // 3 + 1
      expect(pattern1?.trust.beta).toBe(3); // 2 + 1

      const pattern2 = await storage.getPattern('pattern2');
      expect(pattern2?.trust.alpha).toBe(7); // 5 + 2
      expect(pattern2?.trust.beta).toBe(5); // unchanged
    });

    it('should handle errors in batch', async () => {
      const updates: TrustUpdate[] = [
        { patternId: 'pattern1', outcome: true },
        { patternId: 'non-existent', outcome: true },
        { patternId: 'pattern2', outcome: false },
      ];

      const result = await model.batchUpdate(updates);
      
      expect(result.updated).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].patternId).toBe('non-existent');
    });
  });

  describe('setPrior', () => {
    it('should set custom prior for pattern type', () => {
      model.setPrior('CUSTOM_TYPE', 3, 2);
      const config = model.getConfig();
      
      const typeConfig = config.patternTypeConfig?.get('CUSTOM_TYPE');
      expect(typeConfig?.prior).toEqual({
        alpha: 3,
        beta: 2,
        source: 'configured',
      });
    });
  });

  describe('setHalfLife', () => {
    it('should set custom half-life for pattern type', () => {
      model.setHalfLife('CUSTOM_TYPE', 30);
      const config = model.getConfig();
      
      const typeConfig = config.patternTypeConfig?.get('CUSTOM_TYPE');
      expect(typeConfig?.halfLife).toBe(30);
    });
  });

  describe('Wilson lower bound compatibility', () => {
    it('should calculate Wilson lower bound correctly', () => {
      const trust = model.calculateTrust(10, 5);
      
      // Wilson lower bound should be conservative estimate
      expect(trust.wilsonLower).toBeLessThan(trust.value);
      expect(trust.wilsonLower).toBeGreaterThan(0);
      expect(trust.wilsonLower).toBeLessThan(1);
    });

    it('should match existing Wilson implementation for common cases', () => {
      const cases = [
        { successes: 0, failures: 0, expectedRange: [0.4, 0.6] }, // Priors of 1,1 give 0.5
        { successes: 10, failures: 0, expectedRange: [0.6, 0.9] },
        { successes: 50, failures: 50, expectedRange: [0.4, 0.5] },
        { successes: 90, failures: 10, expectedRange: [0.8, 0.95] },
      ];

      for (const testCase of cases) {
        const trust = model.calculateTrust(testCase.successes, testCase.failures);
        expect(trust.wilsonLower).toBeGreaterThanOrEqual(testCase.expectedRange[0]);
        expect(trust.wilsonLower).toBeLessThanOrEqual(testCase.expectedRange[1]);
      }
    });
  });
});