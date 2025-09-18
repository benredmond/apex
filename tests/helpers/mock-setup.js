/**
 * ES Module Mock Setup Helper
 * [FIX:NODE:ESMODULE_IMPORTS] ★★★★☆ - Proper ES module mocking pattern
 * Provides reusable mock setups for common modules
 */

import { vi } from "vitest";

/**
 * Create a mock better-sqlite3 database
 * [PAT:MOCK:DATABASE] - Mock database for unit tests
 */
export function createMockDatabase() {
  return {
    pragma: vi.fn().mockReturnValue([]),
    close: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
      get: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      pluck: vi.fn().mockReturnThis(),
      expand: vi.fn().mockReturnThis(),
    }),
    transaction: vi.fn().mockImplementation((fn) => {
      // [PAT:dA0w9N1I9-4m] ★★★★★ - Synchronous transaction
      return (...args) => fn(...args);
    }),
    aggregate: vi.fn(),
    backup: vi.fn(),
    checkpoint: vi.fn(),
    function: vi.fn(),
    loadExtension: vi.fn(),
    serialize: vi.fn(),
    table: vi.fn(),
    unsafeMode: vi.fn(),
  };
}

/**
 * Setup mock for better-sqlite3
 * Must be called BEFORE any imports that use the database
 */
export function mockBetterSqlite3() {
  vi.unstable_mockModule("better-sqlite3", () => ({
    default: vi.fn().mockImplementation(() => createMockDatabase()),
  }));
}

/**
 * Create a mock PatternDatabase
 */
export function createMockPatternDatabase() {
  const mockDb = createMockDatabase();
  return {
    database: mockDb, // Note: This is the getter return value
    // Add other PatternDatabase methods as needed
    close: vi.fn(),
    getPattern: vi.fn(),
    savePattern: vi.fn(),
    searchPatterns: vi.fn().mockReturnValue([]),
    getAllPatterns: vi.fn().mockReturnValue([]),
  };
}

/**
 * Setup mock for PatternDatabase
 */
export function mockPatternDatabase() {
  vi.unstable_mockModule("../../src/storage/database.js", () => ({
    PatternDatabase: vi.fn().mockImplementation(() => createMockPatternDatabase()),
  }));
}

/**
 * Create a mock TaskRepository
 */
export function createMockTaskRepository() {
  return {
    findActive: vi.fn().mockReturnValue([]),
    findByStatus: vi.fn().mockReturnValue([]),
    findRecent: vi.fn().mockReturnValue([]),
    findById: vi.fn(),
    getStatistics: vi.fn().mockReturnValue({
      total: 0,
      byPhase: {},
      byStatus: {},
      successRate: 0,
    }),
    create: vi.fn().mockReturnValue({ id: "test-task-id" }),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn().mockReturnValue([]),
  };
}

/**
 * Setup mock for TaskRepository
 */
export function mockTaskRepository() {
  vi.unstable_mockModule("../../src/storage/task-repository.js", () => ({
    TaskRepository: vi.fn().mockImplementation(() => createMockTaskRepository()),
  }));
}

/**
 * Create a mock PerformanceTimer
 */
export function createMockPerformanceTimer() {
  return {
    elapsed: vi.fn().mockReturnValue(50),
    meetsRequirement: vi.fn().mockReturnValue(true),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

/**
 * Setup mock for PerformanceTimer
 */
export function mockPerformanceTimer() {
  vi.unstable_mockModule("../../src/utils/performance.js", () => ({
    PerformanceTimer: vi.fn().mockImplementation(() => createMockPerformanceTimer()),
  }));
}

/**
 * Setup all common mocks for CLI command tests
 * [PAT:TEST:SETUP] - Comprehensive mock setup
 */
export function setupCommonMocks() {
  mockBetterSqlite3();
  mockPatternDatabase();
  mockTaskRepository();
  mockPerformanceTimer();
}

/**
 * Create mock console spies
 */
export function createConsoleMocks() {
  return {
    log: vi.spyOn(console, "log").mockImplementation(),
    error: vi.spyOn(console, "error").mockImplementation(),
    warn: vi.spyOn(console, "warn").mockImplementation(),
  };
}

/**
 * Restore console mocks
 */
export function restoreConsoleMocks(mocks) {
  mocks.log?.mockRestore();
  mocks.error?.mockRestore();
  mocks.warn?.mockRestore();
}
