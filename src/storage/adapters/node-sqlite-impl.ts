// node:sqlite Database Adapter Implementation
// Uses Node.js built-in sqlite module for SEA binary compatibility

// @ts-ignore - node:sqlite may not have types available
import { DatabaseSync } from "node:sqlite";
import type {
  DatabaseAdapter,
  Statement,
  StatementResult,
  Transaction,
} from "../database-adapter.js";

/**
 * Statement wrapper for node:sqlite
 */
class NodeSqliteStatement implements Statement {
  constructor(private stmt: any) {}

  run(...params: any[]): StatementResult {
    // node:sqlite returns { changes, lastInsertRowid }
    const result = this.stmt.run(...params);
    return {
      changes: result.changes || 0,
      lastInsertRowid: result.lastInsertRowid || 0,
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
 * node:sqlite adapter implementation
 * Provides SEA binary compatibility without native dependencies
 */
export class NodeSqliteAdapter implements DatabaseAdapter {
  private db: any; // DatabaseSync instance
  private transactionDepth: number = 0;

  constructor(dbPath: string) {
    // Create node:sqlite database connection
    this.db = new DatabaseSync(dbPath, {
      open: true,
      readOnly: false,
      enableForeignKeyConstraints: false, // Match better-sqlite3 default
    });
  }

  prepare(sql: string): Statement {
    const stmt = this.db.prepare(sql);
    return new NodeSqliteStatement(stmt);
  }

  exec(sql: string): void {
    // node:sqlite's DatabaseSync.exec() natively handles multiple SQL statements
    // No need to split - it properly handles complex SQL with CHECK constraints, triggers, etc.
    this.db.exec(sql);
  }

  pragma(pragmaString: string): any {
    // node:sqlite handles pragmas as regular SQL
    const stmt = this.db.prepare(`PRAGMA ${pragmaString}`);
    try {
      // [FIX:API:COMPATIBILITY] ★★★★★ - Handle table_info and similar pragmas that return multiple rows
      if (pragmaString.includes('table_info') || 
          pragmaString.includes('table_list') ||
          pragmaString.includes('foreign_key_list') ||
          pragmaString.includes('index_list') ||
          pragmaString.includes('index_info')) {
        // These pragmas return arrays of rows, like better-sqlite3
        return stmt.all();
      } else {
        // Single-value pragmas (like user_version, journal_mode)
        const result = stmt.get();
        return result;
      }
    } catch (error) {
      // Some pragmas don't return results, just execute them
      stmt.run();
      return undefined;
    }
  }

  transaction<T>(fn: () => T): Transaction<T> {
    // node:sqlite doesn't have a built-in transaction method
    // We need to implement it manually with BEGIN/COMMIT/ROLLBACK
    return (): T => {
      this.transactionDepth++;

      if (this.transactionDepth === 1) {
        // Only begin transaction at top level
        this.exec("BEGIN");
      }

      try {
        const result = fn();

        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          // Only commit at top level
          this.exec("COMMIT");
        }

        return result;
      } catch (error) {
        this.transactionDepth--;
        if (this.transactionDepth === 0) {
          // Only rollback at top level
          this.exec("ROLLBACK");
        }
        throw error;
      }
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  isNodeSqlite(): boolean {
    return true;
  }

  getInstance(): any {
    return this.db;
  }

  /**
   * Direct access to node:sqlite instance for advanced operations
   * Used for implementation-specific optimizations
   */
  get instance(): any {
    return this.db;
  }
}
