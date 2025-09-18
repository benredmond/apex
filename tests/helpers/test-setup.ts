/**
 * TypeScript Test Setup Helper
 * [PAT:TEST:SETUP] - Centralized test setup for TypeScript tests
 * Provides ES module fixes and database setup utilities
 */

import { fileURLToPath } from "url";
import path from "path";
import Database from "better-sqlite3";
import { vi } from "vitest";
import { MigrationRunner } from "../../src/migrations/MigrationRunner.js";
import { MigrationLoader } from "../../src/migrations/MigrationLoader.js";

/**
 * Get __dirname equivalent for ES modules
 * [FIX:ESMODULE:DIRNAME] - ES module __dirname fix
 */
export function getDirname(importMetaUrl: string): string {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

/**
 * Run all migrations on a database
 * [PAT:MIGRATION:TEST] - Migration runner for tests
 */
export async function runMigrations(db: Database.Database): Promise<void> {
  const migrationRunner = new MigrationRunner(db);
  const loader = new MigrationLoader();
  
  // Get __dirname for this file
  const __dirname = getDirname(import.meta.url);
  
  // Load all migrations - note the correct path
  const migrationsDir = path.resolve(__dirname, "../../src/migrations");
  const migrations = loader.loadMigrations(migrationsDir);
  
  // Get migration status
  const status = migrationRunner.getStatus(migrations);
  
  // Apply pending migrations
  for (const migration of status.pending) {
    migrationRunner.apply(migration);
  }
}

/**
 * Create a test database with migrations applied
 * [FIX:TEST:DATABASE] - In-memory database with migrations
 */
export function createTestDatabase(): Database.Database {
  // Create in-memory database
  const db = new Database(":memory:");
  
  // Enable WAL mode for consistency
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("temp_store = MEMORY");
  
  // Run migrations
  runMigrations(db);
  
  return db;
}

/**
 * Create mock setup for ES modules
 * [FIX:NODE:ESMODULE_IMPORTS] - Mock pattern for ES modules
 * 
 * Usage:
 * ```typescript
 * // At the top of test file, BEFORE imports:
 * const mockSetup = createMockSetup();
 * mockSetup.mockModule("../../src/storage/database.js", () => ({
 *   PatternDatabase: vi.fn().mockImplementation(() => mockSetup.getSingleton("database"))
 * }));
 * ```
 */
type MockApi = Pick<typeof vi, "unstable_mockModule" | "clearAllMocks" | "resetAllMocks">;

export function createMockSetup(mockApi: MockApi = vi) {
  const singletons: Map<string, any> = new Map();
  
  return {
    async mockModule(path: string, factory: () => any) {
      await mockApi.unstable_mockModule(path, factory);
    },
    
    getSingleton(key: string, factory?: () => any): any {
      if (!singletons.has(key) && factory) {
        singletons.set(key, factory());
      }
      return singletons.get(key);
    },
    
    clearMocks() {
      // Clear mock calls but DON'T reset singletons
      mockApi.clearAllMocks();
    },
    
    resetAll() {
      // Use sparingly - only when you need fresh instances
      singletons.clear();
      mockApi.resetAllMocks();
    }
  };
}

/**
 * Standard beforeEach setup for database tests
 * [PAT:TEST:LIFECYCLE] - Test lifecycle management
 */
export function setupDatabaseTest() {
  let db: Database.Database | null = null;
  
  beforeEach(() => {
    db = createTestDatabase();
  });
  
  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });
  
  return {
    getDb: () => db!
  };
}
