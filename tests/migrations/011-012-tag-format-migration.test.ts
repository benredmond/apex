/**
 * Tests for migrations 011 and 012: Pattern tag format migration
 * [APE-63] Unify tag storage format between patterns and tasks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { migration as migration011 } from '../../src/migrations/migrations/011-migrate-pattern-tags-to-json.js';
import { migration as migration012 } from '../../src/migrations/migrations/012-rename-tags-csv-column.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('Pattern Tag Format Migrations', () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `apex-tag-migration-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    const dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    
    // Create patterns table with old schema (tags_csv column)
    db.exec(`
      CREATE TABLE patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL,
        type              TEXT NOT NULL,
        title             TEXT NOT NULL,
        summary           TEXT,
        trust_score       REAL NOT NULL DEFAULT 0.5,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        source_repo       TEXT,
        tags_csv          TEXT,
        pattern_digest    TEXT NOT NULL,
        json_canonical    BLOB NOT NULL,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT,
        alias             TEXT UNIQUE
      )
    `);
    
    // Create pattern_metadata table
    db.exec(`
      CREATE TABLE pattern_metadata (
        pattern_id TEXT PRIMARY KEY,
        tags TEXT,
        keywords TEXT,
        FOREIGN KEY (pattern_id) REFERENCES patterns(id)
      )
    `);
    
    // Insert test patterns with CSV tags
    db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title,
        trust_score, created_at, updated_at, tags_csv,
        pattern_digest, json_canonical
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TEST:PATTERN:1', '0.3', '1.0.0', 'TEST', 'Test Pattern 1',
      0.8, '2024-01-01', '2024-01-01', 'api,rest,endpoint',
      'digest1', Buffer.from('{}')
    );
    
    db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title,
        trust_score, created_at, updated_at, tags_csv,
        pattern_digest, json_canonical
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TEST:PATTERN:2', '0.3', '1.0.0', 'TEST', 'Test Pattern 2',
      0.7, '2024-01-01', '2024-01-01', 'cache,performance,redis',
      'digest2', Buffer.from('{}')
    );
    
    // Pattern with empty tags
    db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title,
        trust_score, created_at, updated_at, tags_csv,
        pattern_digest, json_canonical
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'TEST:PATTERN:3', '0.3', '1.0.0', 'TEST', 'Test Pattern 3',
      0.5, '2024-01-01', '2024-01-01', '',
      'digest3', Buffer.from('{}')
    );
    
    // Add metadata for one pattern
    db.prepare(`
      INSERT INTO pattern_metadata (pattern_id, tags, keywords)
      VALUES (?, ?, ?)
    `).run('TEST:PATTERN:1', 'api,rest', 'api endpoint rest');
  });

  afterEach(async () => {
    db.close();
    await fs.remove(tempDir);
  });

  describe('Migration 011: CSV to JSON conversion', () => {
    it('should convert CSV tags to JSON arrays', () => {
      // Run migration
      migration011.up(db);
      
      // Check pattern 1
      const pattern1 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags1 = JSON.parse(pattern1.tags_csv);
      expect(tags1).toEqual(['api', 'rest', 'endpoint']);
      
      // Check pattern 2
      const pattern2 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:2') as any;
      const tags2 = JSON.parse(pattern2.tags_csv);
      expect(tags2).toEqual(['cache', 'performance', 'redis']);
    });

    it('should handle empty tags', () => {
      migration011.up(db);
      
      const pattern3 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:3') as any;
      expect(pattern3.tags_csv).toBe('[]');
    });

    it('should skip patterns already in JSON format', () => {
      // Manually update one pattern to JSON format
      db.prepare('UPDATE patterns SET tags_csv = ? WHERE id = ?')
        .run('["already","json","format"]', 'TEST:PATTERN:1');
      
      // Run migration
      migration011.up(db);
      
      // Should remain unchanged
      const pattern1 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags1 = JSON.parse(pattern1.tags_csv);
      expect(tags1).toEqual(['already', 'json', 'format']);
    });

    it('should update pattern_metadata table', () => {
      migration011.up(db);
      
      const metadata = db.prepare('SELECT tags FROM pattern_metadata WHERE pattern_id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags = JSON.parse(metadata.tags);
      expect(tags).toEqual(['api', 'rest']);
    });

    it('should revert JSON back to CSV', () => {
      // First migrate to JSON
      migration011.up(db);
      
      // Then revert
      migration011.down(db);
      
      const pattern1 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      expect(pattern1.tags_csv).toBe('api,rest,endpoint');
      
      const pattern2 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:2') as any;
      expect(pattern2.tags_csv).toBe('cache,performance,redis');
    });

    it('should validate correctly after migration', () => {
      migration011.up(db);
      const isValid = migration011.validate(db);
      expect(isValid).toBe(true);
    });
  });

  describe('Migration 012: Rename column', () => {
    beforeEach(() => {
      // First run migration 011 to convert data to JSON
      migration011.up(db);
    });

    it('should rename tags_csv column to tags', () => {
      // Check initial state
      let columns = db.pragma('table_info(patterns)').map((col: any) => col.name);
      expect(columns).toContain('tags_csv');
      expect(columns).not.toContain('tags');
      
      // Run migration
      migration012.up(db);
      
      // Check new state
      columns = db.pragma('table_info(patterns)').map((col: any) => col.name);
      expect(columns).not.toContain('tags_csv');
      expect(columns).toContain('tags');
    });

    it('should preserve data during column rename', () => {
      // Run migration
      migration012.up(db);
      
      // Check data is preserved
      const pattern1 = db.prepare('SELECT tags FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags1 = JSON.parse(pattern1.tags);
      expect(tags1).toEqual(['api', 'rest', 'endpoint']);
      
      const pattern2 = db.prepare('SELECT tags FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:2') as any;
      const tags2 = JSON.parse(pattern2.tags);
      expect(tags2).toEqual(['cache', 'performance', 'redis']);
    });

    it('should recreate indexes', () => {
      migration012.up(db);
      
      // Check that indexes exist
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='patterns'"
      ).all() as any[];
      
      const indexNames = indexes.map(idx => idx.name);
      expect(indexNames).toContain('idx_patterns_type');
      expect(indexNames).toContain('idx_patterns_trust');
      expect(indexNames).toContain('idx_patterns_created');
      expect(indexNames).toContain('idx_patterns_tags');
    });

    it('should handle migration when tags column already exists', () => {
      // Run migration twice
      migration012.up(db);
      
      // Should not error on second run
      expect(() => migration012.up(db)).not.toThrow();
      
      // Should still have tags column
      const columns = db.pragma('table_info(patterns)').map((col: any) => col.name);
      expect(columns).toContain('tags');
    });

    it('should revert column rename', () => {
      // Migrate forward
      migration012.up(db);
      
      // Then revert
      migration012.down(db);
      
      // Should have tags_csv again
      const columns = db.pragma('table_info(patterns)').map((col: any) => col.name);
      expect(columns).toContain('tags_csv');
      expect(columns).not.toContain('tags');
      
      // Data should be preserved
      const pattern1 = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags1 = JSON.parse(pattern1.tags_csv);
      expect(tags1).toEqual(['api', 'rest', 'endpoint']);
    });

    it('should validate correctly after migration', () => {
      migration012.up(db);
      const isValid = migration012.validate(db);
      expect(isValid).toBe(true);
    });
  });

  describe('Combined migration flow', () => {
    it('should successfully migrate from CSV to JSON with renamed column', () => {
      // Initial state: CSV format in tags_csv column
      const initialPattern = db.prepare('SELECT tags_csv FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      expect(initialPattern.tags_csv).toBe('api,rest,endpoint');
      
      // Run both migrations
      migration011.up(db);
      migration012.up(db);
      
      // Final state: JSON format in tags column
      const finalPattern = db.prepare('SELECT tags FROM patterns WHERE id = ?')
        .get('TEST:PATTERN:1') as any;
      const tags = JSON.parse(finalPattern.tags);
      expect(tags).toEqual(['api', 'rest', 'endpoint']);
      
      // tags_csv column should not exist
      const columns = db.pragma('table_info(patterns)').map((col: any) => col.name);
      expect(columns).not.toContain('tags_csv');
      expect(columns).toContain('tags');
    });

    it('should support tag-based queries after migration', () => {
      // Run migrations
      migration011.up(db);
      migration012.up(db);
      
      // Query for patterns with 'api' tag
      const results = db.prepare(
        "SELECT id FROM patterns WHERE tags LIKE ?"
      ).all('%"api"%') as any[];
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('TEST:PATTERN:1');
      
      // Query for patterns with 'cache' tag
      const cacheResults = db.prepare(
        "SELECT id FROM patterns WHERE tags LIKE ?"
      ).all('%"cache"%') as any[];
      
      expect(cacheResults).toHaveLength(1);
      expect(cacheResults[0].id).toBe('TEST:PATTERN:2');
    });
  });
});