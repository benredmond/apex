/**
 * ES Module Mock Setup Helper
 * [FIX:NODE:ESMODULE_IMPORTS] ★★★★☆ - Proper ES module mocking pattern
 * Provides reusable mock setups for common modules
 */

import { jest } from "@jest/globals";

/**
 * Create a mock better-sqlite3 database
 * [PAT:MOCK:DATABASE] - Mock database for unit tests
 */
export function createMockDatabase() {
  return {
    pragma: jest.fn().mockReturnValue([]),
    close: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
      run: jest.fn().mockReturnValue({ lastInsertRowid: 1, changes: 1 }),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
      pluck: jest.fn().mockReturnThis(),
      expand: jest.fn().mockReturnThis(),
    }),
    transaction: jest.fn().mockImplementation((fn) => {
      // [PAT:dA0w9N1I9-4m] ★★★★★ - Synchronous transaction
      return (...args) => fn(...args);
    }),
    aggregate: jest.fn(),
    backup: jest.fn(),
    checkpoint: jest.fn(),
    function: jest.fn(),
    loadExtension: jest.fn(),
    serialize: jest.fn(),
    table: jest.fn(),
    unsafeMode: jest.fn(),
  };
}

/**
 * Setup mock for better-sqlite3
 * Must be called BEFORE any imports that use the database
 */
export function mockBetterSqlite3() {
  jest.unstable_mockModule("better-sqlite3", () => ({
    default: jest.fn().mockImplementation(() => createMockDatabase()),
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
    close: jest.fn(),
    getPattern: jest.fn(),
    savePattern: jest.fn(),
    searchPatterns: jest.fn().mockReturnValue([]),
    getAllPatterns: jest.fn().mockReturnValue([]),
  };
}

/**
 * Setup mock for PatternDatabase
 */
export function mockPatternDatabase() {
  jest.unstable_mockModule("../../src/storage/database.js", () => ({
    PatternDatabase: jest.fn().mockImplementation(() => createMockPatternDatabase()),
  }));
}

/**
 * Create a mock TaskRepository
 */
export function createMockTaskRepository() {
  return {
    findActive: jest.fn().mockReturnValue([]),
    findByStatus: jest.fn().mockReturnValue([]),
    findRecent: jest.fn().mockReturnValue([]),
    findById: jest.fn(),
    getStatistics: jest.fn().mockReturnValue({
      total: 0,
      byPhase: {},
      byStatus: {},
      successRate: 0,
    }),
    create: jest.fn().mockReturnValue({ id: "test-task-id" }),
    update: jest.fn(),
    delete: jest.fn(),
    search: jest.fn().mockReturnValue([]),
  };
}

/**
 * Setup mock for TaskRepository
 */
export function mockTaskRepository() {
  jest.unstable_mockModule("../../src/storage/task-repository.js", () => ({
    TaskRepository: jest.fn().mockImplementation(() => createMockTaskRepository()),
  }));
}

/**
 * Create a mock PerformanceTimer
 */
export function createMockPerformanceTimer() {
  return {
    elapsed: jest.fn().mockReturnValue(50),
    meetsRequirement: jest.fn().mockReturnValue(true),
    start: jest.fn(),
    stop: jest.fn(),
  };
}

/**
 * Setup mock for PerformanceTimer
 */
export function mockPerformanceTimer() {
  jest.unstable_mockModule("../../src/utils/performance.js", () => ({
    PerformanceTimer: jest.fn().mockImplementation(() => createMockPerformanceTimer()),
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
    log: jest.spyOn(console, "log").mockImplementation(),
    error: jest.spyOn(console, "error").mockImplementation(),
    warn: jest.spyOn(console, "warn").mockImplementation(),
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