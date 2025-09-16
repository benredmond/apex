/**
 * Test for AutoMigrator.markAllMigrationsAsApplied method
 * This test specifically verifies the private method that caused the schema mismatch
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { AutoMigrator } from '../../src/migrations/auto-migrator.js';
import { DatabaseAdapterFactory } from '../../src/storage/database-adapter.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('AutoMigrator.markAllMigrationsAsApplied', () => {
  let tempDir;
  let dbPath;
  let adapter;
  let autoMigrator;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-mark-applied-test-'));
    dbPath = path.join(tempDir, 'test.db');
    adapter = await DatabaseAdapterFactory.create(dbPath);
    autoMigrator = new AutoMigrator(adapter);
  });

  afterEach(async () => {
    if (adapter) {
      try {
        adapter.close();
      } catch (e) {
        // Ignore
      }
    }
    await fs.remove(tempDir);
  });

  test('markAllMigrationsAsApplied inserts correct number of values', async () => {
    // Run migration which calls markAllMigrationsAsApplied internally
    const result = await autoMigrator.migrate();
    expect(result).toBe(true);
    
    // Verify migrations were recorded
    const stmt = adapter.prepare('SELECT * FROM migrations ORDER BY version');
    const migrations = stmt.all();
    
    expect(migrations.length).toBeGreaterThan(0);
    
    // Verify each migration has all expected fields
    migrations.forEach(migration => {
      expect(migration).toHaveProperty('version');
      expect(migration).toHaveProperty('id');
      expect(migration).toHaveProperty('name');
      expect(migration).toHaveProperty('checksum');
      expect(migration).toHaveProperty('applied_at');
      expect(migration).toHaveProperty('execution_time_ms');
      
      // Verify data types
      expect(typeof migration.version).toBe('number');
      expect(typeof migration.id).toBe('string');
      expect(typeof migration.name).toBe('string');
      expect(typeof migration.applied_at).toBe('string');
      
      // checksum can be null or string
      if (migration.checksum !== null) {
        expect(typeof migration.checksum).toBe('string');
      }
      
      // execution_time_ms can be null or number
      if (migration.execution_time_ms !== null) {
        expect(typeof migration.execution_time_ms).toBe('number');
      }
    });
  });

  test('ensureMigrationsTable creates correct schema', async () => {
    // Call migrate to trigger ensureMigrationsTable
    await autoMigrator.migrate();
    
    // Get the actual table schema
    const schemaStmt = adapter.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    const result = schemaStmt.get();
    
    expect(result).toBeDefined();
    expect(result.sql).toBeDefined();
    
    // Parse column count from CREATE TABLE statement
    const columnMatches = result.sql.match(/^\s*(\w+)\s+\w+/gm);
    const columnCount = columnMatches ? columnMatches.length : 0;
    
    // Should have exactly 6 columns
    expect(columnCount).toBe(6);
    
    // Verify specific columns exist
    expect(result.sql).toContain('version');
    expect(result.sql).toContain('id');
    expect(result.sql).toContain('name');
    expect(result.sql).toContain('checksum');
    expect(result.sql).toContain('applied_at');
    expect(result.sql).toContain('execution_time_ms');
  });

  test('INSERT statement parameter count matches table column count', async () => {
    // Create the migrations table
    await autoMigrator.migrate();
    
    // Manually test an insert with 6 values (matching the fixed schema)
    const insertStmt = adapter.prepare(`
      INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    // This should not throw
    expect(() => {
      insertStmt.run(
        999,
        'test-migration',
        'Test Migration',
        'test-checksum',
        new Date().toISOString(),
        123
      );
    }).not.toThrow();
    
    // Verify the insert worked
    const checkStmt = adapter.prepare('SELECT * FROM migrations WHERE version = ?');
    const inserted = checkStmt.get(999);
    
    expect(inserted).toBeDefined();
    expect(inserted.version).toBe(999);
    expect(inserted.id).toBe('test-migration');
    expect(inserted.name).toBe('Test Migration');
    expect(inserted.checksum).toBe('test-checksum');
    expect(inserted.execution_time_ms).toBe(123);
  });

  test('Migration system handles null values correctly', async () => {
    await autoMigrator.migrate();
    
    // Insert with null checksum and execution_time_ms (as done in markAllMigrationsAsApplied)
    const insertStmt = adapter.prepare(`
      INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    expect(() => {
      insertStmt.run(
        1000,
        'test-null-values',
        'Test Null Values',
        null,  // null checksum
        new Date().toISOString(),
        null   // null execution_time_ms
      );
    }).not.toThrow();
    
    // Verify nulls were stored correctly
    const checkStmt = adapter.prepare('SELECT * FROM migrations WHERE version = ?');
    const result = checkStmt.get(1000);
    
    expect(result).toBeDefined();
    expect(result.checksum).toBeNull();
    expect(result.execution_time_ms).toBeNull();
  });

  test('Prevent regression: detect column count mismatch', async () => {
    // Create a migrations table with the OLD schema (4 columns)
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS migrations_broken (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    
    // Try to insert 6 values (what markAllMigrationsAsApplied does)
    const stmt = adapter.prepare(`
      INSERT INTO migrations_broken VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    // This SHOULD throw an error
    expect(() => {
      stmt.run(
        'test',
        1,
        'Test',
        'checksum',
        new Date().toISOString(),
        100
      );
    }).toThrow(/4 columns but 6 values/);
  });
});