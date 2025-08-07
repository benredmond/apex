/**
 * Migration tests for 010-add-task-tags
 * [APE-63] Multi-Dimensional Pattern Tagging System
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { migration } from '../../src/migrations/migrations/010-add-task-tags.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Migration 010: Add Task Tags', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for database files
    tempDir = path.join(os.tmpdir(), `apex-migration-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Create database
    const dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    
    // Create base tasks table without tags column
    db.exec(`
      CREATE TABLE tasks (
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
        completed_at TIMESTAMP
      )
    `);
    
    // Add some test data
    db.prepare(`
      INSERT INTO tasks (id, title, status) 
      VALUES (?, ?, ?)
    `).run('test-task-1', 'Test Task 1', 'active');
    
    db.prepare(`
      INSERT INTO tasks (id, title, status) 
      VALUES (?, ?, ?)
    `).run('test-task-2', 'Test Task 2', 'completed');
  });

  afterEach(async () => {
    db.close();
    await fs.remove(tempDir);
  });

  describe('up migration', () => {
    it('should add tags column to tasks table', () => {
      // Verify column doesn't exist initially
      let columns = db.pragma('table_info(tasks)').map((col: any) => col.name);
      expect(columns).not.toContain('tags');
      
      // Run migration
      migration.up(db);
      
      // Verify column was added
      columns = db.pragma('table_info(tasks)').map((col: any) => col.name);
      expect(columns).toContain('tags');
    });

    it('should create index on tags column', () => {
      // Run migration
      migration.up(db);
      
      // Verify index exists
      const index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_tags'"
      ).get();
      
      expect(index).toBeTruthy();
    });

    it('should be idempotent (can run multiple times)', () => {
      // Run migration multiple times
      expect(() => migration.up(db)).not.toThrow();
      expect(() => migration.up(db)).not.toThrow();
      expect(() => migration.up(db)).not.toThrow();
      
      // Verify still only one tags column
      const columns = db.pragma('table_info(tasks)').map((col: any) => col.name);
      const tagColumns = columns.filter((name: string) => name === 'tags');
      expect(tagColumns).toHaveLength(1);
    });

    it('should preserve existing data', () => {
      // Get count before migration
      const countBefore = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as any;
      
      // Run migration
      migration.up(db);
      
      // Verify data still exists
      const countAfter = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as any;
      expect(countAfter.count).toBe(countBefore.count);
      
      // Verify specific tasks still exist
      const task1 = db.prepare('SELECT * FROM tasks WHERE id = ?').get('test-task-1') as any;
      expect(task1).toBeTruthy();
      expect(task1.title).toBe('Test Task 1');
      expect(task1.tags).toBeNull(); // Should be null for existing rows
    });

    it('should allow storing JSON tags after migration', () => {
      // Run migration
      migration.up(db);
      
      // Insert task with tags
      const tags = JSON.stringify(['api', 'test', 'migration']);
      db.prepare(`
        INSERT INTO tasks (id, title, tags) 
        VALUES (?, ?, ?)
      `).run('new-task', 'Task with tags', tags);
      
      // Retrieve and verify
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('new-task') as any;
      expect(task.tags).toBe(tags);
      
      // Verify can parse back to array
      const parsedTags = JSON.parse(task.tags);
      expect(parsedTags).toEqual(['api', 'test', 'migration']);
    });

    it('should handle NULL tags correctly', () => {
      // Run migration
      migration.up(db);
      
      // Insert task without tags
      db.prepare(`
        INSERT INTO tasks (id, title) 
        VALUES (?, ?)
      `).run('no-tags-task', 'Task without tags');
      
      // Retrieve and verify
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('no-tags-task') as any;
      expect(task.tags).toBeNull();
    });
  });

  describe('down migration', () => {
    it('should drop the index', () => {
      // Run up migration first
      migration.up(db);
      
      // Verify index exists
      let index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_tags'"
      ).get();
      expect(index).toBeTruthy();
      
      // Run down migration
      migration.down(db);
      
      // Verify index is gone
      index = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_tags'"
      ).get();
      expect(index).toBeFalsy();
    });

    it('should note that column remains for safety', () => {
      // Run up migration
      migration.up(db);
      
      // Run down migration
      migration.down(db);
      
      // Column should still exist (SQLite limitation)
      const columns = db.pragma('table_info(tasks)').map((col: any) => col.name);
      expect(columns).toContain('tags');
    });
  });

  describe('validate', () => {
    it('should return false when tags column is missing', () => {
      // Before migration
      const isValid = migration.validate(db);
      expect(isValid).toBe(false);
    });

    it('should return true after successful migration', () => {
      // Run migration
      migration.up(db);
      
      // Should be valid
      const isValid = migration.validate(db);
      expect(isValid).toBe(true);
    });

    it('should validate tags storage and retrieval', () => {
      // Run migration
      migration.up(db);
      
      // Validation should test insert and query
      const isValid = migration.validate(db);
      expect(isValid).toBe(true);
      
      // Verify test data was cleaned up
      const testTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get('TEST_TAGS_001') as any;
      expect(testTask).toBeFalsy();
    });

    it('should return false if index is missing', () => {
      // Run migration
      migration.up(db);
      
      // Drop index manually
      db.exec('DROP INDEX IF EXISTS idx_tasks_tags');
      
      // Should be invalid
      const isValid = migration.validate(db);
      expect(isValid).toBe(false);
    });

    it('should measure validation performance', () => {
      // Run migration
      migration.up(db);
      
      // Measure validation time
      const start = Date.now();
      const isValid = migration.validate(db);
      const duration = Date.now() - start;
      
      expect(isValid).toBe(true);
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });

  describe('migration metadata', () => {
    it('should have correct metadata', () => {
      expect(migration.id).toBe('010-add-task-tags');
      expect(migration.version).toBe(10);
      expect(migration.name).toBe('Add tags column to tasks table');
    });

    it('should have all required functions', () => {
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
      expect(typeof migration.validate).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle empty database', () => {
      // Create empty database
      const emptyDb = new Database(':memory:');
      
      // Create just the tasks table
      emptyDb.exec(`
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL
        )
      `);
      
      // Should run successfully
      expect(() => migration.up(emptyDb)).not.toThrow();
      
      // Should be valid
      expect(migration.validate(emptyDb)).toBe(true);
      
      emptyDb.close();
    });

    it('should handle large tag arrays', () => {
      // Run migration
      migration.up(db);
      
      // Create large tag array
      const largeTags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
      const tagsJson = JSON.stringify(largeTags);
      
      // Should store successfully
      db.prepare(`
        INSERT INTO tasks (id, title, tags) 
        VALUES (?, ?, ?)
      `).run('large-tags', 'Task with many tags', tagsJson);
      
      // Should retrieve successfully
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('large-tags') as any;
      const parsed = JSON.parse(task.tags);
      expect(parsed).toHaveLength(100);
    });

    it('should handle special characters in tags', () => {
      // Run migration
      migration.up(db);
      
      // Tags with special characters
      const specialTags = ['test-tag', 'under_score', '123numbers', 'CamelCase'];
      const tagsJson = JSON.stringify(specialTags);
      
      // Should store and retrieve correctly
      db.prepare(`
        INSERT INTO tasks (id, title, tags) 
        VALUES (?, ?, ?)
      `).run('special-tags', 'Task with special tags', tagsJson);
      
      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get('special-tags') as any;
      const parsed = JSON.parse(task.tags);
      expect(parsed).toEqual(specialTags);
    });

    it('should work with transactions', () => {
      // Run migration in transaction
      const migrationTx = db.transaction(() => {
        migration.up(db);
      });
      
      expect(() => migrationTx()).not.toThrow();
      
      // Verify migration succeeded
      const columns = db.pragma('table_info(tasks)').map((col: any) => col.name);
      expect(columns).toContain('tags');
    });
  });

  describe('performance benchmarks', () => {
    it('should complete migration quickly for large tables', () => {
      // Insert many tasks
      const insertStmt = db.prepare('INSERT INTO tasks (id, title) VALUES (?, ?)');
      const insertMany = db.transaction((tasks: any[]) => {
        for (const task of tasks) {
          insertStmt.run(task.id, task.title);
        }
      });
      
      const tasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`
      }));
      insertMany(tasks);
      
      // Measure migration time
      const start = Date.now();
      migration.up(db);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Verify all tasks still exist
      const count = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as any;
      expect(count.count).toBe(1002); // 1000 + 2 from beforeEach
    });

    it('should query tags efficiently after migration', () => {
      // Run migration
      migration.up(db);
      
      // Insert tasks with tags
      const insertStmt = db.prepare('INSERT INTO tasks (id, title, tags) VALUES (?, ?, ?)');
      for (let i = 0; i < 1000; i++) {
        const tags = JSON.stringify([`tag${i % 10}`, 'common']);
        insertStmt.run(`tagged-${i}`, `Tagged Task ${i}`, tags);
      }
      
      // Measure query performance
      const start = Date.now();
      const results = db.prepare(
        "SELECT * FROM tasks WHERE tags LIKE ?"
      ).all('%tag5%');
      const duration = Date.now() - start;
      
      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should be fast with index
    });
  });
});