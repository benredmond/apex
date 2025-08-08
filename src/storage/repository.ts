// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import path from "path";
import fs from "fs-extra";
import type Database from "better-sqlite3";
import { PatternDatabase } from "./database.js";
import { PatternCache } from "./cache.js";
import { PatternLoader } from "./loader.js";
import { PatternWatcher } from "./watcher.js";
import type {
  Pattern,
  LookupQuery,
  SearchQuery,
  ListOptions,
  QueryFacets,
  PatternPack,
  ValidationResult,
  FileChangeEvent,
  PatternMetadata,
  PatternTrigger,
  PatternVocab,
} from "./types.js";

export class PatternRepository {
  private db: PatternDatabase;
  private cache: PatternCache;
  private loader: PatternLoader;
  private watcher: PatternWatcher;
  private patternsDir: string;
  private isWatching: boolean = false;

  constructor(
    options: {
      dbPath?: string;
      patternsDir?: string;
      cacheSize?: number;
      watchDebounce?: number;
    } = {},
  ) {
    this.patternsDir = options.patternsDir || ".apex/patterns";
    this.db = new PatternDatabase(options.dbPath);
    this.cache = new PatternCache(options.cacheSize);
    this.loader = new PatternLoader();
    this.watcher = new PatternWatcher(this.patternsDir, options.watchDebounce);

    // Set up watcher event handlers
    this.watcher.on("change", (event: FileChangeEvent) =>
      this.handleFileChange(event),
    );
    this.watcher.on("error", (error: Error) =>
      console.error("Watcher error:", error),
    );
  }

  /**
   * Initialize repository and start watching
   */
  public async initialize(): Promise<void> {
    // Ensure patterns directory exists
    await fs.ensureDir(this.patternsDir);

    // Start watching for changes
    this.watcher.start();
    this.isWatching = true;

    // Wait for initial scan to complete
    await new Promise((resolve) => {
      this.watcher.once("ready", resolve);
    });
  }

  /**
   * Shutdown repository
   */
  public async shutdown(): Promise<void> {
    if (this.isWatching) {
      await this.watcher.stop();
      this.isWatching = false;
    }
    this.db.close();
  }

  /**
   * Get the watcher instance (for testing)
   * @internal
   */
  public getWatcher(): PatternWatcher {
    return this.watcher;
  }

  /**
   * Get the database instance for dependency injection
   * @internal
   */
  public getDatabase(): Database.Database {
    return this.db.database;
  }

  // Core CRUD operations

  public async create(pattern: Pattern): Promise<Pattern> {
    // Write to YAML file
    const filePath = this.getPatternFilePath(pattern.id);
    await this.writePatternFile(filePath, pattern);

    // File watcher will pick up the change and update DB
    // But we can also update immediately for responsiveness
    this.upsertPattern(pattern);

    return pattern;
  }

