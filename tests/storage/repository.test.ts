// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { PatternRepository, createPatternRepository } from '../../src/storage/index.js';

describe('PatternRepository', () => {
  let tempDir: string;
  let repository: PatternRepository;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `apex-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Create repository with test configuration
    repository = await createPatternRepository({
      dbPath: path.join(tempDir, 'test.db'),
      patternsDir: path.join(tempDir, 'patterns'),
      watchDebounce: 50, // Faster for tests
    });
  });

  afterEach(async () => {
    // Clean up
    await repository.shutdown();
    await fs.remove(tempDir);
  });

  describe('CRUD operations', () => {
    it('should create a pattern', async () => {
      const pattern = {
        id: 'TEST:CRUD:CREATE',
        schema_version: '0.3',
        pattern_version: '1.0.0',
        type: 'TEST' as const,
        title: 'Test Pattern',
        summary: 'A test pattern for CRUD operations',
        trust_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['test', 'crud'],
        pattern_digest: '',
        json_canonical: '',
      };

      const created = await repository.create(pattern);
      expect(created.id).toBe(pattern.id);
      
      // Verify it was saved
      const retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.title).toBe(pattern.title);
    });

    it('should update a pattern', async () => {
      const pattern = {
        id: 'TEST:CRUD:UPDATE',
        schema_version: '0.3',
        pattern_version: '1.0.0',
        type: 'TEST' as const,
        title: 'Original Title',
        summary: 'Original summary',
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['test'],
        pattern_digest: '',
        json_canonical: '',
      };

      await repository.create(pattern);
      
      const updated = await repository.update(pattern.id, {
        title: 'Updated Title',
        trust_score: 0.9,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.trust_score).toBe(0.9);
      expect(updated.summary).toBe('Original summary'); // Unchanged
    });

    it('should delete a pattern', async () => {
      const pattern = {
        id: 'TEST:CRUD:DELETE',
        schema_version: '0.3',
        pattern_version: '1.0.0',
        type: 'TEST' as const,
        title: 'To Delete',
        summary: 'This will be deleted',
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['test'],
        pattern_digest: '',
        json_canonical: '',
      };

      await repository.create(pattern);
      
      // Verify it exists
      let retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeTruthy();
      
      // Delete it
      await repository.delete(pattern.id);
      
      // Verify it's gone
      retrieved = await repository.get(pattern.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Query operations', () => {
    beforeEach(async () => {
      // Create test patterns
      const patterns = [
        {
          id: 'TEST:QUERY:JS1',
          type: 'LANG' as const,
          title: 'JavaScript Pattern 1',
          summary: 'Test pattern for JavaScript',
          tags: ['javascript', 'async'],
        },
        {
          id: 'TEST:QUERY:JS2',
          type: 'LANG' as const,
          title: 'JavaScript Pattern 2',
          summary: 'Another JS pattern',
          tags: ['javascript', 'promises'],
        },
        {
          id: 'TEST:QUERY:TS1',
          type: 'LANG' as const,
          title: 'TypeScript Pattern',
          summary: 'Pattern for TypeScript',
          tags: ['typescript', 'types'],
        },
        {
          id: 'TEST:QUERY:ANTI1',
          type: 'ANTI' as const,
          title: 'Anti-pattern Example',
          summary: 'What not to do',
          tags: ['antipattern'],
        },
      ];

      for (const p of patterns) {
        await repository.create({
          ...p,
          schema_version: '0.3',
          pattern_version: '1.0.0',
          trust_score: 0.8,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pattern_digest: '',
          json_canonical: '',
        });
      }
    });

    it('should lookup patterns by type', async () => {
      const result = await repository.lookup({
        type: ['LANG'],
      });

      expect(result.patterns.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.patterns.every(p => p.type === 'LANG')).toBe(true);
    });

    it('should search patterns by text', async () => {
      const results = await repository.search('JavaScript');
      
      expect(results.length).toBe(2);
      expect(results.every(p => p.title.includes('JavaScript'))).toBe(true);
    });

    it('should find patterns by facets', async () => {
      const results = await repository.findByFacets({
        type: 'LANG',
        tags: ['javascript'],
      });

      expect(results.length).toBe(2);
      expect(results.every(p => p.tags.includes('javascript'))).toBe(true);
    });
  });

  describe('File watching', () => {
    it('should detect new pattern files', async () => {
      const patternPath = path.join(tempDir, 'patterns', 'TEST_WATCH_NEW.yaml');
      const patternData = {
        id: 'TEST:WATCH:NEW',
        schema_version: '0.3',
        pattern_version: '1.0.0',
        type: 'TEST',
        title: 'Watch Test',
        summary: 'Testing file watching',
        trust_score: 0.5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['test', 'watch'],
      };

      // Write file after a delay to ensure watcher is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      await fs.writeFile(patternPath, JSON.stringify(patternData, null, 2));
      
      // Wait for file watcher to process
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const pattern = await repository.get('TEST:WATCH:NEW');
      expect(pattern).toBeTruthy();
      expect(pattern?.title).toBe('Watch Test');
    });
  });

  describe('Validation', () => {
    it('should validate patterns', async () => {
      // Create a valid pattern
      const validPath = path.join(tempDir, 'patterns', 'VALID.yaml');
      await fs.writeFile(validPath, JSON.stringify({
        id: 'TEST:VALID:PATTERN',
        schema_version: '0.3',
        pattern_version: '1.0.0',
        type: 'TEST',
        title: 'Valid Pattern',
        summary: 'This is valid',
        trust_score: 0.8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
      }, null, 2));

      // Create an invalid pattern
      const invalidPath = path.join(tempDir, 'patterns', 'INVALID.yaml');
      await fs.writeFile(invalidPath, JSON.stringify({
        id: 'TEST:INVALID:PATTERN',
        // Missing required fields
        type: 'INVALID_TYPE',
      }, null, 2));

      const results = await repository.validate();
      
      const valid = results.filter(r => r.valid);
      const invalid = results.filter(r => !r.valid);
      
      expect(valid.length).toBeGreaterThan(0);
      expect(invalid.length).toBeGreaterThan(0);
      expect(invalid[0].errors).toBeDefined();
    });
  });
});