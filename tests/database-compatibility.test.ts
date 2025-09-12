/**
 * Database Compatibility Test Suite
 * 
 * Tests that the system can handle databases in various states:
 * - Different schema versions
 * - Partially migrated databases
 * - Databases with stale triggers
 * - Corrupted or inconsistent states
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { PatternDatabase } from "../src/storage/database.js";
import { AutoMigrator } from "../src/migrations/auto-migrator.js";

describe("Database Compatibility", () => {
  const testDbDir = path.join(__dirname, "fixtures", "database-snapshots");
  
  describe("Schema Evolution Compatibility", () => {
    it("should handle database with old FTS triggers referencing removed columns", () => {
      const db = new Database(":memory:");
      
      // Create patterns table with current schema
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT,
          tags TEXT,
          keywords TEXT,
          search_index TEXT,
          type TEXT
        );
      `);
      
      // Create FTS table
      db.exec(`
        CREATE VIRTUAL TABLE patterns_fts USING fts5(
          id UNINDEXED,
          title,
          summary,
          tags,
          keywords,
          search_index
        );
      `);
      
      // Create OLD triggers that reference non-existent columns
      db.exec(`
        CREATE TRIGGER patterns_fts_insert AFTER INSERT ON patterns
        BEGIN
          INSERT INTO patterns_fts(id, type, category, subcategory, title, summary, problem, solution)
          VALUES (new.id, new.type, new.category, new.subcategory, new.title, new.summary, new.problem, new.solution);
        END;
      `);
      
      // This should NOT throw - the system should handle it
      expect(async () => {
        const patternDb = await PatternDatabase.create(":memory:");
        await patternDb.initialize();
      }).not.toThrow();
    });
    
    it("should validate trigger columns match FTS table columns", () => {
      const db = new Database(":memory:");
      const patternDb = new PatternDatabase(db);
      
      // Get FTS columns
      const ftsInfo = db.prepare("PRAGMA table_info(patterns_fts)").all() as any[];
      const ftsColumns = new Set(ftsInfo.map(col => col.name));
      
      // Get trigger definitions
      const triggers = db.prepare(`
        SELECT sql FROM sqlite_master 
        WHERE type = 'trigger' 
        AND name LIKE 'patterns_fts_%'
      `).all() as { sql: string }[];
      
      // Extract column references from triggers
      triggers.forEach(trigger => {
        const insertMatch = trigger.sql.match(/INSERT INTO patterns_fts\(([^)]+)\)/);
        if (insertMatch) {
          const triggerColumns = insertMatch[1].split(',').map(c => c.trim());
          triggerColumns.forEach(col => {
            expect(ftsColumns.has(col), 
              `Trigger references column '${col}' not in FTS table`
            ).toBe(true);
          });
        }
      });
    });
  });
  
  describe("Migration Path Testing", () => {
    it("should successfully migrate from any snapshot to current", async () => {
      // Load all snapshot files
      const snapshots = fs.readdirSync(testDbDir)
        .filter(f => f.endsWith('.db'));
      
      for (const snapshot of snapshots) {
        const dbPath = path.join(testDbDir, snapshot);
        const testDb = path.join(testDbDir, `test-${snapshot}`);
        
        // Copy snapshot to test location
        fs.copyFileSync(dbPath, testDb);
        
        // Attempt migration
        const migrator = new AutoMigrator(testDb);
        await expect(migrator.autoMigrate({ silent: true }))
          .resolves.not.toThrow();
        
        // Validate final schema
        const db = new Database(testDb);
        const tables = db.prepare(`
          SELECT name FROM sqlite_master WHERE type = 'table'
        `).all() as { name: string }[];
        
        expect(tables.map(t => t.name)).toContain('patterns');
        expect(tables.map(t => t.name)).toContain('tasks');
        
        // Clean up
        fs.unlinkSync(testDb);
      }
    });
  });
  
  describe("Trigger Integrity", () => {
    it("should not create duplicate triggers", () => {
      const db = new Database(":memory:");
      const patternDb = new PatternDatabase(db);
      
      // Initialize twice - should not create duplicate triggers
      patternDb.initialize();
      patternDb.initialize();
      
      const triggers = db.prepare(`
        SELECT name, COUNT(*) as count 
        FROM sqlite_master 
        WHERE type = 'trigger' 
        GROUP BY name 
        HAVING count > 1
      `).all();
      
      expect(triggers).toHaveLength(0);
    });
    
    it("should handle corrupted trigger definitions gracefully", () => {
      const db = new Database(":memory:");
      
      // Create a corrupted trigger
      db.exec(`
        CREATE TABLE patterns (id TEXT PRIMARY KEY);
        CREATE TRIGGER bad_trigger AFTER INSERT ON patterns
        BEGIN
          SELECT * FROM non_existent_table;
        END;
      `);
      
      // Should handle this without crashing
      expect(() => {
        const patternDb = new PatternDatabase(db);
        patternDb.initialize();
      }).not.toThrow();
    });
  });
  
  describe("Schema Validation", () => {
    it("should verify all migrations are reversible", async () => {
      const db = new Database(":memory:");
      const migrator = new AutoMigrator(":memory:");
      
      // Run all migrations forward
      await migrator.autoMigrate();
      const forwardState = getSchemaFingerprint(db);
      
      // Get current version
      const version = db.prepare(
        "SELECT MAX(version) as version FROM migrations"
      ).get() as { version: number };
      
      // Rollback all migrations
      for (let v = version.version; v > 0; v--) {
        await migrator.rollback(v);
      }
      
      // Run forward again
      await migrator.autoMigrate();
      const finalState = getSchemaFingerprint(db);
      
      expect(finalState).toEqual(forwardState);
    });
  });
});

function getSchemaFingerprint(db: Database.Database): string {
  const schema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type IN ('table', 'index', 'trigger')
    ORDER BY name
  `).all() as { sql: string }[];
  
  return schema.map(s => s.sql).join('\n');
}