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
    const errors: string[] = [];
    const startTime = Date.now();

    // Log selection process if debugging
    if (process.env.APEX_DEBUG) {
      console.log("Selecting database adapter...");
    }

    // Tier 1: Try node:sqlite for Node.js 22+ (built-in, no compilation)
    if (this.hasNodeSqlite()) {
      try {
        const { NodeSqliteAdapter } = await import(
          "./adapters/node-sqlite-impl.js"
        );
        console.log(
          `Using node:sqlite (built-in, ${Date.now() - startTime}ms)`,
        );
        return new NodeSqliteAdapter(dbPath);
      } catch (error) {
        errors.push(`node:sqlite: ${error.message}`);
      }
    }

    // Tier 2: Try better-sqlite3 if available (native module, best performance)
    if (await this.hasBetterSqlite()) {
      try {
        const { BetterSqliteAdapter } = await import(
          "./adapters/better-sqlite-impl.js"
        );
        console.log(
          `Using better-sqlite3 (native, ${Date.now() - startTime}ms)`,
        );
        return await BetterSqliteAdapter.create(dbPath);
      } catch (error) {
        errors.push(`better-sqlite3: ${error.message}`);
      }
    }

    // Tier 3: Universal WASM fallback (always works, slower performance)
    try {
      const { WasmSqliteAdapter } = await import(
        "./adapters/wasm-sqlite-impl.js"
      );
      console.log(
        `Using sql.js (WebAssembly) - universal compatibility mode (${Date.now() - startTime}ms)`,
      );
      return await WasmSqliteAdapter.create(dbPath);
    } catch (error) {
      // If all adapters fail, throw detailed error
      throw new Error(
        `All database adapters failed:\n${errors.join("\n")}\nWASM: ${error.message}`,
      );
    }
  }

  /**
   * Check if node:sqlite is available (Node.js 22+)
   */
  private static hasNodeSqlite(): boolean {
    const majorVersion = parseInt(process.versions.node.split(".")[0]);
    return majorVersion >= 22;
  }

  /**
   * Check if better-sqlite3 is available
   */
  private static async hasBetterSqlite(): Promise<boolean> {
    try {
      await import("better-sqlite3");
      return true;
    } catch {
      return false;
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
