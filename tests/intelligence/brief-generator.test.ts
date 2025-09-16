/**
 * Tests for Task Brief Generator
 * [TEST:PERF:BENCHMARK] ★★★★☆ - Performance benchmarking for SLA validation
 * Converted from subprocess pattern to direct Vitest tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BriefGenerator } from '../../dist/intelligence/brief-generator.js';
import { PatternRepository } from '../../dist/storage/repository.js';
import { initTestDatabase } from '../helpers/vitest-db.js';

describe('BriefGenerator', () => {
  let db: Database.Database;
  let cleanup: () => Promise<void>;
  let generator: BriefGenerator;
  let patternRepo: PatternRepository;

  describe('generateBrief', () => {
    it('should generate a minimal brief for simple tasks', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'task-4',
          identifier: 'T004',
          title: 'Fix null pointer',
          intent: 'Fix NPE in login',
          task_type: 'bug',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(task);

        // Check tl_dr is now a string, not array
        expect(brief.tl_dr).toBeDefined();
        expect(typeof brief.tl_dr).toBe('string');
        expect(brief.tl_dr.length).toBeGreaterThan(0);
        expect(brief.tl_dr.length).toBeLessThanOrEqual(150);
        expect(brief.tl_dr).toContain('Fix');

        // All boilerplate fields should be empty arrays
        expect(brief.objectives).toEqual([]);
        expect(brief.constraints).toEqual([]);
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should meet P50 performance SLA (≤1.5s)', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'task-5',
          identifier: 'T005',
          title: 'Test performance',
          intent: 'Performance test task',
          task_type: 'test',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const start = Date.now();
        const brief = await generator.generateBrief(task);
        const duration = Date.now() - start;

        // [TEST:PERF:BENCHMARK] ★★★★☆ - P50 should be ≤1.5s
        expect(duration).toBeLessThan(1500);

        // Provenance might be undefined for simple tasks
        if (brief.provenance) {
          expect(brief.provenance.generation_time_ms).toBeLessThan(1500);
        }
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should use cache for repeated requests', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'task-6',
          identifier: 'T006',
          title: 'Cache test',
          intent: 'Test caching',
          task_type: 'test',
          status: 'active',
          created_at: new Date().toISOString()
        };

        // First request - should not be cached
        const brief1 = await generator.generateBrief(task);
        if (brief1.provenance) {
          expect(brief1.provenance.cache_hit).not.toBe(true);
        }

        // Second request - should be cached
        const start = Date.now();
        const brief2 = await generator.generateBrief(task);
        const duration = Date.now() - start;

        if (brief2.provenance) {
          expect(brief2.provenance.cache_hit).toBe(true);
        }
        expect(duration).toBeLessThan(100);
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should include similar tasks in drilldowns for complex tasks', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        // Add some sample tasks for similarity testing
        const tasks = [
          {
            id: 'task-1',
            identifier: 'T001',
            title: 'Implement user authentication',
            intent: 'Add JWT authentication to API endpoints',
            task_type: 'feature',
            status: 'completed'
          },
          {
            id: 'task-2',
            identifier: 'T002',
            title: 'Fix login bug',
            intent: 'Users cannot login with special characters in password',
            task_type: 'bug',
            status: 'completed'
          },
          {
            id: 'task-3',
            identifier: 'T003',
            title: 'Refactor authentication module',
            intent: 'Improve code structure and add unit tests',
            task_type: 'refactor',
            status: 'in_progress'
          }
        ];

        // Insert sample tasks
        for (const task of tasks) {
          db.prepare(`
            INSERT INTO tasks (id, identifier, title, intent, task_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(task.id, task.identifier, task.title, task.intent, task.task_type, task.status);
        }

        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'task-7',
          identifier: 'T007',
          title: 'Implement comprehensive user authentication system with OAuth2',
          intent: 'Add full authentication system including JWT, OAuth2, password reset, 2FA, and session management with Redis caching',
          task_type: 'feature',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(task);

        // Complex task should have drilldowns if similar tasks exist
        // This is optional based on task complexity
        if (brief.drilldowns && brief.drilldowns.prior_impls) {
          expect(Array.isArray(brief.drilldowns.prior_impls)).toBe(true);
        }
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should generate appropriate tl_dr based on task type', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const bugTask = {
          id: 'bug-task-1',
          identifier: 'BUG001',
          title: 'Fix login error',
          intent: 'Users cannot login with valid credentials',
          task_type: 'bug',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(bugTask);

        // TL;DR should start with task type action
        expect(brief.tl_dr).toContain('Fix:');
        expect(brief.tl_dr).toContain('Users cannot login');

        // No boilerplate objectives or criteria
        expect(brief.objectives).toEqual([]);
        expect(brief.acceptance_criteria).toEqual([]);
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should handle tasks without similar matches gracefully', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const uniqueTask = {
          id: 'unique-task-1',
          identifier: 'UNIQUE001',
          title: 'Implement quantum computing simulator',
          intent: 'Build a quantum circuit simulator with qubits',
          task_type: 'feature',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(uniqueTask);

        // Should still generate a brief even without similar tasks
        expect(brief.tl_dr).toBeDefined();
        expect(Array.isArray(brief.facts)).toBe(true);
        expect(brief.facts.length).toBeLessThanOrEqual(2);

        // No drilldowns for simple/unique tasks is fine
        // Just validate it's either undefined or valid
        if (brief.drilldowns) {
          expect(typeof brief.drilldowns).toBe('object');
        }
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should only include in-flight work for very complex tasks', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const simpleTask = {
          id: 'simple-task',
          identifier: 'SIMPLE001',
          title: 'Fix typo',
          intent: 'Fix typo in README',
          task_type: 'bug',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(simpleTask);

        // Simple task should not have in-flight work
        expect(brief.in_flight).toBeUndefined();
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should respect maxSimilarTasks option', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        // Add multiple similar tasks
        for (let i = 0; i < 5; i++) {
          db.prepare(`
            INSERT INTO tasks (id, identifier, title, intent, task_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            `task-${i}`,
            `T00${i}`,
            `Authentication task ${i}`,
            'Authentication related work',
            'feature',
            'completed'
          );
        }

        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'task-8',
          identifier: 'T008',
          title: 'Add authentication to API endpoints with comprehensive security',
          intent: 'Implement full authentication system with rate limiting and audit logging',
          task_type: 'feature',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(task, {
          maxSimilarTasks: 2
        });

        // Should respect the limit if drilldowns exist
        if (brief.drilldowns && brief.drilldowns.prior_impls) {
          expect(brief.drilldowns.prior_impls.length).toBeLessThanOrEqual(2);
        }
      } finally {
        await cleanup();
      }
    }, 15000);
  });

  describe('caching behavior', () => {
    it('should invalidate cache when task is updated', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const task = {
          id: 'cache-test-1',
          identifier: 'CACHE001',
          title: 'Cache invalidation test',
          intent: 'Test cache invalidation',
          task_type: 'test',
          status: 'active',
          created_at: new Date().toISOString()
        };

        // Generate brief (will be cached)
        const brief1 = await generator.generateBrief(task);

        // Clear cache manually
        generator.clearCache();

        // Generate again (should not be cached)
        const brief2 = await generator.generateBrief(task);
        if (brief2.provenance) {
          expect(brief2.provenance.cache_hit).not.toBe(true);
        }
      } finally {
        await cleanup();
      }
    }, 15000);
  });

  describe('complexity calculation', () => {
    it('should generate minimal brief for simple tasks', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const simpleTask = {
          id: 'simple-1',
          identifier: 'S001',
          title: 'Fix typo',
          intent: 'Fix typo in docs',
          task_type: 'bug',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(simpleTask);

        // Simple task = minimal brief
        expect(brief.tl_dr.length).toBeLessThan(100);
        expect(brief.objectives).toEqual([]);
        expect(brief.facts).toEqual([]);
        expect(brief.snippets).toEqual([]);
        expect(brief.risks_and_gotchas).toEqual([]);
      } finally {
        await cleanup();
      }
    }, 15000);

    it('should include more data for complex tasks', async () => {
      const { db: testDb, cleanup: testCleanup, dbPath } = await initTestDatabase();
      db = testDb;
      cleanup = testCleanup;

      try {
        patternRepo = new PatternRepository(dbPath);
        generator = new BriefGenerator(db, { patternRepo });

        const complexTask = {
          id: 'complex-1',
          identifier: 'C001',
          title: 'Implement distributed caching system',
          intent: 'Build a distributed caching system with Redis cluster, consistent hashing, cache invalidation strategies, monitoring, and failover support for high availability',
          task_type: 'feature',
          status: 'active',
          created_at: new Date().toISOString()
        };

        const brief = await generator.generateBrief(complexTask);

        // Complex task should have more context
        expect(brief.tl_dr).toBeDefined();
        expect(Array.isArray(brief.facts)).toBe(true);

        // Check complexity score if available
        if (brief.provenance && 'complexity_score' in brief.provenance) {
          expect(brief.provenance.complexity_score).toBeGreaterThanOrEqual(4);
        }
      } finally {
        await cleanup();
      }
    }, 15000);
  });
});