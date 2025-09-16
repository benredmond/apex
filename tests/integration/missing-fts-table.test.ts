/**
 * Integration test for database initialization with missing FTS table
 *
 * This test ensures the critical early return bug is fixed and that
 * database initialization completes even when FTS table is missing.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { PatternDatabase } from "../../src/storage/database.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("Database Initialization with Missing FTS Table", () => {
  let tempDbPath: string;
  
  beforeEach(() => {
    // Create a temporary database file
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });
  
  afterEach(() => {
    // Clean up temporary files
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      const dir = path.dirname(tempDbPath);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  
  it("should complete initialization even when FTS table doesn't exist", async () => {
    // Create a database with patterns table but no FTS table
    // Use complete schema to avoid column mismatch
    const setupDb = new Database(tempDbPath);
    // Create patterns table with all required columns
    setupDb.exec(`
      CREATE TABLE patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL DEFAULT '1.0.0',
        type              TEXT NOT NULL,
        category          TEXT,
        subcategory       TEXT,
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        problem           TEXT,
        solution          TEXT,
        consequences      TEXT,
        implementation    TEXT,
        examples          TEXT,
        confidence        REAL DEFAULT 0.0,
        trust_score       REAL NOT NULL DEFAULT 0.0,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT,
        error_prone       INTEGER DEFAULT 0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at      TEXT,
        pattern_digest    TEXT,
        json_canonical    TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        status            TEXT DEFAULT 'active',
        source_repo       TEXT,
        alias             TEXT UNIQUE,
        tags              TEXT,
        keywords          TEXT,
        search_index      TEXT,
        provenance        TEXT NOT NULL DEFAULT 'manual',
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT,
        last_activity_at  TEXT,
        quality_score_cached REAL,
        cache_timestamp   TEXT,
        semver_constraints TEXT,
        quarantine_reason TEXT,
        quarantine_date   TEXT
      );
    `);
    setupDb.close();
    
    // Now try to initialize with PatternDatabase
    const patternDb = await PatternDatabase.create(tempDbPath);
    
    // Verify critical tables were created despite missing FTS
    const db = patternDb.database;
    
    // Check schema_meta table exists
    const schemaMeta = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name = 'schema_meta'
    `).get();
    expect(schemaMeta).toBeTruthy();
    
    // Check migrations table exists
    const migrations = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name = 'migrations'
    `).get();
    expect(migrations).toBeTruthy();
    
    // Check that initialization completed (indices should exist)
    const indices = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type = 'index'
    `).get() as { count: number };
    expect(indices.count).toBeGreaterThan(0);
    
    patternDb.close();
  });
  
  it("should handle old-style triggers gracefully", async () => {
    // Create a database with old-style triggers that reference removed columns
    const setupDb = new Database(tempDbPath);
    
    // Create patterns table with all required columns
    setupDb.exec(`
      CREATE TABLE patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL DEFAULT '1.0.0',
        type              TEXT NOT NULL,
        category          TEXT,
        subcategory       TEXT,
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        problem           TEXT,
        solution          TEXT,
        consequences      TEXT,
        implementation    TEXT,
        examples          TEXT,
        confidence        REAL DEFAULT 0.0,
        trust_score       REAL NOT NULL DEFAULT 0.0,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT,
        error_prone       INTEGER DEFAULT 0,
        created_at        TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at      TEXT,
        pattern_digest    TEXT,
        json_canonical    TEXT,
        alpha             REAL DEFAULT 1.0,
        beta              REAL DEFAULT 1.0,
        usage_count       INTEGER DEFAULT 0,
        success_count     INTEGER DEFAULT 0,
        status            TEXT DEFAULT 'active',
        source_repo       TEXT,
        alias             TEXT UNIQUE,
        tags              TEXT,
        keywords          TEXT,
        search_index      TEXT,
        provenance        TEXT NOT NULL DEFAULT 'manual',
        key_insight       TEXT,
        when_to_use       TEXT,
        common_pitfalls   TEXT,
        last_activity_at  TEXT,
        quality_score_cached REAL,
        cache_timestamp   TEXT,
        semver_constraints TEXT,
        quarantine_reason TEXT,
        quarantine_date   TEXT
      );
    `);
    
    // Create correct FTS table
    setupDb.exec(`
      CREATE VIRTUAL TABLE patterns_fts USING fts3(
        id,
        title,
        summary,
        tags,
        keywords,
        search_index,
        tokenize=simple
      );
    `);
    
    // Create old-style triggers that reference columns that were removed
    // (category, subcategory, problem, solution were removed from FTS)
    setupDb.exec(`
      CREATE TRIGGER patterns_fts_insert AFTER INSERT ON patterns
      BEGIN
        INSERT INTO patterns_fts(id, title, summary, category, subcategory)
        VALUES (new.id, new.title, new.summary, new.category, new.subcategory);
      END;
    `);
    
    setupDb.close();
    
    // Initialize should detect old triggers and recreate them
    const patternDb = await PatternDatabase.create(tempDbPath);
    const db = patternDb.database;
    
    // Verify triggers were recreated with correct schema
    const triggers = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'trigger' 
      AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
      ORDER BY name
    `).all() as { name: string }[];
    
    expect(triggers.length).toBe(3);
    expect(triggers[0].name).toBe('patterns_ad');
    expect(triggers[1].name).toBe('patterns_ai');
    expect(triggers[2].name).toBe('patterns_au');
    
    patternDb.close();
  });
  
  it("should create all required tables in correct order", async () => {
    // Start with completely empty database
    const patternDb = await PatternDatabase.create(tempDbPath);
    const db = patternDb.database;
    
    // List of critical tables that must exist
    const requiredTables = [
      'patterns',
      'pattern_languages',
      'pattern_frameworks', 
      'pattern_paths',
      'pattern_repos',
      'pattern_task_types',
      'pattern_snippets',
      'pattern_envs',
      'pattern_tags',
      'snippets',
      'patterns_fts',
      'schema_meta',
      'migrations'
    ];
    
    for (const tableName of requiredTables) {
      const table = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type = 'table' AND name = ?
      `).get(tableName);
      expect(table).toBeTruthy();
    }
    
    // Verify FTS triggers exist and have correct names
    const triggers = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'trigger' 
      AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
    `).all() as { name: string }[];
    
    expect(triggers).toHaveLength(3);
    expect(triggers.map(t => t.name).sort()).toEqual(
      ['patterns_ad', 'patterns_ai', 'patterns_au']
    );
    
    patternDb.close();
  });
  
  it("should not recreate triggers if they are already correct", async () => {
    // Initialize database first time
    const patternDb1 = await PatternDatabase.create(tempDbPath);
    
    // Get initial trigger SQL
    const db1 = patternDb1.database;
    const initialTriggers = db1.prepare(`
      SELECT name, sql FROM sqlite_master 
      WHERE type = 'trigger' 
      AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
      ORDER BY name
    `).all() as { name: string; sql: string }[];
    
    patternDb1.close();
    
    // Initialize again
    const patternDb2 = await PatternDatabase.create(tempDbPath);
    const db2 = patternDb2.database;
    
    // Get triggers after second init
    const finalTriggers = db2.prepare(`
      SELECT name, sql FROM sqlite_master 
      WHERE type = 'trigger' 
      AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
      ORDER BY name
    `).all() as { name: string; sql: string }[];
    
    // Triggers should be identical (not recreated)
    expect(finalTriggers).toEqual(initialTriggers);
    
    patternDb2.close();
  });
});