/**
 * Vitest Database Helper
 * [PAT:TEST:DB_INIT] - Centralized database initialization for Vitest tests
 *
 * Replaces subprocess-based database initialization with direct helper functions
 */

import Database from 'better-sqlite3';
import { AutoMigrator } from '../../dist/migrations/auto-migrator.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

/**
 * Initialize a test database with migrations
 * @param dbPath - Path to the database file
 * @returns Database instance and cleanup function
 */
export async function initTestDatabase(dbPath?: string): Promise<{
  db: Database.Database;
  dbPath: string;
  cleanup: () => Promise<void>;
}> {
  // Create temp directory if no path provided
  const tempDir = dbPath ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'apex-test-'));
  const finalDbPath = dbPath || path.join(tempDir!, 'test.db');

  // Initialize database with migrations
  const migrator = new AutoMigrator(finalDbPath);
  const migrationSuccess = await migrator.autoMigrate({ silent: true });

  if (!migrationSuccess) {
    throw new Error('Database migration failed');
  }

  // Open database connection
  const db = new Database(finalDbPath);

  // Cleanup function
  const cleanup = async () => {
    db.close();
    if (tempDir) {
      await fs.remove(tempDir);
    }
  };

  return { db, dbPath: finalDbPath, cleanup };
}

/**
 * Create a unique database path for test isolation
 * @param testName - Optional test name for the database
 * @returns Path to a unique database file
 */
export async function createTestDbPath(testName?: string): Promise<{
  dbPath: string;
  tempDir: string;
}> {
  const prefix = testName ? `apex-${testName}-` : 'apex-test-';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    dbPath: path.join(tempDir, 'test.db'),
    tempDir
  };
}

/**
 * Simple database initialization for basic tests
 * @returns Database instance and cleanup function
 */
export async function quickTestDb(): Promise<{
  db: Database.Database;
  cleanup: () => Promise<void>;
}> {
  const result = await initTestDatabase();
  return {
    db: result.db,
    cleanup: result.cleanup
  };
}