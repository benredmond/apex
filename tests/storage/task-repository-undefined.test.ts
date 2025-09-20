/**
 * Tests for TaskRepository undefined parameter handling
 * Tests that would have caught the SQLite binding error with undefined parameters
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskRepository } from '../../src/storage/repositories/task-repository.js';
import type { Task } from '../../src/schemas/task/types.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('TaskRepository Undefined Parameter Handling', () => {
  let db: Database.Database;
  let taskRepo: TaskRepository;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for database
    tempDir = path.join(os.tmpdir(), `apex-undefined-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Create database with file backing
    const dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);

    // Create full schema as in production
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        intent TEXT,
        task_type TEXT,
        status TEXT DEFAULT 'active',
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
        phase TEXT DEFAULT 'ARCHITECT',
        phase_handoffs TEXT,
        confidence REAL DEFAULT 0.3,
        files_touched TEXT,
        patterns_used TEXT,
        errors_encountered TEXT,
        claims TEXT,
        prior_impls TEXT,
        failure_corpus TEXT,
        policy TEXT,
        assumptions TEXT,
        outcome TEXT,
        reflection_id TEXT,
        key_learning TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tags TEXT
      )
    `);

    // Create other required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_similarity (
        task_a TEXT NOT NULL,
        task_b TEXT NOT NULL,
        similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
        calculation_method TEXT,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_a, task_b),
        CHECK (task_a < task_b)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        message TEXT NOT NULL,
        confidence REAL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    taskRepo = new TaskRepository(db);
  });

  afterEach(async () => {
    db.close();
    await fs.remove(tempDir);
  });

  describe('undefined identifier handling', () => {
    it('should handle undefined identifier without SQLite binding error', () => {
      // This test would have caught the original bug where undefined
      // values cannot be bound to SQLite parameters
      const task = taskRepo.create({
        intent: 'Fix mobile sidebar sessions not scrollable issue',
        identifier: undefined, // Explicitly pass undefined
        task_type: 'bug'
      }, {
        tl_dr: 'Fix mobile sidebar sessions not scrollable issue',
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: ''
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.identifier).toBeNull(); // Should be null in database, not undefined
      expect(task.intent).toBe('Fix mobile sidebar sessions not scrollable issue');
      expect(task.task_type).toBe('bug');

      // Verify database storage
      const row = db.prepare('SELECT identifier FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.identifier).toBeNull(); // SQLite NULL, not undefined
    });

    it('should handle missing optional parameters', () => {
      // Test with minimal required parameters only
      const task = taskRepo.create({
        intent: 'Add dark mode toggle to settings page'
        // identifier is optional and not provided (will be undefined in JS object)
        // task_type is optional and not provided
        // tags is optional and not provided
      }, {
        tl_dr: 'Add dark mode toggle',
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: ''
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.identifier).toBeNull(); // Should be null, not undefined
      expect(task.intent).toBe('Add dark mode toggle to settings page');
      expect(task.task_type).toBe('feature'); // Should use default

      // Verify in database
      const row = db.prepare('SELECT identifier, task_type FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.identifier).toBeNull();
      expect(row.task_type).toBe('feature');
    });

    it('should handle all optional parameters as undefined', () => {
      // Explicitly test all optional parameters as undefined
      const task = taskRepo.create({
        intent: 'Test with all undefined optional params',
        identifier: undefined,
        task_type: undefined,
        tags: undefined
      }, {
        tl_dr: 'Test brief',
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: ''
      });

      expect(task).toBeDefined();
      expect(task.identifier).toBeNull();
      expect(task.task_type).toBe('feature'); // Should use default
      expect(task.tags).toBeUndefined();

      // Verify database storage
      const row = db.prepare('SELECT identifier, task_type, tags FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.identifier).toBeNull(); // SQLite NULL, not undefined
      expect(row.task_type).toBe('feature');
      expect(row.tags).toBeNull(); // NULL when no tags
    });

    it('should handle valid identifier correctly', () => {
      // Test with actual identifier value
      const task = taskRepo.create({
        intent: 'Fix API timeout issue',
        identifier: 'API-123',
        task_type: 'bug'
      }, {
        tl_dr: 'Fix API timeout',
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: ''
      });

      expect(task).toBeDefined();
      expect(task.identifier).toBe('API-123');
      expect(task.task_type).toBe('bug');

      // Verify in database
      const row = db.prepare('SELECT identifier FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.identifier).toBe('API-123');
    });

    it('should handle null identifier correctly', () => {
      // Test explicit null (different from undefined)
      const task = taskRepo.create({
        intent: 'Implement user authentication',
        identifier: null as any, // Explicit null
        task_type: 'feature'
      }, {
        tl_dr: 'Implement auth',
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: ''
      });

      expect(task).toBeDefined();
      expect(task.identifier).toBeNull();

      const row = db.prepare('SELECT identifier FROM tasks WHERE id = ?').get(task.id) as any;
      expect(row.identifier).toBeNull();
    });
  });

  describe('regression prevention', () => {
    it('should never pass undefined to SQLite parameters', () => {
      // This test ensures the fix stays in place
      const testCases = [
        { identifier: undefined, intent: 'Test 1' },
        { identifier: undefined, intent: undefined },
        { identifier: null, intent: 'Test 2' },
        { identifier: 'ID-1', intent: 'Test 3' },
        { intent: 'Test 4' }, // identifier not in object at all
      ];

      for (const testCase of testCases) {
        // None of these should throw SQLite binding errors
        expect(() => {
          taskRepo.create(testCase as any, {
            tl_dr: 'Test',
            objectives: [],
            constraints: [],
            acceptance_criteria: [],
            plan: [],
            facts: [],
            snippets: [],
            risks_and_gotchas: [],
            open_questions: [],
            test_scaffold: ''
          });
        }).not.toThrow(/cannot be bound to SQLite parameter/);
      }
    });
  });
});