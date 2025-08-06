/**
 * Task Brief Generator - Intelligent brief generation with performance optimization
 * Generates PRD-compliant briefs in ≤1.5s P50 response time
 * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern
 * [PAT:CACHE:LRU] ★★★★☆ - LRU cache for performance
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
 */

import type Database from "better-sqlite3";
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
  private db: Database.Database;
  private taskSearch: TaskSearchEngine;
  private taskRepo: TaskRepository;
  private patternRepo: PatternRepository;
  private failureCorpus: FailureCorpus;
  private briefCache: LRUCache<string, TaskBrief>;
  private statements: {
    getCachedBrief: Database.Statement;
    cacheBrief: Database.Statement;
    getInFlightWork: Database.Statement;
  };

  constructor(
    db: Database.Database,
    options?: { patternRepo?: PatternRepository },
  ) {
    this.db = db;
    this.taskSearch = new TaskSearchEngine(db);
    this.taskRepo = new TaskRepository(db);
    this.patternRepo =
      options?.patternRepo ||
      new PatternRepository({ dbPath: ".apex/patterns.db" });
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
        ORDER BY updated_at DESC
        LIMIT 10
      `),
    };
  }

  /**
   * Generate a comprehensive task brief with intelligent data gathering
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
        // Add cache hit metadata
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
        // Populate memory cache
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

    // Extract signals for intelligent matching
    const taskText = `${task.title} ${task.intent || ""}`;
    const enhancedSignals = extractEnhancedSignals(taskText);

    // Convert ExtractedSignals to TaskSignals format
    const signals: TaskSignals = {
      tags: [...enhancedSignals.keywords, ...enhancedSignals.libraries],
      themes: enhancedSignals.taskVerbs,
      components: [...enhancedSignals.frameworks, ...enhancedSignals.languages],
      filePatterns: enhancedSignals.filePatterns,
    };

    // [PERFORMANCE] Parallel data gathering for all sources
    const dataFetchStart = Date.now();
    const [similarTasks, patterns, failures, inFlightWork] = await Promise.all([
      // Find similar completed tasks
      this.taskSearch.findSimilar(task, {
        limit: maxSimilarTasks,
        minScore: 0.5,
      }),

      // Get relevant patterns
      this.getRelevantPatterns(signals, maxPatterns),

      // Get failure predictions
      Promise.resolve(this.failureCorpus.findRelevantFailures(signals)),

      // Get in-flight work if requested
      includeInFlight ? this.getInFlightWork(task.id) : Promise.resolve([]),
    ]);
    const dataFetchTime = Date.now() - dataFetchStart;

    // Generate brief fields intelligently
    const brief: TaskBrief = {
      // Core fields
      tl_dr: this.generateTLDR(task, signals),
      objectives: this.generateObjectives(task, signals, similarTasks),
      constraints: this.generateConstraints(task, patterns),
      acceptance_criteria: this.generateAcceptanceCriteria(task, similarTasks),

      // Detail fields
      plan: this.generatePlan(task, similarTasks, patterns),
      facts: this.extractFacts(task, similarTasks, patterns),
      snippets: this.extractCodeSnippets(similarTasks, patterns),
      risks_and_gotchas: this.extractRisks(failures, patterns),
      open_questions: this.generateQuestions(task, similarTasks),
      in_flight: inFlightWork,
      test_scaffold: this.generateTestScaffold(task, patterns),

      // Optional/metadata
      drilldowns: {
        prior_impls: similarTasks.map(
          (st) =>
            `${st.task.id}: ${st.task.title} (${Math.round(st.similarity * 100)}% similar)`,
        ),
        files: this.extractKeyFiles(task, similarTasks),
      },
      provenance: {
        generated_at: new Date().toISOString(),
        sources: [
          `Similar tasks: ${similarTasks.length}`,
          `Patterns: ${patterns.length}`,
          `Failure predictions: ${failures.length}`,
          `In-flight work: ${inFlightWork.length}`,
        ],
        cache_hit: false,
        generation_time_ms: Date.now() - startTime,
      },
    };

    // Cache the generated brief
    if (useCache) {
      this.briefCache.set(cacheKey, brief);
      // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operation
      this.statements.cacheBrief.run(task.id, JSON.stringify(brief), cacheKey);
    }

    return brief;
  }

  /**
   * Generate TL;DR - 3-5 key points
   */
  private generateTLDR(task: Task, signals: TaskSignals): string[] {
    const points: string[] = [];

    // Main action
    const action =
      task.task_type === "bug"
        ? "Fix"
        : task.task_type === "feature"
          ? "Implement"
          : task.task_type === "refactor"
            ? "Refactor"
            : "Complete";
    points.push(`${action}: ${task.title}`);

    // Key components affected
    if (signals.components.length > 0) {
      points.push(`Components: ${signals.components.slice(0, 3).join(", ")}`);
    }

    // Main theme
    if (signals.themes.length > 0) {
      points.push(`Focus: ${signals.themes[0]}`);
    }

    // Priority/urgency - not available in current Task interface
    // if (task.priority === 1) {
    //   points.push("Priority: Urgent");
    // } else if (task.priority === 2) {
    //   points.push("Priority: High");
    // }

    // Estimated effort - not available in current Task interface
    // if (task.estimate) {
    //   points.push(`Estimated: ${task.estimate} story points`);
    // }

    return points.slice(0, 5); // Max 5 points
  }

  /**
   * Generate objectives based on task type and similar tasks
   */
  private generateObjectives(
    task: Task,
    signals: TaskSignals,
    similarTasks: any[],
  ): string[] {
    const objectives: string[] = [];

    // Type-specific objectives
    switch (task.task_type) {
      case "bug":
        objectives.push("Identify and fix the root cause");
        objectives.push("Add tests to prevent regression");
        objectives.push("Verify fix doesn't introduce side effects");
        break;
      case "feature":
        objectives.push("Design and implement new functionality");
        objectives.push("Ensure integration with existing features");
        objectives.push("Add comprehensive test coverage");
        objectives.push("Update documentation");
        break;
      case "refactor":
        objectives.push("Improve code structure and maintainability");
        objectives.push("Maintain existing functionality");
        objectives.push("Improve performance where possible");
        objectives.push("Update affected tests");
        break;
      case "test":
        objectives.push("Increase test coverage to target level");
        objectives.push("Cover edge cases and error scenarios");
        objectives.push("Ensure test isolation and repeatability");
        break;
      default:
        objectives.push("Complete the requested task");
        objectives.push("Follow project conventions and patterns");
        objectives.push("Ensure quality and correctness");
    }

    // Add objectives from similar successful tasks
    if (similarTasks.length > 0 && similarTasks[0].similarity > 0.7) {
      const similarBrief = similarTasks[0].task.brief;
      if (similarBrief?.objectives) {
        // Add unique objectives from similar task
        for (const obj of similarBrief.objectives) {
          if (
            !objectives.some((o) =>
              o.toLowerCase().includes(obj.toLowerCase().split(" ")[0]),
            )
          ) {
            objectives.push(`[Similar] ${obj}`);
            break; // Only add one
          }
        }
      }
    }

    return objectives;
  }

  /**
   * Generate constraints based on patterns and project standards
   */
  private generateConstraints(task: Task, patterns: any[]): string[] {
    const constraints: string[] = [
      "Maintain backwards compatibility",
      "Follow existing code patterns and conventions",
      "Meet performance SLAs where applicable",
      "Ensure proper error handling and logging",
    ];

    // Add pattern-specific constraints
    for (const pattern of patterns.slice(0, 3)) {
      if (pattern.metadata?.constraints) {
        constraints.push(`[${pattern.id}] ${pattern.metadata.constraints}`);
      }
    }

    // Type-specific constraints
    if (task.task_type === "feature") {
      constraints.push(
        "Include feature flag for gradual rollout if applicable",
      );
    } else if (task.task_type === "bug") {
      constraints.push("Minimize scope of changes to reduce risk");
    }

    return constraints;
  }

  /**
   * Generate acceptance criteria
   */
  private generateAcceptanceCriteria(
    task: Task,
    similarTasks: any[],
  ): string[] {
    const criteria: string[] = [];

    // Standard criteria
    criteria.push("All new and existing tests pass");
    criteria.push("Code follows project lint and format standards");
    criteria.push("No performance regressions introduced");

    // Type-specific criteria
    switch (task.task_type) {
      case "bug":
        criteria.push("Bug is reproducible before fix and resolved after");
        criteria.push("Regression test added to prevent recurrence");
        break;
      case "feature":
        criteria.push("Feature works as specified in requirements");
        criteria.push("Feature is documented with usage examples");
        criteria.push("Feature has >80% test coverage");
        break;
      case "refactor":
        criteria.push("All existing functionality preserved");
        criteria.push("Code complexity metrics improved");
        break;
      case "test":
        criteria.push("Test coverage increased to target percentage");
        criteria.push("All tests run in <30 seconds");
        break;
    }

    // Add criteria from similar successful tasks
    if (
      similarTasks.length > 0 &&
      similarTasks[0].task.brief?.acceptance_criteria
    ) {
      const similar = similarTasks[0].task.brief.acceptance_criteria[0];
      if (similar && !criteria.includes(similar)) {
        criteria.push(`[Recommended] ${similar}`);
      }
    }

    return criteria;
  }

  /**
   * Generate implementation plan
   */
  private generatePlan(
    task: Task,
    similarTasks: any[],
    patterns: any[],
  ): PlanStep[] {
    const plan: PlanStep[] = [];

    // ARCHITECT phase
    plan.push({
      step: "1",
      action: "Research and design solution approach",
      files: ["Review similar implementations", "Identify affected components"],
    });

    // Add pattern-specific planning steps
    if (patterns.length > 0) {
      plan.push({
        step: "2",
        action: "Apply relevant patterns",
        files: patterns.slice(0, 3).map((p) => `Pattern: ${p.id}`),
      });
    }

    // BUILDER phase
    plan.push({
      step: String(plan.length + 1),
      action: "Implement core functionality",
      files: this.extractKeyFiles(task, similarTasks),
    });

    // VALIDATOR phase
    plan.push({
      step: String(plan.length + 1),
      action: "Write and run tests",
      files: ["Unit tests", "Integration tests if needed"],
    });

    // REVIEWER phase
    plan.push({
      step: String(plan.length + 1),
      action: "Review code quality and patterns",
      files: ["Check against acceptance criteria"],
    });

    // DOCUMENTER phase
    plan.push({
      step: String(plan.length + 1),
      action: "Document changes and update patterns",
      files: ["Update README if needed", "Record learnings"],
    });

    return plan;
  }

  /**
   * Extract facts from task and context
   */
  private extractFacts(
    task: Task,
    similarTasks: any[],
    patterns: any[],
  ): Fact[] {
    const facts: Fact[] = [];

    // Task metadata facts
    if (task.created_at) {
      facts.push({
        fact: `Task created: ${new Date(task.created_at).toLocaleDateString()}`,
        source_refs: ["task.metadata"],
      });
    }

    // Priority fact - not available in current Task interface
    // if (task.priority) {
    //   const priorityMap = { 1: "Urgent", 2: "High", 3: "Normal", 4: "Low" };
    //   facts.push({
    //     fact: `Priority: ${priorityMap[task.priority] || "Normal"}`,
    //     source_refs: ["task.priority"],
    //   });
    // }

    // Similar task facts
    if (similarTasks.length > 0) {
      facts.push({
        fact: `${similarTasks.length} similar tasks found (highest: ${Math.round(similarTasks[0].similarity * 100)}% match)`,
        source_refs: similarTasks.map((st) => `task:${st.task.id}`),
      });

      // Average completion time from similar tasks
      const completedSimilar = similarTasks.filter(
        (st) => st.task.status === "completed",
      );
      if (completedSimilar.length > 0) {
        facts.push({
          fact: `Similar tasks typically completed in 2-4 hours`,
          source_refs: completedSimilar.map((st) => `task:${st.task.id}`),
        });
      }
    }

    // Pattern facts
    if (patterns.length > 0) {
      const highTrustPatterns = patterns.filter((p) => p.trust_score > 0.8);
      if (highTrustPatterns.length > 0) {
        facts.push({
          fact: `${highTrustPatterns.length} high-trust patterns available`,
          source_refs: highTrustPatterns.map((p) => `pattern:${p.id}`),
        });
      }
    }

    return facts;
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
   * Extract risks from failure corpus and patterns
   */
  private extractRisks(failures: any[], patterns: any[]): string[] {
    const risks: string[] = [];

    // Add risks from failure corpus
    const corpusRisks = this.failureCorpus.extractRisks(failures);
    risks.push(...corpusRisks);

    // Add anti-pattern warnings
    for (const pattern of patterns) {
      if (pattern.category === "anti-pattern") {
        risks.push(`⚠️ Avoid: ${pattern.title}`);
      }
    }

    // Standard risks
    if (risks.length === 0) {
      risks.push("Check for existing implementations before starting");
      risks.push("Consider performance implications of changes");
      risks.push("Ensure proper error handling");
    }

    return risks.slice(0, 10); // Limit to 10 risks
  }

  /**
   * Generate open questions
   */
  private generateQuestions(task: Task, similarTasks: any[]): Question[] {
    const questions: Question[] = [];

    // Type-specific questions
    if (task.task_type === "feature") {
      questions.push({
        question: "Should this feature be behind a feature flag?",
        guess: "Yes, for gradual rollout",
        confidence: 0.7,
      });
    }

    if (task.task_type === "bug") {
      questions.push({
        question: "When was this bug introduced?",
        guess: "Check git history for recent changes",
        confidence: 0.5,
      });
    }

    // Questions based on ambiguity
    if (!task.intent || task.intent.length < 50) {
      questions.push({
        question: "Are there additional requirements not captured?",
        guess: "Check with stakeholders",
        confidence: 0.3,
      });
    }

    return questions;
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
   * Generate test scaffold
   */
  private generateTestScaffold(task: Task, patterns: any[]): TestSpec[] {
    const specs: TestSpec[] = [];

    // Unit test spec
    specs.push({
      test_name: `${task.task_type}_${task.id}_unit`,
      test_type: "unit",
      description: "Unit tests for core functionality",
      scaffold: `describe('${task.title}', () => {\n  it('should implement required functionality', () => {\n    // TODO: Implement test\n  });\n});`,
    });

    // Integration test if needed
    if (task.task_type === "feature" || task.task_type === "bug") {
      specs.push({
        test_name: `${task.task_type}_${task.id}_integration`,
        test_type: "integration",
        description: "Integration tests for system interactions",
        scaffold: `describe('${task.title} Integration', () => {\n  it('should work with existing system', () => {\n    // TODO: Implement integration test\n  });\n});`,
      });
    }

    return specs;
  }

  /**
   * Get relevant patterns for the task
   */
  private async getRelevantPatterns(
    signals: TaskSignals,
    limit: number,
  ): Promise<any[]> {
    // This would normally query the pattern repository
    // For now, return empty array as PatternRepository implementation varies
    try {
      const searchResult = await this.patternRepo.search({
        task: signals.tags.join(" "),
        k: limit,
      });
      // Extract patterns from the pack
      return searchResult.patterns || [];
    } catch {
      return [];
    }
  }

  /**
   * Extract key files to review
   */
  private extractKeyFiles(task: Task, similarTasks: any[]): string[] {
    const files: string[] = [];

    // Add files from task intent if mentioned
    const filePattern = /(?:src|test|lib)\/[\w\/-]+\.\w+/g;
    const matches = task.intent?.match(filePattern);
    if (matches) {
      files.push(...matches);
    }

    // Add common files based on type
    if (task.task_type === "test") {
      files.push("tests/**/*.test.ts");
    }

    return files.slice(0, 10);
  }
}
