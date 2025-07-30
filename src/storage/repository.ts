// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import path from 'path';
import fs from 'fs-extra';
import { PatternDatabase } from './database.js';
import { PatternCache } from './cache.js';
import { PatternLoader } from './loader.js';
import { PatternWatcher } from './watcher.js';
import type { 
  Pattern, 
  LookupQuery, 
  QueryFacets, 
  PatternPack, 
  ValidationResult,
  FileChangeEvent 
} from './types.js';

export class PatternRepository {
  private db: PatternDatabase;
  private cache: PatternCache;
  private loader: PatternLoader;
  private watcher: PatternWatcher;
  private patternsDir: string;
  private isWatching: boolean = false;

  constructor(options: {
    dbPath?: string;
    patternsDir?: string;
    cacheSize?: number;
    watchDebounce?: number;
  } = {}) {
    this.patternsDir = options.patternsDir || '.apex/patterns';
    this.db = new PatternDatabase(options.dbPath);
    this.cache = new PatternCache(options.cacheSize);
    this.loader = new PatternLoader();
    this.watcher = new PatternWatcher(this.patternsDir, options.watchDebounce);

    // Set up watcher event handlers
    this.watcher.on('change', (event: FileChangeEvent) => this.handleFileChange(event));
    this.watcher.on('error', (error: Error) => console.error('Watcher error:', error));
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
      this.watcher.once('ready', resolve);
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
    this.db.getStatement('deletePattern').run(id);
    this.cache.deletePattern(id);
  }

  public async get(id: string): Promise<Pattern | null> {
    // Check cache first
    const cached = this.cache.getPattern(id);
    if (cached) {
      return cached;
    }

    // Query database
    const row = this.db.getStatement('getPattern').get(id) as any;
    if (!row) {
      return null;
    }

    const pattern = this.rowToPattern(row);
    this.cache.setPattern(id, pattern);
    return pattern;
  }

  // Query methods

  public async lookup(query: LookupQuery): Promise<PatternPack> {
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
        cachedIds.slice(0, k).map(id => this.get(id))
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
    const patternIds = rows.map(r => r.id);
    this.cache.setFacetResults(cacheKey, patternIds);

    // Convert rows to patterns
    const patterns = rows.slice(0, k).map(row => this.rowToPattern(row));
    
    // Cache individual patterns
    patterns.forEach(p => this.cache.setPattern(p.id, p));

    return {
      patterns,
      total: rows.length,
      query,
    };
  }

