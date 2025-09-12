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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PatternDatabase {
  private db: DatabaseAdapter;
  private fallbackDb?: DatabaseAdapter;
  private statements: Map<string, Statement> = new Map();
  private fallbackStatements: Map<string, Statement> = new Map();

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
    const instance = new PatternDatabase();
    await instance.initialize(dbPath, options);
    return instance;
  }

  // Getter for database instance (needed for migrations)
  get database(): DatabaseAdapter {
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
  private constructor() {}

  /**
   * Initialize the database instance (called by factory method)
   */
  private async initialize(
    dbPath: string = ApexConfig.DB_PATH,
    options?: {
      fallbackPath?: string;
      enableFallback?: boolean;
    },
  ): Promise<void> {
    // DEFENSIVE: Warn if using relative path (should always use absolute paths from ~/.apex)
    if (!path.isAbsolute(dbPath)) {
      // Check if we're in MCP context (which should always use absolute paths)
      // MCP is started with: apex mcp serve
      const isMCP =
        process.argv.some((arg) => arg.includes("mcp")) &&
        process.argv.some((arg) => arg.includes("serve"));
      if (isMCP) {
        throw new Error(
          `PatternDatabase: MCP must use absolute database paths. Got relative path: ${dbPath}. ` +
            `This would create a local database. Use PatternRepository.createWithProjectPaths() instead.`,
        );
      }
      // For non-MCP (CLI), warn but allow for backward compatibility
      if (!dbPath.includes(".apex")) {
        console.warn(
          `⚠️  WARNING: Using relative database path '${dbPath}' will create a local database. ` +
            `Consider using absolute paths from ~/.apex for proper isolation.`,
        );
      }
    }

    // Use centralized config for database path
    const fullPath = path.isAbsolute(dbPath)
      ? dbPath
      : path.join(process.cwd(), dbPath);

    // Ensure directory exists
    fs.ensureDirSync(path.dirname(fullPath));

    // Open database using adapter factory for SEA/npm compatibility
    this.db = await DatabaseAdapterFactory.create(fullPath);

    // Initialize fallback database if path provided
    if (options?.fallbackPath && options?.enableFallback !== false) {
      try {
        const fallbackFullPath = path.isAbsolute(options.fallbackPath)
          ? options.fallbackPath
          : path.join(process.cwd(), options.fallbackPath);

        // Only use fallback if it exists (don't create it)
        if (fs.existsSync(fallbackFullPath)) {
          this.fallbackDb =
            await DatabaseAdapterFactory.create(fallbackFullPath);
          this.initializeFallbackDb();
        }
      } catch (error) {
        // Fallback database is optional, so we can continue without it
        console.error(
          "Warning: Could not initialize fallback database:",
          error,
        );
      }
    }

    // Enable WAL mode for better concurrency
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("temp_store = MEMORY");

    // Optimize for concurrent reads and multiple processes
    this.db.pragma("read_uncommitted = 1");
    this.db.pragma("busy_timeout = 30000"); // Increase to 30 seconds for heavy concurrent access
    this.db.pragma("wal_autocheckpoint = 1000"); // Auto-checkpoint every 1000 pages

    // Don't truncate WAL on startup - it can cause disk I/O errors with concurrent access
    // Instead, just do a passive checkpoint
    this.db.pragma("wal_checkpoint(PASSIVE)");

    // Increase cache size for better performance with large codebases
    const cacheSize = process.env.APEX_DB_CACHE_SIZE
      ? parseInt(process.env.APEX_DB_CACHE_SIZE)
      : 10000;
    this.db.pragma(`cache_size = ${cacheSize}`);

    // Initialize schema
    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
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
    // DEFENSIVE: Drop and recreate FTS triggers to prevent schema mismatches
    // This handles cases where triggers exist but reference old column names
    this.db.exec(`
      DROP TRIGGER IF EXISTS patterns_fts_insert;
      DROP TRIGGER IF EXISTS patterns_fts_update;
      DROP TRIGGER IF EXISTS patterns_fts_delete;
    `);
    
    this.db.exec(FTS_SCHEMA_SQL.patterns_fts);
    this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.insert);
    this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.update);
    this.db.exec(FTS_SCHEMA_SQL.patterns_fts_triggers.delete);

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
    this.fallbackDb.pragma("journal_mode = WAL");
    this.fallbackDb.pragma("synchronous = NORMAL");
    this.fallbackDb.pragma("temp_store = MEMORY");
    this.fallbackDb.pragma("read_uncommitted = 1");
    this.fallbackDb.pragma("busy_timeout = 30000"); // Match main DB timeout

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
      this.db.exec(idx);
    }
  }

  private prepareStatements(): void {
    // Prepare commonly used statements
    this.statements.set(
      "getPattern",
      this.db.prepare("SELECT * FROM patterns WHERE id = ? AND invalid = 0"),
    );

    this.statements.set(
      "upsertPattern",
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

    this.statements.set(
      "deletePattern",
      this.db.prepare("DELETE FROM patterns WHERE id = ?"),
    );

    // Alias lookup statements (APE-44)
    this.statements.set(
      "getPatternByAlias",
      this.db.prepare("SELECT * FROM patterns WHERE alias = ? AND invalid = 0"),
    );

    this.statements.set(
      "getPatternByTitle",
      this.db.prepare(
        "SELECT * FROM patterns WHERE LOWER(title) = LOWER(?) AND invalid = 0",
      ),
    );

    this.statements.set(
      "checkAliasExists",
      this.db.prepare("SELECT COUNT(*) as count FROM patterns WHERE alias = ?"),
    );

    this.statements.set(
      "searchPatterns",
      this.db.prepare(`
      SELECT p.*, bm25(patterns_fts) AS rank
      FROM patterns_fts
      JOIN patterns p ON p.rowid = patterns_fts.rowid
      WHERE patterns_fts MATCH ?
      AND p.invalid = 0
      ORDER BY rank
      LIMIT ?
    `),
    );
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
      console.error("Fallback query failed:", error);
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
    this.db.close();
    if (this.fallbackDb) {
      this.fallbackDb.close();
    }
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
