/**
 * Tests for task system database schema migration
 */

// [BUILD:MODULE:ESM] ★★★☆☆ - ES module pattern
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { migration } from "../../src/migrations/006-add-task-system-schema.js";

describe("Migration 006: Add Task System Schema", () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    // [PAT:TEST:MIGRATION] ★★★★☆ - Test migrations with temp database
    tempDir = mkdtempSync(join(tmpdir(), "apex-test-"));
    db = new Database(join(tempDir, "test.db"));
    
    // Initialize with migration_versions table
    db.exec(`
      CREATE TABLE migration_versions (
        version INTEGER PRIMARY KEY,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        execution_time_ms INTEGER,
        rolled_back INTEGER DEFAULT 0,
        rolled_back_at TEXT
      )
    `);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("up migration", () => {
    it("should create all required tables", () => {
      // Run migration
      migration.up(db);

      // Check tasks table exists
      const tasksTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
        )
        .get();
      expect(tasksTable).toBeDefined();

      // Check task_files table exists
      const taskFilesTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='task_files'",
        )
        .get();
      expect(taskFilesTable).toBeDefined();

      // Check task_similarity table exists
      const taskSimilarityTable = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='task_similarity'",
        )
        .get();
      expect(taskSimilarityTable).toBeDefined();
    });

    it("should create all required columns in tasks table", () => {
      migration.up(db);

      const columns = db.pragma("table_info(tasks)") as any[];
      const columnNames = columns.map((col) => col.name);

      // Check core columns
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("identifier");
      expect(columnNames).toContain("title");
      expect(columnNames).toContain("task_type");
      expect(columnNames).toContain("status");
      
      // Check Task Brief columns
      expect(columnNames).toContain("tl_dr");
      expect(columnNames).toContain("objectives");
      expect(columnNames).toContain("acceptance_criteria");
      expect(columnNames).toContain("plan");
      
      // Check execution tracking columns
      expect(columnNames).toContain("phase");
      expect(columnNames).toContain("phase_handoffs");
      expect(columnNames).toContain("confidence");
      
      // Check evidence collection columns
      expect(columnNames).toContain("files_touched");
      expect(columnNames).toContain("patterns_used");
      
      // Check result columns
      expect(columnNames).toContain("outcome");
      expect(columnNames).toContain("reflection_id");
      expect(columnNames).toContain("duration_ms");
      
      // Check timestamps
      expect(columnNames).toContain("created_at");
      expect(columnNames).toContain("completed_at");
    });

    it("should create all required indexes", () => {
      migration.up(db);

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as any[];
      const indexNames = indexes.map((idx) => idx.name);

      // Check task indexes
      expect(indexNames).toContain("idx_tasks_status");
      expect(indexNames).toContain("idx_tasks_type");
      expect(indexNames).toContain("idx_tasks_phase");
      expect(indexNames).toContain("idx_tasks_created");
      expect(indexNames).toContain("idx_tasks_outcome");
      expect(indexNames).toContain("idx_tasks_identifier");
      expect(indexNames).toContain("idx_tasks_status_phase");
      expect(indexNames).toContain("idx_tasks_type_outcome");
      
      // Check file tracking indexes
      expect(indexNames).toContain("idx_task_files_task");
      expect(indexNames).toContain("idx_task_files_path");
      expect(indexNames).toContain("idx_task_files_timestamp");
      
      // Check similarity indexes
      expect(indexNames).toContain("idx_similarity_task_a");
      expect(indexNames).toContain("idx_similarity_task_b");
      expect(indexNames).toContain("idx_similarity_score");
    });

    it("should handle duplicate migration gracefully", () => {
      // Run migration twice
      migration.up(db);
      expect(() => migration.up(db)).not.toThrow();
      
      // Should still have only one tasks table
      const tables = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='tasks'",
        )
        .get() as any;
      expect(tables.count).toBe(1);
    });

    it("should support JSON storage in task fields", () => {
      migration.up(db);

      const testData = {
        id: "T001",
        title: "Test Task",
        objectives: JSON.stringify(["Objective 1", "Objective 2"]),
        plan: JSON.stringify([
          { step: 1, action: "Design", files: ["file1.ts"] },
          { step: 2, action: "Build", files: ["file2.ts"] },
        ]),
        patterns_used: JSON.stringify(["PAT:TEST:1", "PAT:TEST:2"]),
      };

      // Insert test data
      db.prepare(
        "INSERT INTO tasks (id, title, objectives, plan, patterns_used) VALUES (?, ?, ?, ?, ?)",
      ).run(
        testData.id,
        testData.title,
        testData.objectives,
        testData.plan,
        testData.patterns_used,
      );

      // Query and verify
      const result = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get(testData.id) as any;
      
      expect(result.id).toBe(testData.id);
      expect(JSON.parse(result.objectives)).toEqual(["Objective 1", "Objective 2"]);
      expect(JSON.parse(result.plan)).toHaveLength(2);
      expect(JSON.parse(result.patterns_used)).toEqual(["PAT:TEST:1", "PAT:TEST:2"]);
    });
  });

  describe("down migration", () => {
    it("should remove all tables and indexes", () => {
      // First run up migration
      migration.up(db);
      
      // Verify tables exist
      let tables = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('tasks', 'task_files', 'task_similarity')",
        )
        .get() as any;
      expect(tables.count).toBe(3);
      
      // Run down migration
      migration.down(db);
      
      // Verify tables are removed
      tables = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('tasks', 'task_files', 'task_similarity')",
        )
        .get() as any;
      expect(tables.count).toBe(0);
      
      // Verify indexes are removed
      const indexes = db
        .prepare(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tasks%' OR name LIKE 'idx_task_%' OR name LIKE 'idx_similarity%'",
        )
        .get() as any;
      expect(indexes.count).toBe(0);
    });
  });

  describe("validation", () => {
    it("should pass validation after successful migration", () => {
      migration.up(db);
      const isValid = migration.validate!(db);
      expect(isValid).toBe(true);
    });

    it("should fail validation if tables are missing", () => {
      // Don't run migration
      const isValid = migration.validate!(db);
      expect(isValid).toBe(false);
    });

    it("should fail validation if indexes are missing", () => {
      migration.up(db);
      // Drop an index
      db.exec("DROP INDEX idx_tasks_status");
      const isValid = migration.validate!(db);
      expect(isValid).toBe(false);
    });
  });

  describe("performance", () => {
    it("should meet query performance targets", () => {
      migration.up(db);
      
      // Insert test data
      const stmt = db.prepare(
        "INSERT INTO tasks (id, title, task_type, status, phase) VALUES (?, ?, ?, ?, ?)",
      );
      
      for (let i = 1; i <= 1000; i++) {
        stmt.run(`T${i.toString().padStart(3, "0")}`, `Task ${i}`, "feature", "active", "BUILDER");
      }
      
      // Test query performance
      const start = Date.now();
      
      // Query by status and phase (uses composite index)
      db.prepare("SELECT * FROM tasks WHERE status = ? AND phase = ?")
        .all("active", "BUILDER");
      
      // Query by type and outcome
      db.prepare("SELECT * FROM tasks WHERE task_type = ?")
        .all("feature");
      
      // Query recent tasks
      db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10")
        .all();
      
      const duration = Date.now() - start;
      
      // Should complete within 1500ms target
      expect(duration).toBeLessThan(1500);
    });
  });
});