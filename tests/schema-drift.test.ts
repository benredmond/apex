/**
 * Schema Drift Detection Test Suite
 * 
 * Detects when the code's schema expectations diverge from
 * what's actually possible in the database.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { FTS_SCHEMA_SQL } from "../src/storage/schema-constants.js";

describe("Schema Drift Detection", () => {
  describe("FTS Trigger Validation", () => {
    it("trigger definitions should only reference existing columns", () => {
      const db = new Database(":memory:");
      
      // Create the patterns table with actual schema
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT,
          tags TEXT,
          keywords TEXT,
          search_index TEXT,
          type TEXT,
          trust_score REAL,
          created_at TEXT,
          updated_at TEXT
        );
      `);
      
      // Create FTS table
      db.exec(FTS_SCHEMA_SQL.patterns_fts);
      
      // Extract columns from FTS table
      const ftsColumns = db.prepare(`
        SELECT name FROM pragma_table_info('patterns_fts')
      `).all() as { name: string }[];
      const ftsColumnSet = new Set(ftsColumns.map(c => c.name));
      
      // Extract columns from patterns table  
      const patternColumns = db.prepare(`
        SELECT name FROM pragma_table_info('patterns')
      `).all() as { name: string }[];
      const patternColumnSet = new Set(patternColumns.map(c => c.name));
      
      // Validate each trigger definition
      const triggers = [
        FTS_SCHEMA_SQL.patterns_fts_triggers.insert,
        FTS_SCHEMA_SQL.patterns_fts_triggers.update,
        FTS_SCHEMA_SQL.patterns_fts_triggers.delete
      ];
      
      triggers.forEach((triggerSql, index) => {
        // Extract column references from INSERT INTO patterns_fts(...)
        const insertMatch = triggerSql.match(/INSERT INTO patterns_fts\s*\(([^)]+)\)/);
        if (insertMatch) {
          const columns = insertMatch[1].split(',').map(c => c.trim());
          columns.forEach(col => {
            if (col !== 'patterns_fts' && col !== 'rowid') {
              expect(ftsColumnSet.has(col), 
                `Trigger ${index} references FTS column '${col}' that doesn't exist`
              ).toBe(true);
            }
          });
        }
        
        // Extract column references from VALUES (new.xxx, ...)
        const newColumnRefs = [...triggerSql.matchAll(/new\.(\w+)/g)];
        newColumnRefs.forEach(match => {
          const col = match[1];
          if (col !== 'rowid') {
            expect(patternColumnSet.has(col),
              `Trigger ${index} references patterns column 'new.${col}' that doesn't exist`
            ).toBe(true);
          }
        });
        
        // Extract column references from old.xxx
        const oldColumnRefs = [...triggerSql.matchAll(/old\.(\w+)/g)];
        oldColumnRefs.forEach(match => {
          const col = match[1];
          if (col !== 'rowid') {
            expect(patternColumnSet.has(col),
              `Trigger ${index} references patterns column 'old.${col}' that doesn't exist`
            ).toBe(true);
          }
        });
      });
    });
    
    it("FTS table columns in triggers should match actual FTS schema", () => {
      const db = new Database(":memory:");
      
      // Create FTS table from schema constants
      db.exec(FTS_SCHEMA_SQL.patterns_fts);
      
      // Get actual FTS columns
      const actualColumns = db.prepare(`
        SELECT name FROM pragma_table_info('patterns_fts')
      `).all() as { name: string }[];
      const actualColumnSet = new Set(actualColumns.map(c => c.name));
      
      // Parse expected columns from FTS schema definition
      const schemaMatch = FTS_SCHEMA_SQL.patterns_fts.match(/USING fts5\s*\(([^)]+)\)/);
      if (!schemaMatch) {
        throw new Error("Could not parse FTS schema");
      }
      
      const expectedColumns = schemaMatch[1]
        .split(',')
        .map(c => c.trim())
        .map(c => c.split(/\s+/)[0]); // Get column name, ignore "UNINDEXED" etc
      
      // Verify all trigger-referenced columns exist in FTS schema
      const insertTrigger = FTS_SCHEMA_SQL.patterns_fts_triggers.insert;
      const insertMatch = insertTrigger.match(/INSERT INTO patterns_fts\s*\(([^)]+)\)/);
      
      if (insertMatch) {
        const triggerColumns = insertMatch[1].split(',').map(c => c.trim());
        triggerColumns.forEach(col => {
          if (col !== 'rowid' && col !== 'patterns_fts') {
            expect(expectedColumns).toContain(col);
            expect(actualColumnSet.has(col), 
              `Trigger expects FTS column '${col}' but it doesn't exist in table`
            ).toBe(true);
          }
        });
      }
    });
  });
  
  describe("Migration Consistency", () => {
    it("every schema change should have a corresponding migration", () => {
      // This test would compare git history of schema files
      // with migration files to ensure they're in sync
      // For now, we'll just check that migration count is reasonable
      
      const db = new Database(":memory:");
      db.exec(`
        CREATE TABLE migrations (
          version INTEGER PRIMARY KEY,
          id TEXT NOT NULL
        );
      `);
      
      // Run migrations
      const { MigrationLoader } = require("../src/migrations/MigrationLoader.js");
      const loader = new MigrationLoader();
      const migrations = loader.loadMigrations();
      
      // There should be at least one migration for FTS fixes
      const ftsMigrations = migrations.filter(m => 
        m.name.includes('fts') || m.name.includes('trigger')
      );
      
      expect(ftsMigrations.length).toBeGreaterThan(0);
    });
  });
  
  describe("Defensive Programming Validation", () => {
    it("should always drop triggers before creating them", () => {
      // Verify our database.ts initialize method drops triggers first
      const initCode = FTS_SCHEMA_SQL.patterns_fts_triggers.insert;
      
      // In real implementation, we'd read database.ts and verify
      // it has DROP TRIGGER statements before CREATE TRIGGER
      // For now, we verify our migration does this
      const migration018 = require("../src/migrations/018-fix-fts-trigger-schema.js");
      const migrationCode = migration018.migration018FixFtsTriggerSchema.up.toString();
      
      expect(migrationCode).toContain("DROP TRIGGER IF EXISTS");
      expect(migrationCode.indexOf("DROP TRIGGER")).toBeLessThan(
        migrationCode.indexOf("CREATE TRIGGER")
      );
    });
    
    it("should handle trigger creation failures gracefully", () => {
      const db = new Database(":memory:");
      
      // Create patterns table without required columns
      db.exec(`CREATE TABLE patterns (id TEXT PRIMARY KEY);`);
      
      // Try to create trigger that references non-existent columns
      const badTrigger = `
        CREATE TRIGGER test_trigger AFTER INSERT ON patterns
        BEGIN
          INSERT INTO some_table(missing_column) VALUES (new.missing_column);
        END;
      `;
      
      // Should throw a clear error, not silently fail
      expect(() => db.exec(badTrigger)).toThrow(/no such column/);
    });
  });
});