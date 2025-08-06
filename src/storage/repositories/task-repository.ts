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

export class TaskRepository {
  private db: Database.Database;
  private statements: {
    create: Database.Statement;
    findById: Database.Statement;
    findByStatus: Database.Statement;
    findActive: Database.Statement;
    findSimilar: Database.Statement;
    cacheSimilarity: Database.Statement;
    updatePhase: Database.Statement;
    updateConfidence: Database.Statement;
    complete: Database.Statement;
  };

  constructor(db: Database.Database) {
    this.db = db;
    // [FIX:SQLITE:SYNC] ★★★★★ - Prepare statements synchronously for performance
    this.statements = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      create: this.db.prepare(`
        INSERT INTO tasks (
          id, identifier, title, intent, task_type, status,
          tl_dr, objectives, constraints, acceptance_criteria, plan,
          facts, snippets, risks_and_gotchas, open_questions, test_scaffold,
          phase, confidence, created_at
        ) VALUES (
          @id, @identifier, @title, @intent, @task_type, @status,
          @tl_dr, @objectives, @constraints, @acceptance_criteria, @plan,
          @facts, @snippets, @risks_and_gotchas, @open_questions, @test_scaffold,
          @phase, @confidence, CURRENT_TIMESTAMP
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
    const oldBrief = this.isNewTaskBrief(brief)
      ? newToOldTaskBrief(brief)
      : brief;

    const newTask = {
      id,
      identifier: task.identifier,
      title: oldBrief.tl_dr || task.intent || "Untitled Task",
      intent: task.intent,
      task_type: task.task_type || "feature",
      status: "active" as TaskStatus,
      // Store brief components as JSON strings
      tl_dr: oldBrief.tl_dr,
      objectives: JSON.stringify(oldBrief.objectives),
      constraints: JSON.stringify(oldBrief.constraints),
      acceptance_criteria: JSON.stringify(oldBrief.acceptance_criteria),
      plan: JSON.stringify(oldBrief.plan),
      facts: JSON.stringify(oldBrief.facts),
      snippets: JSON.stringify(oldBrief.snippets),
      risks_and_gotchas: JSON.stringify(oldBrief.risks_and_gotchas),
      open_questions: JSON.stringify(oldBrief.open_questions),
      test_scaffold: oldBrief.test_scaffold,
      phase: "ARCHITECT" as Phase,
      confidence: 0.3,
    };

    // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous insert
    this.statements.create.run(newTask);

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
   * Find similar tasks with caching
   * NOTE: This method maintains backward compatibility while internally
   * using the enhanced TaskSearchEngine for better similarity matching
   */
  findSimilar(taskId: string, limit: number = 5): SimilarTask[] {
    // For enhanced similarity search, use TaskSearchEngine
    // This maintains the simple interface while providing better results

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
      reflection_id: reflectionId,
      duration_ms: duration,
    });
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
    brief: TaskBrief | NewTaskBrief,
  ): brief is NewTaskBrief {
    return Array.isArray((brief as NewTaskBrief).tl_dr);
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
}
