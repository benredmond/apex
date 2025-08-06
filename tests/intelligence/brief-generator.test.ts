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
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        description TEXT,
        intent TEXT,
        task_type TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        
        -- Brief components (stored as JSON strings)
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
        
        -- Execution tracking
        phase TEXT DEFAULT 'ARCHITECT',
        phase_handoffs TEXT,
        confidence REAL DEFAULT 0.3,
        
        -- Evidence Collection
        files_touched TEXT,
        patterns_used TEXT,
        errors_encountered TEXT,
        claims TEXT,
        
        -- Learning & Intelligence
        prior_impls TEXT,
        failure_corpus TEXT,
        policy TEXT,
        assumptions TEXT,
        
        -- Results
        outcome TEXT,
        reflection_id TEXT,
        key_learning TEXT,
        duration_ms INTEGER,
        
        -- Additional fields
        tags TEXT,
        updated_at TEXT,
        
        -- Timestamps
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );
      
      CREATE TABLE IF NOT EXISTS task_similarity (
        task_a TEXT NOT NULL,
        task_b TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        calculation_method TEXT,
        calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_a, task_b)
      );
      
      CREATE TABLE IF NOT EXISTS patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL DEFAULT '1.0',
        pattern_version   TEXT NOT NULL DEFAULT '1.0',
        type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL DEFAULT '',
        trust_score       REAL NOT NULL CHECK (trust_score >= 0.0 AND trust_score <= 1.0) DEFAULT 0.5,
        created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        source_repo       TEXT,
        tags_csv          TEXT,
        pattern_digest    TEXT NOT NULL DEFAULT '',
        json_canonical    BLOB NOT NULL DEFAULT '{}',
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT,
        alias             TEXT UNIQUE,
        tags              TEXT,
        keywords          TEXT,
        search_index      TEXT
      );
    `);
    
    // Initialize services
    taskRepo = new TaskRepository(db);
    
    // Create a mock PatternRepository for testing
    const mockPatternRepo = {
      search: async () => [],
      findByIds: async () => [],
      findHighTrust: async () => [],
    } as any;
    
    generator = new BriefGenerator(db, { patternRepo: mockPatternRepo });
    
    // Add sample data
    createSampleData();
  });
  
  afterEach(() => {
    db.close();
  });
  
  function createSampleData() {
    // Create sample tasks
    db.prepare(`
      INSERT INTO tasks (id, identifier, title, intent, task_type, status, outcome, tags, updated_at)
      VALUES 
        ('task-1', 'T001', 'Implement user authentication', 'Add JWT auth to the system', 'feature', 'completed', 'success', '["auth", "security"]', datetime('now', '-1 day')),
        ('task-2', 'T002', 'Fix login bug', 'Users cannot login properly', 'bug', 'completed', 'success', '["auth", "bug"]', datetime('now', '-2 days')),
        ('task-3', 'T003', 'Add caching layer', 'Implement Redis cache for performance', 'feature', 'active', NULL, '["cache", "performance"]', datetime('now'))
    `).run();
    
    // Create similarity scores
    db.prepare(`
      INSERT INTO task_similarity (task_a, task_b, similarity_score, calculation_method)
      VALUES 
        ('task-1', 'task-2', 0.85, 'multi-signal'),
        ('task-1', 'task-3', 0.45, 'multi-signal')
    `).run();
    
    // Create sample patterns
    db.prepare(`
      INSERT INTO patterns (id, type, title, summary, trust_score, pattern_digest, json_canonical)
      VALUES 
        ('PAT:AUTH:JWT', 'CODEBASE', 'JWT Authentication', 'Use secure JWT tokens for authentication', 0.95, 'jwt-auth-pattern', '{"type": "auth", "constraints": ["Use secure tokens"]}'),
        ('FIX:AUTH:SESSION', 'FAILURE', 'Fix Session Issues', 'Common session authentication fixes', 0.88, 'session-fix-pattern', '{"type": "fix", "domain": "auth"}')
    `).run();
  }
  
  describe('generateBrief', () => {
    it('should generate a PRD-compliant brief', async () => {
      const task: Task = {
        id: 'task-4',
        identifier: 'T004',
        title: 'Implement password reset',
        intent: 'Add password reset functionality',
        task_type: 'feature' as const,
        status: 'active',
        created_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(task);
      
      // Check all required fields exist
      expect(brief.tl_dr).toBeDefined();
      expect(Array.isArray(brief.tl_dr)).toBe(true);
      expect(brief.tl_dr.length).toBeGreaterThan(0);
      expect(brief.tl_dr.length).toBeLessThanOrEqual(5);
      
      expect(brief.objectives).toBeDefined();
      expect(Array.isArray(brief.objectives)).toBe(true);
      
      expect(brief.constraints).toBeDefined();
      expect(Array.isArray(brief.constraints)).toBe(true);
      
      expect(brief.acceptance_criteria).toBeDefined();
      expect(Array.isArray(brief.acceptance_criteria)).toBe(true);
      
      expect(brief.plan).toBeDefined();
      expect(Array.isArray(brief.plan)).toBe(true);
      expect(brief.plan.length).toBeGreaterThan(0);
      
      expect(brief.facts).toBeDefined();
      expect(Array.isArray(brief.facts)).toBe(true);
      
      expect(brief.snippets).toBeDefined();
      expect(Array.isArray(brief.snippets)).toBe(true);
      
      expect(brief.risks_and_gotchas).toBeDefined();
      expect(Array.isArray(brief.risks_and_gotchas)).toBe(true);
      
      expect(brief.open_questions).toBeDefined();
      expect(Array.isArray(brief.open_questions)).toBe(true);
      
      expect(brief.in_flight).toBeDefined();
      expect(Array.isArray(brief.in_flight)).toBe(true);
      
      expect(brief.test_scaffold).toBeDefined();
      expect(Array.isArray(brief.test_scaffold)).toBe(true);
      
      expect(brief.drilldowns).toBeDefined();
      expect(brief.drilldowns.prior_impls).toBeDefined();
      expect(brief.drilldowns.files).toBeDefined();
      
      expect(brief.provenance).toBeDefined();
      expect(brief.provenance.generated_at).toBeDefined();
      expect(brief.provenance.sources).toBeDefined();
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
      expect(brief.provenance.generation_time_ms).toBeLessThan(1500);
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
      expect(brief1.provenance.cache_hit).toBe(false);
      
      // Second request - should be cached
      const start = Date.now();
      const brief2 = await generator.generateBrief(task);
      const duration = Date.now() - start;
      
      expect(brief2.provenance.cache_hit).toBe(true);
      expect(duration).toBeLessThan(100); // Cache hit should be <100ms
    });
    
    it('should include similar tasks in drilldowns', async () => {
      const task: Task = {
        id: 'task-7',
        identifier: 'T007',
        title: 'Implement OAuth authentication',
        intent: 'Add OAuth support',
        task_type: 'feature' as const,
        status: 'open',
        tags: ['auth', 'security'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Save task first
      db.prepare(`
        INSERT INTO tasks (id, identifier, title, description, intent, task_type, status, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(task.id, task.identifier, task.title, task.intent, task.intent, task.task_type, task.status, JSON.stringify(task.tags));
      
      const brief = await generator.generateBrief(task);
      
      // Should find similar auth tasks
      expect(brief.drilldowns.prior_impls.length).toBeGreaterThan(0);
      expect(brief.drilldowns.prior_impls[0]).toContain('auth');
    });
    
    it('should populate type-specific objectives', async () => {
      // Test bug type
      const bugTask: Task = {
        id: 'task-8',
        identifier: 'T008',
        title: 'Fix memory leak',
        intent: 'Memory leak in cache layer',
        task_type: 'bug' as const,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const bugBrief = await generator.generateBrief(bugTask);
      expect(bugBrief.objectives).toContain('Identify and fix the root cause');
      expect(bugBrief.objectives).toContain('Add tests to prevent regression');
      
      // Test feature type
      const featureTask: Task = {
        id: 'task-9',
        identifier: 'T009',
        title: 'Add export functionality',
        intent: 'Export data to CSV',
        task_type: 'feature' as const,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const featureBrief = await generator.generateBrief(featureTask);
      expect(featureBrief.objectives).toContain('Design and implement new functionality');
      expect(featureBrief.objectives).toContain('Add comprehensive test coverage');
    });
    
    it('should handle tasks without similar matches gracefully', async () => {
      const uniqueTask: Task = {
        id: 'task-10',
        identifier: 'T010',
        title: 'Unique task with no similarities',
        intent: 'This task has no similar tasks',
        task_type: 'feature' as const,
        status: 'open',
        tags: ['unique', 'special'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(uniqueTask);
      
      // Should still generate a valid brief
      expect(brief).toBeDefined();
      expect(brief.tl_dr.length).toBeGreaterThan(0);
      expect(brief.objectives.length).toBeGreaterThan(0);
      expect(brief.plan.length).toBeGreaterThan(0);
    });
    
    it('should include in-flight work when requested', async () => {
      const task: Task = {
        id: 'task-11',
        identifier: 'T011',
        title: 'New feature',
        intent: 'Add new feature',
        task_type: 'feature' as const,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(task, {
        includeInFlight: true
      });
      
      // Should include the in-progress task (task-3)
      expect(brief.in_flight).toBeDefined();
      expect(Array.isArray(brief.in_flight)).toBe(true);
      // Note: May be empty if no in-flight work overlaps
    });
    
    it('should respect maxSimilarTasks option', async () => {
      const task: Task = {
        id: 'task-12',
        identifier: 'T012',
        title: 'Limited similar tasks',
        intent: 'Test limiting similar tasks',
        task_type: 'feature' as const,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const brief = await generator.generateBrief(task, {
        maxSimilarTasks: 2
      });
      
      // Should respect the limit
      expect(brief.drilldowns.prior_impls.length).toBeLessThanOrEqual(2);
    });
  });
  
  describe('caching behavior', () => {
    it('should invalidate cache when task is updated', async () => {
      const task: Task = {
        id: 'task-13',
        identifier: 'T013',
        title: 'Cache invalidation test',
        intent: 'Test cache invalidation',
        task_type: 'test' as const,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // First generation
      const brief1 = await generator.generateBrief(task);
      expect(brief1.provenance.cache_hit).toBe(false);
      
      // Update task (simulate change)
      task.updated_at = new Date(Date.now() + 1000).toISOString();
      
      // Should not use cache due to different updated_at
      const brief2 = await generator.generateBrief(task);
      expect(brief2.provenance.cache_hit).toBe(false);
    });
  });
});