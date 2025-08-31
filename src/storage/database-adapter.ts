// Database Adapter Interface for dual database support
// Enables seamless switching between better-sqlite3 (npm) and node:sqlite (SEA binaries)

import { BetterSqliteAdapter } from "./adapters/better-sqlite-impl.js";

export interface Statement {
  run(...params: any[]): StatementResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

export interface StatementResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Transaction<T> {
  (): T;
}

export interface DatabaseAdapter {
  /**
   * Prepare a SQL statement for execution
   */
  prepare(sql: string): Statement;

  /**
   * Execute SQL directly (for DDL operations)
   */
  exec(sql: string): void;

  /**
   * Set database pragma
   */
  pragma(pragmaString: string): any;

  /**
   * Create a transaction function
   */
  transaction<T>(fn: () => T): Transaction<T>;

  /**
   * Close the database connection
   */
  close(): void;

  /**
   * Check if this is a node:sqlite implementation
   * Used for implementation-specific optimizations
   */
  isNodeSqlite(): boolean;

  /**
   * Get the underlying database instance
   * Used for migration system and advanced operations
   */
  getInstance(): any;
}

/**
 * Factory for creating database adapters based on runtime environment
 */
export class DatabaseAdapterFactory {
  static async create(dbPath: string): Promise<DatabaseAdapter> {
    // Runtime detection: SEA binaries use node:sqlite, npm uses better-sqlite3
    if (process.env.APEX_BINARY_MODE === 'true' || this.isSEAEnvironment()) {
      // For SEA binaries, use built-in node:sqlite to avoid native module issues
      try {
        const { NodeSqliteAdapter } = await import('./adapters/node-sqlite-impl.js');
        return new NodeSqliteAdapter(dbPath);
      } catch (error) {
        console.warn('Failed to load node:sqlite adapter, falling back to better-sqlite3:', error.message);
        // Fallback to better-sqlite3 if node:sqlite fails
        const { BetterSqliteAdapter } = await import('./adapters/better-sqlite-impl.js');
        return new BetterSqliteAdapter(dbPath);
      }
    } else {
      // For npm installations, use better-sqlite3 for optimal performance
      const { BetterSqliteAdapter } = await import('./adapters/better-sqlite-impl.js');
      return new BetterSqliteAdapter(dbPath);
    }
  }

  /**
   * Detect if running in Single Executable Application environment
   */
  private static isSEAEnvironment(): boolean {
    // Check for SEA indicators
    // @ts-ignore - process.isSEA might not be available in all Node versions
    if (typeof process.isSEA === "function" && process.isSEA()) {
      return true;
    }

    // Fallback detection methods
    // SEA binaries have different argv[0] pattern
    const isCompiledBinary =
      process.argv[0].includes("apex") &&
      !process.argv[0].includes("node") &&
      !process.argv[0].includes("npm");

    return isCompiledBinary;
  }
}
