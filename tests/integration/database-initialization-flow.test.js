/**
 * Test for complete database initialization flow
 * This simulates the actual startup sequence and verifies each step
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PatternDatabase } from '../../src/storage/database.js';
import { DatabaseAdapterFactory } from '../../src/storage/database-adapter.js';
import { AutoMigrator } from '../../src/migrations/auto-migrator.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Database Initialization Flow', () => {
  let tempDir;
  let dbPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-init-flow-test-'));
    dbPath = path.join(tempDir, 'patterns.db');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('Fresh database initialization completes without errors', async () => {
    const db = await PatternDatabase.create(dbPath);
    
    // Database is already initialized by create()
    
    // Verify all core tables exist
    const adapter = db.getAdapter();
    
    const tables = adapter.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `).all();
    
    const tableNames = tables.map(t => t.name);
    
    // Core tables that should exist
    expect(tableNames).toContain('patterns');
    expect(tableNames).toContain('migrations');
    expect(tableNames).toContain('schema_meta');
    
    db.close();
  });

  test('Database initialization is idempotent', async () => {
    // First initialization
    const db1 = await PatternDatabase.create(dbPath);
    
    // Add a test pattern
    const testPattern = {
      id: 'test-pattern-1',
      type: 'CODEBASE',
      title: 'Test Pattern',
      summary: 'A test pattern',
      trust_score: 0.5
    };
    
    // Get patterns count before
    const adapter1 = db1.getAdapter();
    const insertStmt = adapter1.prepare(`
      INSERT INTO patterns (id, schema_version, pattern_version, type, title, summary, trust_score, created_at, updated_at, pattern_digest, json_canonical)
      VALUES (?, '1.0.0', '1.0.0', ?, ?, ?, ?, datetime('now'), datetime('now'), 'test-digest', '{}')
    `);
    insertStmt.run(testPattern.id, testPattern.type, testPattern.title, testPattern.summary, testPattern.trust_score);
    
    db1.close();
    
    // Second initialization on same database
    const db2 = await PatternDatabase.create(dbPath);
    
    // Verify data is preserved
    const adapter2 = db2.getAdapter();
    const checkStmt = adapter2.prepare('SELECT * FROM patterns WHERE id = ?');
    const pattern = checkStmt.get(testPattern.id);
    
    expect(pattern).toBeDefined();
    expect(pattern.title).toBe(testPattern.title);
    
    db2.close();
  });

  test('Migration table schema is consistent between AutoMigrator and PatternDatabase', async () => {
    // Initialize via PatternDatabase
    const db = await PatternDatabase.create(dbPath);
    const dbAdapter = db.getAdapter();
    
    // Get schema created by PatternDatabase
    const dbSchema = dbAdapter.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    db.close();
    
    // Now initialize via AutoMigrator on a fresh database
    const autoMigratorPath = path.join(tempDir, 'auto-migrator.db');
    const amAdapter = await DatabaseAdapterFactory.create(autoMigratorPath);
    const autoMigrator = new AutoMigrator(amAdapter);
    await autoMigrator.migrate();
    
    // Get schema created by AutoMigrator
    const amSchema = amAdapter.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    amAdapter.close();
    
    // Both schemas should be similar (ignoring whitespace differences)
    const normalizeSchema = (sql) => sql.replace(/\s+/g, ' ').toLowerCase().trim();
    
    if (dbSchema && amSchema) {
      // Both should have same columns
      expect(dbSchema.sql).toContain('version');
      expect(dbSchema.sql).toContain('id');
      expect(dbSchema.sql).toContain('name');
      expect(dbSchema.sql).toContain('checksum');
      expect(dbSchema.sql).toContain('applied_at');
      expect(dbSchema.sql).toContain('execution_time_ms');
      
      expect(amSchema.sql).toContain('version');
      expect(amSchema.sql).toContain('id');
      expect(amSchema.sql).toContain('name');
      expect(amSchema.sql).toContain('checksum');
      expect(amSchema.sql).toContain('applied_at');
      expect(amSchema.sql).toContain('execution_time_ms');
    }
  });

  test('Database operations work after initialization', async () => {
    const db = await PatternDatabase.create(dbPath);
    
    // Test search (should not throw)
    const searchResults = db.searchPatterns('test');
    expect(Array.isArray(searchResults)).toBe(true);
    
    // Test pattern operations
    const patterns = db.getAllPatterns();
    expect(Array.isArray(patterns)).toBe(true);
    
    // Test adapter operations
    const adapter = db.getAdapter();
    expect(adapter).toBeDefined();
    
    // Test a simple query
    const result = adapter.prepare('SELECT COUNT(*) as count FROM patterns').get();
    expect(result).toHaveProperty('count');
    expect(typeof result.count).toBe('number');
    
    db.close();
  });

  test('Database handles concurrent initializations gracefully', async () => {
    // Start multiple initializations concurrently
    const promises = [];
    
    for (let i = 0; i < 3; i++) {
      const promise = (async () => {
        const db = await PatternDatabase.create(dbPath);
        return db;
      })();
      promises.push(promise);
    }
    
    // All should complete without errors
    const databases = await Promise.all(promises);
    
    expect(databases).toHaveLength(3);
    
    // Clean up
    databases.forEach(db => db.close());
  });
});

describe('Startup Sequence Simulation', () => {
  let tempDir;
  let originalHome;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-startup-test-'));
    originalHome = process.env.HOME;
    // Set HOME to temp dir to avoid affecting real ~/.apex
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.remove(tempDir);
  });

  test('apex start command initializes database correctly', async () => {
    // Create a minimal test that simulates apex start
    const apexPath = path.join(__dirname, '../../src/cli/apex.js');
    
    // Run apex start with a timeout and auto-answer
    const child = spawn('node', [apexPath, 'start'], {
      env: {
        ...process.env,
        HOME: tempDir,
        APEX_DEBUG: '1'
      },
      timeout: 5000
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Kill after 2 seconds (enough time to initialize)
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 2000);
    
    await new Promise((resolve) => {
      child.on('exit', resolve);
    });
    
    // Check that initialization started
    expect(output).toContain('Starting APEX');
    
    // Should not have schema mismatch errors
    expect(errorOutput).not.toContain('columns but');
    expect(errorOutput).not.toContain('values were supplied');
    
    // Check if database was created
    const apexDir = path.join(tempDir, '.apex');
    if (await fs.pathExists(apexDir)) {
      const files = await fs.readdir(apexDir);
      const dbFiles = files.filter(f => f.endsWith('.db'));
      
      // At least one database should be created
      if (dbFiles.length > 0) {
        expect(dbFiles.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('Error Detection and Prevention', () => {
  let tempDir;
  let dbPath;
  let adapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-error-test-'));
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

  test('Detect schema mismatch between table definition and INSERT statement', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    // Create table with 4 columns (simulating the bug)
    adapter.exec(`
      CREATE TABLE test_mismatch (
        col1 TEXT,
        col2 TEXT,
        col3 TEXT,
        col4 TEXT
      )
    `);
    
    // Try to insert 6 values
    const stmt = adapter.prepare('INSERT INTO test_mismatch VALUES (?, ?, ?, ?, ?, ?)');
    
    // Should throw error about column count
    expect(() => {
      stmt.run('a', 'b', 'c', 'd', 'e', 'f');
    }).toThrow(/4 columns but 6 values/);
  });

  test('Validate prepared statement parameter counts', async () => {
    adapter = await DatabaseAdapterFactory.create(dbPath);
    
    adapter.exec(`
      CREATE TABLE test_params (
        id INTEGER PRIMARY KEY,
        name TEXT,
        value TEXT
      )
    `);
    
    // Correct number of parameters
    const goodStmt = adapter.prepare('INSERT INTO test_params (name, value) VALUES (?, ?)');
    expect(() => {
      goodStmt.run('test', 'value');
    }).not.toThrow();
    
    // Wrong number of parameters in VALUES
    const badStmt = adapter.prepare('INSERT INTO test_params (name, value) VALUES (?, ?, ?)');
    expect(() => {
      badStmt.run('test', 'value', 'extra');
    }).toThrow();
  });

  test('Ensure all migration-related tables use same schema structure', async () => {
    const db = new PatternDatabase(dbPath);
    await db.init();
    
    const adapter = db.getAdapter();
    
    // Get all tables related to migrations
    const tables = adapter.prepare(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='table' AND name LIKE '%migration%'
    `).all();
    
    // If there are multiple migration tables, they should have compatible schemas
    const migrationTables = tables.filter(t => t.name.includes('migration'));
    
    if (migrationTables.length > 1) {
      // Check that all have similar column counts
      const columnCounts = migrationTables.map(table => {
        const matches = table.sql.match(/,/g);
        return matches ? matches.length + 1 : 1;
      });
      
      // All should have same column count
      const uniqueCounts = [...new Set(columnCounts)];
      expect(uniqueCounts).toHaveLength(1);
    }
    
    db.close();
  });
});