  public async search(text: string, limit: number = 20): Promise<Pattern[]> {
    const rows = this.db.getStatement('searchPatterns').all(text, limit) as any[];
    return rows.map(row => this.rowToPattern(row));
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
      k: 100 
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
      this.db.exec('DELETE FROM patterns');
      
      // Insert all valid patterns
      for (const { path, result } of results) {
        if ('pattern' in result) {
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
      const patternId = path.split('/').pop()?.replace(/\.(yaml|yml|json)$/, '') || 'unknown';
      
      if ('error' in result) {
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
    // In real implementation, would load migrations from files
    const migrations = [];
    await this.db.runMigrations(migrations);
  }

  // Private helper methods

  private async handleFileChange(event: FileChangeEvent): Promise<void> {
    try {
      if (event.type === 'unlink') {
        // Extract pattern ID from file path
        const patternId = path.basename(event.path, path.extname(event.path));
        this.db.getStatement('deletePattern').run(patternId);
        this.cache.deletePattern(patternId);
      } else {
        // Load and upsert pattern
        const result = await this.loader.loadPattern(event.path);
        
        if ('pattern' in result) {
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
      this.db.getStatement('upsertPattern').run({
        ...pattern,
        source_repo: pattern.source_repo || null,
        tags_csv: pattern.tags.join(','),
        invalid: pattern.invalid ? 1 : 0,
        invalid_reason: pattern.invalid_reason || null,
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
    this.db.prepare('DELETE FROM pattern_languages WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_frameworks WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_tags WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_paths WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_repos WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_task_types WHERE pattern_id = ?').run(patternId);
    this.db.prepare('DELETE FROM pattern_envs WHERE pattern_id = ?').run(patternId);

    // Insert tags (already implemented)
    if (pattern.tags && Array.isArray(pattern.tags)) {
      const insertTag = this.db.prepare('INSERT INTO pattern_tags (pattern_id, tag) VALUES (?, ?)');
      for (const tag of pattern.tags) {
        insertTag.run(patternId, tag);
      }
    }

    // Extract scope data if available (patterns loaded from YAML have scope field)
    const scope = pattern.scope || {};

    // Insert languages
    if (scope.languages && Array.isArray(scope.languages)) {
      const insertLang = this.db.prepare('INSERT INTO pattern_languages (pattern_id, lang) VALUES (?, ?)');
      for (const lang of scope.languages) {
        insertLang.run(patternId, lang);
      }
    }

    // Insert frameworks with optional semver
    if (scope.frameworks && Array.isArray(scope.frameworks)) {
      const insertFramework = this.db.prepare('INSERT INTO pattern_frameworks (pattern_id, framework, semver) VALUES (?, ?, ?)');
      for (const fw of scope.frameworks) {
        if (typeof fw === 'string') {
          // Simple framework name
          insertFramework.run(patternId, fw, null);
        } else if (fw && typeof fw === 'object' && fw.name) {
          // Framework with semver
          const semver = fw.semver || fw.version || null;
          insertFramework.run(patternId, fw.name, semver);
        }
      }
      
      // Also check semver_constraints for additional framework versions
      if (pattern.semver_constraints?.dependencies) {
        for (const [framework, version] of Object.entries(pattern.semver_constraints.dependencies)) {
          // Only add if not already in scope.frameworks
          const alreadyAdded = scope.frameworks.some((fw: any) => 
            (typeof fw === 'string' && fw === framework) ||
            (fw && typeof fw === 'object' && fw.name === framework)
          );
          if (!alreadyAdded && typeof version === 'string') {
            insertFramework.run(patternId, framework, version);
          }
        }
      }
    }

    // Insert paths
    if (scope.paths && Array.isArray(scope.paths)) {
      const insertPath = this.db.prepare('INSERT INTO pattern_paths (pattern_id, glob) VALUES (?, ?)');
      for (const path of scope.paths) {
        insertPath.run(patternId, path);
      }
    }

    // Insert repos
    if (scope.repos && Array.isArray(scope.repos)) {
      const insertRepo = this.db.prepare('INSERT INTO pattern_repos (pattern_id, repo_glob) VALUES (?, ?)');
      for (const repo of scope.repos) {
        insertRepo.run(patternId, repo);
      }
    }

    // Insert task types
    if (scope.task_types && Array.isArray(scope.task_types)) {
      const insertTaskType = this.db.prepare('INSERT INTO pattern_task_types (pattern_id, task_type) VALUES (?, ?)');
      for (const taskType of scope.task_types) {
        insertTaskType.run(patternId, taskType);
      }
    }

    // Insert environments
    if (scope.envs && Array.isArray(scope.envs)) {
      const insertEnv = this.db.prepare('INSERT INTO pattern_envs (pattern_id, env) VALUES (?, ?)');
      for (const env of scope.envs) {
        insertEnv.run(patternId, env);
      }
    }
  }

  private async markInvalid(patternId: string, reason: string): Promise<void> {
    this.db.prepare(`
      UPDATE patterns 
      SET invalid = 1, invalid_reason = ? 
      WHERE id = ?
    `).run(reason, patternId);
    
    this.cache.deletePattern(patternId);
  }

  private getPatternFilePath(patternId: string): string {
    // Organize by pattern type if available
    return path.join(this.patternsDir, `${patternId}.yaml`);
  }

  private async writePatternFile(filePath: string, pattern: Pattern): Promise<void> {
    await fs.ensureDir(path.dirname(filePath));
    
    // Write to temp file first
    const tempPath = `${filePath}.tmp`;
    
    // Remove internal fields before writing
    const { pattern_digest, json_canonical, invalid, invalid_reason, ...fileData } = pattern;
    
    await fs.writeFile(tempPath, JSON.stringify(fileData, null, 2));
    
    // Atomic rename
    await fs.rename(tempPath, filePath);
  }

  private rowToPattern(row: any): Pattern {
    const { tags_csv, ...rest } = row;
    return {
      ...rest,
      tags: tags_csv ? tags_csv.split(',') : [],
      invalid: row.invalid === 1,
    };
  }

  private buildLookupQuery(facets: QueryFacets): string {
    let sql = 'SELECT DISTINCT p.* FROM patterns p';
    const joins: string[] = [];
    const wheres: string[] = ['p.invalid = 0'];
    
    // Include all patterns regardless of trust score
    // The ranking system will prioritize high-trust patterns
    // This allows new patterns to be discovered and used
    
    if (facets.type) {
      wheres.push(`p.type = '${facets.type}'`);
    }
    
    // Only add language filter if languages are specified and non-empty
    if (facets.languages && facets.languages.length > 0) {
      joins.push('JOIN pattern_languages l ON l.pattern_id = p.id');
      wheres.push(`l.lang IN (${facets.languages.map(l => `'${l}'`).join(',')})`);
    }
    
    // Only add framework filter if frameworks are specified and non-empty
    if (facets.frameworks && facets.frameworks.length > 0) {
      joins.push('LEFT JOIN pattern_frameworks f ON f.pattern_id = p.id');
      const frameworkCondition = facets.frameworks.map(f => `f.framework = '${f}'`).join(' OR ');
      wheres.push(`(f.framework IS NULL OR (${frameworkCondition}))`);
    }
    
    if (facets.tags?.length) {
      joins.push('JOIN pattern_tags t ON t.pattern_id = p.id');
      wheres.push(`t.tag IN (${facets.tags.map(t => `'${t}'`).join(',')})`);
    }
    
    // Add other facet joins...
    
    sql += ' ' + joins.join(' ');
    if (wheres.length > 0) {
      sql += ' WHERE ' + wheres.join(' AND ');
    }
    
    // Order by trust score descending to prioritize high-trust patterns
    sql += ' ORDER BY p.trust_score DESC';
    
    return sql;
  }
}