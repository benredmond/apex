// [PAT:TEST:SEARCH] ★★★★☆ (78 uses, 90% success) - Search functionality testing patterns
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { PatternDatabase } from '../../src/storage/database.js';
import { PatternRepository } from '../../src/storage/repository.js';
import { PatternDiscoverer } from '../../src/mcp/tools/discover.js';
import { QueryProcessor } from '../../src/search/query-processor.js';
import { FuzzyMatcher } from '../../src/search/fuzzy-matcher.js';
import { SynonymExpander } from '../../src/search/synonym-expander.js';
// No migrations needed - base schema includes all required columns
import type { Pattern } from '../../src/storage/types.js';

describe('Enhanced Pattern Discovery', () => {
  let db: PatternDatabase;
  let repository: PatternRepository;
  let discoverer: PatternDiscoverer;
  let processor: QueryProcessor;

  beforeAll(async () => {
    // Initialize test database (base schema includes all columns)
    db = new PatternDatabase(':memory:');
    repository = new PatternRepository(db);
    discoverer = new PatternDiscoverer(repository);
    processor = new QueryProcessor();

    // Insert test patterns
    const testPatterns: Partial<Pattern>[] = [
      {
        id: 'PAT:AUTH:JWT_VALIDATION',
        type: 'CODEBASE',
        title: 'JWT Token Validation Pattern',
        summary: 'Secure JWT authentication and validation',
        tags: ['authentication', 'security', 'jwt'],
        keywords: ['jwt', 'token', 'auth', 'validation'],
        trust_score: 0.95,
      },
      {
        id: 'PAT:TEST:ASYNC_JEST',
        type: 'TEST',
        title: 'Async Jest Testing Pattern',
        summary: 'Handle asynchronous operations in Jest tests',
        tags: ['testing', 'jest', 'async'],
        keywords: ['test', 'jest', 'async', 'promise'],
        trust_score: 0.88,
      },
      {
        id: 'FIX:TYPESCRIPT:MODULE_IMPORT',
        type: 'FAILURE',
        title: 'TypeScript Module Import Error Fix',
        summary: 'Fix TypeScript module resolution errors',
        tags: ['typescript', 'import', 'module'],
        keywords: ['typescript', 'import', 'error', 'module'],
        trust_score: 0.92,
      },
    ];

    for (const pattern of testPatterns) {
      await repository.insert(pattern as Pattern);
    }
  });

  afterAll(async () => {
    // Cleanup
    db.database.close();
  });

  describe('Natural Language Query Tests', () => {
    const testCases = [
      { 
        query: 'how to handle async errors in jest',
        expectedMinCount: 1,
        expectedPattern: 'PAT:TEST:ASYNC_JEST'
      },
      { 
        query: 'authentication jwt implementation',
        expectedMinCount: 1,
        expectedPattern: 'PAT:AUTH:JWT_VALIDATION'
      },
      { 
        query: 'fix typescript module errors',
        expectedMinCount: 1,
        expectedPattern: 'FIX:TYPESCRIPT:MODULE_IMPORT'
      },
    ];

    test.each(testCases)(
      'should find patterns for: $query',
      async ({ query, expectedMinCount, expectedPattern }) => {
        const response = await discoverer.discover({
          query,
          max_results: 10,
          min_score: 0.3
        });

        expect(response.patterns.length).toBeGreaterThanOrEqual(expectedMinCount);
        
        const patternIds = response.patterns.map(p => p.pattern.id);
        expect(patternIds).toContain(expectedPattern);
      }
    );
  });

  describe('Synonym Expansion Tests', () => {
    test('should expand "auth" to include authentication synonyms', () => {
      const expander = new SynonymExpander();
      const expansion = expander.expandQuery('auth jwt');
      
      expect(expansion.expanded).toContain('auth');
      expect(expansion.expanded).toContain('authentication');
      expect(expansion.expanded).toContain('authorization');
      expect(expansion.expanded).toContain('jwt');
    });

    test('should expand "db" to database synonyms', () => {
      const expander = new SynonymExpander();
      const expansion = expander.expandQuery('db migration');
      
      expect(expansion.expanded).toContain('database');
      expect(expansion.expanded).toContain('storage');
      expect(expansion.expanded).toContain('migration');
    });
  });

  describe('Fuzzy Matching Tests', () => {
    test('should handle typos with fuzzy matching', () => {
      const matcher = new FuzzyMatcher();
      
      // Test typo tolerance
      const result = matcher.fuzzyMatch('autentication', 'authentication', 0.8);
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0.8);
    });

    test('should suggest corrections for typos', () => {
      const matcher = new FuzzyMatcher();
      const dictionary = ['authentication', 'authorization', 'jwt', 'token'];
      
      const suggestions = matcher.suggestCorrections('authen', dictionary);
      expect(suggestions).toContain('authentication');
    });
  });

  describe('Performance Tests', () => {
    test('search should complete under 100ms', async () => {
      const start = performance.now();
      
      await discoverer.discover({
        query: 'authentication patterns',
        max_results: 10,
        min_score: 0.3
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });

    test('should use cache for repeated queries', async () => {
      // First query
      const response1 = await discoverer.discover({
        query: 'test caching',
        max_results: 5,
      });
      expect(response1.cache_hit).toBe(false);

      // Second identical query
      const response2 = await discoverer.discover({
        query: 'test caching',
        max_results: 5,
      });
      expect(response2.cache_hit).toBe(true);
      
      // Latency should be much lower for cached query
      expect(response2.latency_ms).toBeLessThan(response1.latency_ms);
    });
  });

  describe('Query Processing Tests', () => {
    test('should safely parse and sanitize FTS queries', () => {
      const testQueries = [
        { input: 'auth AND jwt', expected: '"auth" "jwt"' },
        { input: '"exact phrase"', expected: '"exact phrase"' },
        { input: 'NOT error', expected: 'NOT "error"' },
      ];

      for (const { input, expected } of testQueries) {
        const processed = processor.processQuery(input, { enableSynonyms: false });
        expect(processed.ftsQuery).toBe(expected);
      }
    });

    test('should reject dangerous query inputs', () => {
      const dangerousQueries = [
        "'; DROP TABLE patterns; --",
        'query /* comment */ injection',
        'query\\x00null',
      ];

      for (const dangerous of dangerousQueries) {
        expect(() => {
          processor.processQuery(dangerous);
        }).toThrow();
      }
    });
  });

  describe('Zero-Result Query Handling', () => {
    test('should provide meaningful results even for vague queries', async () => {
      const response = await discoverer.discover({
        query: 'fix errors',
        max_results: 10,
      });

      // Should find at least the TypeScript error fix pattern
      expect(response.patterns.length).toBeGreaterThan(0);
      
      // Should show query interpretation
      expect(response.query_interpretation.keywords).toContain('fix');
    });
  });
});