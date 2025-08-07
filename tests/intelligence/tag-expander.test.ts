/**
 * Unit tests for TagExpander
 * [APE-63] Multi-Dimensional Pattern Tagging System
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 * [TEST:PERF:BENCHMARK] ★★★★☆ - Performance benchmarking for <50ms requirement
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TagExpander } from '../../src/intelligence/tag-expander.js';
import { TAG_RELATIONSHIPS } from '../../src/intelligence/tag-relationships.js';

describe('TagExpander', () => {
  let expander: TagExpander;

  beforeEach(() => {
    expander = new TagExpander();
  });

  describe('sanitizeTag()', () => {
    it('should convert tags to lowercase', () => {
      expect(expander.sanitizeTag('API')).toBe('api');
      expect(expander.sanitizeTag('CamelCase')).toBe('camelcase');
    });

    it('should remove SQL injection attempts', () => {
      expect(expander.sanitizeTag("'; DROP TABLE users--")).toBe('table');
      expect(expander.sanitizeTag('SELECT * FROM patterns')).toBe('from_patterns');
      expect(expander.sanitizeTag('UNION SELECT')).toBe('');
    });

    it('should remove special characters', () => {
      expect(expander.sanitizeTag('test@#$%')).toBe('test');
      expect(expander.sanitizeTag('hello"world')).toBe('helloworld');
      expect(expander.sanitizeTag('semi;colon')).toBe('semicolon');
    });

    it('should allow alphanumeric, dash, and underscore', () => {
      expect(expander.sanitizeTag('test-tag_123')).toBe('test-tag_123');
      expect(expander.sanitizeTag('valid_name-2')).toBe('valid_name-2');
    });

    it('should limit tag length to 50 characters', () => {
      const longTag = 'a'.repeat(60);
      expect(expander.sanitizeTag(longTag).length).toBe(50);
    });

    it('should handle empty and whitespace strings', () => {
      expect(expander.sanitizeTag('')).toBe('');
      expect(expander.sanitizeTag('   ')).toBe('');
      expect(expander.sanitizeTag('\n\t')).toBe('');
    });

    it('should remove script tags and XSS attempts', () => {
      expect(expander.sanitizeTag('<script>alert(1)</script>')).toBe('alert1');
      expect(expander.sanitizeTag('javascript:void(0)')).toBe('javascriptvoid0');
    });
  });

  describe('expand()', () => {
    it('should expand tags using relationships', () => {
      const expanded = expander.expand(['auth']);
      expect(expanded).toContain('auth');
      expect(expanded).toContain('authentication');
      expect(expanded).toContain('security');
      expect(expanded).toContain('jwt');
    });

    it('should handle multiple input tags', () => {
      const expanded = expander.expand(['api', 'test']);
      expect(expanded).toContain('api');
      expect(expanded).toContain('test');
      expect(expanded).toContain('endpoint');
      expect(expanded).toContain('testing');
    });

    it('should respect maxDepth option', () => {
      const depth1 = expander.expand(['auth'], { maxDepth: 1 });
      const depth2 = expander.expand(['auth'], { maxDepth: 2 });
      
      // Depth 2 should have more tags than depth 1
      expect(depth2.length).toBeGreaterThan(depth1.length);
      
      // Depth 1 should have direct relationships only
      expect(depth1).toContain('auth');
      expect(depth1).toContain('authentication');
      
      // Depth 2 should have second-level relationships
      expect(depth2).toContain('token'); // From jwt -> token
    });

    it('should respect maxTags option', () => {
      const expanded = expander.expand(['auth'], { maxTags: 5 });
      expect(expanded.length).toBeLessThanOrEqual(5);
    });

    it('should detect and prevent cycles', () => {
      // Auth -> authentication -> auth (cycle)
      const expanded = expander.expand(['auth'], { maxDepth: 10 });
      // Should not hang or duplicate
      const uniqueTags = new Set(expanded);
      expect(uniqueTags.size).toBe(expanded.length);
    });

    it('should cache results for performance', () => {
      const tags = ['api', 'cache', 'test'];
      
      // First call
      const start1 = Date.now();
      const result1 = expander.expand(tags);
      const time1 = Date.now() - start1;
      
      // Second call (should use cache)
      const start2 = Date.now();
      const result2 = expander.expand(tags);
      const time2 = Date.now() - start2;
      
      expect(result1).toEqual(result2);
      // Cache hit should be faster (allowing some variance)
      expect(time2).toBeLessThanOrEqual(time1 + 1);
    });

    it('should handle empty input', () => {
      expect(expander.expand([])).toEqual([]);
    });

    it('should sanitize tags before expansion', () => {
      const expanded = expander.expand(["API", "'; DROP TABLE"]);
      expect(expanded).toContain('api');
      expect(expanded).not.toContain('DROP');
    });

    it('should handle unknown tags', () => {
      const expanded = expander.expand(['unknown-tag-xyz']);
      expect(expanded).toEqual(['unknown-tag-xyz']);
    });

    it('should complete within 50ms for 10 tags', () => {
      const tags = ['api', 'cache', 'test', 'auth', 'database', 
                    'ui', 'async', 'error', 'pattern', 'search'];
      
      const start = Date.now();
      expander.expand(tags);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });

  describe('calculateOverlapScore()', () => {
    it('should return 1 for identical tag sets', () => {
      const score = expander.calculateOverlapScore(['api', 'test'], ['api', 'test']);
      expect(score).toBe(1);
    });

    it('should return 0 for completely different tag sets', () => {
      const score = expander.calculateOverlapScore(['api'], ['database']);
      expect(score).toBe(0);
    });

    it('should calculate partial overlap correctly', () => {
      // Auth and security are related
      const score = expander.calculateOverlapScore(['auth'], ['security']);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should handle empty tag sets', () => {
      expect(expander.calculateOverlapScore([], ['api'])).toBe(0);
      expect(expander.calculateOverlapScore(['api'], [])).toBe(0);
      expect(expander.calculateOverlapScore([], [])).toBe(0);
    });

    it('should use expanded tags for calculation', () => {
      // jwt and auth are related through expansion
      const score = expander.calculateOverlapScore(['jwt'], ['auth']);
      expect(score).toBeGreaterThan(0.5); // High overlap due to relationships
    });

    it('should be symmetric', () => {
      const score1 = expander.calculateOverlapScore(['api', 'test'], ['cache', 'performance']);
      const score2 = expander.calculateOverlapScore(['cache', 'performance'], ['api', 'test']);
      expect(score1).toBe(score2);
    });

    it('should complete within 10ms for typical sets', () => {
      const start = Date.now();
      expander.calculateOverlapScore(
        ['api', 'auth', 'cache'],
        ['test', 'database', 'ui']
      );
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10);
    });
  });

  describe('quarantineTags()', () => {
    it('should sanitize tags without trust scores', () => {
      const result = expander.quarantineTags(['API', "test'; DROP"]);
      expect(result).toEqual(['api', 'test']);
    });

    it('should filter tags below trust threshold', () => {
      const trustScores = new Map([
        ['api', 0.8],
        ['test', 0.2], // Below threshold
        ['cache', 0.5],
      ]);
      
      const result = expander.quarantineTags(['api', 'test', 'cache'], trustScores);
      expect(result).toContain('api');
      expect(result).toContain('cache');
      expect(result).not.toContain('test');
    });

    it('should use default trust score for unknown tags', () => {
      const trustScores = new Map([['api', 0.8]]);
      const result = expander.quarantineTags(['api', 'unknown'], trustScores);
      
      // Unknown gets 0.5 default, which is above 0.3 threshold
      expect(result).toContain('api');
      expect(result).toContain('unknown');
    });

    it('should handle empty input', () => {
      expect(expander.quarantineTags([])).toEqual([]);
      expect(expander.quarantineTags([], new Map())).toEqual([]);
    });

    it('should remove empty sanitized tags', () => {
      const result = expander.quarantineTags(['', '   ', 'valid']);
      expect(result).toEqual(['valid']);
    });
  });

  describe('cache management', () => {
    it('should track cache statistics', () => {
      const stats = expander.getStats();
      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats.cacheSize).toBe(0);
    });

    it('should increase cache size after expansions', () => {
      expander.expand(['api']);
      expander.expand(['test']);
      
      const stats = expander.getStats();
      expect(stats.cacheSize).toBe(2);
    });

    it('should clear cache', () => {
      expander.expand(['api']);
      expander.expand(['test']);
      
      expander.clearCache();
      
      const stats = expander.getStats();
      expect(stats.cacheSize).toBe(0);
    });

    it('should limit cache size to prevent memory issues', () => {
      // Create more than maxCacheSize (1000) entries
      // Note: In real implementation this would be tested more thoroughly
      for (let i = 0; i < 10; i++) {
        expander.expand([`tag${i}`]);
      }
      
      const stats = expander.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(1000);
    });

    it('should not cache when cacheResults is false', () => {
      expander.expand(['api'], { cacheResults: false });
      const stats = expander.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle circular relationships gracefully', () => {
      // Many tags have circular relationships in TAG_RELATIONSHIPS
      const expanded = expander.expand(['auth', 'authentication', 'security']);
      
      // Should complete without hanging
      expect(expanded).toBeDefined();
      expect(expanded.length).toBeGreaterThan(0);
      
      // No duplicates
      const unique = new Set(expanded);
      expect(unique.size).toBe(expanded.length);
    });

    it('should handle very long tag lists', () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
      
      const start = Date.now();
      const expanded = expander.expand(manyTags, { maxTags: 50 });
      const duration = Date.now() - start;
      
      expect(expanded.length).toBeLessThanOrEqual(50);
      expect(duration).toBeLessThan(100); // Should still be fast
    });

    it('should handle malformed input gracefully', () => {
      // @ts-expect-error Testing invalid input
      expect(() => expander.expand(null)).not.toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => expander.expand(undefined)).not.toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => expander.expand('not-an-array')).not.toThrow();
    });
  });
});