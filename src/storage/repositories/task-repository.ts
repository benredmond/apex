/**
 * Task Repository - Database access layer for tasks
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
 */

import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type {
  Task,
  TaskBrief,
  TaskStatus,
  TaskType,
  Phase,
  SimilarTask,
  TaskOutcome,
} from "../../schemas/task/types.js";
import type { TaskBrief as NewTaskBrief } from "../../schemas/task/brief-types.js";
import { newToOldTaskBrief } from "../../schemas/task/brief-adapter.js";
import type { TaskSearchEngine } from "../../intelligence/task-search.js";
import type { DatabaseAdapter, Statement } from "../database-adapter.js";

export class TaskRepository {
  private db: DatabaseAdapter;
  private searchEngine?: TaskSearchEngine;
  private statements: {
    create: Statement;
    findById: Statement;
    findByStatus: Statement;
    findActive: Statement;
    findSimilar: Statement;
    cacheSimilarity: Statement;
    updatePhase: Statement;
    updateConfidence: Statement;
    complete: Statement;
  };

  constructor(db: DatabaseAdapter, searchEngine?: TaskSearchEngine) {
    this.db = db;
    this.searchEngine = searchEngine;
    // [FIX:SQLITE:SYNC] ★★★★★ - Prepare statements synchronously for performance
    try {
      this.statements = this.prepareStatements();
    } catch (error) {
      console.error(`[TaskRepository] Failed to prepare statements:`, error);
      throw error;
    }
  }

  /**
   * Set the search engine for similarity computation
   * [PAT:LIFECYCLE:EVENT_HOOKS] - Enables automatic similarity triggers
   */
  setSearchEngine(searchEngine: TaskSearchEngine): void {
    this.searchEngine = searchEngine;
  }

  private prepareStatements() {
    console.error(
      `[TaskRepository] Preparing statements with database:`,
      this.db ? "available" : "not available",
    );
    console.error(`[TaskRepository] Database path:`, (this.db as any)?.name);

    return {
      create: this.db.prepare(`
        INSERT INTO tasks (
          id, identifier, title, intent, task_type, status,
          tl_dr, objectives, constraints, acceptance_criteria, plan,
          facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
          phase, confidence, tags, created_at
        ) VALUES (
          @id, @identifier, @title, @intent, @task_type, @status,
          @tl_dr, @objectives, @constraints, @acceptance_criteria, @plan,
          @facts, @snippets, @risks_and_gotchas, @open_questions, @test_scaffold,
          @phase, @confidence, @tags, CURRENT_TIMESTAMP
        )
      `),

      findById: this.db.prepare(`
        SELECT * FROM tasks WHERE id = ?
      `),

      findByStatus: this.db.prepare(`
        SELECT * FROM tasks 
        WHERE status = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `),

      findActive: this.db.prepare(`
        SELECT * FROM tasks 
        WHERE status = 'active' 
        ORDER BY created_at DESC
      `),

      findSimilar: this.db.prepare(`
        SELECT 
          t.*,
          ts.similarity_score,
          ts.calculation_method
        FROM task_similarity ts
        JOIN tasks t ON (t.id = ts.task_b OR t.id = ts.task_a)
        WHERE (ts.task_a = ? OR ts.task_b = ?)
          AND t.id != ?
        ORDER BY ts.similarity_score DESC
        LIMIT ?
      `),

      cacheSimilarity: this.db.prepare(`
        INSERT OR REPLACE INTO task_similarity 
        (task_a, task_b, similarity_score, calculation_method)
        VALUES (?, ?, ?, ?)
      `),

      updatePhase: this.db.prepare(`
        UPDATE tasks SET phase = ? WHERE id = ?
      `),

      updateConfidence: this.db.prepare(`
        UPDATE tasks SET confidence = ? WHERE id = ?
      `),

      complete: this.db.prepare(`
        UPDATE tasks SET
          status = 'completed',
          outcome = @outcome,
          key_learning = @key_learning,
          patterns_used = @patterns_used,
          reflection_id = @reflection_id,
          duration_ms = @duration_ms,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = @id
      `),
    };
  }

