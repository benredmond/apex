// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import type { DatabaseAdapter, Statement } from "./database-adapter.js";
import { DatabaseAdapterFactory } from "./database-adapter.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs-extra";
import type { Pattern, Migration } from "./types.js";
// [PAT:IMPORT:ESM] ★★★★☆ (67 uses, 89% success) - From cache
import { DATABASE_SCHEMA_VERSION } from "../config/constants.js";
import { ApexConfig } from "../config/apex-config.js";
import { SCHEMA_SQL, FTS_SCHEMA_SQL, INDICES_SQL } from "./schema-constants.js";
import {
  withRetry,
  transactionWithRetry,
  tableExists,
  setPragma,
} from "./database-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PatternDatabase {
  private db: DatabaseAdapter;
  private fallbackDb?: DatabaseAdapter;
  private statements: Map<string, Statement> = new Map();
  private fallbackStatements: Map<string, Statement> = new Map();
  private initialized = false;
  private initializing?: Promise<void>;
  private managedConnection = true;
  private pendingDbPath?: string;
  private externalAdapter?: DatabaseAdapter;

  /**
   * Static factory method to create PatternDatabase instances
   * Required due to async DatabaseAdapterFactory
   */
  static async create(
    dbPath: string = ApexConfig.DB_PATH,
    options?: {
      fallbackPath?: string;
      enableFallback?: boolean;
    },
  ): Promise<PatternDatabase> {
    const instance = new PatternDatabase(dbPath);
    await instance.init(dbPath, options);
    return instance;
  }

  // Getter for database instance (needed for migrations)
  get database(): DatabaseAdapter {
    if (!this.db) {
      throw new Error("PatternDatabase not initialized");
    }

    return this.db;
  }

  /**
   * Access the underlying database driver instance when needed
   */
  get rawDatabase(): any {
    if (!this.db) {
      throw new Error("PatternDatabase not initialized");
    }

    if (typeof (this.db as any).getInstance === "function") {
      return (this.db as any).getInstance();
    }

    return this.db;
  }

  // Getter for fallback database instance
  get fallbackDatabase(): DatabaseAdapter | undefined {
    return this.fallbackDb;
  }

  // Check if fallback database is available
  hasFallback(): boolean {
    return this.fallbackDb !== undefined;
  }

  /**
   * Private constructor - use PatternDatabase.create() instead
   */
  constructor(connectionOrPath?: string | DatabaseAdapter | any) {
    if (connectionOrPath && typeof connectionOrPath !== "string") {
      this.externalAdapter = this.normalizeAdapter(connectionOrPath);
      this.managedConnection = false;
    } else if (typeof connectionOrPath === "string") {
      this.pendingDbPath = connectionOrPath;
    }
  }

  /**
   * Initialize the database instance (called by factory method)
   */
  public async init(
    dbPathOrOptions?:
      | string
      | {
          fallbackPath?: string;
          enableFallback?: boolean;
        },
    maybeOptions?: {
      fallbackPath?: string;
      enableFallback?: boolean;
    },
  ): Promise<void> {
    let dbPath: string | undefined;
    let options:
      | {
          fallbackPath?: string;
          enableFallback?: boolean;
        }
      | undefined;

    if (typeof dbPathOrOptions === "string") {
      dbPath = dbPathOrOptions;
      options = maybeOptions;
    } else if (dbPathOrOptions === undefined) {
      dbPath = undefined;
      options = maybeOptions;
    } else {
      options = dbPathOrOptions;
    }

    await this.performInitialization(dbPath, options);
  }

  /**
   * Backward-compatible alias for init()
   */
  public async initialize(
    dbPathOrOptions?:
      | string
      | {
          fallbackPath?: string;
          enableFallback?: boolean;
        },
    maybeOptions?: {
      fallbackPath?: string;
      enableFallback?: boolean;
    },
  ): Promise<void> {
    await this.init(dbPathOrOptions as any, maybeOptions);
  }

  private async performInitialization(
    dbPath: string | undefined,
    options?: {
      fallbackPath?: string;
      enableFallback?: boolean;
    },
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    const targetPath = dbPath ?? this.pendingDbPath ?? ApexConfig.DB_PATH;
    this.pendingDbPath = targetPath;

    if (!this.initializing) {
      this.initializing = (async () => {
        try {
          if (this.externalAdapter) {
            this.db = this.externalAdapter;
          } else {
            const fullPath = this.resolveDatabasePath(targetPath);
            this.managedConnection = true;
            this.db = await DatabaseAdapterFactory.create(fullPath);
          }

          // Initialize fallback database if requested and not already configured
          if (options?.fallbackPath && options?.enableFallback !== false) {
            await this.setupFallbackDatabase(options.fallbackPath);
          }

          if (!this.db) {
            throw new Error(
              "PatternDatabase initialization failed: database adapter not available",
            );
          }

          // Apply runtime pragmas for both managed and external adapters
          setPragma(this.db, "journal_mode", "WAL");
          setPragma(this.db, "synchronous", "NORMAL");
          setPragma(this.db, "temp_store", "MEMORY");
          setPragma(this.db, "read_uncommitted", 1);
          setPragma(this.db, "busy_timeout", 30000);
          setPragma(this.db, "wal_autocheckpoint", 1000);
          setPragma(this.db, "wal_checkpoint", "PASSIVE");

          const cacheSize = process.env.APEX_DB_CACHE_SIZE
            ? parseInt(process.env.APEX_DB_CACHE_SIZE)
            : 10000;
          setPragma(this.db, "cache_size", cacheSize);

          // Initialize schema objects and prepared statements
          await this.initializeSchema();
          this.prepareStatements();
          this.initialized = true;
        } finally {
          this.initializing = undefined;
        }
      })();
    }

    if (this.initializing) {
      await this.initializing;
    }
  }

  private resolveDatabasePath(dbPath: string): string {
    if (!path.isAbsolute(dbPath)) {
      const isMCP =
        process.argv.some((arg) => arg.includes("mcp")) &&
        process.argv.some((arg) => arg.includes("serve"));
      if (isMCP) {
        throw new Error(
          `PatternDatabase: MCP must use absolute database paths. Got relative path: ${dbPath}. ` +
            `This would create a local database. Use PatternRepository.createWithProjectPaths() instead.`,
        );
      }
      if (!dbPath.includes(".apex")) {
        console.warn(
          `⚠️  WARNING: Using relative database path '${dbPath}' will create a local database. ` +
            `Consider using absolute paths from ~/.apex for proper isolation.`,
        );
      }
    }

    const fullPath = path.isAbsolute(dbPath)
      ? dbPath
      : path.join(process.cwd(), dbPath);

    fs.ensureDirSync(path.dirname(fullPath));
    return fullPath;
  }

  private async setupFallbackDatabase(fallbackPath: string): Promise<void> {
    if (this.fallbackDb) {
      return; // Already configured
    }

    try {
      const fallbackFullPath = path.isAbsolute(fallbackPath)
        ? fallbackPath
        : path.join(process.cwd(), fallbackPath);

      if (fs.existsSync(fallbackFullPath)) {
        this.fallbackDb = await DatabaseAdapterFactory.create(fallbackFullPath);
        this.initializeFallbackDb();
      }
    } catch (error) {
      try {
        console.error(
          "Warning: Could not initialize fallback database:",
          error,
        );
      } catch {
        // Ignore console errors
      }
    }
  }

  private normalizeAdapter(candidate: any): DatabaseAdapter {
    if (this.isDatabaseAdapter(candidate)) {
      return candidate;
    }
    return this.createAdapterFromLegacyInstance(candidate);
  }

  private isDatabaseAdapter(value: any): value is DatabaseAdapter {
    return (
      value &&
      typeof value === "object" &&
      typeof value.prepare === "function" &&
      typeof value.exec === "function" &&
      typeof value.transaction === "function" &&
      typeof value.close === "function" &&
      typeof value.getInstance === "function"
    );
  }

  private createAdapterFromLegacyInstance(instance: any): DatabaseAdapter {
    if (!instance || typeof instance.prepare !== "function") {
      throw new Error(
        "PatternDatabase: Unsupported database instance provided. Expected an object with prepare() method.",
      );
    }

    const wrapStatement = (stmt: any): Statement => ({
      run: (...params: any[]) => {
        const result = stmt.run(...params) || {};
        return {
          changes: result.changes ?? 0,
          lastInsertRowid: result.lastInsertRowid ?? 0,
        };
      },
      get: (...params: any[]) => stmt.get(...params),
      all: (...params: any[]) => stmt.all(...params),
    });

    return {
      prepare: (sql: string) => wrapStatement(instance.prepare(sql)),
      exec: (sql: string) => instance.exec(sql),
      pragma: (pragmaString: string) =>
        typeof instance.pragma === "function"
          ? instance.pragma(pragmaString)
          : undefined,
      transaction: <T>(fn: () => T) => {
        if (typeof instance.transaction === "function") {
          return instance.transaction(fn);
        }
        return () => {
          instance.exec("BEGIN");
          try {
            const result = fn();
            instance.exec("COMMIT");
            return result;
          } catch (error) {
            instance.exec("ROLLBACK");
            throw error;
          }
        };
      },
      close: () => {
        if (typeof instance.close === "function") {
          instance.close();
        }
      },
      isNodeSqlite: () => false,
      getInstance: () => instance,
      supportsFTSTriggers: () => true,
    };
  }

  private async initializeSchema(): Promise<void> {
    // [PAT:CLEAN:SINGLE_SOURCE] - Use centralized schema from schema-constants.ts

    // Core pattern table
    this.db.exec(SCHEMA_SQL.patterns);

    // Facet tables
    this.db.exec(SCHEMA_SQL.pattern_languages);
    this.db.exec(SCHEMA_SQL.pattern_frameworks);
    this.db.exec(SCHEMA_SQL.pattern_paths);
    this.db.exec(SCHEMA_SQL.pattern_repos);
    this.db.exec(SCHEMA_SQL.pattern_task_types);
    this.db.exec(SCHEMA_SQL.pattern_snippets);
    this.db.exec(SCHEMA_SQL.pattern_envs);
    this.db.exec(SCHEMA_SQL.pattern_tags);
    this.db.exec(SCHEMA_SQL.snippets);

    // Full-text search tables and triggers
    this.db.exec(FTS_SCHEMA_SQL.patterns_fts);

    // DEFENSIVE: Check if triggers need updating (conditional recreation)
    // Only drop and recreate if they don't exist or have wrong schema
    try {
      // First check if FTS table exists
      const ftsExists = this.db
        .prepare(
          `
        SELECT name FROM sqlite_master 
        WHERE type = 'table' AND name = 'patterns_fts'
      `,
        )
        .get();

      if (!ftsExists) {
        console.warn("FTS table does not exist, skipping trigger check");
        // Don't return here - we still need to initialize other tables!
        // Just skip the trigger check
      } else {
        // Only check and recreate triggers if FTS table exists
        const checkAndRecreateTriggers = async () => {
          const triggers = this.db
            .prepare(
              `
            SELECT name, sql FROM sqlite_master 
            WHERE type = 'trigger' 
            AND name IN ('patterns_ai', 'patterns_ad', 'patterns_au')
          `,
            )
            .all() as { name: string; sql: string }[];

          // Check if we have all 3 triggers and they reference correct columns
          // Note: These columns (category, subcategory, etc.) were removed from patterns table
          // but might exist in old triggers
          const needsRecreation =
            triggers.length !== 3 ||
            triggers.some((t) => {
              const sql = t.sql.toLowerCase();
              // Check for columns that were removed from the patterns table
              // and shouldn't be in FTS triggers
              return (
                sql.includes(".category") ||
                sql.includes(".subcategory") ||
                sql.includes(".problem") ||
                sql.includes(".solution") ||
                sql.includes(".implementation") ||
                sql.includes(".examples") ||
                // Check for wrong trigger names (old pattern)
                sql.includes("patterns_fts_insert") ||
                sql.includes("patterns_fts_update") ||
                sql.includes("patterns_fts_delete")
              );
            });

          if (needsRecreation) {
            console.log("Updating FTS triggers to match current schema...");
            // Use transaction with retry logic for atomic trigger recreation
            await transactionWithRetry(
              this.db,
              () => {
                // Drop all FTS-related triggers (both old and new naming)
                this.db.exec(`
                DROP TRIGGER IF EXISTS patterns_ai;
                DROP TRIGGER IF EXISTS patterns_ad;
                DROP TRIGGER IF EXISTS patterns_au;
                DROP TRIGGER IF EXISTS patterns_fts_insert;
                DROP TRIGGER IF EXISTS patterns_fts_update;
                DROP TRIGGER IF EXISTS patterns_fts_delete;
              `);

                // Recreate with correct schema
                this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.insert);
                this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.update);
                this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.delete);
              },
              { maxRetries: 3, retryDelay: 100 },
            );
          }
        };

        // Call the function only within the else block
        await checkAndRecreateTriggers();
      } // End of else block for ftsExists check
    } catch (error) {
      // Log error but don't fail initialization
      // Triggers can be fixed by migrations
      try {
        console.error("Warning: Failed to check/update FTS triggers:", error);
        console.error("Triggers will be fixed by migration system if needed");
      } catch {
        // Ignore console errors
      }
    }

    // Schema versioning
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('schema_version', '${DATABASE_SCHEMA_VERSION}');
    `);

    // Migrations table
    this.db.exec(SCHEMA_SQL.migrations);

    // Create indices
    this.createIndices();
  }

  private initializeFallbackDb(): void {
    if (!this.fallbackDb) return;

    // Set read-only pragmas for performance
    setPragma(this.fallbackDb, "journal_mode", "WAL");
    setPragma(this.fallbackDb, "synchronous", "NORMAL");
    setPragma(this.fallbackDb, "temp_store", "MEMORY");
    setPragma(this.fallbackDb, "read_uncommitted", 1);
    setPragma(this.fallbackDb, "busy_timeout", 30000); // Match main DB timeout

    // Prepare fallback statements (we'll add these as needed)
  }

  private createIndices(): void {
    const indices = [
      "CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)",
      "CREATE INDEX IF NOT EXISTS idx_patterns_digest ON patterns(pattern_digest)",
      "CREATE INDEX IF NOT EXISTS idx_patterns_invalid ON patterns(invalid)",
      "CREATE INDEX IF NOT EXISTS idx_langs_lang ON pattern_languages(lang)",
      "CREATE INDEX IF NOT EXISTS idx_frameworks_fw ON pattern_frameworks(framework)",
      "CREATE INDEX IF NOT EXISTS idx_paths_glob ON pattern_paths(glob)",
      "CREATE INDEX IF NOT EXISTS idx_repos_glob ON pattern_repos(repo_glob)",
      "CREATE INDEX IF NOT EXISTS idx_tasks_type ON pattern_task_types(task_type)",
      "CREATE INDEX IF NOT EXISTS idx_envs_env ON pattern_envs(env)",
      "CREATE INDEX IF NOT EXISTS idx_tags_tag ON pattern_tags(tag)",
    ];

    for (const idx of indices) {
      try {
        this.db.exec(idx);
      } catch (error: any) {
        const message = error?.message || "";
        if (
          message.includes("no such column") ||
          message.includes("no such table")
        ) {
          // Legacy databases may be missing newer columns; skip index creation
          try {
            console.warn(
              `Skipping index creation due to legacy schema mismatch: ${idx.split(" ")[4] ?? idx}`,
            );
          } catch {
            // ignore logging errors
          }
          continue;
        }
        throw error;
      }
    }
  }

  private prepareStatements(): void {
    // Prepare commonly used statements
    this.safeSetStatement("getPattern", () =>
      this.db.prepare("SELECT * FROM patterns WHERE id = ? AND invalid = 0"),
    );

    // Both node:sqlite and better-sqlite3 support named parameters with @ syntax
    this.safeSetStatement("upsertPattern", () =>
      this.db.prepare(`
      INSERT INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, source_repo, tags,
        pattern_digest, json_canonical, invalid, invalid_reason, alias,
        keywords, search_index, alpha, beta, usage_count, success_count,
        key_insight, when_to_use, common_pitfalls
      ) VALUES (
        @id, @schema_version, @pattern_version, @type, @title, @summary,
        @trust_score, @created_at, @updated_at, @source_repo, @tags,
        @pattern_digest, @json_canonical, @invalid, @invalid_reason, @alias,
        @keywords, @search_index, @alpha, @beta, @usage_count, @success_count,
        @key_insight, @when_to_use, @common_pitfalls
      )
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        pattern_version = excluded.pattern_version,
        type = excluded.type,
        title = excluded.title,
        summary = excluded.summary,
        trust_score = excluded.trust_score,
        updated_at = excluded.updated_at,
        source_repo = excluded.source_repo,
        tags = excluded.tags,
        pattern_digest = excluded.pattern_digest,
        json_canonical = excluded.json_canonical,
        invalid = excluded.invalid,
        invalid_reason = excluded.invalid_reason,
        alias = excluded.alias,
        keywords = excluded.keywords,
        search_index = excluded.search_index,
        alpha = excluded.alpha,
        beta = excluded.beta,
        usage_count = excluded.usage_count,
        success_count = excluded.success_count,
        key_insight = excluded.key_insight,
        when_to_use = excluded.when_to_use,
        common_pitfalls = excluded.common_pitfalls
    `),
    );

    this.safeSetStatement("deletePattern", () =>
      this.db.prepare("DELETE FROM patterns WHERE id = ?"),
    );

    // Alias lookup statements (APE-44)
    this.safeSetStatement("getPatternByAlias", () =>
      this.db.prepare("SELECT * FROM patterns WHERE alias = ? AND invalid = 0"),
    );

    this.safeSetStatement("getPatternByTitle", () =>
      this.db.prepare(
        "SELECT * FROM patterns WHERE LOWER(title) = LOWER(?) AND invalid = 0",
      ),
    );

    this.safeSetStatement("checkAliasExists", () =>
      this.db.prepare("SELECT COUNT(*) as count FROM patterns WHERE alias = ?"),
    );

    this.safeSetStatement("searchPatterns", () =>
      this.db.prepare(`
      SELECT p.*
      FROM patterns_fts
      JOIN patterns p ON p.rowid = patterns_fts.rowid
      WHERE patterns_fts MATCH ?
      AND p.invalid = 0
      ORDER BY patterns_fts.rowid
      LIMIT ?
    `),
    );
  }

  private safeSetStatement(name: string, factory: () => Statement): void {
    try {
      const stmt = factory();
      this.statements.set(name, stmt);
    } catch (error: any) {
      const message = error?.message || "";
      const isLegacySchema =
        message.includes("no such column") ||
        message.includes("no such table") ||
        message.includes("has no column named");

      if (isLegacySchema) {
        try {
          console.warn(
            `Skipping prepared statement ${name} due to legacy schema mismatch`,
          );
        } catch {
          // ignore logging failures
        }
        return;
      }
      throw error;
    }
  }

  /**
   * Retrieve the active database adapter for advanced operations
   */
  public getAdapter(): DatabaseAdapter {
    return this.db;
  }

  /**
   * Simple pattern search helper mirroring legacy Jest helpers
   */
  public searchPatterns(query: string, limit: number = 20): any[] {
    return this.getStatement("searchPatterns").all(query, limit);
  }

  /**
   * Convenience method used by older tests to fetch all patterns
   */
  public getAllPatterns(): any[] {
    const stmt = this.db.prepare(
      "SELECT * FROM patterns WHERE invalid = 0 ORDER BY updated_at DESC",
    );
    return stmt.all();
  }

  /**
   * Execute a database operation with retry logic for SQLITE_BUSY errors
   * [FIX:SQLITE:BUSY] - Exponential backoff for database locks
   */
  public async withRetry<T>(
    fn: () => T | Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (error?.code === "SQLITE_BUSY" && i < maxRetries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = 100 * Math.pow(2, i);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw new Error("Retry logic failed - should not reach here");
  }

  public transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  public getStatement(name: string): Statement {
    const stmt = this.statements.get(name);
    if (!stmt) {
      throw new Error(`Statement ${name} not found`);
    }
    return stmt;
  }

  public prepare(sql: string): Statement {
    return this.db.prepare(sql);
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Query with fallback to global database
   * Returns combined results from primary and fallback databases
   * Primary results take precedence over fallback
   */
  public queryWithFallback(sql: string, params: any[] = []): any[] {
    // Get results from primary database
    const primaryStmt = this.db.prepare(sql);
    const primaryResults =
      params.length > 0 ? primaryStmt.all(...params) : primaryStmt.all();

    // If no fallback database, return primary results only
    if (!this.fallbackDb) {
      return primaryResults;
    }

    // Get results from fallback database
    try {
      const fallbackStmt = this.fallbackDb.prepare(sql);
      const fallbackResults =
        params.length > 0 ? fallbackStmt.all(...params) : fallbackStmt.all();

      // Merge results - primary takes precedence
      // Deduplicate by pattern ID if present
      const primaryIds = new Set(
        primaryResults.map((r: any) => r.id || r.pattern_id).filter(Boolean),
      );

      const uniqueFallbackResults = fallbackResults.filter((fb: any) => {
        const fbId = fb.id || fb.pattern_id;
        return fbId ? !primaryIds.has(fbId) : true;
      });

      return [...primaryResults, ...uniqueFallbackResults];
    } catch (error) {
      // If fallback query fails (e.g., schema mismatch), return primary only
      try {
        console.error("Fallback query failed:", error);
      } catch {
        // Ignore console errors
      }
      return primaryResults;
    }
  }

  /**
   * Get single row with fallback
   */
  public getWithFallback(sql: string, params: any[] = []): any | undefined {
    const results = this.queryWithFallback(sql, params);
    return results[0];
  }

  public close(): void {
    if (
      this.db &&
      this.managedConnection &&
      typeof this.db.close === "function"
    ) {
      this.db.close();
    }
    if (this.fallbackDb) {
      this.fallbackDb.close();
      this.fallbackDb = undefined;
    }
    this.initialized = false;
    this.initializing = undefined;
  }

  // Migration support
  public async runMigrations(migrations: Migration[]): Promise<void> {
    const applied = this.db.prepare("SELECT id FROM migrations").all() as {
      id: string;
    }[];
    const appliedIds = new Set(applied.map((m) => m.id));

    for (const migration of migrations) {
      if (!appliedIds.has(migration.id)) {
        const transaction = this.db.transaction(() => {
          this.db.exec(migration.sql);
          this.db
            .prepare(
              "INSERT INTO migrations (id, sql, applied_at) VALUES (?, ?, ?)",
            )
            .run(migration.id, migration.sql, new Date().toISOString());
        });
        transaction();
      }
    }
  }

  public getSchemaVersion(): string {
    const result = this.db
      .prepare("SELECT value FROM schema_meta WHERE key = ?")
      .get("schema_version") as { value: string };
    return result?.value || "0.1";
  }
}
