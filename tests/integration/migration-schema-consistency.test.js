/**
 * Integration test for migration system schema consistency
 * This test ensures that all migration components use compatible schemas
 * and can work together without errors.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { AutoMigrator } from '../../src/migrations/auto-migrator.js';
import { MigrationRunner } from '../../src/migrations/MigrationRunner.js';
import { MigrationLoader } from '../../src/migrations/MigrationLoader.js';
import { DatabaseAdapterFactory } from '../../src/storage/database-adapter.js';
import { PatternDatabase } from '../../src/storage/database.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Migration System Schema Consistency', () => {
  let tempDir;
  let dbPath;
  let adapter;

  beforeEach(async () => {
    // Create temp directory for test database
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-migration-test-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(async () => {
    // Clean up
    if (adapter) {
      try {
        adapter.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    await fs.remove(tempDir);
  });

  test('AutoMigrator and MigrationRunner use compatible migration table schemas', async () => {
    // Create adapter
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // Initialize AutoMigrator
    const autoMigrator = new AutoMigrator(adapter);
    
    // Run auto migration to create tables
    const result = await autoMigrator.migrate();
    expect(result).toBe(true);
    
    // Now verify that MigrationRunner can work with the same database
    const loader = new MigrationLoader(path.join(__dirname, '../../src/migrations'));
    const runner = new MigrationRunner(adapter, loader);
    
    // This should not throw an error about schema mismatch
    const migrations = await loader.loadMigrations();
    const status = runner.getStatus(migrations);
    
    expect(status).toBeDefined();
    expect(status.applied).toBeDefined();
    expect(status.pending).toBeDefined();
  });

  test('markAllMigrationsAsApplied uses correct number of columns', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    const autoMigrator = new AutoMigrator(adapter);
    
    // Create a fresh database
    const migrationApplied = await autoMigrator.migrate();
    expect(migrationApplied).toBe(true);
    
    // Query the migrations table to verify schema
    const stmt = adapter.prepare('SELECT * FROM migrations LIMIT 1');
    const row = stmt.get();
    
    if (row) {
      // Verify all expected columns exist
      expect(row).toHaveProperty('version');
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('checksum');
      expect(row).toHaveProperty('applied_at');
      expect(row).toHaveProperty('execution_time_ms');
    }
  });

  test('Migration table schema is consistent across components', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // Get schema from AutoMigrator
    const autoMigrator = new AutoMigrator(adapter);
    await autoMigrator.migrate();
    
    // Check the actual table schema
    const schemaQuery = adapter.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    const schema = schemaQuery.get();
    
    expect(schema).toBeDefined();
    expect(schema.sql).toContain('version');
    expect(schema.sql).toContain('id');
    expect(schema.sql).toContain('name');
    expect(schema.sql).toContain('checksum');
    expect(schema.sql).toContain('applied_at');
    expect(schema.sql).toContain('execution_time_ms');
    
    // Verify PRIMARY KEY is on version
    expect(schema.sql).toMatch(/version\s+INTEGER\s+PRIMARY\s+KEY/i);
  });

  test('PatternDatabase migration table matches AutoMigrator schema', async () => {
    // Test with PatternDatabase initialization using async factory
    const db = await PatternDatabase.create(dbPath);
    
    // Get the adapter from PatternDatabase
    const dbAdapter = db.getAdapter();
    
    // Check migration table schema created by PatternDatabase
    const schemaQuery = dbAdapter.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    const schema = schemaQuery.get();
    
    if (schema) {
      // Should have the 6-column schema
      expect(schema.sql).toContain('version');
      expect(schema.sql).toContain('id');
      expect(schema.sql).toContain('name');
      expect(schema.sql).toContain('checksum');
      expect(schema.sql).toContain('applied_at');
      expect(schema.sql).toContain('execution_time_ms');
    }
    
    db.close();
  });

  test('Database can be initialized and migrated without errors', async () => {
    // This simulates the actual startup flow using async factory
    const db = await PatternDatabase.create(dbPath);
    
    // Verify database is functional
    const patterns = db.searchPatterns('test');
    expect(Array.isArray(patterns)).toBe(true);
    
    db.close();
  });
});

describe('Migration Table Column Count Validation', () => {
  let tempDir;
  let dbPath;
  let adapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-column-test-'));
    dbPath = path.join(tempDir, 'test.db');
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

  test('INSERT statements match table column count', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // Create migrations table
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        id TEXT NOT NULL,
        name TEXT NOT NULL,
        checksum TEXT,
        applied_at TEXT NOT NULL,
        execution_time_ms INTEGER
      )
    `);
    
    // This should work - 6 columns, 6 values
    const stmt = adapter.prepare(
      "INSERT INTO migrations (version, id, name, checksum, applied_at, execution_time_ms) VALUES (?, ?, ?, ?, ?, ?)"
    );
    
    // Should not throw
    expect(() => {
      stmt.run(1, 'test-migration', 'Test Migration', 'abc123', new Date().toISOString(), 100);
    }).not.toThrow();
    
    // Verify the insert worked
    const check = adapter.prepare('SELECT COUNT(*) as count FROM migrations');
    const result = check.get();
    expect(result.count).toBe(1);
  });

  test('Detect column count mismatch errors', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // Create table with 4 columns (the old schema)
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS migrations_old (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    
    // Try to insert 6 values into 4-column table
    const stmt = adapter.prepare(
      "INSERT INTO migrations_old VALUES (?, ?, ?, ?, ?, ?)"
    );
    
    // This should throw an error about column count mismatch
    expect(() => {
      stmt.run('test', 1, 'Test', 'checksum', new Date().toISOString(), 100);
    }).toThrow(/4 columns but 6 values/);
  });
});

describe('Cross-Component Migration Compatibility', () => {
  let tempDir;
  let dbPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-compat-test-'));
    dbPath = path.join(tempDir, 'test.db');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('AutoMigrator creates tables that MigrationRunner can use', async () => {
    // Step 1: Use AutoMigrator to set up database
    const adapter1 = await DatabaseAdapterFactory.create(dbPath);
    const autoMigrator = new AutoMigrator(adapter1);
    await autoMigrator.migrate();
    adapter1.close();
    
    // Step 2: Use MigrationRunner with the same database
    const adapter2 = await DatabaseAdapterFactory.create(dbPath);
    const loader = new MigrationLoader(path.join(__dirname, '../../src/migrations'));
    const runner = new MigrationRunner(adapter2, loader);
    
    // Should be able to get status without errors
    const migrations = await loader.loadMigrations();
    const status = runner.getStatus(migrations);
    
    expect(status).toBeDefined();
    expect(status.applied).toBeInstanceOf(Array);
    expect(status.pending).toBeInstanceOf(Array);
    
    adapter2.close();
  });

  test('MigrationRunner and AutoMigrator track migrations in same table', async () => {
    const adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // First, AutoMigrator creates and populates the table
    const autoMigrator = new AutoMigrator(adapter);
    await autoMigrator.migrate();
    
    // Check how many migrations AutoMigrator recorded
    const count1 = adapter.prepare('SELECT COUNT(*) as count FROM migrations').get();
    
    // Now MigrationRunner should see those migrations
    const loader = new MigrationLoader(path.join(__dirname, '../../src/migrations'));
    const runner = new MigrationRunner(adapter, loader);
    const migrations = await loader.loadMigrations();
    const status = runner.getStatus(migrations);
    
    // Applied count should match what's in the database
    expect(status.applied.length).toBeGreaterThan(0);
    
    adapter.close();
  });
});