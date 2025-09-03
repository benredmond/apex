/**
 * Database Type Definitions
 * Provides a unified interface for database operations
 * Compatible with both better-sqlite3 and node:sqlite
 */

import type { DatabaseAdapter, Statement } from "./database-adapter.js";

// Export DatabaseAdapter as the primary database type
// This replaces direct usage of better-sqlite3's Database type
export type Database = DatabaseAdapter;
export type { Statement };

// Re-export for compatibility
export type { DatabaseAdapter } from "./database-adapter.js";