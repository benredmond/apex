// better-sqlite3 Database Adapter Implementation
// Wraps better-sqlite3 to conform to DatabaseAdapter interface

import type {
  DatabaseAdapter,
  Statement,
  StatementResult,
  Transaction,
} from "../database-adapter.js";

/**
 * Statement wrapper for better-sqlite3
 */
class BetterSqliteStatement implements Statement {
  constructor(private stmt: any) {}

  run(...params: any[]): StatementResult {
    const result = this.stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  get(...params: any[]): any {
    return this.stmt.get(...params);
  }

  all(...params: any[]): any[] {
    return this.stmt.all(...params);
  }
}

/**
 * better-sqlite3 adapter implementation
 * Maintains optimal performance characteristics for npm installations
 */
export class BetterSqliteAdapter implements DatabaseAdapter {
  private static Database: any = null;
  private db: any;

  /**
   * Create a new BetterSqliteAdapter instance
   * Uses dynamic import to handle optional dependency
   */
  static async create(dbPath: string): Promise<BetterSqliteAdapter> {
    // Load better-sqlite3 dynamically if not already loaded
    if (!BetterSqliteAdapter.Database) {
      try {
        const module = await import("better-sqlite3");
        BetterSqliteAdapter.Database = module.default || module;
      } catch (error) {
        throw new Error(
          "better-sqlite3 is not available. It may have failed to compile. " +
          "The system should fall back to an alternative SQLite implementation."
        );
      }
    }
    
    const adapter = new BetterSqliteAdapter();
    adapter.db = new BetterSqliteAdapter.Database(dbPath);
    return adapter;
  }

  private constructor() {
    // Private constructor to force use of create() method
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare(sql);
    return new BetterSqliteStatement(stmt);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(pragmaString: string): any {
    return this.db.pragma(pragmaString);
  }

  transaction<T>(fn: () => T): Transaction<T> {
    const transaction = this.db.transaction(fn);
    return transaction;
  }

  close(): void {
    this.db.close();
  }

  isNodeSqlite(): boolean {
    return false;
  }

  getInstance(): any {
    return this.db;
  }

  /**
   * Direct access to better-sqlite3 instance for advanced operations
   * Used by PatternDatabase for migration and compatibility
   */
  get instance(): any {
    return this.db;
  }
}
