/**
 * Performance tests for Beta-Bernoulli Trust Model
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BetaBernoulliTrustModel } from '../../src/trust/beta-bernoulli.js';
import { MemoryStorageAdapter } from '../../src/trust/storage-adapter.js';
import { TrustUpdate } from '../../src/trust/types.js';

describe('BetaBernoulliTrustModel Performance', () => {
  let storage: MemoryStorageAdapter;
  let model: BetaBernoulliTrustModel;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    model = new BetaBernoulliTrustModel(storage, {
      defaultAlpha: 1,
      defaultBeta: 1,
      defaultHalfLife: 90,
      enableCache: true,
      maxCacheSize: 1000,
    });

    // Pre-populate storage with patterns
    for (let i = 0; i < 1000; i++) {
      storage.addPattern({
        id: `pattern-${i}`,
        type: 'TEST',
        trust: {
          alpha: Math.random() * 20 + 1,
          beta: Math.random() * 20 + 1,
          lastUpdated: new Date().toISOString(),
          decayApplied: false,
        },
      });
    }
  });

  describe('Batch update performance', () => {
    it('should update 1000 patterns in less than 100ms', async () => {
      const updates: TrustUpdate[] = [];
      
      // Generate 1000 updates
      for (let i = 0; i < 1000; i++) {
        updates.push({
          patternId: `pattern-${i}`,
          outcome: Math.random() > 0.5,
        });
      }

      const startTime = performance.now();
      const result = await model.batchUpdate(updates);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.updated).toBe(1000);
      expect(result.failed).toBe(0);
      expect(duration).toBeLessThan(100); // Less than 100ms
      
      console.log(`Batch update of 1000 patterns took ${duration.toFixed(2)}ms`);
    });

    it('should handle mixed batch sizes efficiently', async () => {
      const batchSizes = [10, 50, 100, 500, 1000];
      const results: Array<{ size: number; duration: number; perItem: number }> = [];

      for (const size of batchSizes) {
        const updates: TrustUpdate[] = [];
        for (let i = 0; i < size; i++) {
          updates.push({
            patternId: `pattern-${i % 1000}`,
            outcome: Math.random() > 0.5,
          });
        }

        const startTime = performance.now();
        await model.batchUpdate(updates);
        const endTime = performance.now();
        const duration = endTime - startTime;
        const perItem = duration / size;

        results.push({ size, duration, perItem });
      }

      // Log results
      console.log('\nBatch update performance:');
      console.log('Size\tDuration\tPer Item');
      results.forEach(r => {
        console.log(`${r.size}\t${r.duration.toFixed(2)}ms\t${r.perItem.toFixed(3)}ms`);
      });

      // Per-item time should not increase significantly with batch size
      const smallBatchPerItem = results[0].perItem;
      const largeBatchPerItem = results[results.length - 1].perItem;
      expect(largeBatchPerItem).toBeLessThan(smallBatchPerItem * 2);
    });
  });

  describe('Trust calculation performance', () => {
    it('should calculate trust scores quickly', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const successes = Math.floor(Math.random() * 100);
        const failures = Math.floor(Math.random() * 100);
        model.calculateTrust(successes, failures);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const perCalculation = duration / iterations;

      console.log(`\n${iterations} trust calculations took ${duration.toFixed(2)}ms`);
      console.log(`Average: ${perCalculation.toFixed(4)}ms per calculation`);

      expect(perCalculation).toBeLessThan(0.1); // Less than 0.1ms per calculation
    });
  });

  describe('Confidence interval performance', () => {
    it('should calculate confidence intervals efficiently with caching', async () => {
      const patternIds = Array.from({ length: 100 }, (_, i) => `pattern-${i}`);
      
      // First pass - no cache
      const startTime1 = performance.now();
      for (const id of patternIds) {
        await model.getConfidenceInterval(id);
      }
      const duration1 = performance.now() - startTime1;

      // Second pass - with cache
      const startTime2 = performance.now();
      for (const id of patternIds) {
        await model.getConfidenceInterval(id);
      }
      const duration2 = performance.now() - startTime2;

      console.log(`\nConfidence interval performance:`);
      console.log(`First pass (no cache): ${duration1.toFixed(2)}ms`);
      console.log(`Second pass (cached): ${duration2.toFixed(2)}ms`);
      console.log(`Cache speedup: ${(duration1 / duration2).toFixed(1)}x`);

      expect(duration2).toBeLessThan(duration1 / 5); // Cached should be at least 5x faster
    });
  });

  describe('Memory usage', () => {
    it('should maintain bounded cache size', async () => {
      // Clear cache first
      model.clearCache();

      // Access more patterns than cache size
      const cacheSize = model.getConfig().maxCacheSize;
      const accessCount = cacheSize * 2;

      for (let i = 0; i < accessCount; i++) {
        await model.getConfidenceInterval(`pattern-${i % 1000}`);
      }

      // Cache should not grow unbounded
      // We can't directly measure cache size, but we can verify performance
      // doesn't degrade significantly
      const startTime = performance.now();
      await model.getConfidenceInterval('pattern-999');
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(10); // Should still be fast
    });
  });

  describe('Decay calculation performance', () => {
    it('should handle time decay efficiently', async () => {
      const patternIds = Array.from({ length: 100 }, (_, i) => `pattern-${i}`);
      
      const startTime = performance.now();
      for (const id of patternIds) {
        await model.decayTrust(id, 30); // Decay by 30 days
      }
      const duration = performance.now() - startTime;

      console.log(`\nDecay calculation for 100 patterns: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(50); // Less than 50ms for 100 patterns
    });
  });

  describe('Real-world scenario', () => {
    it('should handle realistic workload efficiently', async () => {
      // Simulate a day of pattern updates
      // Assume 10,000 pattern uses per day across 500 unique patterns
      const updates: TrustUpdate[] = [];
      const now = new Date();

      for (let i = 0; i < 10000; i++) {
        const patternId = `pattern-${Math.floor(Math.random() * 500)}`;
        const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        updates.push({
          patternId,
          outcome: Math.random() > 0.2, // 80% success rate
          timestamp,
        });
      }

      const startTime = performance.now();
      const result = await model.batchUpdate(updates);
      const duration = performance.now() - startTime;

      console.log(`\nReal-world scenario (10,000 updates):`);
      console.log(`Duration: ${duration.toFixed(2)}ms`);
      console.log(`Updates per second: ${(10000 / (duration / 1000)).toFixed(0)}`);
      console.log(`Failed updates: ${result.failed}`);

      expect(duration).toBeLessThan(500); // Less than 500ms for 10k updates
      expect(result.failed).toBeLessThan(100); // Less than 1% failure rate
    });
  });
});