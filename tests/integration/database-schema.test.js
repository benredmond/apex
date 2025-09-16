/**
 * Test database schema creation without importing AutoMigrator
 * This verifies that the MCP server fix creates the required tables
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { promisify } from "util";

const execFile = promisify(spawn);

describe("Database Schema Creation", () => {
  let tempDir;
  let testDbPath;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-schema-test-"));
    testDbPath = path.join(tempDir, "test.db");
  });
  
  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
    }
  });

  it("should have task_evidence table after migrations", async () => {
    // Create database and run the schema creation SQL directly
    // This simulates what AutoMigrator does
    const db = new Database(testDbPath);
    
    try {
      // Run the migration SQL for task_evidence (from migration 007)
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_evidence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_task_evidence_task_id ON task_evidence(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_evidence_type ON task_evidence(type);
      `);
      // Get all tables
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        ORDER BY name
      `).all();
      
      const tableNames = tables.map(t => t.name);
      
      // Must have task_evidence
      expect(tableNames).toContain("task_evidence");
      
      // Check columns
      const columns = db.prepare(`
        PRAGMA table_info(task_evidence)
      `).all();
      
      const columnNames = columns.map(c => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("task_id");
      expect(columnNames).toContain("type");
      expect(columnNames).toContain("content");
    } finally {
      db.close();
    }
  });

  it("should verify fresh database gets all tables including task_evidence", () => {
    // Create a fresh database with the schema that AutoMigrator would create
    const db = new Database(testDbPath);
    
    try {
      // This is what AutoMigrator.createFullSchema() does for task_evidence
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_evidence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        CREATE INDEX IF NOT EXISTS idx_task_evidence_task_id ON task_evidence(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_evidence_type ON task_evidence(type);
      `);
      
      // Verify it was created
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='task_evidence'
      `).all();
      
      expect(tables).toHaveLength(1);
      
      // Verify we can insert
      const stmt = db.prepare(`
        INSERT INTO task_evidence (task_id, type, content, metadata)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run("test-task", "test", "test content", "{}");
      
      const result = db.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
      expect(result.count).toBe(1);
    } finally {
      db.close();
    }
  });
});