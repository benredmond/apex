import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PackBuilder } from '../../src/ranking/pack-builder';
import { PatternRepository } from '../../src/storage/repository';
import { Pattern } from '../../src/schemas/pattern/base';
import { RankedPattern } from '../../src/ranking/types';

// Mock the repository
jest.mock('../../src/storage/repository');

describe('PackBuilder', () => {
  let builder: PackBuilder;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      get: jest.fn(),
      search: jest.fn(),
    };
    builder = new PackBuilder(mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should create an empty pack for no patterns', async () => {
      const result = await builder.buildPatternPack('Test task', []);
      
      expect(result.pack).toMatchObject({
        task: 'Test task',
        candidates: [],
        anti_patterns: [],
        policies: [],
        tests: [],
        meta: {
          total_ranked: 0,
          considered: 0,
          included: 0,
          budget_bytes: 8192,
        },
      });
      
      expect(result.bytes).toBeLessThan(200); // Small empty structure
    });

    it('should include high-scoring candidates', async () => {
      const patterns = createMockPatterns([
        { id: 'PAT:HIGH:1', score: 95, type: 'CODEBASE' },
        { id: 'PAT:HIGH:2', score: 85, type: 'LANG' },
        { id: 'PAT:LOW:1', score: 70, type: 'CODEBASE' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      // Should include all candidates when budget allows
      expect(result.pack.candidates).toHaveLength(3);
      // But high-scoring ones should be first
      expect(result.pack.candidates[0].score).toBeGreaterThanOrEqual(80);
      expect(result.pack.candidates[1].score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Priority order', () => {
    it('should always include POLICY patterns', async () => {
      const patterns = createMockPatterns([
        { id: 'POLICY:SEC:1', score: 60, type: 'POLICY' },
        { id: 'PAT:HIGH:1', score: 95, type: 'CODEBASE' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      expect(result.pack.policies).toHaveLength(1);
      expect(result.pack.policies[0].id).toBe('POLICY:SEC:1');
    });

    it('should respect quotas for different pattern types', async () => {
      const patterns = createMockPatterns([
        { id: 'PAT:1', score: 90, type: 'CODEBASE' },
        { id: 'PAT:2', score: 85, type: 'CODEBASE' },
        { id: 'PAT:3', score: 82, type: 'CODEBASE' },
        { id: 'PAT:4', score: 81, type: 'CODEBASE' },
        { id: 'ANTI:1', score: 70, type: 'ANTI' },
        { id: 'ANTI:2', score: 65, type: 'ANTI' },
        { id: 'TEST:1', score: 60, type: 'TEST' },
        { id: 'TEST:2', score: 55, type: 'TEST' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked, {
        topCandidatesQuota: 3,
        antisQuota: 1,
        testsQuota: 1,
      });
      
      // Should have max 3 top candidates (score >= 80)
      const topCandidates = result.pack.candidates.filter(c => c.score >= 80);
      expect(topCandidates.length).toBeLessThanOrEqual(3);
      
      // Should have max 1 anti-pattern
      expect(result.pack.anti_patterns.length).toBeLessThanOrEqual(1);
      
      // Should have max 1 test pattern
      expect(result.pack.tests.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Size budget management', () => {
    it('should respect the 8KB budget limit', async () => {
      // Create many patterns to exceed budget
      const patterns = Array.from({ length: 50 }, (_, i) => ({
        id: `PAT:LARGE:${i}`,
        score: 90 - i,
        type: 'CODEBASE' as const,
        summary: 'A'.repeat(200), // Long summary
        snippet: 'console.log("test");\n'.repeat(50), // Large snippet
      }));
      
      const mockPatterns = patterns.map(p => createMockPattern(p));
      
      mockRepository.get.mockImplementation(async (id) => 
        mockPatterns.find(mp => mp.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      expect(result.bytes).toBeLessThanOrEqual(8192);
      expect(result.pack.meta.bytes).toBeLessThanOrEqual(8192);
    });

    it('should perform snippet trimming when over budget', async () => {
      const largeSnippet = Array(30).fill('function test() { return true; }').join('\n');
      
      const patterns = createMockPatterns([
        {
          id: 'PAT:LARGE:1',
          score: 95,
          type: 'CODEBASE',
          snippet: largeSnippet,
        },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked, {
        budgetBytes: 1000, // Small budget to force trimming
        snippetLinesInit: 18,
        snippetLinesMin: 8,
      });
      
      const candidate = result.pack.candidates[0];
      expect(candidate.snippet).toBeDefined();
      
      const snippetLines = candidate.snippet!.code.split('\n').length;
      expect(snippetLines).toBeLessThanOrEqual(18);
    });
  });

  describe('Deduplication', () => {
    it('should not include duplicate pattern IDs', async () => {
      const patterns = createMockPatterns([
        { id: 'PAT:DUP:1', score: 95, type: 'CODEBASE' },
        { id: 'PAT:DUP:1', score: 90, type: 'CODEBASE' }, // Duplicate
        { id: 'PAT:UNIQUE:1', score: 85, type: 'LANG' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      const allIds = result.pack.candidates.map(c => c.id);
      const uniqueIds = new Set(allIds);
      
      expect(allIds.length).toBe(uniqueIds.size);
      expect(allIds.filter(id => id === 'PAT:DUP:1').length).toBe(1); // Should only appear once
    });

    it('should not duplicate referenced patterns in separate lists', async () => {
      const patterns = createMockPatterns([
        {
          id: 'PAT:REF:1',
          score: 90,
          type: 'CODEBASE',
          notes: 'Uses [ANTI:SEC:1] and [TEST:UNIT:1]',
        },
        { id: 'ANTI:SEC:1', score: 70, type: 'ANTI' },
        { id: 'TEST:UNIT:1', score: 60, type: 'TEST' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      // Should track references but include in lists if space allows
      expect(result.pack.candidates).toHaveLength(1);
      expect(result.pack.candidates[0].anti_refs).toContain('ANTI:SEC:1');
      expect(result.pack.candidates[0].test_refs).toContain('TEST:UNIT:1');
    });
  });

  describe('Debug mode', () => {
    it('should include explanations when debug is enabled', async () => {
      const patterns = createMockPatterns([
        { id: 'PAT:DEBUG:1', score: 95, type: 'CODEBASE' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked, {
        debug: true,
      });
      
      expect(result.pack.meta.explain).toBe(true);
      expect(result.pack.meta.reasons).toBeDefined();
      expect(result.pack.meta.reasons!.length).toBeGreaterThan(0);
      expect(result.pack.meta.reasons![0]).toHaveProperty('id');
      expect(result.pack.meta.reasons![0]).toHaveProperty('score');
    });
  });

  describe('Compression metrics', () => {
    it('should provide gzip metrics', async () => {
      const patterns = createMockPatterns([
        { id: 'PAT:GZIP:1', score: 95, type: 'CODEBASE' },
      ]);
      
      mockRepository.get.mockImplementation(async (id) => 
        patterns.find(p => p.pattern.id === id)?.pattern || null
      );

      const ranked = patterns.map(p => ({
        id: p.pattern.id,
        score: p.score,
        explain: {} as any,
      }));

      const result = await builder.buildPatternPack('Test task', ranked);
      
      expect(result.gzipBytes).toBeDefined();
      expect(result.gzipBytes!).toBeLessThan(result.bytes);
    });
  });

  // Helper functions
  function createMockPatterns(specs: Array<{
    id: string;
    score: number;
    type: string;
    summary?: string;
    snippet?: string;
    content?: string;
    notes?: string;
  }>) {
    return specs.map(spec => createMockPattern(spec));
  }

  function createMockPattern(spec: {
    id: string;
    score: number;
    type: string;
    summary?: string;
    snippet?: string;
    content?: string;
    notes?: string;
  }) {
    const pattern: Pattern = {
      id: spec.id,
      type: spec.type as any,
      summary: spec.summary || `Summary for ${spec.id}`,
      notes: spec.notes || spec.content,
      updated_at: new Date().toISOString(),
      snippets: spec.snippet ? [{
        language: 'javascript',
        code: spec.snippet,
        reference: 'test.js:L1-L10',
      }] : [],
    } as Pattern;

    return {
      pattern,
      score: spec.score,
      id: spec.id,
      explain: {} as any,
    };
  }
});