  public async update(id: string, updates: Partial<Pattern>): Promise<Pattern> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Pattern ${id} not found`);
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    await this.create(updated);
    return updated;
  }

  public async delete(id: string): Promise<void> {
    const filePath = this.getPatternFilePath(id);

    // Delete file (watcher will update DB)
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }

    // Also delete from DB immediately
    this.db.getStatement("deletePattern").run(id);
    this.cache.deletePattern(id);
  }

  public async get(id: string): Promise<Pattern | null> {
    // Check cache first
    const cached = this.cache.getPattern(id);
    if (cached) {
      return cached;
    }

    // Query database
    const row = this.db.getStatement("getPattern").get(id) as any;
    if (!row) {
      return null;
    }

    const pattern = this.rowToPattern(row);
    this.cache.setPattern(id, pattern);
    return pattern;
  }

  /**
   * Get pattern with enhanced metadata including last_used_task (APE-65)
   */
  public async getWithMetadata(
    id: string,
  ): Promise<(Pattern & { last_used_task?: string }) | null> {
    const pattern = await this.get(id);
    if (!pattern) return null;

    // Query for last_used_task from reflections
    try {
      const lastUsedRow = this.db.database
        .prepare(
          `
        SELECT task_id, MAX(created_at) as last_used
        FROM reflections
        WHERE json_extract(json, '$.claims.patterns_used[*].pattern_id') LIKE ?
        GROUP BY task_id
        ORDER BY last_used DESC
        LIMIT 1
      `,
        )
        .get(`%${id}%`) as any;

      if (lastUsedRow) {
        return { ...pattern, last_used_task: lastUsedRow.task_id };
      }
    } catch (error) {
      // Reflections table might not exist or query might fail
      console.debug(`Could not fetch last_used_task for pattern ${id}:`, error);
    }

    return pattern;
  }

  /**
   * Get pattern by ID, alias, or title (APE-44)
   * Tries in order: exact ID match, alias match, case-insensitive title match
   */
  public async getByIdOrAlias(identifier: string): Promise<Pattern | null> {
    // Try exact ID match first (fastest)
    let pattern = await this.get(identifier);
    if (pattern) return pattern;

    // Try alias match (indexed lookup)
    const aliasRow = this.db
      .getStatement("getPatternByAlias")
      .get(identifier) as any;
    if (aliasRow) {
      pattern = this.rowToPattern(aliasRow);
      this.cache.setPattern(pattern.id, pattern);
      return pattern;
    }

    // Try case-insensitive title match (slower)
    const titleRow = this.db
      .getStatement("getPatternByTitle")
      .get(identifier) as any;
    if (titleRow) {
      pattern = this.rowToPattern(titleRow);
      this.cache.setPattern(pattern.id, pattern);
      return pattern;
    }

    return null;
  }

  // Query methods

  /**
   * List patterns with simple filtering and pagination
   * [FIX:API:METHOD_CONSISTENCY] ★★☆☆☆ - Standard list method
   */
  public async list(options: ListOptions = {}): Promise<Pattern[]> {
    const {
      limit = 50,
      offset = 0,
      orderBy = "trust_score",
      order = "desc",
      filter = {},
    } = options;

    // Build query
    let sql = `
      SELECT * FROM patterns
      WHERE 1=1
    `;
    const params: any[] = [];

    // Apply filters
    if (filter.type && filter.type.length > 0) {
      sql += ` AND type IN (${filter.type.map(() => "?").join(", ")})`;
      params.push(...filter.type);
    }

    if (filter.minTrust !== undefined) {
      sql += " AND trust_score >= ?";
      params.push(filter.minTrust);
    }

    if (filter.tags && filter.tags.length > 0) {
      sql += ` AND id IN (
        SELECT pattern_id FROM pattern_tags
        WHERE tag IN (${filter.tags.map(() => "?").join(", ")})
      )`;
      params.push(...filter.tags);
    }

    if (filter.valid !== undefined) {
      sql += " AND invalid = ?";
      params.push(filter.valid ? 0 : 1);
    }

    // Apply ordering
    const validOrderBy = [
      "trust_score",
      "usage_count",
      "created_at",
      "updated_at",
    ];
    const safeOrderBy = validOrderBy.includes(orderBy)
      ? orderBy
      : "trust_score";
    const safeOrder = order === "asc" ? "ASC" : "DESC";
    sql += ` ORDER BY ${safeOrderBy} ${safeOrder}`;

    // Apply pagination
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // Execute query
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    // Convert rows to patterns
    return rows.map((row) => this.rowToPattern(row));
  }

  /**
   * Semantic search with facets using FTS5
   * [PAT:SEARCH:FTS5] ★★★★☆ - SQLite FTS5 search implementation
   */
  public async search(query: SearchQuery): Promise<PatternPack> {
    // [PAT:PERF:QUERY_MONITORING] - Monitor query performance
    const startTime = performance.now();
    const { task = "", type, tags, k = 20 } = query;

    // Build FTS5 query
    let ftsQuery = task.trim();
    if (!ftsQuery) {
      // Fall back to facet-based search if no text query
      return this.lookup({
        type: type,
        tags,
        k,
      } as LookupQuery);
    }

    // Process the query for FTS5
    // Split multi-word queries into individual terms with OR
    const terms = ftsQuery.split(/\s+/).filter((t) => t.length > 0);
    if (terms.length > 1) {
      // Create an OR query for multiple terms
      ftsQuery = terms
        .map((term) => {
          // Escape special FTS5 characters
          const escaped = term.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(" OR ");
    } else {
      // Single term - just escape it
      ftsQuery = ftsQuery.replace(/"/g, '""');
    }

    // Build the SQL query using FTS5 MATCH
    let sql = `
      SELECT DISTINCT p.*, 
             rank * -1 as fts_rank
      FROM patterns p
      JOIN patterns_fts pf ON p.rowid = pf.rowid
      WHERE pf.patterns_fts MATCH ?
        AND p.invalid = 0
    `;

    const params: any[] = [ftsQuery];

    // Add type filter if specified
    // Handle type as array for consistency with SearchQuery interface
    if (type && Array.isArray(type) && type.length > 0) {
      const typePlaceholders = type.map(() => "?").join(",");
      sql += ` AND p.type IN (${typePlaceholders})`;
      params.push(...type);
    } else if (type && !Array.isArray(type)) {
      // Handle single type for backward compatibility
      sql += ` AND p.type = ?`;
      params.push(type);
    }

    // Add tag filter if specified
    if (tags && tags.length > 0) {
      const tagPlaceholders = tags.map(() => "?").join(",");
      sql += ` AND p.id IN (
        SELECT pattern_id FROM pattern_tags WHERE tag IN (${tagPlaceholders})
      )`;
      params.push(...tags);
    }

    // Order by FTS rank (lower rank = better match)
    sql += ` ORDER BY fts_rank ASC LIMIT ?`;
    params.push(k);

    let rows: any[] = [];
    try {
      // [FIX:ASYNC:SYNC] ★★★★★ - SQLite operations are synchronous
      const stmt = this.db.prepare(sql);
      rows = stmt.all(...params) as any[];
    } catch (error) {
      console.error("[ERROR] FTS5 search failed:", error);
      console.error("[ERROR] Query:", { task: ftsQuery, type, tags });
      // Fall back to regular facet-based search
      console.warn("[FALLBACK] Using facet-based search due to FTS5 error");
      return this.lookup({
        type: Array.isArray(type) ? type : type ? [type] : undefined,
        tags,
        k,
      });
    }

    // Convert rows to patterns
    const patterns = rows.map((row) => this.rowToPattern(row));

    // Cache patterns
    patterns.forEach((p) => this.cache.setPattern(p.id, p));

    // Performance monitoring
    const duration = performance.now() - startTime;
    if (duration > 100) {
      console.warn(
        `[PERF] Slow FTS5 search detected: ${duration.toFixed(2)}ms`,
        {
          query: task,
          resultCount: patterns.length,
          filters: { type, tags },
        },
      );
    }

    return {
      patterns,
      total: patterns.length,
      query,
    };
  }

  /**
   * @deprecated Use search() for semantic queries or list() for simple enumeration
   * [FIX:BREAKING:MIGRATION] ★★★★☆ - Deprecation with backward compatibility
   */
  public async lookup(query: LookupQuery): Promise<PatternPack> {
    console.warn(
      "PatternRepository.lookup() is deprecated. Use search() for semantic queries or list() for simple enumeration.",
    );
    const { k = 20, ...facets } = query;

    // Build query facets
    const queryFacets: QueryFacets = {
      type: facets.type?.[0], // Convert array to single type for facets
      languages: facets.languages,
      frameworks: facets.frameworks,
      tags: facets.tags,
      paths: facets.paths,
      task_types: facets.task_types,
      envs: facets.envs,
    };

    // Generate cache key
    const cacheKey = PatternCache.generateFacetKey(queryFacets);
    const cachedIds = this.cache.getFacetResults(cacheKey);

    if (cachedIds) {
      // Load patterns from cache/DB
      const patterns = await Promise.all(
        cachedIds.slice(0, k).map((id) => this.get(id)),
      );
      return {
        patterns: patterns.filter(Boolean) as Pattern[],
        total: cachedIds.length,
        query,
      };
    }

    // Build query
    let sql = this.buildLookupQuery(queryFacets);
    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as any[];

    // Cache results
    const patternIds = rows.map((r) => r.id);
    this.cache.setFacetResults(cacheKey, patternIds);

    // Convert rows to patterns
    const patterns = rows.slice(0, k).map((row) => this.rowToPattern(row));

    // Cache individual patterns
    patterns.forEach((p) => this.cache.setPattern(p.id, p));

    return {
      patterns,
      total: rows.length,
      query,
    };
  }

  /**
   * Text-based search (distinct from semantic search)
   */
  public async searchText(
    text: string,
    limit: number = 20,
  ): Promise<Pattern[]> {
    const rows = this.db
      .getStatement("searchPatterns")
      .all(text, limit) as any[];
    return rows.map((row) => this.rowToPattern(row));
  }

  public async findByFacets(facets: QueryFacets): Promise<Pattern[]> {
    const result = await this.lookup({
      type: facets.type ? [facets.type] : undefined,
      languages: facets.languages,
      frameworks: facets.frameworks,
      tags: facets.tags,
      paths: facets.paths,
      task_types: facets.task_types,
      envs: facets.envs,
      k: 100,
    });
    return result.patterns;
  }

  // Maintenance operations

  public async rebuild(): Promise<void> {
    // Clear cache
    this.cache.invalidateAll();

    // Reload all patterns from disk
    const results = await this.loader.loadDirectory(this.patternsDir);

    // Transaction for bulk insert
    this.db.transaction(() => {
      // Clear existing data
      this.db.exec("DELETE FROM patterns");

      // Insert all valid patterns
      for (const { path, result } of results) {
        if ("pattern" in result) {
          this.upsertPattern(result.pattern);
        } else {
          console.error(`Failed to load ${path}: ${result.error}`);
        }
      }
    });
  }

  public async validate(): Promise<ValidationResult[]> {
    const results = await this.loader.loadDirectory(this.patternsDir);

    return results.map(({ path, result }) => {
      const patternId =
        path
          .split("/")
          .pop()
          ?.replace(/\.(yaml|yml|json)$/, "") || "unknown";

      if ("error" in result) {
        return {
          pattern_id: patternId,
          valid: false,
          errors: [result.error],
        };
      }

      return {
        pattern_id: result.pattern.id,
        valid: true,
      };
    });
  }

  public async migrate(): Promise<void> {
    // Import migration system dynamically to avoid circular dependencies
    const { MigrationLoader, MigrationRunner } = await import(
      "../migrations/index.js"
    );

    const loader = new MigrationLoader();
    const runner = new MigrationRunner(this.db.database);

    const migrations = await loader.loadMigrations();
    await runner.runMigrations(migrations);
  }

  // Private helper methods

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    try {
      if (event.type === "unlink") {
        // Extract pattern ID from file path
        const patternId = path.basename(event.path, path.extname(event.path));
        this.db.getStatement("deletePattern").run(patternId);
        this.cache.deletePattern(patternId);
      } else {
        // Load and upsert pattern
        const result = await this.loader.loadPattern(event.path);

        if ("pattern" in result) {
          this.upsertPattern(result.pattern);
        } else {
          // Mark pattern as invalid
          const patternId = path.basename(event.path, path.extname(event.path));
          await this.markInvalid(patternId, result.error);
        }
      }
    } catch (error) {
      console.error(`Error handling file change for ${event.path}:`, error);
    }
  }

  private upsertPattern(pattern: Pattern): void {
    this.db.transaction(() => {
      // Upsert main pattern
      this.db.getStatement("upsertPattern").run({
        ...pattern,
        source_repo: pattern.source_repo || null,
        tags: JSON.stringify(pattern.tags), // [APE-63] Store tags as JSON
        invalid: pattern.invalid ? 1 : 0,
        invalid_reason: pattern.invalid_reason || null,
        alias: pattern.alias || null, // APE-44: Support for human-readable aliases
      });

      // Insert facet data
      this._insertFacets(pattern.id, pattern);
    });

    // Update cache
    this.cache.setPattern(pattern.id, pattern);
    this.cache.invalidateFacetsForPattern(pattern.id);
  }

  /**
   * Extract and insert facet data for a pattern
   * [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Clean extraction of facet logic
   */
  private _insertFacets(patternId: string, pattern: any): void {
    // Delete existing facet data for this pattern
    this.db
      .prepare("DELETE FROM pattern_languages WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_frameworks WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_tags WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_paths WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_repos WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_task_types WHERE pattern_id = ?")
      .run(patternId);
    this.db
      .prepare("DELETE FROM pattern_envs WHERE pattern_id = ?")
      .run(patternId);

    // Insert tags (already implemented)
    if (pattern.tags && Array.isArray(pattern.tags)) {
      const insertTag = this.db.prepare(
        "INSERT INTO pattern_tags (pattern_id, tag) VALUES (?, ?)",
      );
      for (const tag of pattern.tags) {
        insertTag.run(patternId, tag);
      }
    }

    // Extract scope data if available (patterns loaded from YAML have scope field)
    const scope = pattern.scope || {};

    // Insert languages
    if (scope.languages && Array.isArray(scope.languages)) {
      const insertLang = this.db.prepare(
        "INSERT INTO pattern_languages (pattern_id, lang) VALUES (?, ?)",
      );
      for (const lang of scope.languages) {
        insertLang.run(patternId, lang);
      }
    }

    // Insert frameworks with optional semver
    if (scope.frameworks && Array.isArray(scope.frameworks)) {
      const insertFramework = this.db.prepare(
        "INSERT INTO pattern_frameworks (pattern_id, framework, semver) VALUES (?, ?, ?)",
      );
      for (const fw of scope.frameworks) {
        if (typeof fw === "string") {
          // Simple framework name
          insertFramework.run(patternId, fw, null);
        } else if (fw && typeof fw === "object" && fw.name) {
          // Framework with semver
          const semver = fw.semver || fw.version || null;
          insertFramework.run(patternId, fw.name, semver);
        }
      }

      // Also check semver_constraints for additional framework versions
      if (pattern.semver_constraints?.dependencies) {
        for (const [framework, version] of Object.entries(
          pattern.semver_constraints.dependencies,
        )) {
          // Only add if not already in scope.frameworks
          const alreadyAdded = scope.frameworks.some(
            (fw: any) =>
              (typeof fw === "string" && fw === framework) ||
              (fw && typeof fw === "object" && fw.name === framework),
          );
          if (!alreadyAdded && typeof version === "string") {
            insertFramework.run(patternId, framework, version);
          }
        }
      }
    }

    // Insert paths
    if (scope.paths && Array.isArray(scope.paths)) {
      const insertPath = this.db.prepare(
        "INSERT INTO pattern_paths (pattern_id, glob) VALUES (?, ?)",
      );
      for (const path of scope.paths) {
        insertPath.run(patternId, path);
      }
    }

    // Insert repos
    if (scope.repos && Array.isArray(scope.repos)) {
      const insertRepo = this.db.prepare(
        "INSERT INTO pattern_repos (pattern_id, repo_glob) VALUES (?, ?)",
      );
      for (const repo of scope.repos) {
        insertRepo.run(patternId, repo);
      }
    }

    // Insert task types
    if (scope.task_types && Array.isArray(scope.task_types)) {
      const insertTaskType = this.db.prepare(
        "INSERT INTO pattern_task_types (pattern_id, task_type) VALUES (?, ?)",
      );
      for (const taskType of scope.task_types) {
        insertTaskType.run(patternId, taskType);
      }
    }

    // Insert environments
    if (scope.envs && Array.isArray(scope.envs)) {
      const insertEnv = this.db.prepare(
        "INSERT INTO pattern_envs (pattern_id, env) VALUES (?, ?)",
      );
      for (const env of scope.envs) {
        insertEnv.run(patternId, env);
      }
    }
  }

  private async markInvalid(patternId: string, reason: string): Promise<void> {
    this.db
      .prepare(
        `
      UPDATE patterns 
      SET invalid = 1, invalid_reason = ? 
      WHERE id = ?
    `,
      )
      .run(reason, patternId);

    this.cache.deletePattern(patternId);
  }

  private getPatternFilePath(patternId: string): string {
    // Organize by pattern type if available
    return path.join(this.patternsDir, `${patternId}.yaml`);
  }

  private async writePatternFile(
    filePath: string,
    pattern: Pattern,
  ): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));

    // Write to temp file first
    const tempPath = `${filePath}.tmp`;

    // Remove internal fields before writing
    const {
      pattern_digest,
      json_canonical,
      invalid,
      invalid_reason,
      ...fileData
    } = pattern;

    await fs.writeFile(tempPath, JSON.stringify(fileData, null, 2));

    // Atomic rename
    await fs.rename(tempPath, filePath);
  }

  private rowToPattern(row: any): Pattern {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      invalid: row.invalid === 1,
      // Include enhanced metadata fields (APE-65)
      usage_count: row.usage_count,
      success_count: row.success_count,
      key_insight: row.key_insight,
      when_to_use: row.when_to_use,
      common_pitfalls: row.common_pitfalls,
    };
  }

  private buildLookupQuery(facets: QueryFacets): string {
    let sql = "SELECT DISTINCT p.* FROM patterns p";
    const joins: string[] = [];
    const wheres: string[] = ["p.invalid = 0"];

    // Include all patterns regardless of trust score
    // The ranking system will prioritize high-trust patterns
    // This allows new patterns to be discovered and used

    if (facets.type) {
      wheres.push(`p.type = '${facets.type}'`);
    }

    // Only add language filter if languages are specified and non-empty
    if (facets.languages && facets.languages.length > 0) {
      joins.push("JOIN pattern_languages l ON l.pattern_id = p.id");
      wheres.push(
        `l.lang IN (${facets.languages.map((l) => `'${l}'`).join(",")})`,
      );
    }

    // Only add framework filter if frameworks are specified and non-empty
    if (facets.frameworks && facets.frameworks.length > 0) {
      joins.push("LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id");
      const frameworkCondition = facets.frameworks
        .map((f) => `f.framework = '${f}'`)
        .join(" OR ");
      wheres.push(`(f.framework IS NULL OR (${frameworkCondition}))`);
    }

    if (facets.tags?.length) {
      joins.push("JOIN pattern_tags t ON t.pattern_id = p.id");
      wheres.push(`t.tag IN (${facets.tags.map((t) => `'${t}'`).join(",")})`);
    }

    // Add other facet joins...

    sql += " " + joins.join(" ");
    if (wheres.length > 0) {
      sql += " WHERE " + wheres.join(" AND ");
    }

    // Order by trust score descending to prioritize high-trust patterns
    sql += " ORDER BY p.trust_score DESC";

    return sql;
  }

  /**
   * Load pattern metadata for given pattern IDs
   * [PAT:REPO:METHOD] ★★★★★ - Repository method pattern
   */
  public async getMetadata(
    patternIds: string[],
  ): Promise<Map<string, PatternMetadata[]>> {
    if (patternIds.length === 0) {
      return new Map();
    }

    const placeholders = patternIds.map(() => "?").join(",");
    const sql = `SELECT * FROM pattern_metadata WHERE pattern_id IN (${placeholders})`;

    // [FIX:ASYNC:SYNC] ★★★★★ - SQLite operations are synchronous
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...patternIds) as PatternMetadata[];

    // Group by pattern_id
    const result = new Map<string, PatternMetadata[]>();
    for (const row of rows) {
      if (!result.has(row.pattern_id)) {
        result.set(row.pattern_id, []);
      }
      result.get(row.pattern_id)!.push(row);
    }

    return result;
  }

  /**
   * Load pattern triggers for given pattern IDs
   * [PAT:REPO:METHOD] ★★★★★ - Repository method pattern
   */
  public async getTriggers(
    patternIds: string[],
  ): Promise<Map<string, PatternTrigger[]>> {
    if (patternIds.length === 0) {
      return new Map();
    }

    const placeholders = patternIds.map(() => "?").join(",");
    const sql = `SELECT * FROM pattern_triggers WHERE pattern_id IN (${placeholders}) ORDER BY priority DESC`;

    // [FIX:ASYNC:SYNC] ★★★★★ - SQLite operations are synchronous
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...patternIds) as any[];

    // Convert and group by pattern_id
    const result = new Map<string, PatternTrigger[]>();
    for (const row of rows) {
      // Convert regex field from 0/1 to boolean
      const trigger: PatternTrigger = {
        ...row,
        regex: row.regex === 1,
      };

      if (!result.has(row.pattern_id)) {
        result.set(row.pattern_id, []);
      }
      result.get(row.pattern_id)!.push(trigger);
    }

    return result;
  }

  /**
   * Load pattern vocabulary for given pattern IDs
   * [PAT:REPO:METHOD] ★★★★★ - Repository method pattern
   */
  public async getVocab(
    patternIds: string[],
  ): Promise<Map<string, PatternVocab[]>> {
    if (patternIds.length === 0) {
      return new Map();
    }

    const placeholders = patternIds.map(() => "?").join(",");
    const sql = `SELECT * FROM pattern_vocab WHERE pattern_id IN (${placeholders}) ORDER BY weight DESC`;

    // [FIX:ASYNC:SYNC] ★★★★★ - SQLite operations are synchronous
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...patternIds) as PatternVocab[];

    // Group by pattern_id
    const result = new Map<string, PatternVocab[]>();
    for (const row of rows) {
      if (!result.has(row.pattern_id)) {
        result.set(row.pattern_id, []);
      }
      result.get(row.pattern_id)!.push(row);
    }

    return result;
  }

  /**
   * Update quality metadata for a pattern
   * [APE-29] Pattern Quality & Freshness System
   */
  public async updateQualityMetadata(
    patternId: string,
    metadata: {
      lastActivityAt?: string | null;
      qualityScoreCached?: number | null;
      cacheTimestamp?: string | null;
      semverConstraints?: string | null;
      quarantineReason?: string | null;
      quarantineDate?: string | null;
    },
  ): Promise<void> {
    const updates: string[] = [];
    const params: any[] = [];

    if (metadata.lastActivityAt !== undefined) {
      updates.push("last_activity_at = ?");
      params.push(metadata.lastActivityAt);
    }
    if (metadata.qualityScoreCached !== undefined) {
      updates.push("quality_score_cached = ?");
      params.push(metadata.qualityScoreCached);
    }
    if (metadata.cacheTimestamp !== undefined) {
      updates.push("cache_timestamp = ?");
      params.push(metadata.cacheTimestamp);
    }
    if (metadata.semverConstraints !== undefined) {
      updates.push("semver_constraints = ?");
      params.push(metadata.semverConstraints);
    }
    if (metadata.quarantineReason !== undefined) {
      updates.push("quarantine_reason = ?");
      params.push(metadata.quarantineReason);
    }
    if (metadata.quarantineDate !== undefined) {
      updates.push("quarantine_date = ?");
      params.push(metadata.quarantineDate);
    }

    if (updates.length === 0) {
      return; // Nothing to update
    }

    // Add updated_at timestamp
    updates.push("updated_at = ?");
    params.push(new Date().toISOString());

    // Add pattern ID as last parameter
    params.push(patternId);

    const sql = `UPDATE patterns SET ${updates.join(", ")} WHERE id = ?`;

    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Using synchronous SQLite transactions
    const stmt = this.db.prepare(sql);
    stmt.run(...params);

    // Clear cache for this pattern
    // this.cache.invalidatePattern(patternId);
  }

  /**
   * Update pattern metadata (for evidence tracking)
   */
  public async updateMetadata(
    patternId: string,
    updates: Record<string, any>,
  ): Promise<void> {
    const pattern = await this.get(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Get metadata from database directly
    const metadataSql = `SELECT metadata FROM patterns WHERE id = ?`;
    const metadataStmt = this.db.prepare(metadataSql);
    const metadataRow = metadataStmt.get(patternId) as
      | { metadata: string }
      | undefined;

    const currentMetadata = metadataRow?.metadata
      ? JSON.parse(metadataRow.metadata)
      : {};
    const updatedMetadata = {
      ...currentMetadata,
      ...updates,
    };

    const sql = `UPDATE patterns SET metadata = ?, updated_at = ? WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(
      JSON.stringify(updatedMetadata),
      new Date().toISOString(),
      patternId,
    );

    // Clear cache
    // this.cache.invalidatePattern(patternId);
  }

  /**
   * Get all patterns (for conflict detection)
   */
  public async getAllPatterns(): Promise<Pattern[]> {
    const sql = `SELECT * FROM patterns ORDER BY id`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as any[];

    return rows.map((row) => this.rowToPattern(row));
  }
}
