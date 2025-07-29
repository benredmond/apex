import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createPatternRepository } from '../../src/storage/index.js';
import { createRankerFromRepository } from '../../src/ranking/storage-adapter.js';
import { Pattern } from '../../src/storage/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Ranking + Storage Integration', () => {
  let tempDir: string;
  let repository: any;
  let ranker: any;
  
  beforeAll(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-ranking-test-'));
    
    // Initialize repository
    repository = await createPatternRepository({
      dbPath: path.join(tempDir, 'patterns.db'),
      patternsDir: path.join(tempDir, 'patterns'),
      watch: false,
    });
    
    // Create test patterns
    const patterns: Pattern[] = [
      {
        id: 'APEX.TEST:LANG:TS:ASYNC_AWAIT',
        type: 'LANG',
        category: 'typescript',
        severity: 'info',
        title: 'Async/Await Pattern',
        description: 'Best practices for async/await in TypeScript',
        problem: 'Improper error handling in async functions',
        solution: 'Use try-catch blocks',
        examples: {
          correct: 'async function fetch() { try { await api.get(); } catch (e) { handle(e); } }',
          incorrect: 'async function fetch() { await api.get(); }',
        },
        scope: {
          paths: ['src/**/*.ts', 'lib/**/*.ts'],
          languages: ['typescript'],
          frameworks: ['express@^4.0.0', 'fastify@^3.0.0'],
        },
        tags: ['async', 'error-handling'],
        metadata: {
          sources: ['internal'],
          keywords: ['async', 'await', 'promise'],
          trust: { score: 0.85 },
          lastReviewed: new Date().toISOString(),
          halfLifeDays: 90,
          repo: 'apex/test-repo',
          org: 'APEX',
        },
      },
      {
        id: 'APEX.TEST:POLICY:SECURITY:JWT',
        type: 'POLICY',
        category: 'security',
        severity: 'error',
        title: 'JWT Security Policy',
        description: 'Mandatory JWT validation',
        problem: 'Missing JWT validation',
        solution: 'Always validate JWT tokens',
        examples: {
          correct: 'jwt.verify(token, secret)',
        },
        scope: {
          paths: ['**/*.ts', '**/*.js'],
          languages: ['typescript', 'javascript'],
        },
        tags: ['security', 'jwt'],
        metadata: {
          sources: ['security-team'],
          keywords: ['jwt', 'auth'],
          trust: { score: 0.95 },
          lastReviewed: new Date().toISOString(),
          halfLifeDays: 180,
          org: 'APEX',
        },
      },
      {
        id: 'PUBLIC:LANG:JS:PROMISE_ALL',
        type: 'LANG',
        category: 'javascript',
        severity: 'warning',
        title: 'Promise.all Usage',
        description: 'Parallel promise execution',
        problem: 'Sequential await instead of parallel',
        solution: 'Use Promise.all for parallel execution',
        examples: {
          correct: 'const [a, b] = await Promise.all([fetchA(), fetchB()]);',
          incorrect: 'const a = await fetchA(); const b = await fetchB();',
        },
        scope: {
          paths: ['**/*.js'],
          languages: ['javascript'],
        },
        tags: ['performance', 'promises'],
        metadata: {
          sources: ['community'],
          keywords: ['promise', 'parallel'],
          trust: { score: 0.7 },
          lastReviewed: new Date(Date.now() - 60 * 86400000).toISOString(), // 60 days ago
          halfLifeDays: 90,
        },
      },
      {
        id: 'TEST:NO_TRUST',
        type: 'LANG',
        category: 'test',
        severity: 'info',
        title: 'No Trust Pattern',
        description: 'Pattern without trust score',
        problem: 'Test',
        solution: 'Test',
        examples: { correct: 'test' },
        scope: {
          languages: ['typescript'],
        },
        tags: ['test'],
        metadata: {
          sources: ['test'],
          keywords: ['test'],
          // Explicitly no trust score
        },
      },
    ];
    
    // Insert patterns
    for (const pattern of patterns) {
      await repository.create(pattern);
    }
    
    // Create ranker
    ranker = await createRankerFromRepository(repository);
  });
  
  afterAll(async () => {
    // Cleanup
    if (repository) {
      await repository.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  test('ranks patterns from storage repository', async () => {
    const signals = {
      paths: ['src/api/auth.ts'],
      languages: ['typescript'],
      frameworks: [{ name: 'express', version: '4.18.2' }],
      repo: 'apex/test-repo',
      org: 'APEX',
    };
    
    const results = await ranker.rankPatterns(signals, 3);
    
    // Only 2 patterns match TypeScript language/paths
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].id).toContain('APEX'); // Local patterns should rank higher
    expect(results[0].explain).toBeDefined();
  });
  
  test('policy patterns get boost when applicable', async () => {
    const signals = {
      paths: ['auth.js'],
      languages: ['javascript'],
      frameworks: [],
      org: 'APEX',
    };
    
    const results = await ranker.rankPatterns(signals, 3);
    
    const policyPattern = results.find(r => r.id.includes('POLICY'));
    expect(policyPattern).toBeDefined();
    expect(policyPattern!.explain.policy.points).toBe(20);
  });
  
  test('freshness affects ranking', async () => {
    const signals = {
      paths: ['app.js'],
      languages: ['javascript'],
      frameworks: [],
    };
    
    const results = await ranker.rankPatterns(signals, 3);
    
    // Check freshness scores
    for (const result of results) {
      expect(result.explain.freshness.age_days).toBeDefined();
      expect(result.explain.freshness.points).toBeGreaterThanOrEqual(0);
      expect(result.explain.freshness.points).toBeLessThanOrEqual(20);
    }
  });
  
  test('locality boost works with storage patterns', async () => {
    const signals = {
      paths: ['src/service.ts'],
      languages: ['typescript'],
      frameworks: [],
      repo: 'apex/test-repo',
      org: 'APEX',
    };
    
    const results = await ranker.rankPatterns(signals, 3);
    
    // APEX patterns should have locality boost
    const apexPattern = results.find(r => r.id.startsWith('APEX'));
    expect(apexPattern).toBeDefined();
    expect(apexPattern!.explain.locality.points).toBeGreaterThan(0);
  });
  
  test('handles patterns without trust scores', async () => {
    const signals = {
      paths: [],
      languages: ['typescript'],
      frameworks: [],
    };
    
    const results = await ranker.rankPatterns(signals, 10);
    
    const noTrustPattern = results.find(r => r.id === 'TEST:NO_TRUST');
    expect(noTrustPattern).toBeDefined();
    expect(noTrustPattern!.explain.trust.wilson).toBeGreaterThan(0); // Should have default
  });
});