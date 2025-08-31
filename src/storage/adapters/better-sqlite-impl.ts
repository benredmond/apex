// better-sqlite3 Database Adapter Implementation
// Wraps better-sqlite3 to conform to DatabaseAdapter interface

import Database from "better-sqlite3";
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
  constructor(private stmt: Database.Statement) {}

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
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
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

  getInstance(): Database.Database {
    return this.db;
  }

  /**
   * Direct access to better-sqlite3 instance for advanced operations
   * Used by PatternDatabase for migration and compatibility
   */
  get instance(): Database.Database {
    return this.db;
  }
}
