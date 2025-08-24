/**
 * Task Search Engine - Advanced similarity search for tasks
 * Implements multi-signal scoring with tag/theme/component matching
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
 * [PAT:CACHE:LRU] ★★★★☆ - LRU cache for similarity scores
 */

import type Database from "better-sqlite3";
import { LRUCache } from "lru-cache";
import type { Task, SimilarTask, TaskSignals } from "../schemas/task/types.js";
import { TaskRepository } from "../storage/repositories/task-repository.js";
import { FuzzyMatcher } from "../search/fuzzy-matcher.js";
import { TaskTagger } from "./task-tagger.js";
import { extractEnhancedSignals } from "./signal-extractor.js";

export class TaskSearchEngine {
  private db: Database.Database;
  private repo: TaskRepository;
  private fuzzyMatcher: FuzzyMatcher;
  private tagger: TaskTagger;
  private cache: LRUCache<string, SimilarTask[]>;
  private statements: {
    findSimilarCached: Database.Statement;
    cacheSimilarity: Database.Statement;
    getAllTasks: Database.Statement;
    clearCache: Database.Statement;
  };

  constructor(db: Database.Database, taskRepo?: TaskRepository) {
    this.db = db;
    this.repo = taskRepo || new TaskRepository(db);
    this.fuzzyMatcher = new FuzzyMatcher();
    this.tagger = new TaskTagger();

    // [PAT:CACHE:LRU] ★★★★☆ - LRU cache with 1000 entries, 5-minute TTL
    this.cache = new LRUCache({
      max: 1000,
      ttl: 5 * 60 * 1000, // 5 minutes
    });

    // [FIX:SQLITE:SYNC] ★★★★★ - Prepare statements synchronously for performance
    this.statements = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      findSimilarCached: this.db.prepare(`
        SELECT 
          t.*,
          ts.similarity_score,
          ts.calculation_method
        FROM task_similarity ts
        JOIN tasks t ON (t.id = ts.task_b OR t.id = ts.task_a)
        WHERE (ts.task_a = ? OR ts.task_b = ?)
          AND t.id != ?
          AND ts.similarity_score >= ?
        ORDER BY ts.similarity_score DESC
        LIMIT ?
      `),

      cacheSimilarity: this.db.prepare(`
        INSERT OR REPLACE INTO task_similarity 
        (task_a, task_b, similarity_score, calculation_method, calculated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),

      getAllTasks: this.db.prepare(`
        SELECT * FROM tasks 
        WHERE id != ? 
        ORDER BY created_at DESC
        LIMIT ?
      `),

      clearCache: this.db.prepare(`
        DELETE FROM task_similarity 
        WHERE task_a = ? OR task_b = ?
      `),
    };
  }

  /**
   * Find similar tasks using multi-signal scoring
   */
  async findSimilar(
    task: Task,
    options: {
      limit?: number;
      minScore?: number;
      useCache?: boolean;
    } = {},
  ): Promise<SimilarTask[]> {
    const { limit = 5, minScore = 0.3, useCache = true } = options;

    // Check memory cache first
    const cacheKey = `${task.id}:${limit}:${minScore}`;
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Check database cache
    const dbCached = this.statements.findSimilarCached.all(
      task.id,
      task.id,
      task.id,
      minScore,
      limit,
    ) as any[];

    if (dbCached.length > 0) {
      const results = dbCached.map((row) => ({
        task: this.deserializeTask(row),
        similarity: row.similarity_score,
        reason: row.calculation_method || "cached",
      }));

      // Store in memory cache
      this.cache.set(cacheKey, results);
      return results;
    }

    // Calculate similarities for all tasks
    const allTasks = this.statements.getAllTasks.all(task.id, 100) as any[];
    const similarities: SimilarTask[] = [];

    // Batch process for efficiency
    for (const row of allTasks) {
      const otherTask = this.deserializeTask(row);
      const score = this.calculateMultiSignalScore(task, otherTask);

      if (score >= minScore) {
        const reason = this.generateSimilarityReason(task, otherTask);
        similarities.push({
          task: otherTask,
          similarity: score,
          reason,
        });

        // Cache in database (ensure task_a < task_b for constraint)
        const [taskA, taskB] =
          task.id < otherTask.id
            ? [task.id, otherTask.id]
            : [otherTask.id, task.id];

        this.statements.cacheSimilarity.run(
          taskA,
          taskB,
          score,
          "multi_signal",
        );
      }
    }

    // Sort by similarity score and limit results
    const results = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // Store in memory cache
    this.cache.set(cacheKey, results);

    return results;
  }

  /**
   * Calculate multi-signal similarity score between two tasks
   */
  private calculateMultiSignalScore(task1: Task, task2: Task): number {
    const signals1 = this.extractTaskSignals(task1);
    const signals2 = this.extractTaskSignals(task2);

    // Tag overlap (weight: 3) - highest weight
    const tagScore = this.calculateSetOverlap(signals1.tags, signals2.tags) * 3;

    // Theme match (weight: 2)
    const themeScore =
      this.calculateSetOverlap(signals1.themes, signals2.themes) * 2;

    // Component overlap (weight: 1)
    const componentScore = this.calculateSetOverlap(
      signals1.components,
      signals2.components,
    );

    // File overlap bonus (weight: 2)
    const fileScore =
      this.calculateFileOverlap(
        task1.files_touched || [],
        task2.files_touched || [],
      ) * 2;

    // Type similarity (weight: 1) - from existing implementation
    const typeScore = task1.task_type === task2.task_type ? 1 : 0;

    // Title similarity using fuzzy matching (weight: 1)
    const titleScore = this.fuzzyMatcher.similarity(
      task1.title || "",
      task2.title || "",
    );

    // Normalize to 0-1 range
    const totalWeight = 10; // 3 + 2 + 1 + 2 + 1 + 1
    const totalScore =
      tagScore +
      themeScore +
      componentScore +
      fileScore +
      typeScore +
      titleScore;

    return Math.min(1, Math.max(0, totalScore / totalWeight));
  }

  /**
   * Extract signals from a task for comparison
   */
  private extractTaskSignals(task: Task): TaskSignals {
    // Use tagger to extract tags, themes, and components
    const tags = this.tagger.autoTag(task);

    // Extract file patterns from touched files
    const filePatterns = this.extractFilePatterns(task.files_touched || []);

    return {
      tags: tags.tags,
      themes: tags.themes,
      components: tags.components,
      filePatterns,
    };
  }

  /**
   * Calculate overlap between two sets (Jaccard similarity)
   */
  private calculateSetOverlap(set1: string[], set2: string[]): number {
    if (set1.length === 0 || set2.length === 0) return 0;

    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = new Set([...s1].filter((x) => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate file overlap between two file lists
   */
  private calculateFileOverlap(files1: string[], files2: string[]): number {
    if (files1.length === 0 || files2.length === 0) return 0;

    // Extract directories and filenames for comparison
    const patterns1 = new Set(this.extractFilePatterns(files1));
    const patterns2 = new Set(this.extractFilePatterns(files2));

    const intersection = new Set(
      [...patterns1].filter((x) => patterns2.has(x)),
    );
    const union = new Set([...patterns1, ...patterns2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Extract file patterns from file paths
   */
  private extractFilePatterns(files: string[]): string[] {
    const patterns = new Set<string>();

    for (const file of files) {
      // Add full path
      patterns.add(file);

      // Add directory
      const dir = file.substring(0, file.lastIndexOf("/"));
      if (dir) patterns.add(dir + "/");

      // Add extension pattern
      const ext = file.substring(file.lastIndexOf("."));
      if (ext) patterns.add("*" + ext);

      // Add filename without path
      const filename = file.substring(file.lastIndexOf("/") + 1);
      patterns.add(filename);
    }

    return Array.from(patterns);
  }

  /**
   * Generate human-readable similarity reason
   */
  private generateSimilarityReason(task1: Task, task2: Task): string {
    const signals1 = this.extractTaskSignals(task1);
    const signals2 = this.extractTaskSignals(task2);

    const reasons: string[] = [];

    // Check tag overlap
    const tagOverlap = new Set(
      [...signals1.tags].filter((x) => signals2.tags.includes(x)),
    );
    if (tagOverlap.size > 0) {
      reasons.push(
        `shared tags: ${Array.from(tagOverlap).slice(0, 3).join(", ")}`,
      );
    }

    // Check theme match
    const themeOverlap = new Set(
      [...signals1.themes].filter((x) => signals2.themes.includes(x)),
    );
    if (themeOverlap.size > 0) {
      reasons.push(`similar themes: ${Array.from(themeOverlap).join(", ")}`);
    }

    // Check component overlap
    const componentOverlap = new Set(
      [...signals1.components].filter((x) => signals2.components.includes(x)),
    );
    if (componentOverlap.size > 0) {
      reasons.push(
        `same components: ${Array.from(componentOverlap).join(", ")}`,
      );
    }

    // Check file overlap
    const fileOverlap = this.calculateFileOverlap(
      task1.files_touched || [],
      task2.files_touched || [],
    );
    if (fileOverlap > 0.3) {
      reasons.push("similar files modified");
    }

    // Check type match
    if (task1.task_type === task2.task_type) {
      reasons.push(`same type: ${task1.task_type}`);
    }

    return reasons.length > 0 ? reasons.join("; ") : "general similarity";
  }

  /**
   * Extract tags from intent string
   */
  extractTags(intent: string): string[] {
    return this.tagger.extractKeywords(intent);
  }

  /**
   * Infer themes from intent string
   */
  inferThemes(intent: string): string[] {
    return this.tagger.detectThemes(intent);
  }

  /**
   * Detect components from file list
   */
  detectComponents(files: string[]): string[] {
    return this.tagger.detectComponents(files);
  }

  /**
   * Clear similarity cache for a task (e.g., on completion)
   */
  clearCacheForTask(taskId: string): void {
    // Clear memory cache
    for (const key of this.cache.keys()) {
      if (key.startsWith(taskId + ":")) {
        this.cache.delete(key);
      }
    }

    // Clear database cache
    this.statements.clearCache.run(taskId, taskId);
  }

  /**
   * Compute similarities for a single task
   * [PAT:LIFECYCLE:EVENT_HOOKS] - Called after task create/update
   */
  async computeSimilarities(taskId: string): Promise<void> {
    try {
      const task = this.repo.findById(taskId);
      if (!task) return;

      // Clear existing cache for this task
      this.clearCacheForTask(taskId);

      // Compute similarities with all active tasks
      await this.findSimilar(task, { useCache: false, limit: 10 });
    } catch (error) {
      // Don't fail task operations due to similarity computation
      console.error(
        `Failed to compute similarities for task ${taskId}:`,
        error,
      );
    }
  }

  /**
   * Pre-compute similarities for active tasks (batch processing)
   */
  async precomputeSimilarities(): Promise<void> {
    const activeTasks = this.repo.findByStatus("active", 50);

    // Process in batches to avoid blocking
    const batchSize = 10;
    for (let i = 0; i < activeTasks.length; i += batchSize) {
      const batch = activeTasks.slice(i, i + batchSize);

      for (const task of batch) {
        // Calculate similarities but don't await
        this.findSimilar(task, { useCache: false });
      }
    }
  }

  /**
   * Backfill similarities for all existing tasks
   * [PAT:MIGRATION:BACKFILL] - One-time computation for existing data
   */
  async backfillSimilarities(): Promise<number> {
    try {
      const allTasks = this.repo.findByStatus("active", 100);
      let computed = 0;

      for (const task of allTasks) {
        await this.computeSimilarities(task.id);
        computed++;
      }

      console.log(`Backfilled similarities for ${computed} tasks`);
      return computed;
    } catch (error) {
      console.error("Failed to backfill similarities:", error);
      return 0;
    }
  }

  /**
   * Deserialize task from database row
   */
  private deserializeTask(row: any): Task {
    return {
      ...row,
      // Parse JSON fields
      objectives: row.objectives ? JSON.parse(row.objectives) : undefined,
      constraints: row.constraints ? JSON.parse(row.constraints) : undefined,
      acceptance_criteria: row.acceptance_criteria
        ? JSON.parse(row.acceptance_criteria)
        : undefined,
      plan: row.plan ? JSON.parse(row.plan) : undefined,
      facts: row.facts ? JSON.parse(row.facts) : undefined,
      snippets: row.snippets ? JSON.parse(row.snippets) : undefined,
      risks_and_gotchas: row.risks_and_gotchas
        ? JSON.parse(row.risks_and_gotchas)
        : undefined,
      open_questions: row.open_questions
        ? JSON.parse(row.open_questions)
        : undefined,
      in_flight: row.in_flight ? JSON.parse(row.in_flight) : undefined,
      phase_handoffs: row.phase_handoffs
        ? JSON.parse(row.phase_handoffs)
        : undefined,
      files_touched: row.files_touched
        ? JSON.parse(row.files_touched)
        : undefined,
      patterns_used: row.patterns_used
        ? JSON.parse(row.patterns_used)
        : undefined,
      errors_encountered: row.errors_encountered
        ? JSON.parse(row.errors_encountered)
        : undefined,
      claims: row.claims ? JSON.parse(row.claims) : undefined,
      prior_impls: row.prior_impls ? JSON.parse(row.prior_impls) : undefined,
      failure_corpus: row.failure_corpus
        ? JSON.parse(row.failure_corpus)
        : undefined,
      assumptions: row.assumptions ? JSON.parse(row.assumptions) : undefined,
    };
  }
}
