/**
 * Task Brief Generator - Intelligent brief generation with performance optimization
 * Generates PRD-compliant briefs in ≤1.5s P50 response time
 * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern
 * [PAT:CACHE:LRU] ★★★★☆ - LRU cache for performance
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
 */

import type Database from "better-sqlite3";
import type {
  DatabaseAdapter,
  Statement,
} from "../storage/database-adapter.js";
import { LRUCache } from "lru-cache";
import type { Task, TaskSignals } from "../schemas/task/types.js";
import type {
  TaskBrief,
  BriefOptions,
  BriefGenerationMetrics,
  PlanStep,
  Fact,
  CodeSnippet,
  Question,
  InFlightWork,
  TestSpec,
} from "../schemas/task/brief-types.js";
import { TaskSearchEngine } from "./task-search.js";
import { TaskRepository } from "../storage/repositories/task-repository.js";
import { PatternRepository } from "../storage/repository.js";
import { FailureCorpus } from "./failure-corpus.js";
import { extractEnhancedSignals } from "./signal-extractor.js";

export class BriefGenerator {
  private db: DatabaseAdapter;
  private taskSearch: TaskSearchEngine;
  private taskRepo: TaskRepository;
  private patternRepo: PatternRepository;
  private failureCorpus: FailureCorpus;
  private briefCache: LRUCache<string, TaskBrief>;
  private statements: {
    getCachedBrief: Statement;
    cacheBrief: Statement;
    getInFlightWork: Statement;
  };

  constructor(
    db: DatabaseAdapter,
    options?: {
      patternRepo?: PatternRepository;
      taskRepo?: TaskRepository;
    },
  ) {
    this.db = db;
    this.taskRepo = options?.taskRepo || new TaskRepository(db);
    this.taskSearch = new TaskSearchEngine(db, this.taskRepo);
    // Pattern repository MUST be provided by caller to ensure correct database path
    if (!options?.patternRepo) {
      throw new Error(
        "PatternRepository must be provided to BriefGenerator to ensure correct database path",
      );
    }
    this.patternRepo = options.patternRepo;
    this.failureCorpus = new FailureCorpus();

    // [PAT:CACHE:LRU] ★★★★☆ - LRU cache with 1000 entries, 5-minute TTL
    this.briefCache = new LRUCache({
      max: 1000,
      ttl: 5 * 60 * 1000, // 5 minutes
    });

    // [FIX:SQLITE:SYNC] ★★★★★ - Prepare statements synchronously
    this.statements = this.prepareStatements();
  }

