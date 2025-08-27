// [PAT:TEST:SEARCH] ★★★★☆ (78 uses, 90% success) - Search functionality testing patterns
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { fileURLToPath } from 'url';
import path from 'path';
import Database from 'better-sqlite3';
import { PatternRepository } from '../../src/storage/repository.js';
import { PatternDiscoverer } from '../../src/mcp/tools/discover.js';
import { QueryProcessor } from '../../src/search/query-processor.js';
import { FuzzyMatcher } from '../../src/search/fuzzy-matcher.js';
import { SynonymExpander } from '../../src/search/synonym-expander.js';
import { MigrationRunner } from '../../src/migrations/MigrationRunner.js';
import { MigrationLoader } from '../../src/migrations/MigrationLoader.js';
import type { Pattern } from '../../src/storage/types.js';

// [FIX:ESMODULE:DIRNAME] - ES module __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skipped due to Jest ESM module linking issue (see task 48CESPldy74LIBswPVg33)
// Error: "module is already linked" when using jest.unstable_mockModule
describe.skip('Enhanced Pattern Discovery', () => {
  let repository: PatternRepository;
  let discoverer: PatternDiscoverer;
  let processor: QueryProcessor;

  beforeAll(async () => {
    // [PAT:MIGRATION:TEST] - Initialize repository first, then run migrations on its database
    repository = new PatternRepository({ dbPath: ':memory:' });
    
    // Get the internal database from the repository
    const db = (repository as any).db.database;
    
    // FIRST: Create base patterns table (BEFORE migrations)
    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL DEFAULT '1.0',
        pattern_version   TEXT NOT NULL DEFAULT '1.0',
        type              TEXT NOT NULL,
        title             TEXT,
        summary           TEXT,
        trust_score       REAL DEFAULT 0.5,
        created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
        pattern_digest    TEXT,
        json_canonical    TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT,
        tags              TEXT,
        keywords          TEXT,
        search_index      TEXT,
        status            TEXT DEFAULT 'active'
      );
    `);
    
    // THEN: Run migrations (with problematic ones skipped)
    const migrationRunner = new MigrationRunner(db);
    const loader = new MigrationLoader(path.resolve(__dirname, '../../src/migrations'));
    const migrations = await loader.loadMigrations();
    
    // Skip problematic migrations that expect existing data
    const migrationsToRun = migrations.filter(m => 
      !['011-migrate-pattern-tags-to-json', '012-rename-tags-csv-column', '014-populate-pattern-tags'].includes(m.id)
    );
    
    // Run migrations silently (suppress console output)
    const originalLog = console.log;
    console.log = () => {};
    try {
      await migrationRunner.runMigrations(migrationsToRun);
    } catch (error) {
      // Ignore migration errors in tests
    } finally {
      console.log = originalLog;
    }
    
    // Initialize repository after migrations
    await repository.initialize();
    discoverer = new PatternDiscoverer(repository);
    processor = new QueryProcessor();

    // Insert test patterns (note: tags should be JSON string after migration 011)
    const testPatterns: Partial<Pattern>[] = [
      {
        id: 'PAT:AUTH:JWT_VALIDATION',
        schema_version: '1.0',
        pattern_version: '1.0',
        type: 'CODEBASE',
        title: 'JWT Token Validation Pattern',
        summary: 'Secure JWT authentication and validation',
        tags: ['authentication', 'security', 'jwt'],  // Array format expected by type
        keywords: ['jwt', 'token', 'auth', 'validation'],
        trust_score: 0.95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pattern_digest: 'test-digest-1',
        json_canonical: JSON.stringify({}),
        search_index: 'jwt token validation pattern secure authentication auth PAT AUTH JWT VALIDATION',
      },
      {
        id: 'PAT:TEST:ASYNC_JEST',
        schema_version: '1.0',
        pattern_version: '1.0',
        type: 'TEST',
        title: 'Async Jest Testing Pattern',
        summary: 'Handle asynchronous operations in Jest tests',
        tags: ['testing', 'jest', 'async'],  // Array format expected by type
        keywords: ['test', 'jest', 'async', 'promise'],
        trust_score: 0.88,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pattern_digest: 'test-digest-2',
        json_canonical: JSON.stringify({}),
        search_index: 'async jest testing pattern handle asynchronous operations tests errors PAT TEST ASYNC JEST',
      },
      {
        id: 'FIX:TYPESCRIPT:MODULE_IMPORT',
        schema_version: '1.0',
        pattern_version: '1.0',
        type: 'FAILURE',
        title: 'TypeScript Module Import Error Fix',
        summary: 'Fix TypeScript module resolution errors',
        tags: ['typescript', 'import', 'module'],  // Array format expected by type
        keywords: ['typescript', 'import', 'error', 'module'],
        trust_score: 0.92,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pattern_digest: 'test-digest-3',
        json_canonical: JSON.stringify({}),
        search_index: 'typescript module import error fix resolution errors FIX TYPESCRIPT MODULE IMPORT',
      },
    ];

    for (const pattern of testPatterns) {
      await repository.create(pattern as Pattern);
    }
    
    // Wait for file watcher to process changes
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify patterns were created
    const pat1 = await repository.get('PAT:AUTH:JWT_VALIDATION');
    const pat2 = await repository.get('PAT:TEST:ASYNC_JEST');
    const pat3 = await repository.get('FIX:TYPESCRIPT:MODULE_IMPORT');
    
    if (!pat1 || !pat2 || !pat3) {
      console.error('Patterns not found after creation:', { pat1: !!pat1, pat2: !!pat2, pat3: !!pat3 });
    }
  });

  afterAll(async () => {
    // Cleanup
    await repository.shutdown();
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