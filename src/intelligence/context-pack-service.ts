/**
 * Context Pack Service - Assembles task context for AI assistants
 * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern for MCP tools
 * [PAT:CACHE:LRU] ★★★★☆ - LRU cache for performance
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import type Database from "better-sqlite3";
import type { DatabaseAdapter, Statement } from "../storage/database-adapter.js";
import { LRUCache } from "lru-cache";
import { TaskRepository } from "../storage/repositories/task-repository.js";
import { PatternRepository } from "../storage/repository.js";
import type { Task, SimilarTask } from "../schemas/task/types.js";

export interface ContextPackOptions {
  taskId?: string;
  packs?: string[]; // Which packs to include: 'tasks', 'patterns', 'statistics'
  maxActiveTasks?: number;
  maxSimilarPerTask?: number;
  maxSizeBytes?: number;
}

export interface ActiveTaskContext {
  id: string;
  title: string;
  phase: string;
  intent: string;
  confidence: number;
  decisions: string[];
  files_touched: string[];
}

export interface TaskStatistics {
  total_completed: number;
  success_rate: number;
  average_duration_ms: number;
  active_count: number;
  blocked_count: number;
}

export interface TaskPatterns {
  by_theme: Record<
    string,
    {
      common_files: string[];
      common_decisions: string[];
      pattern_ids: string[];
    }
  >;
}

export interface ContextPackMetadata {
  timestamp: string;
  size_bytes: number;
  cache_hit: boolean;
  truncation_info?: Record<string, string>;
  generation_time_ms: number;
}

export interface ContextPack {
  active_tasks: ActiveTaskContext[];
  recent_similar_tasks: Record<string, SimilarTask[]>;
  task_statistics: TaskStatistics;
  task_patterns: TaskPatterns;
  metadata: ContextPackMetadata;
}

export class ContextPackService {
  private contextCache: LRUCache<string, ContextPack>;
  private statements: {
    getTaskStats: Statement;
    getActiveTaskCount: Statement;
    getBlockedTaskCount: Statement;
    getTaskThemes: Statement;
  };

  constructor(
    private taskRepo: TaskRepository,
    private patternRepo: PatternRepository,
    private db: DatabaseAdapter,
    private options: {
      maxCacheEntries?: number;
      cacheTtlMs?: number;
      skipPrecompute?: boolean;
    } = {},
  ) {
    // [PAT:CACHE:LRU] ★★★★☆ - Configurable LRU cache
    this.contextCache = new LRUCache({
      max: options.maxCacheEntries || 100,
      maxSize: 1024 * 1024, // 1MB max size
      ttl: options.cacheTtlMs || 5 * 60 * 1000, // 5 minutes default
      sizeCalculation: (value) => JSON.stringify(value).length,
    });

    // [FIX:SQLITE:SYNC] ★★★★★ - Prepare statements synchronously
    this.statements = this.prepareStatements();

    // Pre-compute for active tasks on init
    if (!options.skipPrecompute) {
      this.precomputeActiveTasks();
    }
  }

  private prepareStatements() {
    return {
      getTaskStats: this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status = 'completed' AND outcome = 'success' THEN 1 END) as success_count,
          AVG(CASE WHEN status = 'completed' THEN duration_ms END) as avg_duration
        FROM tasks
      `),

      getActiveTaskCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM tasks WHERE status = 'active'
      `),

      getBlockedTaskCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM tasks WHERE status = 'blocked'
      `),

      getTaskThemes: this.db.prepare(`
        SELECT DISTINCT 
          task_type as theme,
          GROUP_CONCAT(DISTINCT files_touched) as files
        FROM tasks
        WHERE tasks.status = 'completed' AND task_type IS NOT NULL
        GROUP BY task_type
        LIMIT 10
      `),
    };
  }

  async getContextPack(options?: ContextPackOptions): Promise<ContextPack> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(options);

    // Check cache first
    const cached = this.contextCache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          cache_hit: true,
        },
      };
    }

    // Build context pack with budgeted assembly
    const maxSize = options?.maxSizeBytes || 28 * 1024; // 28KB default
    let currentSize = 0;
    const truncationInfo: Record<string, string> = {};

    // Start with metadata (highest priority)
    const metadata: ContextPackMetadata = {
      timestamp: new Date().toISOString(),
      size_bytes: 0,
      cache_hit: false,
      generation_time_ms: 0,
    };
    currentSize += this.estimateSize(metadata);

    // Get components in parallel but assemble with priority
    const [activeTasks, statistics, patterns] = await Promise.all([
      this.getActiveTasks(options),
      this.getTaskStatistics(),
      this.getTaskPatterns(),
    ]);

    // Add active tasks (second priority)
    let includedActiveTasks = activeTasks;
    const activeTasksSize = this.estimateSize(activeTasks);
    if (currentSize + activeTasksSize > maxSize) {
      // Calculate how many tasks we can fit
      const remainingBudget = maxSize - currentSize;
      let tasksToInclude = 0;
      let testSize = 0;

      for (let i = 0; i < activeTasks.length; i++) {
        const taskSize = this.estimateSize([activeTasks[i]]);
        if (testSize + taskSize > remainingBudget) break;
        testSize += taskSize;
        tasksToInclude++;
      }

      includedActiveTasks = activeTasks.slice(0, Math.max(1, tasksToInclude));
      truncationInfo.active_tasks = `Truncated to ${includedActiveTasks.length} tasks`;
    }
    currentSize += this.estimateSize(includedActiveTasks);

    // Add patterns (third priority)
    let includedPatterns = patterns;
    const patternsSize = this.estimateSize(patterns);
    if (currentSize + patternsSize > maxSize) {
      // Truncate pattern descriptions
      includedPatterns = this.truncatePatterns(patterns);
      truncationInfo.patterns = "Pattern data truncated";
    }
    currentSize += this.estimateSize(includedPatterns);

    // Add statistics (fourth priority)
    currentSize += this.estimateSize(statistics);

    // Get similar tasks for active tasks (fifth priority)
    const similarTasks: Record<string, SimilarTask[]> = {};
    const maxSimilarPerTask = options?.maxSimilarPerTask || 20;

    for (const task of includedActiveTasks.slice(0, 10)) {
      // Limit to first 10 active tasks
      if (currentSize >= maxSize * 0.9) {
        truncationInfo.similar_tasks = "Truncated due to size limit";
        break;
      }

      // [PAT:INDIRECTION:REPOSITORY] - Use repository layer for enhanced search
      const similar = await this.taskRepo.findSimilar(
        task.id,
        maxSimilarPerTask,
      );

      const truncatedSimilar = similar.map((s) => ({
        ...s,
        task: {
          ...s.task,
          title: s.task.title.substring(0, 250),
        },
        reason: s.reason?.substring(0, 250),
      }));

      similarTasks[`${task.id}_similar`] = truncatedSimilar;
      currentSize += this.estimateSize(truncatedSimilar);
    }

    // Finalize metadata
    metadata.size_bytes = currentSize;
    metadata.generation_time_ms = Date.now() - startTime;
    if (Object.keys(truncationInfo).length > 0) {
      metadata.truncation_info = truncationInfo;
    }

    const contextPack: ContextPack = {
      active_tasks: includedActiveTasks,
      recent_similar_tasks: similarTasks,
      task_statistics: statistics,
      task_patterns: includedPatterns,
      metadata,
    };

    // Cache the result
    this.contextCache.set(cacheKey, contextPack);

    return contextPack;
  }

  private async getActiveTasks(
    options?: ContextPackOptions,
  ): Promise<ActiveTaskContext[]> {
    const tasks = this.taskRepo.findByStatus("active");
    const maxTasks = options?.maxActiveTasks || 50;

    return tasks.slice(0, maxTasks).map((task) => ({
      id: task.id,
      title: task.title.substring(0, 250),
      phase: task.phase || "ARCHITECT",
      intent: task.intent?.substring(0, 250) || "",
      confidence: task.confidence || 0,
      decisions: task.decisions || [],
      files_touched: (task.files_touched || []).slice(0, 10),
    }));
  }

  private getTaskStatistics(): TaskStatistics {
    // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous queries for performance
    const stats = this.statements.getTaskStats.get() as any;
    const activeCount = this.statements.getActiveTaskCount.get() as any;
    const blockedCount = this.statements.getBlockedTaskCount.get() as any;

    return {
      total_completed: stats.completed_count || 0,
      success_rate:
        stats.completed_count > 0
          ? stats.success_count / stats.completed_count
          : 0,
      average_duration_ms: stats.avg_duration || 0,
      active_count: activeCount.count || 0,
      blocked_count: blockedCount.count || 0,
    };
  }

  private getTaskPatterns(): TaskPatterns {
    const themes = this.statements.getTaskThemes.all() as any[];
    const patterns: TaskPatterns = { by_theme: {} };

    for (const theme of themes) {
      if (!theme.theme) continue;

      patterns.by_theme[theme.theme] = {
        common_files: theme.files ? theme.files.split(",").slice(0, 5) : [],
        common_decisions: [], // Would need more complex query
        pattern_ids: [], // Would need pattern association
      };
    }

    return patterns;
  }

  private truncatePatterns(patterns: TaskPatterns): TaskPatterns {
    const truncated: TaskPatterns = { by_theme: {} };

    // Keep only first 5 themes
    const themes = Object.keys(patterns.by_theme).slice(0, 5);
    for (const theme of themes) {
      truncated.by_theme[theme] = {
        common_files: patterns.by_theme[theme].common_files.slice(0, 3),
        common_decisions: patterns.by_theme[theme].common_decisions.slice(0, 3),
        pattern_ids: patterns.by_theme[theme].pattern_ids.slice(0, 3),
      };
    }

    return truncated;
  }

  private estimateSize(obj: any): number {
    return JSON.stringify(obj).length;
  }

  private getCacheKey(options?: ContextPackOptions): string {
    return JSON.stringify({
      taskId: options?.taskId || "all",
      packs: options?.packs || ["all"],
    });
  }

  private async precomputeActiveTasks(): Promise<void> {
    // Pre-compute context for active tasks in background
    const activeTasks = this.taskRepo.findByStatus("active");

    for (const task of activeTasks.slice(0, 5)) {
      // Pre-warm cache for top 5 active tasks
      this.getContextPack({ taskId: task.id }).catch(() => {
        // Ignore errors in background precomputation
      });
    }
  }
}