  /**
   * Create a new task with generated brief
   */
  create(task: Partial<Task>, brief: TaskBrief | NewTaskBrief): Task {
    const id = nanoid();

    // Convert new TaskBrief format to old format if needed
    const oldBrief = brief
      ? this.isNewTaskBrief(brief)
        ? newToOldTaskBrief(brief)
        : brief
      : null;

    const newTask = {
      id,
      identifier: task.identifier ?? null,  // Convert undefined to null for SQLite
      title: oldBrief?.tl_dr || task.intent || "Untitled Task",
      intent: task.intent ?? null,  // Convert undefined to null for SQLite
      task_type: task.task_type || "feature",
      status: "active" as TaskStatus,
      // Store brief components as JSON strings
      tl_dr: oldBrief?.tl_dr || null,
      objectives: oldBrief ? JSON.stringify(oldBrief.objectives) : null,
      constraints: oldBrief ? JSON.stringify(oldBrief.constraints) : null,
      acceptance_criteria: oldBrief
        ? JSON.stringify(oldBrief.acceptance_criteria)
        : null,
      plan: oldBrief ? JSON.stringify(oldBrief.plan) : null,
      facts: oldBrief ? JSON.stringify(oldBrief.facts) : null,
      snippets: oldBrief ? JSON.stringify(oldBrief.snippets) : null,
      risks_and_gotchas: oldBrief
        ? JSON.stringify(oldBrief.risks_and_gotchas)
        : null,
      open_questions: oldBrief ? JSON.stringify(oldBrief.open_questions) : null,
      test_scaffold: oldBrief?.test_scaffold || null,
      phase: "ARCHITECT" as Phase,
      confidence: 0.3,
      tags: task.tags ? JSON.stringify(task.tags) : null, // [APE-63] Store tags as JSON
    };

    // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous insert
    try {
      this.statements.create.run(newTask);
    } catch (error) {
      // Log the actual SQLite error for debugging
      console.error(`[TaskRepository] Failed to insert task:`, error);
      console.error(`[TaskRepository] Task data:`, newTask);
      throw error;
    }

    // [PAT:LIFECYCLE:EVENT_HOOKS] - Compute similarities for new task (async, non-blocking)
    if (this.searchEngine) {
      // Fire and forget - don't await to avoid blocking task creation
      this.searchEngine.computeSimilarities(id).catch((error) => {
        console.error(
          `Failed to compute similarities for new task ${id}:`,
          error,
        );
      });
    }

    // Fetch the created task to return full object
    return this.findById(id)!;
  }

  /**
   * Find task by ID
   */
  findById(id: string): Task | null {
    const row = this.statements.findById.get(id) as any;
    if (!row) return null;
    return this.deserializeTask(row);
  }

  /**
   * Find tasks by status
   */
  findByStatus(status: TaskStatus, limit: number = 10): Task[] {
    const rows = this.statements.findByStatus.all(status, limit) as any[];
    return rows.map((row) => this.deserializeTask(row));
  }

  /**
   * Find all active tasks
   */
  findActive(): Task[] {
    const rows = this.statements.findActive.all() as any[];
    return rows.map((row) => this.deserializeTask(row));
  }

  /**
   * Find tasks by various criteria including tags
   * [APE-63] Support tag-based filtering
   */
  find(
    criteria: {
      tags?: string[];
      status?: TaskStatus;
      limit?: number;
    } = {},
  ): Task[] {
    const { tags, status, limit = 10 } = criteria;

    // Build dynamic query based on criteria
    let query = "SELECT * FROM tasks WHERE 1=1";
    const params: any[] = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (tags && tags.length > 0) {
      // For tag filtering, we need to check if any of the provided tags
      // are present in the task's tags JSON array
      const tagConditions = tags.map(() => "tags LIKE ?").join(" OR ");
      query += ` AND (${tagConditions})`;
      tags.forEach((tag) => {
        params.push(`%"${tag}"%`);
      });
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];
    return rows.map((row) => this.deserializeTask(row));
  }

