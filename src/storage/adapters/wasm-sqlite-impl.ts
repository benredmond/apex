// WebAssembly SQLite Adapter Implementation
// Uses sql.js for universal compatibility without native dependencies
// Provides fallback when better-sqlite3 and node:sqlite are unavailable

import initSqlJs from "sql.js";
import fs from "fs-extra";
import path from "path";
import type {
  DatabaseAdapter,
  Statement,
  StatementResult,
  Transaction,
} from "../database-adapter.js";

/**
 * Statement wrapper for sql.js
 * Triggers auto-save after modifications
 */
class WasmSqliteStatement implements Statement {
  constructor(
    private stmt: any,
    private adapter: WasmSqliteAdapter,
  ) {}

  run(...params: any[]): StatementResult {
    // Bind parameters and run statement
    if (params.length > 0) {
      this.stmt.bind(params);
    }

    const success = this.stmt.step(); // Returns true if there were results
    const result = {
      changes: this.adapter.getChanges(),
      lastInsertRowid: this.adapter.getLastInsertRowid(),
    };

    // Reset statement for reuse
    this.stmt.reset();

    // Trigger auto-save after modification
    this.adapter.scheduleSave();

    return result;
  }

  get(...params: any[]): any {
    if (params.length > 0) {
      this.stmt.bind(params);
    }

    const hasResult = this.stmt.step();
    if (!hasResult) {
      this.stmt.reset();
      return undefined;
    }

    const result = this.stmt.getAsObject();
    this.stmt.reset();
    return result;
  }

  all(...params: any[]): any[] {
    if (params.length > 0) {
      this.stmt.bind(params);
    }

    const results: any[] = [];
    while (this.stmt.step()) {
      results.push(this.stmt.getAsObject());
    }

    this.stmt.reset();
    return results;
  }
}

/**
 * WebAssembly SQLite adapter implementation
 * Provides universal compatibility at the cost of some performance
 * [PAT:ADAPTER:INTERFACE] ★★★★★ (38 uses, 92% success) - From cache
 */
export class WasmSqliteAdapter implements DatabaseAdapter {
  private SQL: any;
  private db: any;
  private dbPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private transactionDepth: number = 0;
  private statements: Map<string, any> = new Map();

  /**
   * Create a new WasmSqliteAdapter instance
   * [ARCH:FACTORY:ASYNC] ★★★★☆ (42 uses, 88% success) - From cache
   */
  static async create(dbPath: string): Promise<WasmSqliteAdapter> {
    const adapter = new WasmSqliteAdapter();
    await adapter.initialize(dbPath);
    return adapter;
  }

  private constructor() {
    // Private constructor to force use of create() method
  }

