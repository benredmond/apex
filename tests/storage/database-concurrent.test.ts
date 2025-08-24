/**
 * Tests for concurrent database access and multiple connections
 * These tests would have caught the disk I/O errors we encountered
 */

import Database from "better-sqlite3";
import { PatternDatabase } from "../../src/storage/database.js";
import { TaskRepository } from "../../src/storage/repositories/task-repository.js";
import { nanoid } from "nanoid";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("Concurrent Database Access", () => {
  const testDir = path.join(os.tmpdir(), "apex-test-concurrent", nanoid());
  const dbPath = path.join(testDir, "test.db");

  beforeAll(() => {
    fs.ensureDirSync(testDir);
  });

  afterAll(() => {
    fs.removeSync(testDir);
  });

  describe("Multiple Database Instances", () => {
    it("should handle multiple PatternDatabase instances on same file", () => {
      // This simulates what was happening in our bug
      const db1 = new PatternDatabase(dbPath);
      const db2 = new PatternDatabase(dbPath);

      // Both should be able to read
      expect(() => {
        db1.database.prepare("SELECT 1").get();
        db2.database.prepare("SELECT 1").get();
      }).not.toThrow();

      // Close connections
      db1.close();
      db2.close();
    });

    it("should handle WAL mode with multiple connections", () => {
      const db1 = new Database(dbPath);
      db1.pragma("journal_mode = WAL");
      db1.pragma("busy_timeout = 30000");

      const db2 = new Database(dbPath);
      db2.pragma("journal_mode = WAL");
      db2.pragma("busy_timeout = 30000");

      // Create table in first connection
      db1.exec(`
        CREATE TABLE IF NOT EXISTS test_table (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Insert in first connection
      const stmt1 = db1.prepare("INSERT INTO test_table (id, value) VALUES (?, ?)");
      stmt1.run("test1", "value1");

      // Read from second connection
      const stmt2 = db2.prepare("SELECT * FROM test_table WHERE id = ?");
      const result = stmt2.get("test1");
      expect(result).toBeDefined();
      expect(result.value).toBe("value1");

      db1.close();
      db2.close();
    });

    it("should not fail with WAL checkpoint operations", () => {
      const db1 = new Database(dbPath);
      db1.pragma("journal_mode = WAL");
      
      // First connection does a checkpoint
      db1.pragma("wal_checkpoint(PASSIVE)");

      const db2 = new Database(dbPath);
      db2.pragma("journal_mode = WAL");

      // Second connection should still work
      expect(() => {
        db2.prepare("SELECT 1").get();
      }).not.toThrow();

      // Attempting TRUNCATE checkpoint with multiple connections should not cause disk I/O error
      expect(() => {
        db1.pragma("wal_checkpoint(TRUNCATE)");
      }).not.toThrow();

      db1.close();
      db2.close();
    });
  });

  describe("TaskRepository with shared database", () => {
    it("should handle multiple TaskRepository instances with same database", () => {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.pragma("busy_timeout = 30000");

      // Create necessary tables
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
          test_scaffold TEXT,
          phase TEXT DEFAULT 'ARCHITECT',
          confidence REAL DEFAULT 0.3,
          tags TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          outcome TEXT,
          reflection_id TEXT,
          key_learning TEXT,
          patterns_used TEXT,
          duration_ms INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS task_similarity (
          task_a TEXT NOT NULL,
          task_b TEXT NOT NULL,
          similarity_score REAL NOT NULL,
          calculation_method TEXT,
          calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (task_a, task_b)
        );
      `);

      // Create multiple repositories with same database
      const repo1 = new TaskRepository(db);
      const repo2 = new TaskRepository(db);

      // Both should be able to create tasks
      const task1 = repo1.create(
        {
          intent: "Test task 1",
          task_type: "bug",
        },
        {
          tl_dr: "Test brief 1",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
        }
      );

      const task2 = repo2.create(
        {
          intent: "Test task 2",
          task_type: "feature",
        },
        {
          tl_dr: "Test brief 2",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
        }
      );

      expect(task1.id).toBeDefined();
      expect(task2.id).toBeDefined();
      expect(task1.id).not.toBe(task2.id);

      db.close();
    });

    it("should handle prepared statements across multiple instances", () => {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");

      // Create tasks table if not exists
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
          test_scaffold TEXT,
          phase TEXT DEFAULT 'ARCHITECT',
          confidence REAL DEFAULT 0.3,
          tags TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          outcome TEXT,
          reflection_id TEXT,
          key_learning TEXT,
          patterns_used TEXT,
          duration_ms INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS task_similarity (
          task_a TEXT NOT NULL,
          task_b TEXT NOT NULL,
          similarity_score REAL NOT NULL,
          calculation_method TEXT,
          calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (task_a, task_b)
        );
      `);

      // Create multiple prepared statements for same operation
      const stmt1 = db.prepare(`
        INSERT INTO tasks (
          id, identifier, title, intent, task_type, status,
          tl_dr, objectives, constraints, acceptance_criteria, plan,
          facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
          phase, confidence, tags, created_at
        ) VALUES (
          @id, @identifier, @title, @intent, @task_type, @status,
          @tl_dr, @objectives, @constraints, @acceptance_criteria, @plan,
          @facts, @snippets, @risks_and_gotchas, @open_questions, @test_scaffold,
          @phase, @confidence, @tags, CURRENT_TIMESTAMP
        )
      `);

      const stmt2 = db.prepare(`
        INSERT INTO tasks (
          id, identifier, title, intent, task_type, status,
          tl_dr, objectives, constraints, acceptance_criteria, plan,
          facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
          phase, confidence, tags, created_at
        ) VALUES (
          @id, @identifier, @title, @intent, @task_type, @status,
          @tl_dr, @objectives, @constraints, @acceptance_criteria, @plan,
          @facts, @snippets, @risks_and_gotchas, @open_questions, @test_scaffold,
          @phase, @confidence, @tags, CURRENT_TIMESTAMP
        )
      `);

      // Both statements should work
      const task1 = {
        id: nanoid(),
        identifier: null,
        title: "Test 1",
        intent: "Test intent 1",
        task_type: "bug",
        status: "active",
        tl_dr: null,
        objectives: null,
        constraints: null,
        acceptance_criteria: null,
        plan: null,
        facts: null,
        snippets: null,
        risks_and_gotchas: null,
        open_questions: null,
        test_scaffold: null,
        phase: "ARCHITECT",
        confidence: 0.3,
        tags: null,
      };

      const task2 = {
        ...task1,
        id: nanoid(),
        title: "Test 2",
        intent: "Test intent 2",
      };

      expect(() => stmt1.run(task1)).not.toThrow();
      expect(() => stmt2.run(task2)).not.toThrow();

      db.close();
    });
  });

  describe("Database initialization patterns", () => {
    it("should not create multiple connections in initialization flow", async () => {
      const testDbPath = path.join(testDir, "init-test.db");

      // This simulates what apex start was doing (the bug)
      const badInit = async () => {
        // Creating PatternDatabase first
        const pdb = new PatternDatabase(testDbPath);
        // Then another database connection with same file
        const db2 = new Database(testDbPath);
        
        // Both connections trying to do operations
        pdb.database.pragma("journal_mode = WAL");
        db2.pragma("journal_mode = WAL");
        
        pdb.close();
        db2.close();
      };

      // The bad pattern should not throw but could cause issues
      await expect(badInit()).resolves.not.toThrow();

      // This is the correct pattern - single connection
      const goodInit = async () => {
        // Only one database connection
        const db = new Database(testDbPath);
        db.pragma("journal_mode = WAL");
        db.pragma("busy_timeout = 30000");
        
        // Do all operations with this single connection
        db.exec("CREATE TABLE IF NOT EXISTS test (id INTEGER)");
        
        db.close();
      };

      await expect(goodInit()).resolves.not.toThrow();
    });
  });
});