  private prepareStatements() {
    // Create table if not exists (for caching)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_briefs (
        task_id TEXT PRIMARY KEY,
        brief_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        cache_key TEXT NOT NULL
      )
    `);

    return {
      getCachedBrief: this.db.prepare(`
        SELECT brief_json 
        FROM task_briefs 
        WHERE task_id = ? AND cache_key = ?
      `),

      cacheBrief: this.db.prepare(`
        INSERT OR REPLACE INTO task_briefs 
        (task_id, brief_json, generated_at, cache_key)
        VALUES (?, ?, datetime('now'), ?)
      `),

      getInFlightWork: this.db.prepare(`
        SELECT id, title, status
        FROM tasks
        WHERE status IN ('in_progress', 'blocked')
          AND id != ?
        ORDER BY created_at DESC
        LIMIT 10
      `),
    };
  }

  /**
   * Calculate task complexity on a 1-10 scale
   */
  private calculateComplexity(task: Task, signals: TaskSignals): number {
    let score = 1;

    // Intent length (longer = more complex)
    const intentLength = (task.intent || task.title || "").length;
    if (intentLength > 200) score += 2;
    else if (intentLength > 100) score += 1;

    // Task type complexity
    if (task.task_type === "feature") score += 2;
    else if (task.task_type === "refactor") score += 1;
    else if (task.task_type === "bug") score += 1;

    // Component count
    if (signals.components.length > 3) score += 2;
    else if (signals.components.length > 1) score += 1;

    // File patterns
    if (signals.filePatterns.length > 5) score += 2;
    else if (signals.filePatterns.length > 2) score += 1;

    // Multiple themes/verbs
    if (signals.themes.length > 2) score += 1;

    return Math.min(score, 10);
  }

  /**
   * Generate a minimal, factual task brief based on complexity
   */
  async generateBrief(
    task: Task,
    options: BriefOptions = {},
  ): Promise<TaskBrief> {
    const startTime = Date.now();
    const {
      useCache = true,
      includeInFlight = true,
      maxSimilarTasks = 5,
      maxPatterns = 10,
    } = options;

    // Generate cache key based on task state
    const cacheKey = `${task.id}:${task.created_at || "latest"}`;

    // [PAT:CACHE:LRU] ★★★★☆ - Check memory cache first (<100ms)
    if (useCache) {
      const cached = this.briefCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          provenance: {
            ...cached.provenance,
            cache_hit: true,
            generation_time_ms: Date.now() - startTime,
          },
        };
      }

      // Check database cache
      const dbCached = this.statements.getCachedBrief.get(task.id, cacheKey) as
        | { brief_json: string }
        | undefined;
      if (dbCached) {
        const brief = JSON.parse(dbCached.brief_json) as TaskBrief;
        this.briefCache.set(cacheKey, brief);
        return {
          ...brief,
          provenance: {
            ...brief.provenance,
            cache_hit: true,
            generation_time_ms: Date.now() - startTime,
          },
        };
      }
    }

    // Extract signals and calculate complexity
    const taskText = `${task.title} ${task.intent || ""}`;
    const enhancedSignals = extractEnhancedSignals(taskText);
    const signals: TaskSignals = {
      tags: [...enhancedSignals.keywords, ...enhancedSignals.libraries],
      themes: enhancedSignals.taskVerbs,
      components: [...enhancedSignals.frameworks, ...enhancedSignals.languages],
      filePatterns: enhancedSignals.filePatterns,
    };

    const complexity = this.calculateComplexity(task, signals);

    // Simple tasks (1-3): Just a one-liner
    if (complexity <= 3) {
      const brief: TaskBrief = {
        tl_dr: this.generateMinimalTLDR(task),
        objectives: [],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: "",
        provenance: {
          generated_at: new Date().toISOString(),
          sources: [],
          complexity_score: complexity,
          cache_hit: false,
          generation_time_ms: Date.now() - startTime,
        },
      };

      if (useCache) {
        this.briefCache.set(cacheKey, brief);
        this.statements.cacheBrief.run(
          task.id,
          JSON.stringify(brief),
          cacheKey,
        );
      }
      return brief;
    }

    // Medium and complex tasks: Gather real data
    const [similarTasks, patterns, failures, inFlightWork] = await Promise.all([
      // Only get similar tasks if complexity > 3
      complexity > 3
        ? this.taskSearch.findSimilar(task, {
            limit: maxSimilarTasks,
            minScore: 0.7, // Higher threshold for relevance
          })
        : Promise.resolve([]),

      // Only get patterns for complex tasks
      complexity >= 6
        ? this.getRelevantPatterns(signals, maxPatterns)
        : Promise.resolve([]),

      // Only get failures for complex tasks
      complexity >= 7
        ? Promise.resolve(this.failureCorpus.findRelevantFailures(signals))
        : Promise.resolve([]),

      // Only get in-flight work for complex tasks
      complexity >= 8 && includeInFlight
        ? this.getInFlightWork(task.id)
        : Promise.resolve([]),
    ]);

    // Build brief based on actual data
    const brief: TaskBrief = {
      tl_dr: this.generateMinimalTLDR(task),
      objectives: [], // No generic objectives
      constraints: [], // No generic constraints
      acceptance_criteria: [], // No generic criteria
      plan: [], // No generic plan
      facts: this.extractRealFacts(task, similarTasks, patterns),
      snippets:
        complexity >= 6 ? this.extractCodeSnippets(similarTasks, patterns) : [],
      risks_and_gotchas: complexity >= 7 ? this.extractRealRisks(failures) : [],
      open_questions: [], // No generated questions
      in_flight: inFlightWork.length > 0 ? inFlightWork : undefined,
      test_scaffold: "", // AI can generate its own

      // Only include drilldowns if we have real data
      drilldowns:
        similarTasks.length > 0
          ? {
              prior_impls: similarTasks.map(
                (st) =>
                  `${st.task.id}: ${st.task.title} (${Math.round(st.similarity * 100)}% similar)`,
              ),
              files: this.extractKeyFiles(task, similarTasks),
            }
          : undefined,

      provenance: {
        generated_at: new Date().toISOString(),
        complexity_score: complexity,
        sources: [
          similarTasks.length > 0
            ? `Similar tasks: ${similarTasks.length}`
            : null,
          patterns.length > 0 ? `Patterns: ${patterns.length}` : null,
          failures.length > 0
            ? `Failure predictions: ${failures.length}`
            : null,
        ].filter(Boolean) as string[],
        cache_hit: false,
        generation_time_ms: Date.now() - startTime,
      },
    };

    // Cache the generated brief
    if (useCache) {
      this.briefCache.set(cacheKey, brief);
      this.statements.cacheBrief.run(task.id, JSON.stringify(brief), cacheKey);
    }
    return brief;
  }

  /**
   * Generate minimal TL;DR - just the essential task description
   */
  private generateMinimalTLDR(task: Task): string {
    const action =
      task.task_type === "bug"
        ? "Fix"
        : task.task_type === "feature"
          ? "Implement"
          : task.task_type === "refactor"
            ? "Refactor"
            : task.task_type === "test"
              ? "Test"
              : "Complete";

    // Use intent if available and concise, otherwise title
    const description =
      task.intent && task.intent.length < 100 ? task.intent : task.title;

    return `${action}: ${description}`.substring(0, 150);
  }

  /**
   * Extract only real, factual information from task and similar tasks
   */
  private extractRealFacts(
    task: Task,
    similarTasks: any[],
    patterns: any[],
  ): Fact[] {
    const facts: Fact[] = [];

    // Only add facts that are real data points
    if (similarTasks.length > 0 && similarTasks[0].similarity > 0.7) {
      facts.push({
        fact: `Found ${similarTasks.length} similar task(s) with ${Math.round(similarTasks[0].similarity * 100)}% match`,
        source_refs: similarTasks.slice(0, 3).map((st) => st.task.id),
      });
    }

    if (patterns.length > 0) {
      const highTrustPatterns = patterns.filter((p) => p.trust_score > 0.8);
      if (highTrustPatterns.length > 0) {
        facts.push({
          fact: `${highTrustPatterns.length} high-trust patterns available`,
          source_refs: highTrustPatterns.slice(0, 3).map((p) => p.id),
        });
      }
    }

    return facts;
  }

  /**
   * Extract only real risks from failure corpus
   */
  private extractRealRisks(failures: any[]): string[] {
    // Only include actual failure predictions with high probability
    return failures
      .filter((f) => f.probability > 0.6)
      .slice(0, 3)
      .map(
        (f) =>
          `${f.pattern}: ${f.description} (${Math.round(f.probability * 100)}% chance)`,
      );
  }

  /**
   * Extract code snippets from similar tasks and patterns
   */
  private extractCodeSnippets(
    similarTasks: any[],
    patterns: any[],
  ): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];

    // Get snippets from patterns
    for (const pattern of patterns.slice(0, 3)) {
      if (pattern.snippets && pattern.snippets.length > 0) {
        const snippet = pattern.snippets[0];
        snippets.push({
          code: snippet.code,
          language: snippet.language || "typescript",
          description: `Pattern ${pattern.id}: ${pattern.title}`,
          source_ref: `pattern:${pattern.id}`,
        });
      }
    }

    // Add implementation hints from similar tasks
    if (similarTasks.length > 0 && similarTasks[0].similarity > 0.7) {
      snippets.push({
        code:
          "// Check similar implementation in task " + similarTasks[0].task.id,
        language: "typescript",
        description: "Reference implementation available",
        source_ref: `task:${similarTasks[0].task.id}`,
      });
    }

    return snippets.slice(0, 5); // Limit to 5 snippets
  }

  /**
   * Extract key files from task and similar tasks
   */
  private extractKeyFiles(task: Task, similarTasks: any[]): string[] {
    const files: string[] = [];

    // Get files from similar tasks
    for (const st of similarTasks.slice(0, 3)) {
      if (st.task.files_modified) {
        const taskFiles = JSON.parse(st.task.files_modified) as string[];
        files.push(...taskFiles);
      }
    }

    // Deduplicate and limit
    return [...new Set(files)].slice(0, 10);
  }

  /**
   * Get in-flight work that might conflict
   */
  private async getInFlightWork(
    currentTaskId: string,
  ): Promise<InFlightWork[]> {
    const inFlight = this.statements.getInFlightWork.all(
      currentTaskId,
    ) as any[];

    return inFlight.map((task) => ({
      task_id: task.id,
      title: task.title,
      overlap_type: "components" as const,
      risk_level: "low" as const,
    }));
  }

  /**
   * Get relevant patterns from pattern repository
   */
  private async getRelevantPatterns(
    signals: TaskSignals,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      // Use pattern repository to find relevant patterns
      const searchResult = await this.patternRepo.search({
        task: signals.tags.join(" "),
        k: limit,
      });

      return searchResult.patterns || [];
    } catch (error) {
      // Pattern repo might not be available
      return [];
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): BriefGenerationMetrics {
    return {
      cache_hit: false, // Would need to track this per request
      total_time_ms: 0, // Would need to track this
      data_fetch_ms: 0, // Would need to track this
      generation_ms: 0, // Would need to track this
      similar_tasks_found: 0, // Would need to track this
      patterns_applied: 0, // Would need to track this
      failures_analyzed: 0, // Would need to track this
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.briefCache.clear();
    // Also clear database cache if needed
    this.db.exec("DELETE FROM task_briefs");
  }
}
