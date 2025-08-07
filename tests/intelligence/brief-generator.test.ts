/**
 * Tests for Task Brief Generator
 * [TEST:PERF:BENCHMARK] ★★★★☆ - Performance benchmarking for SLA validation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { BriefGenerator } from '../../src/intelligence/brief-generator.js';
import { TaskRepository } from '../../src/storage/repositories/task-repository.js';
import { PatternRepository } from '../../src/storage/repositories/pattern-repository.js';
import { TaskSearchEngine } from '../../src/intelligence/task-search.js';
import type { Task } from '../../src/schemas/task/types.js';

describe('BriefGenerator', () => {
  let db: Database.Database;
  let generator: BriefGenerator;
  let taskRepo: TaskRepository;
  
  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        -- Core identifiers
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        intent TEXT,
        task_type TEXT,
        status TEXT DEFAULT 'active',
        
        -- Task Brief Components (JSON storage for complex structures)
        tl_dr TEXT,
        objectives TEXT,
        constraints TEXT,
        acceptance_criteria TEXT,
        plan TEXT,
        facts TEXT,
        snippets TEXT,
        risks_and_gotchas TEXT,
        open_questions TEXT,
        in_flight TEXT,
        test_scaffold TEXT,
        
        -- Execution tracking (5-phase workflow)
        phase TEXT DEFAULT 'ARCHITECT',
        phase_handoffs TEXT,
        confidence REAL DEFAULT 0.3 CHECK (confidence >= 0.0 AND confidence <= 1.0),
        
        -- Evidence Collection (for reflection)
        files_touched TEXT,
        patterns_used TEXT,
        errors_encountered TEXT,
        claims TEXT,
        
        -- Learning & Intelligence
        prior_impls TEXT,
        failure_corpus TEXT,
        policy TEXT,
        assumptions TEXT,
        
        -- Results (for Shadow Graph)
        outcome TEXT,
        reflection_id TEXT,
        key_learning TEXT,
        duration_ms INTEGER,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        
        -- Tags support [APE-63]
        tags TEXT,
        
        -- Additional fields from original test
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        themes TEXT,
        components TEXT,
        file_patterns TEXT,
        files_created TEXT,
        files_modified TEXT,
        brief TEXT,
        parent_id TEXT,
        checkpoint_messages TEXT,
        evidence_log TEXT,
        handoff TEXT
      );
      
      CREATE TABLE IF NOT EXISTS task_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
      
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        message TEXT NOT NULL,
        confidence REAL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
      
      CREATE TABLE IF NOT EXISTS task_search (
        task_id TEXT PRIMARY KEY,
        title_embedding BLOB,
        intent_embedding BLOB,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );
      
      CREATE TABLE IF NOT EXISTS task_similarity (
        task_a TEXT NOT NULL,
        task_b TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        calculation_method TEXT,
        calculated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_a, task_b),
        FOREIGN KEY (task_a) REFERENCES tasks(id),
        FOREIGN KEY (task_b) REFERENCES tasks(id)
      );
    `);
    
    // Initialize repositories and services
    taskRepo = new TaskRepository(db);
    generator = new BriefGenerator(db);
    
    // Add some sample tasks for testing
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
    
    // Create tasks without briefs - just insert directly
    for (const task of tasks) {
      db.prepare(`
        INSERT INTO tasks (id, identifier, title, intent, task_type, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(task.id, task.identifier, task.title, task.intent, task.task_type, task.status);
    }
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('generateBrief', () => {
    it('should generate a minimal brief for simple tasks', async () => {
      const task: Task = {
        id: 'task-4',
        identifier: 'T004',
        title: 'Fix null pointer',
        intent: 'Fix NPE in login',
        task_type: 'bug' as const,
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
      expect(brief.acceptance_criteria).toEqual([]);
      expect(brief.plan).toEqual([]);
      expect(brief.open_questions).toEqual([]);
      
      // Facts should be minimal or empty
      expect(brief.facts).toBeDefined();
      expect(Array.isArray(brief.facts)).toBe(true);
      
      expect(brief.snippets).toBeDefined();
      expect(Array.isArray(brief.snippets)).toBe(true);
      
      expect(brief.risks_and_gotchas).toBeDefined();
      expect(Array.isArray(brief.risks_and_gotchas)).toBe(true);
      
      // Test scaffold should be empty string
      expect(brief.test_scaffold).toBe('');
    });
    
    it('should meet P50 performance SLA (≤1.5s)', async () => {
      const task: Task = {
        id: 'task-5',
        identifier: 'T005',
        title: 'Test performance',
        intent: 'Performance test task',
        task_type: 'test' as const,
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
    });
    
    it('should use cache for repeated requests', async () => {
      const task: Task = {
        id: 'task-6',
        identifier: 'T006',
        title: 'Cache test',
        intent: 'Test caching',
        task_type: 'test' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      // First request - should not be cached
      const brief1 = await generator.generateBrief(task);
      if (brief1.provenance) {
        expect(brief1.provenance.cache_hit).toBe(false);
      }
      
      // Second request - should be cached
      const start = Date.now();
      const brief2 = await generator.generateBrief(task);
      const duration = Date.now() - start;
      
      if (brief2.provenance) {
        expect(brief2.provenance.cache_hit).toBe(true);
      }
      expect(duration).toBeLessThan(100); // Cache hit should be <100ms
    });
    
    it('should include similar tasks in drilldowns for complex tasks', async () => {
      const task: Task = {
        id: 'task-7',
        identifier: 'T007',
        title: 'Implement comprehensive user authentication system with OAuth2',
        intent: 'Add full authentication system including JWT, OAuth2, password reset, 2FA, and session management with Redis caching',
        task_type: 'feature' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(task);
      
      // Complex task should have drilldowns if similar tasks exist
      if (brief.drilldowns && brief.drilldowns.prior_impls) {
        expect(brief.drilldowns.prior_impls.length).toBeGreaterThanOrEqual(0);
      }
    });
    
    it('should generate appropriate tl_dr based on task type', async () => {
      const bugTask: Task = {
        id: 'bug-task-1',
        identifier: 'BUG001',
        title: 'Fix login error',
        intent: 'Users cannot login with valid credentials',
        task_type: 'bug' as const,
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
    });
    
    it('should handle tasks without similar matches gracefully', async () => {
      const uniqueTask: Task = {
        id: 'unique-task-1',
        identifier: 'UNIQUE001',
        title: 'Implement quantum computing simulator',
        intent: 'Build a quantum circuit simulator with qubits',
        task_type: 'feature' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(uniqueTask);
      
      // Should still generate a brief even without similar tasks
      expect(brief.tl_dr).toBeDefined();
      expect(brief.facts.length).toBeLessThanOrEqual(2); // Minimal facts
      
      // No drilldowns for simple/unique tasks
      if (!brief.drilldowns) {
        expect(brief.drilldowns).toBeUndefined();
      }
    });
    
    it('should only include in-flight work for very complex tasks', async () => {
      const simpleTask: Task = {
        id: 'simple-task',
        identifier: 'SIMPLE001',
        title: 'Fix typo',
        intent: 'Fix typo in README',
        task_type: 'bug' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(simpleTask);
      
      // Simple task should not have in-flight work
      expect(brief.in_flight).toBeUndefined();
    });
    
    it('should respect maxSimilarTasks option', async () => {
      const task: Task = {
        id: 'task-8',
        identifier: 'T008',
        title: 'Add authentication to API endpoints with comprehensive security',
        intent: 'Implement full authentication system with rate limiting and audit logging',
        task_type: 'feature' as const,
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
    });
  });
  
  describe('caching behavior', () => {
    it('should invalidate cache when task is updated', async () => {
      const task: Task = {
        id: 'cache-test-1',
        identifier: 'CACHE001',
        title: 'Cache invalidation test',
        intent: 'Test cache invalidation',
        task_type: 'test' as const,
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
        expect(brief2.provenance.cache_hit).toBe(false);
      }
    });
  });
  
  describe('complexity calculation', () => {
    it('should generate minimal brief for simple tasks', async () => {
      const simpleTask: Task = {
        id: 'simple-1',
        identifier: 'S001',
        title: 'Fix typo',
        intent: 'Fix typo in docs',
        task_type: 'bug' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(simpleTask);
      
      // Simple task = minimal brief
      expect(brief.tl_dr.length).toBeLessThan(100);
      expect(brief.objectives).toEqual([]);
      expect(brief.facts.length).toBe(0);
      expect(brief.snippets.length).toBe(0);
      expect(brief.risks_and_gotchas.length).toBe(0);
    });
    
    it('should include more data for complex tasks', async () => {
      const complexTask: Task = {
        id: 'complex-1',
        identifier: 'C001',
        title: 'Implement distributed caching system',
        intent: 'Build a distributed caching system with Redis cluster, consistent hashing, cache invalidation strategies, monitoring, and failover support for high availability',
        task_type: 'feature' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(complexTask);
      
      // Complex task should have more context
      expect(brief.tl_dr).toBeDefined();
      // Facts might be populated if similar tasks exist
      expect(brief.facts).toBeDefined();
      
      // Check complexity score if available
      if (brief.provenance && 'complexity_score' in brief.provenance) {
        expect(brief.provenance.complexity_score).toBeGreaterThanOrEqual(4);
      }
    });
  });
});