  /**
   * Add a checkpoint message to a task
   * [APE-63] Track task progress with checkpoint messages
   */
  checkpoint(request: {
    id: string;
    message: string;
    confidence?: number;
  }): void {
    const task = this.findById(request.id);
    if (!task) {
      throw new Error(`Task ${request.id} not found`);
    }

    const inFlight = task.in_flight || [];
    const checkpoint = `${new Date().toISOString()}: ${request.message}${
      request.confidence ? ` (confidence: ${request.confidence})` : ""
    }`;
    inFlight.push(checkpoint);

    const updates: Partial<Task> = { in_flight: inFlight };
    if (request.confidence !== undefined) {
      updates.confidence = request.confidence;
    }

    this.update(request.id, updates);
  }

  /**
   * Find similar tasks with caching
   * NOTE: This method maintains backward compatibility while internally
   * using the enhanced TaskSearchEngine for better similarity matching
   */
  async findSimilar(taskId: string, limit: number = 5): Promise<SimilarTask[]> {
    // [PAT:LIFECYCLE:EVENT_HOOKS] - Use TaskSearchEngine if available for better results
    if (this.searchEngine) {
      const task = this.findById(taskId);
      if (!task) return [];

      try {
        return await this.searchEngine.findSimilar(task, {
          limit,
          useCache: true,
        });
      } catch (error) {
        console.error(
          `TaskSearchEngine failed, falling back to basic similarity:`,
          error,
        );
        // Fall through to basic implementation
      }
    }

    // First check cache using existing statement for backward compatibility
    const cached = this.statements.findSimilar.all(
      taskId,
      taskId,
      taskId,
      limit,
    ) as any[];

    if (cached.length > 0) {
      return cached.map((row) => ({
        task: this.deserializeTask(row),
        similarity: row.similarity_score,
        reason: row.calculation_method || "cached",
      }));
    }

    // If no cache, calculate similarity (simplified for backward compatibility)
    const task = this.findById(taskId);
    if (!task) return [];

    // Get all tasks for comparison
    const allTasks = this.db
      .prepare("SELECT * FROM tasks WHERE id != ? LIMIT 20")
      .all(taskId) as any[];

    const similarities: SimilarTask[] = [];
    for (const row of allTasks) {
      const otherTask = this.deserializeTask(row);
      const similarity = this.calculateSimilarity(task, otherTask);

      if (similarity > 0.3) {
        similarities.push({
          task: otherTask,
          similarity,
          reason: "title and type matching",
        });

        // Cache the similarity score
        const [taskA, taskB] =
          taskId < otherTask.id
            ? [taskId, otherTask.id]
            : [otherTask.id, taskId];
        this.statements.cacheSimilarity.run(
          taskA,
          taskB,
          similarity,
          "title_type_match",
        );
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Update task fields
   */
  update(id: string, updates: Partial<Task>): void {
    // Handle null/undefined updates
    if (!updates) {
      return;
    }

    // For complex updates like in_flight, we need a more flexible approach
    const updateFields: string[] = [];
    const params: any = { id };

    if (updates.phase !== undefined) {
      updateFields.push("phase = @phase");
      params.phase = updates.phase;
    }
    if (updates.phase_handoffs !== undefined) {
      updateFields.push("phase_handoffs = @phase_handoffs");
      params.phase_handoffs = JSON.stringify(updates.phase_handoffs);
    }
    if (updates.files_touched !== undefined) {
      updateFields.push("files_touched = @files_touched");
      params.files_touched = JSON.stringify(updates.files_touched);
    }
    if (updates.errors_encountered !== undefined) {
      updateFields.push("errors_encountered = @errors_encountered");
      params.errors_encountered = JSON.stringify(updates.errors_encountered);
    }
    if (updates.confidence !== undefined) {
      updateFields.push("confidence = @confidence");
      params.confidence = updates.confidence;
    }
    if (updates.in_flight !== undefined) {
      updateFields.push("in_flight = @in_flight");
      params.in_flight = JSON.stringify(updates.in_flight);
    }

    if (updateFields.length === 0) return;

    const sql = `UPDATE tasks SET ${updateFields.join(", ")} WHERE id = @id`;
    const stmt = this.db.prepare(sql);
    stmt.run(params);

    // [PAT:LIFECYCLE:EVENT_HOOKS] - Recompute similarities after task update (async, non-blocking)
    if (this.searchEngine) {
      // Fire and forget - don't await to avoid blocking task update
      this.searchEngine.computeSimilarities(id).catch((error) => {
        console.error(
          `Failed to recompute similarities for updated task ${id}:`,
          error,
        );
      });
    }
  }

  /**
   * Complete a task
   */
  complete(
    id: string,
    outcome: TaskOutcome,
    keyLearning: string,
    patternsUsed?: string[],
    reflectionId?: string,
  ): void {
    const startTime = this.db
      .prepare("SELECT created_at FROM tasks WHERE id = ?")
      .get(id) as any;

    const duration = startTime
      ? Date.now() - new Date(startTime.created_at).getTime()
      : null;

    this.statements.complete.run({
      id,
      outcome,
      key_learning: keyLearning,
      patterns_used: patternsUsed ? JSON.stringify(patternsUsed) : null,
      reflection_id: reflectionId || null,
      duration_ms: duration,
    });

    // [PAT:LIFECYCLE:EVENT_HOOKS] - Clear similarities on task completion
    if (this.searchEngine) {
      try {
        this.searchEngine.clearCacheForTask(id);
      } catch (error) {
        console.error(
          `Failed to clear similarity cache for completed task ${id}:`,
          error,
        );
      }
    }
  }

  /**
   * Deserialize task from database row
   */
  private deserializeTask(row: any): Task {
    const task: Task = {
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
      tags: row.tags ? JSON.parse(row.tags) : undefined, // [APE-63] Parse tags
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
    return task;
  }

  /**
   * Type guard to check if brief is new format
   */
  private isNewTaskBrief(
    brief: TaskBrief | NewTaskBrief | undefined,
  ): brief is NewTaskBrief {
    return brief !== undefined && Array.isArray((brief as NewTaskBrief).tl_dr);
  }

  /**
   * Calculate similarity between two tasks (simplified)
   */
  private calculateSimilarity(task1: Task, task2: Task): number {
    let score = 0;

    // Type matching (30% weight)
    if (task1.task_type === task2.task_type) {
      score += 0.3;
    }

    // Title similarity (70% weight) - simplified Levenshtein
    const title1 = (task1.title || "").toLowerCase();
    const title2 = (task2.title || "").toLowerCase();
    const words1 = new Set(title1.split(/\s+/));
    const words2 = new Set(title2.split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size > 0) {
      score += (intersection.size / union.size) * 0.7;
    }

    return Math.min(1, Math.max(0, score));
  }

  findRecent(limit: number = 20): Task[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks 
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.deserializeTask(row));
  }

  async getStatistics(period: string = "week"): Promise<any> {
    // Calculate date range based on period
    const now = new Date();
    let sinceDate = new Date();

    switch (period) {
      case "today":
        sinceDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        sinceDate.setDate(now.getDate() - 7);
        break;
      case "month":
        sinceDate.setDate(now.getDate() - 30);
        break;
      case "all":
        sinceDate = new Date(0); // Beginning of time
        break;
    }

    const sinceDateStr = sinceDate.toISOString();

    // Get total tasks
    const totalStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE created_at >= ?
    `);
    const totalResult = totalStmt.get(sinceDateStr) as any;
    const totalTasks = totalResult?.count || 0;

    // Get tasks by status
    const statusStmt = this.db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM tasks 
      WHERE created_at >= ?
      GROUP BY status
    `);
    const statusResults = statusStmt.all(sinceDateStr) as any[];

    const statusCounts = {
      active: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
    };

    for (const row of statusResults) {
      if (row.status in statusCounts) {
        statusCounts[row.status as keyof typeof statusCounts] = row.count;
      }
    }

    // Calculate completion rate
    const completionRate =
      totalTasks > 0 ? statusCounts.completed / totalTasks : 0;

    // Get tasks this week
    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - 7);
    const weekStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE created_at >= ?
    `);
    const weekResult = weekStmt.get(weekDate.toISOString()) as any;
    const tasksThisWeek = weekResult?.count || 0;

    return {
      total_tasks: totalTasks,
      active_tasks: statusCounts.active,
      completed_tasks: statusCounts.completed,
      failed_tasks: statusCounts.failed,
      completion_rate: completionRate,
      tasks_this_week: tasksThisWeek,
      avg_duration: "N/A", // Would need more complex calculation
      last_updated: new Date().toISOString(),
    };
  }
}
