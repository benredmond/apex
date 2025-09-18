/**
 * Test that AutoMigrator creates all required tables including task_evidence
 * 
 * NOTE: These tests are temporarily skipped due to a "module is already linked" error
 * when importing AutoMigrator. This is a known issue with Jest's experimental VM modules
 * and how they handle ESM module linking. The AutoMigrator functionality is tested
 * in integration tests which run in separate processes to avoid this issue.
 * 
 * TODO: Resolve module linking issue or refactor tests to use subprocess approach
 * like tests/integration/database-tables.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import os from "os";
// With Vitest, ESM module linking works properly
import { AutoMigrator } from "../../src/migrations/auto-migrator.js";

describe("AutoMigrator Table Creation", () => {
  let tempDir;
  let testDbPath;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-tables-test-"));
    testDbPath = path.join(tempDir, "test.db");
  });
  
  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it("should create task_evidence table for fresh database", async () => {
    // Run migrations on fresh database
    const migrator = new AutoMigrator(testDbPath);
    const success = await migrator.autoMigrate({ silent: true });
    
    expect(success).toBe(true);
    
    // Check database has task_evidence table
    const db = new Database(testDbPath, { readonly: true });
    
    try {
      // Get all table names
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `).all();
      
      const tableNames = tables.map(t => t.name);
      
      // Must have task_evidence table
      expect(tableNames).toContain("task_evidence");
      
      // Verify table structure
      const columns = db.prepare(`
        PRAGMA table_info(task_evidence)
      `).all();
      
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("task_id");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("content");
      expect(columnNames).toContain("metadata");
      expect(columnNames).toContain("timestamp");
      
      // Verify we can insert
      db.close();
      const dbWrite = new Database(testDbPath);
      
      const stmt = dbWrite.prepare(`
        INSERT INTO task_evidence (task_id, type, content, metadata, timestamp)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);
      
      // Should not throw
      dbWrite
        .prepare(
          `INSERT INTO tasks (id, title) VALUES (?, ?)`
        )
        .run("test-task", "Test Task");

      expect(() => {
        stmt.run("test-task", "file", "test content", "{}");
      }).not.toThrow();
      
      dbWrite.close();
    } catch (error) {
      db.close();
      throw error;
    }
  });

  it("should add task_evidence to existing database missing it", async () => {
    // Start with current schema then simulate missing table by removing migration 7 artefacts
    const initialMigrator = new AutoMigrator(testDbPath);
    await initialMigrator.autoMigrate({ silent: true });

    const db = new Database(testDbPath);

    db.exec(`
      DROP TABLE IF EXISTS task_evidence;
      DROP INDEX IF EXISTS idx_evidence_task;
      DROP INDEX IF EXISTS idx_evidence_task_type;
      DROP INDEX IF EXISTS idx_evidence_timestamp;
      DELETE FROM migration_versions WHERE version = 7;
      DELETE FROM migrations WHERE version = 7;
    `);

    db.close();

    // Run migrations again - should reapply migration 007
    const migrator = new AutoMigrator(testDbPath);
    const success = await migrator.autoMigrate({ silent: true });
    
    expect(success).toBe(true);
    
    // Check task_evidence now exists
    const dbAfter = new Database(testDbPath, { readonly: true });
    
    const tablesAfter = dbAfter.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name='task_evidence'
    `).get();
    expect(tablesAfter.count).toBe(1);
    
    dbAfter.close();
  });

  it("should close database connection after autoMigrate", async () => {
    const migrator = new AutoMigrator(testDbPath);
    await migrator.autoMigrate({ silent: true });
    
    // Should be able to open database (connection was closed)
    let db;
    expect(() => {
      db = new Database(testDbPath);
    }).not.toThrow();
    
    if (db) {
      // Should be able to query
      const result = db.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
      expect(result.count).toBe(0);
      db.close();
    }
  });
});
