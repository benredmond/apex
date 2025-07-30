/**
 * Integration tests for MCP tools
 * [PAT:TEST:INTEGRATION] ★★★☆☆ (2 uses) - End-to-end integration testing
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PatternRepository } from '../../../src/storage/repository.js';
import { initializeTools } from '../../../src/mcp/tools/index.js';
import { PatternLookupService } from '../../../src/mcp/tools/lookup.js';
import { ReflectionService } from '../../../src/mcp/tools/reflect.js';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('MCP Tools Integration', () => {
  let tempDir: string;
  let repository: PatternRepository;
  let lookupService: PatternLookupService;
  let reflectionService: ReflectionService;
  
  beforeAll(async () => {
    // Create temp directory
    tempDir = path.join(os.tmpdir(), `apex-tools-integration-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Initialize repository
    repository = new PatternRepository({
      dbPath: path.join(tempDir, 'test.db'),
      patternsDir: path.join(tempDir, 'patterns'),
    });
    await repository.initialize();
    
    // Create comprehensive test patterns
    await createComprehensiveTestPatterns(repository);
    
    // Initialize tools
    initializeTools(repository);
    
    // Create service instances
    lookupService = new PatternLookupService(repository);
    reflectionService = new ReflectionService(repository, path.join(tempDir, 'patterns.db'), {
      gitRepoPath: tempDir,
    });
  });
  
  afterAll(async () => {
    await repository.shutdown();
    await fs.remove(tempDir);
  });
  
  describe('End-to-End Pattern Lookup', () => {
    it('should handle complete lookup flow with caching', async () => {
      const request = {
        task: 'Implement secure user authentication with JWT tokens',
        task_intent: {
          type: 'feature' as const,
          confidence: 0.9,
          sub_type: 'security',
        },
        project_signals: {
          language: 'typescript',
          framework: 'express',
          test_framework: 'jest',
          dependencies: {
            'express': '^4.18.0',
            'jsonwebtoken': '^9.0.0',
          },
        },
      };
      
      // First request - cache miss
      const response1 = await lookupService.lookup(request);
      expect(response1.cache_hit).toBe(false);
      
      // Debug: Check what we got back
      if (response1.pattern_pack.candidates.length === 0) {
        console.log('No candidates returned. Debug info:');
        console.log('Task:', request.task);
        console.log('Total patterns in DB:', await repository.list({ k: 100 }).then(p => p.patterns.length));
      }
      
      expect(response1.pattern_pack.candidates.length).toBeGreaterThan(0);
      
      // Check if JWT pattern is ranked high
      const jwtPattern = response1.pattern_pack.candidates.find(c => c.id === 'PAT:AUTH:JWT');
      expect(jwtPattern).toBeDefined();
      expect(jwtPattern!.score).toBeGreaterThan(0.5);
      
      // Second request - should hit cache
      const response2 = await lookupService.lookup(request);
      expect(response2.cache_hit).toBe(true);
      expect(response2.pattern_pack).toEqual(response1.pattern_pack);
      expect(response2.latency_ms).toBeLessThan(response1.latency_ms);
    });
    
    it('should adapt recommendations based on session context', async () => {
      const baseRequest = {
        task: 'Add authentication to API endpoints',
        project_signals: {
          language: 'typescript',
          framework: 'express',
        },
      };
      
      // Request without session context
      const response1 = await lookupService.lookup(baseRequest);
      const initialPatterns = response1.pattern_pack.candidates.map(c => c.id);
      
      // Request with failed pattern in session
      const requestWithFailure = {
        ...baseRequest,
        session_context: {
          recent_patterns: [{
            pattern_id: 'PAT:AUTH:BASIC',
            success: false,
            timestamp: new Date().toISOString(),
          }],
          failed_patterns: ['PAT:AUTH:BASIC'],
        },
      };
      
      const response2 = await lookupService.lookup(requestWithFailure);
      const adaptedPatterns = response2.pattern_pack.candidates.map(c => c.id);
      
      // Should not recommend the failed pattern
      expect(adaptedPatterns).not.toContain('PAT:AUTH:BASIC');
      
      // Should still have other auth patterns
      expect(adaptedPatterns.some(p => p.startsWith('PAT:AUTH:'))).toBe(true);
    });
    
    it('should provide task-specific patterns based on intent', async () => {
      const testCases = [
        {
          intent: 'bug_fix' as const,
          task: 'Fix memory leak in authentication module',
          expectedPatterns: ['PAT:DEBUG:MEMORY', 'PAT:FIX:LEAK'],
        },
        {
          intent: 'test' as const,
          task: 'Write unit tests for user service',
          expectedPatterns: ['PAT:TEST:UNIT', 'PAT:TEST:MOCK'],
        },
        {
          intent: 'refactor' as const,
          task: 'Refactor authentication to use dependency injection',
          expectedPatterns: ['PAT:REFACTOR:DI', 'PAT:ARCH:CLEAN'],
        },
      ];
      
      for (const testCase of testCases) {
        const response = await lookupService.lookup({
          task: testCase.task,
          task_intent: {
            type: testCase.intent,
            confidence: 0.95,
          },
        });
        
        const patternIds = response.pattern_pack.candidates.map(c => c.id);
        
        // Should include relevant patterns for the task type
        for (const expectedPattern of testCase.expectedPatterns) {
          expect(patternIds).toContain(expectedPattern);
        }
      }
    });
  });
  
  describe('Pattern Reflection Integration', () => {
    it('should update trust scores based on usage', async () => {
      // Get initial trust score
      const initialLookup = await lookupService.lookup({
        task: 'Implement OAuth2 authentication',
      });
      
      const oauthPattern = initialLookup.pattern_pack.candidates.find(
        c => c.id === 'PAT:AUTH:OAUTH'
      );
      expect(oauthPattern).toBeDefined();
      const initialScore = oauthPattern!.trust;
      
      // Report successful usage
      const reflectResponse = await reflectionService.reflect({
        task: {
          id: 'T100',
          title: 'Implement OAuth2 authentication',
        },
        outcome: 'success',
        claims: {
          patterns_used: [{
            pattern_id: 'PAT:AUTH:OAUTH',
            evidence: ['Successfully implemented OAuth2 flow', 'All tests passing'],
          }],
          trust_updates: [{
            pattern_id: 'PAT:AUTH:OAUTH',
            delta: {
              alpha: 1,
              beta: 0,
            },
          }],
        },
        options: {
          dry_run: false,
        },
      });
      
      expect(reflectResponse.success).toBe(true);
      
      // Check if trust score improved in subsequent lookup
      const updatedLookup = await lookupService.lookup({
        task: 'Implement OAuth2 authentication',
      });
      
      const updatedPattern = updatedLookup.pattern_pack.candidates.find(
        c => c.id === 'PAT:AUTH:OAUTH'
      );
      expect(updatedPattern).toBeDefined();
      expect(updatedPattern!.trust).toBeGreaterThan(initialScore);
    });
  });
  
  describe('Performance and Concurrency', () => {
    it('should handle high concurrent load', async () => {
      const concurrentRequests = 50;
      const requests = Array.from({ length: concurrentRequests }, (_, i) => ({
        task: `Task ${i}: ${i % 2 === 0 ? 'Implement' : 'Fix'} feature ${i}`,
        project_signals: {
          language: i % 3 === 0 ? 'typescript' : i % 3 === 1 ? 'javascript' : 'python',
          framework: i % 2 === 0 ? 'express' : 'fastapi',
        },
      }));
      
      const startTime = Date.now();
      const responses = await Promise.all(
        requests.map(req => lookupService.lookup(req))
      );
      const duration = Date.now() - startTime;
      
      expect(responses).toHaveLength(concurrentRequests);
      
      // All responses should be valid
      responses.forEach(response => {
        expect(response.pattern_pack).toBeDefined();
        expect(response.request_id).toBeDefined();
        expect(response.latency_ms).toBeDefined();
      });
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds for 50 requests
      
      // Check cache effectiveness
      const cacheHits = responses.filter(r => r.cache_hit).length;
      console.log(`Cache hit rate: ${(cacheHits / concurrentRequests * 100).toFixed(2)}%`);
    });
  });
});

async function createComprehensiveTestPatterns(repository: PatternRepository): Promise<void> {
  const patterns = [
    // Authentication patterns
    { id: 'PAT:AUTH:JWT', type: 'CODEBASE', title: 'JWT Authentication', tags: ['auth', 'jwt', 'security'], trust_score: 0.85 },
    { id: 'PAT:AUTH:OAUTH', type: 'CODEBASE', title: 'OAuth2 Authentication', tags: ['auth', 'oauth', 'security'], trust_score: 0.9 },
    { id: 'PAT:AUTH:BASIC', type: 'CODEBASE', title: 'Basic Authentication', tags: ['auth', 'basic'], trust_score: 0.6 },
    
    // Testing patterns
    { id: 'PAT:TEST:UNIT', type: 'TEST', title: 'Unit Testing Pattern', tags: ['testing', 'unit'], trust_score: 0.95 },
    { id: 'PAT:TEST:MOCK', type: 'TEST', title: 'Mocking Pattern', tags: ['testing', 'mock'], trust_score: 0.88 },
    
    // Architecture patterns
    { id: 'PAT:ARCH:CLEAN', type: 'CODEBASE', title: 'Clean Architecture', tags: ['architecture', 'clean'], trust_score: 0.92 },
    { id: 'PAT:REFACTOR:DI', type: 'CODEBASE', title: 'Dependency Injection', tags: ['refactor', 'di'], trust_score: 0.87 },
    
    // Debug patterns
    { id: 'PAT:DEBUG:MEMORY', type: 'CODEBASE', title: 'Memory Debugging', tags: ['debug', 'memory'], trust_score: 0.8 },
    { id: 'PAT:FIX:LEAK', type: 'CODEBASE', title: 'Memory Leak Fix', tags: ['fix', 'memory', 'leak'], trust_score: 0.75 },
  ];
  
  for (const pattern of patterns) {
    await repository.create({
      ...pattern,
      type: pattern.type as any,
      summary: `${pattern.title} best practices and implementation`,
      schema_version: '1.0.0',
      pattern_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pattern_digest: `digest-${pattern.id}`,
      json_canonical: JSON.stringify(pattern),
    });
  }
}