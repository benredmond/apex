#!/usr/bin/env node

/**
 * Simple test to verify the migration schema fix works
 * Runs outside of Jest to avoid ESM issues
 */

import { AutoMigrator } from '../dist/migrations/auto-migrator.js';
import { DatabaseAdapterFactory } from '../dist/storage/database-adapter.js';
import { PatternDatabase } from '../dist/storage/database.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

console.log('🧪 Testing Migration Schema Fix...\n');

async function test() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apex-verify-fix-'));
  const dbPath = path.join(tempDir, 'test.db');
  
  try {
    // Test 1: AutoMigrator initialization
    console.log('Test 1: AutoMigrator initialization');
    const migrator = new AutoMigrator(dbPath);
    const result = await migrator.autoMigrate({ silent: false });
    
    if (!result) {
      throw new Error('AutoMigrator.migrate() returned false');
    }
    
    // Get adapter to verify - AutoMigrator closed its connection so we need a new one
    const adapter1 = await DatabaseAdapterFactory.create(dbPath);
    
    // Verify migrations table has correct schema
    const schema = adapter1.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    if (!schema || !schema.sql.includes('version') || !schema.sql.includes('checksum')) {
      throw new Error('Migrations table schema is incorrect');
    }
    
    // Verify migrations were inserted correctly
    const migrations = adapter1.prepare('SELECT * FROM migrations').all();
    if (migrations.length === 0) {
      throw new Error('No migrations were recorded');
    }
    
    // Check each migration has all columns
    const firstMigration = migrations[0];
    const requiredColumns = ['version', 'id', 'name', 'checksum', 'applied_at', 'execution_time_ms'];
    for (const col of requiredColumns) {
      if (!(col in firstMigration)) {
        throw new Error(`Migration missing column: ${col}`);
      }
    }
    
    console.log('✅ AutoMigrator works correctly');
    console.log(`   - Created migrations table with 6 columns`);
    console.log(`   - Inserted ${migrations.length} migrations successfully\n`);
    
    adapter1.close();
    
    // Test 2: PatternDatabase initialization
    console.log('Test 2: PatternDatabase initialization');
    const dbPath2 = path.join(tempDir, 'test2.db');
    const db = await PatternDatabase.create(dbPath2);
    
    const adapter2 = db.getAdapter();
    const schema2 = adapter2.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `).get();
    
    if (!schema2 || !schema2.sql.includes('version') || !schema2.sql.includes('checksum')) {
      throw new Error('PatternDatabase migrations table schema is incorrect');
    }
    
    console.log('✅ PatternDatabase initialization works correctly\n');
    
    db.close();
    
    // Test 3: Simulate the exact bug scenario
    console.log('Test 3: Column count validation');
    const adapter3 = await DatabaseAdapterFactory.create(':memory:');
    
    // Create the OLD schema (4 columns) that caused the bug
    adapter3.exec(`
      CREATE TABLE migrations_old (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
    
    // Try to insert 6 values (what the bug did)
    let errorCaught = false;
    try {
      const stmt = adapter3.prepare('INSERT INTO migrations_old VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run('test', 1, 'Test', 'checksum', new Date().toISOString(), 100);
    } catch (e) {
      if (e.message.includes('4 columns but 6 values')) {
        errorCaught = true;
      }
    }
    
    if (!errorCaught) {
      throw new Error('Failed to detect column count mismatch');
    }
    
    console.log('✅ Column count mismatch detection works\n');
    
    adapter3.close();
    
    // Test 4: End-to-end apex start simulation
    console.log('Test 4: End-to-end initialization');
    const dbPath3 = path.join(tempDir, 'test3.db');
    
    // Simulate what apex start does using async factory
    const db2 = await PatternDatabase.create(dbPath3);
    
    // Should be able to do basic operations
    const patterns = db2.searchPatterns('test');
    if (!Array.isArray(patterns)) {
      throw new Error('searchPatterns did not return an array');
    }
    
    db2.close();
    console.log('✅ End-to-end initialization works\n');
    
    // Clean up
    await fs.remove(tempDir);
    
    console.log('🎉 All tests passed! The migration schema fix is working correctly.');
    console.log('\nSummary:');
    console.log('- AutoMigrator creates correct 6-column schema');
    console.log('- PatternDatabase uses compatible schema');
    console.log('- Column count mismatches are properly detected');
    console.log('- End-to-end initialization completes without errors');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    await fs.remove(tempDir).catch(() => {});
    process.exit(1);
  }
}

test().catch(console.error);