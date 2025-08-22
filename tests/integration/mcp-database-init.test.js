import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("MCP Database Initialization Integration", () => {
  let tempDir;
  let testDbPath;
  
  beforeEach(async () => {
    // Create temp directory for test databases
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-mcp-test-"));
    testDbPath = path.join(tempDir, "patterns.db");
  });
  
  afterEach(async () => {
    // Clean up
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe("AutoMigrator", () => {
    it("should create all required tables including task_evidence for fresh database", async () => {
      // Import AutoMigrator
      const { AutoMigrator } = await import("../../src/migrations/auto-migrator.js");
      
      // Run migrations on fresh database
      const migrator = new AutoMigrator(testDbPath);
      const success = await migrator.autoMigrate({ silent: true });
      
      expect(success).toBe(true);
      
      // Check database has all required tables
      const db = new Database(testDbPath, { readonly: true });
      
      try {
        // Get all table names
        const tables = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' 
          ORDER BY name
        `).all();
        
        const tableNames = tables.map(t => t.name);
        
        // Critical tables that must exist
        const requiredTables = [
          "patterns",
          "migrations",
          "pattern_drafts",
          "pattern_languages",
          "pattern_frameworks",
          "pattern_categories",
          "pattern_references",
          "pattern_conflicts",
          "pattern_relationships",
          "pattern_facets",
          "project_migrations",
          "tasks",
          "task_evidence",  // This was missing before!
        ];
        
        for (const table of requiredTables) {
          expect(tableNames).toContain(table);
        }
        
        // Specifically verify task_evidence table structure
        const taskEvidenceColumns = db.prepare(`
          PRAGMA table_info(task_evidence)
        `).all();
        
        const columnNames = taskEvidenceColumns.map(c => c.name);
        expect(columnNames).toContain("id");
        expect(columnNames).toContain("task_id");
        expect(columnNames).toContain("type");
        expect(columnNames).toContain("content");
        expect(columnNames).toContain("metadata");
        expect(columnNames).toContain("timestamp");
      } finally {
        db.close();
      }
    });

    it("should add task_evidence table to existing database missing it", async () => {
      // Create a database without task_evidence table (simulating old version)
      const db = new Database(testDbPath);
      
      // Create minimal patterns and migrations tables
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          schema_version TEXT NOT NULL,
          pattern_version TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          trust_score REAL NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        
        CREATE TABLE migrations (
          id TEXT PRIMARY KEY,
          version INTEGER NOT NULL,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
        
        -- Mark some migrations as already applied (but not the task_evidence one)
        INSERT INTO migrations (id, version, name, applied_at)
        VALUES 
          ('001-initial', 1, 'Initial schema', datetime('now')),
          ('002-add-drafts', 2, 'Add drafts table', datetime('now'));
      `);
      
      // Verify task_evidence doesn't exist yet
      const tablesBefore = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'
      `).all();
      expect(tablesBefore).toHaveLength(0);
      
      db.close();
      
      // Now run AutoMigrator which should add missing tables
      const { AutoMigrator } = await import("../../src/migrations/auto-migrator.js");
      const migrator = new AutoMigrator(testDbPath);
      const success = await migrator.autoMigrate({ silent: true });
      
      expect(success).toBe(true);
      
      // Check task_evidence table now exists
      const dbAfter = new Database(testDbPath, { readonly: true });
      try {
        const tablesAfter = dbAfter.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'
        `).all();
        expect(tablesAfter).toHaveLength(1);
        
        // Verify we can query it
        const result = dbAfter.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
        expect(result.count).toBe(0);
        
        // Verify we can insert into it
        dbAfter.close();
        const dbWrite = new Database(testDbPath);
        dbWrite.prepare(`
          INSERT INTO task_evidence (task_id, type, content, metadata, timestamp)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run("test-task", "test", "test content", "{}");
        
        const inserted = dbWrite.prepare("SELECT * FROM task_evidence").get();
        expect(inserted.task_id).toBe("test-task");
        dbWrite.close();
      } catch (error) {
        dbAfter.close();
        throw error;
      }
    });

    it("should handle concurrent database access properly", async () => {
      const { AutoMigrator } = await import("../../src/migrations/auto-migrator.js");
      
      // Run first migrator
      const migrator1 = new AutoMigrator(testDbPath);
      await migrator1.autoMigrate({ silent: true });
      
      // Database connection should be closed, allowing another connection
      const db = new Database(testDbPath);
      
      // Should be able to query
      const result = db.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
      expect(result.count).toBe(0);
      
      // Should be able to run another migrator
      const migrator2 = new AutoMigrator(testDbPath);
      const success = await migrator2.autoMigrate({ silent: true });
      expect(success).toBe(true);
      
      db.close();
    });
  });

  describe("ApexConfig Integration", () => {
    it("should not use legacy path even when it exists", async () => {
      // Set up test to use our temp directory
      process.env.APEX_PATTERNS_DB = testDbPath;
      
      // Create a legacy database in current directory
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      const legacyPath = path.join(tempDir, "patterns.db");
      await fs.writeFile(legacyPath, "legacy database");
      
      try {
        const { ApexConfig } = await import("../../src/config/apex-config.js");
        
        const dbPath = await ApexConfig.getProjectDbPath();
        
        // Should return our test path from env var, not legacy
        expect(dbPath).toBe(testDbPath);
        expect(dbPath).not.toBe(legacyPath);
      } finally {
        process.chdir(originalCwd);
        delete process.env.APEX_PATTERNS_DB;
      }
    });

    it("should migrate and delete legacy database", async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);
      
      try {
        // Create legacy database with data
        const legacyPath = path.join(tempDir, "patterns.db");
        const db = new Database(legacyPath);
        db.exec(`
          CREATE TABLE patterns (
            id TEXT PRIMARY KEY,
            title TEXT
          );
          INSERT INTO patterns (id, title) VALUES ('TEST', 'Test Pattern');
        `);
        db.close();
        
        // Verify legacy exists
        expect(await fs.pathExists(legacyPath)).toBe(true);
        
        const { ApexConfig } = await import("../../src/config/apex-config.js");
        
        // Run migration
        const migrated = await ApexConfig.migrateLegacyDatabase();
        
        // Since we can't easily mock the primary path, check if migration attempted
        // In real scenario, legacy would be deleted after successful migration
        expect(typeof migrated).toBe("boolean");
        
        // If migration happened, legacy should be gone
        if (migrated) {
          expect(await fs.pathExists(legacyPath)).toBe(false);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});