  /**
   * Initialize the WASM SQLite module and load database
   */
  private async initialize(dbPath: string): Promise<void> {
    this.dbPath = dbPath;

    try {
      // Initialize sql.js WebAssembly module
      this.SQL = await initSqlJs({
        // Locate WASM file in node_modules
        locateFile: (file: string) => {
          // Try multiple potential paths for different environments
          const paths = [
            `node_modules/sql.js/dist/${file}`,
            `./node_modules/sql.js/dist/${file}`,
            `../node_modules/sql.js/dist/${file}`,
            `/Users/ben/dev/apex/node_modules/sql.js/dist/${file}`,
          ];

          // Return the first path that exists
          for (const path of paths) {
            if (fs.existsSync(path)) {
              return path;
            }
          }

          // Fallback to default path
          return `node_modules/sql.js/dist/${file}`;
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to initialize sql.js WebAssembly: ${error.message}`,
      );
    }

    // Load existing database or create new one
    if (await fs.pathExists(dbPath)) {
      try {
        const buffer = await fs.readFile(dbPath);
        this.db = new this.SQL.Database(buffer);
      } catch (error) {
        console.warn(
          `Failed to load existing database, creating new one: ${error.message}`,
        );
        this.db = new this.SQL.Database();
        this.scheduleSave(); // Save immediately to create file
      }
    } else {
      // Create new database
      this.db = new this.SQL.Database();
      // Ensure directory exists
      await fs.ensureDir(path.dirname(dbPath));
      this.scheduleSave(); // Save immediately to create file
    }

    // Enable foreign keys and set pragmas for compatibility
    this.exec("PRAGMA foreign_keys = OFF"); // Match better-sqlite3 default
    this.exec("PRAGMA journal_mode = DELETE"); // WASM doesn't support WAL
  }

  /**
   * Schedule auto-save after modifications
   * [PAT:PERSISTENCE:AUTOSAVE] ★★★★☆ (15 uses, 87% success) - From cache
   */
  scheduleSave(): void {
    // Clear existing timeout if any
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Schedule save after 100ms of inactivity
    this.saveTimeout = setTimeout(() => {
      this.saveToFile().catch((error) => {
        console.error("Failed to save database:", error);
      });
    }, 100);
  }

  /**
   * Save database to file
   * Uses atomic write (temp file + rename) to prevent corruption
   */
  private async saveToFile(): Promise<void> {
    if (!this.db || !this.dbPath) return;

    try {
      // Export database as Uint8Array
      const data = this.db.export();
      const buffer = Buffer.from(data);

      // Write to temporary file first
      const tempPath = `${this.dbPath}.tmp`;
      await fs.writeFile(tempPath, buffer);

      // Atomic rename to prevent corruption
      await fs.rename(tempPath, this.dbPath);
    } catch (error) {
      // Clean up temp file if it exists
      const tempPath = `${this.dbPath}.tmp`;
      await fs.remove(tempPath).catch(() => {});
      throw error;
    }
  }

  prepare(sql: string): Statement {
    // Cache prepared statements for reuse
    if (!this.statements.has(sql)) {
      const stmt = this.db.prepare(sql);
      this.statements.set(sql, stmt);
    }

    return new WasmSqliteStatement(this.statements.get(sql), this);
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.scheduleSave();
  }

  pragma(pragmaString: string): any {
    // Execute pragma as regular SQL
    const result = this.db.exec(`PRAGMA ${pragmaString}`);

    // Format result to match expected structure
    if (result && result.length > 0 && result[0].values.length > 0) {
      // Convert array result to object
      const columns = result[0].columns;
      const values = result[0].values[0];
      const obj: any = {};

      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = values[i];
      }

      return obj;
    }

    return undefined;
  }

  /**
   * Manual transaction implementation
   * [PAT:TRANSACTION:MANUAL] ★★★★☆ (22 uses, 81% success) - From cache
   */
  transaction<T>(fn: () => T): Transaction<T> {
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
    // Save any pending changes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      // Synchronous save on close
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
      } catch (error) {
        console.error("Failed to save on close:", error);
      }
    }

    // Clean up prepared statements
    this.statements.clear();

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  isNodeSqlite(): boolean {
    return false;
  }

  getInstance(): any {
    // Return a compatibility wrapper that provides the expected API
    // for MigrationRunner and other components expecting better-sqlite3-like interface
    const adapter = this;

    return {
      // Delegate to adapter's prepare method which returns proper Statement
      prepare: (sql: string) => adapter.prepare(sql),

      // Delegate exec directly
      exec: (sql: string) => adapter.exec(sql),

      // Delegate pragma
      pragma: (pragma: string) => adapter.pragma(pragma),

      // Delegate transaction
      transaction: (fn: () => any) => adapter.transaction(fn),

      // Expose the raw db for any direct access needs
      _rawDb: this.db,

      // Add close method
      close: () => adapter.close(),
    };
  }

  /**
   * Get number of changes from last operation
   * sql.js doesn't track this automatically, so we query it
   */
  getChanges(): number {
    const result = this.db.exec("SELECT changes()");
    if (result && result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] || 0;
    }
    return 0;
  }

  /**
   * Get last insert rowid
   */
  getLastInsertRowid(): number {
    const result = this.db.exec("SELECT last_insert_rowid()");
    if (result && result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] || 0;
    }
    return 0;
  }
}
