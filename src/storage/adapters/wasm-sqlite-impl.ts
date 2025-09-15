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

  *iterate(...params: any[]): IterableIterator<any> {
    // Generator function for iterating over results
    // [FIX:API:COMPATIBILITY] ★★★★★ (28 uses, 98% success) - Complete better-sqlite3 interface
    if (params.length > 0) {
      this.stmt.bind(params);
    }

    try {
      while (this.stmt.step()) {
        yield this.stmt.getAsObject();
      }
    } finally {
      this.stmt.reset();
    }
  }

  // Additional better-sqlite3 Statement methods for full compatibility
  pluck(column?: boolean): this {
    // sql.js doesn't support pluck mode, but provide stub
    if (column) {
      console.warn(
        "Statement.pluck() not supported in WASM adapter, returning full objects",
      );
    }
    return this;
  }

  expand(expand?: boolean): this {
    // sql.js doesn't support expand mode, but provide stub
    if (expand) {
      console.warn(
        "Statement.expand() not supported in WASM adapter, returning flat objects",
      );
    }
    return this;
  }

  raw(raw?: boolean): this {
    // sql.js doesn't support raw mode, but provide stub
    if (raw) {
      console.warn(
        "Statement.raw() not supported in WASM adapter, returning object format",
      );
    }
    return this;
  }

  safeIntegers(safeIntegers?: boolean): this {
    // WASM doesn't need safe integers, but provide stub
    if (safeIntegers) {
      console.warn("Statement.safeIntegers() not needed in WASM adapter");
    }
    return this;
  }

  // Properties for compatibility
  get reader() {
    return false;
  } // Not a reader statement
  get readonly() {
    return false;
  } // sql.js statements are not inherently readonly
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
      const data = this.db?.export();
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
      // Check if this is a multi-row pragma (like table_info, table_list, etc.)
      if (
        pragmaString.includes("table_info") ||
        pragmaString.includes("table_list") ||
        pragmaString.includes("foreign_key_list") ||
        pragmaString.includes("index_list") ||
        pragmaString.includes("index_info") ||
        result[0].values.length > 1
      ) {
        // Return array of objects for multi-row results
        const columns = result[0].columns;
        return result[0].values.map((row: any[]) => {
          const obj: any = {};
          for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = row[i];
          }
          return obj;
        });
      } else {
        // Single row result - return as object
        const columns = result[0].columns;
        const values = result[0].values[0];
        const obj: any = {};

        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = values[i];
        }

        return obj;
      }
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
    if (this.saveTimeout && this.db) {
      clearTimeout(this.saveTimeout);
      // Synchronous save on close
      try {
        const data = this.db?.export();
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
    // [PAT:ADAPTER:DELEGATION] ★★★★☆ (15 uses, 92% success) - From cache
    const adapter = this;

    return {
      // Core database methods - delegate to adapter
      prepare: (sql: string) => adapter.prepare(sql),
      exec: (sql: string) => adapter.exec(sql),
      pragma: (pragma: string) => adapter.pragma(pragma),
      transaction: (fn: () => any) => adapter.transaction(fn),
      close: () => adapter.close(),

      // Additional better-sqlite3 methods for full compatibility
      aggregate: (name: string, options: any) => {
        // sql.js doesn't support custom aggregates, but provide stub for compatibility
        console.warn(
          `Custom aggregate '${name}' not supported in WASM adapter`,
        );
        return adapter;
      },

      backup: (destination: string, options?: any) => {
        // Provide backup functionality using export/import
        const data = this.db?.export();
        fs.writeFileSync(destination, Buffer.from(data));
        return {
          transfer: () => Buffer.from(data).length,
          remainingPages: 0,
          pageCount: 0,
        };
      },

      checkpoint: (databaseName?: string) => {
        // WASM doesn't use WAL mode, so checkpoint is a no-op
        return { busyHandler: null, log: 0, checkpointed: 0 };
      },

      serialize: (options?: any) => {
        // Return database as buffer (similar to better-sqlite3)
        return Buffer.from(this.db?.export() || new ArrayBuffer(0));
      },

      // Better-sqlite3 properties
      get defaultSafeIntegers() {
        return false;
      }, // WASM adapter doesn't need safe integers
      get memory() {
        // Return dummy memory info since sql.js doesn't expose this
        return { used: 0, high: 0 };
      },
      get readonly() {
        return false;
      }, // sql.js is always read-write
      get open() {
        return this.db !== null;
      },
      get inTransaction() {
        return adapter.transactionDepth > 0;
      },
      get name() {
        return adapter.dbPath;
      },

      // Internal methods that some code might expect
      unsafeMode: (unsafe?: boolean) => {
        // sql.js doesn't have unsafe mode, return current instance
        if (unsafe !== undefined) {
          console.warn("Unsafe mode not supported in WASM adapter");
        }
        return adapter.getInstance();
      },

      // Expose the raw db for any direct access needs (debugging)
      _rawDb: this.db,
      _adapter: adapter, // Allow access to adapter if needed

      // Statement creation shortcuts that some code might use
      function: (name: string, options: any, func: Function) => {
        // Custom functions not widely supported in sql.js
        console.warn(`Custom function '${name}' not supported in WASM adapter`);
        return adapter;
      },

      loadExtension: (path: string) => {
        // Extensions not supported in WASM
        throw new Error("Extensions not supported in WASM SQLite adapter");
      },

      // Event handling stubs for compatibility
      on: (event: string, callback: Function) => {
        // sql.js doesn't have events, but provide stub
        console.warn(`Event handling '${event}' not supported in WASM adapter`);
        return adapter.getInstance();
      },

      off: (event: string, callback?: Function) => {
        // Event removal stub
        return adapter.getInstance();
      },
    };
  }

  /**
   * [PAT:ADAPTER:DELEGATION] ★★★★★ (5 uses, 100% success) - From cache
   * sql.js (WASM) supports FTS3 triggers properly
   * No manual synchronization needed
   */
  supportsFTSTriggers(): boolean {
    return true; // sql.js FTS triggers work correctly
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
