/**
 * Test to verify the node:sqlite exec() method fix
 * 
 * This test ensures that the exec() method in node-sqlite-impl.ts
 * properly handles complex multi-statement SQL including:
 * - CREATE TABLE with CHECK constraints
 * - Multiple statements in one exec() call
 * - Triggers
 * - Foreign keys
 */

import { DatabaseAdapterFactory } from '../../dist/storage/database-adapter.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Node:SQLite exec() method fix', () => {
  let adapter;
  let testDbPath;

  beforeEach(async () => {
    // Create a unique test database for each test
    testDbPath = path.join(__dirname, `../../.test-dbs/node-sqlite-exec-${Date.now()}.db`);
    
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Force use of node:sqlite adapter if available
    if (parseInt(process.versions.node.split('.')[0]) >= 22) {
      process.env.APEX_FORCE_ADAPTER = 'node-sqlite';
    }
    
    adapter = await DatabaseAdapterFactory.create(testDbPath);
  });

  afterEach(() => {
    if (adapter) {
      adapter.close();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    delete process.env.APEX_FORCE_ADAPTER;
  });

  test('should handle complex multi-statement SQL with CHECK constraints', () => {
    const complexSQL = `
      CREATE TABLE IF NOT EXISTS test_table (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('TYPE1','TYPE2','TYPE3')),
        score REAL CHECK (score >= 0.0 AND score <= 1.0),
        status TEXT DEFAULT 'active'
      );
      
      CREATE TABLE IF NOT EXISTS test_table2 (
        id INTEGER PRIMARY KEY,
        ref_id TEXT,
        FOREIGN KEY (ref_id) REFERENCES test_table(id)
      );
      
      INSERT INTO test_table (id, type, score) VALUES ('test1', 'TYPE1', 0.5);
      INSERT INTO test_table (id, type, score) VALUES ('test2', 'TYPE2', 0.8);
    `;
    
    // This should not throw an error with the fixed exec() method
    expect(() => adapter.exec(complexSQL)).not.toThrow();
    
    // Verify data was inserted
    const stmt = adapter.prepare('SELECT COUNT(*) as count FROM test_table');
    const result = stmt.get();
    expect(result.count).toBe(2);
  });

  test('should handle SQL with triggers', () => {
    // First create the tables
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS main_table (
        id TEXT PRIMARY KEY,
        value TEXT
      );
      
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        main_id TEXT,
        action TEXT,
        timestamp TEXT
      );
    `);
    
    // Create a trigger with semicolons inside BEGIN...END block
    const triggerSQL = `
      CREATE TRIGGER IF NOT EXISTS audit_trigger 
      AFTER INSERT ON main_table 
      BEGIN
        INSERT INTO audit_log (main_id, action, timestamp) 
        VALUES (new.id, 'INSERT', datetime('now'));
      END;
    `;
    
    expect(() => adapter.exec(triggerSQL)).not.toThrow();
    
    // Test that the trigger works
    adapter.prepare('INSERT INTO main_table (id, value) VALUES (?, ?)').run('test1', 'value1');
    
    const auditCount = adapter.prepare('SELECT COUNT(*) as count FROM audit_log').get();
    expect(auditCount.count).toBe(1);
  });

  test('should handle migration-style schema creation', () => {
    // This mimics the actual migration SQL that was failing
    const migrationSQL = `
      CREATE TABLE IF NOT EXISTS patterns (
        id                TEXT PRIMARY KEY,
        schema_version    TEXT NOT NULL,
        pattern_version   TEXT NOT NULL,
        type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
        title             TEXT NOT NULL,
        summary           TEXT NOT NULL,
        trust_score       REAL NOT NULL CHECK (trust_score >= 0.0 AND trust_score <= 1.0),
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        source_repo       TEXT,
        tags              TEXT,
        pattern_digest    TEXT NOT NULL,
        json_canonical    BLOB NOT NULL,
        invalid           INTEGER NOT NULL DEFAULT 0,
        invalid_reason    TEXT
      );

      CREATE TABLE IF NOT EXISTS pattern_tags (
        pattern_id  TEXT NOT NULL,
        tag         TEXT NOT NULL,
        PRIMARY KEY (pattern_id, tag),
        FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE CASCADE
      );
    `;
    
    expect(() => adapter.exec(migrationSQL)).not.toThrow();
    
    // Verify tables were created
    const tableCount = adapter.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('patterns', 'pattern_tags')"
    ).get();
    expect(tableCount.count).toBe(2);
  });

  test('should handle FTS3 virtual tables with triggers', () => {
    const ftsSQL = `
      CREATE VIRTUAL TABLE IF NOT EXISTS patterns_fts USING fts3(
        id,
        title,
        summary,
        tags,
        tokenize=simple
      );

      CREATE TRIGGER IF NOT EXISTS patterns_ai AFTER INSERT ON patterns BEGIN
        INSERT INTO patterns_fts (rowid, id, title, summary, tags)
        VALUES (new.rowid, new.id, new.title, new.summary, new.tags);
      END;
      
      CREATE TRIGGER IF NOT EXISTS patterns_ad AFTER DELETE ON patterns BEGIN
        INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags)
        VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags);
      END;
    `;
    
    // First create the patterns table (simplified)
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        tags TEXT
      );
    `);
    
    // Now create FTS and triggers
    expect(() => adapter.exec(ftsSQL)).not.toThrow();
    
    // Verify FTS table was created
    const ftsExists = adapter.prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='patterns_fts'"
    ).get();
    expect(ftsExists.count).toBe(1);
  });

  test('should match better-sqlite3 behavior for exec()', () => {
    // Test that exec() returns undefined (no results)
    const result = adapter.exec('SELECT 1');
    expect(result).toBeUndefined();
    
    // Test that exec() can handle comments
    const sqlWithComments = `
      -- This is a comment
      CREATE TABLE test3 (id INTEGER);
      /* Multi-line
         comment */
      INSERT INTO test3 VALUES (1);
    `;
    
    expect(() => adapter.exec(sqlWithComments)).not.toThrow();
    
    const count = adapter.prepare('SELECT COUNT(*) as count FROM test3').get();
    expect(count.count).toBe(1);
  });
});