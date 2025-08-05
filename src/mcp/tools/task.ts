/**
 * Task Service - MCP tools for task lifecycle management
 * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern for MCP tools
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { z } from "zod";
import { TaskRepository } from "../../storage/repositories/task-repository.js";
import {
  InvalidParamsError,
  InternalError,
  ToolExecutionError,
} from "../errors.js";
import type {
  Task,
  TaskBrief,
  CreateRequest,
  CreateResponse,
  FindRequest,
  FindSimilarRequest,
  UpdateRequest,
  CheckpointRequest,
  CompleteRequest,
  ReflectionDraft,
  SimilarTask,
} from "../../schemas/task/types.js";
import {
  CreateRequestSchema,
  FindRequestSchema,
  FindSimilarRequestSchema,
  UpdateRequestSchema,
  CheckpointRequestSchema,
  CompleteRequestSchema,
} from "../../schemas/task/types.js";

export class TaskService {
  constructor(private repository: TaskRepository) {}

  /**
   * Create a new task with auto-generated brief
   * [PAT:VALIDATION:ZOD] ★★★☆☆ - Validate request with Zod
   */
  async create(params: unknown): Promise<CreateResponse> {
    // Validate input
    const parseResult = CreateRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid create request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      // Generate task brief from intent
      const brief = this.generateBrief(request.intent, request.type);

      // Create task in database
      const task = this.repository.create(
        {
          identifier: request.identifier,
          intent: request.intent,
          task_type: request.type,
        },
        brief,
      );

      return {
        id: task.id,
        brief,
      };
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find tasks by various criteria
   */
  async find(params: unknown): Promise<Task[]> {
    // Validate input
    const parseResult = FindRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid find request: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      // For now, only support status-based search
      // TODO: Add support for tags, themes, components once implemented
      if (request.status) {
        return this.repository.findByStatus(request.status, request.limit);
      }

      // Default to returning active tasks
      return this.repository.findActive().slice(0, request.limit);
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to find tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Find similar tasks using cached similarity scores
   */
  async findSimilar(params: unknown): Promise<SimilarTask[]> {
    // Validate input
    const parseResult = FindSimilarRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid find similar request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      // If no task ID provided, use the most recent active task
      let taskId = request.taskId;
      if (!taskId) {
        const activeTasks = this.repository.findActive();
        if (activeTasks.length === 0) {
          return [];
        }
        taskId = activeTasks[0].id;
      }

      return this.repository.findSimilar(taskId, 5);
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to find similar tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all currently active tasks
   */
  async getCurrent(): Promise<Task[]> {
    try {
      return this.repository.findActive();
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to get current tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update task with execution details
   */
  async update(params: unknown): Promise<void> {
    // Validate input
    const parseResult = UpdateRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid update request: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      const updates: Partial<Task> = {};

      if (request.phase) updates.phase = request.phase;
      if (request.confidence !== undefined) updates.confidence = request.confidence;
      if (request.files) updates.files_touched = request.files;
      if (request.errors) updates.errors_encountered = request.errors;
      
      // Store handoff in phase_handoffs
      if (request.handoff) {
        const task = this.repository.findById(request.id);
        if (task) {
          const handoffs = task.phase_handoffs || {};
          handoffs[task.phase || "ARCHITECT"] = request.handoff;
          updates.phase_handoffs = handoffs;
        }
      }

      this.repository.update(request.id, updates);
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Add a checkpoint message to task tracking
   */
  async checkpoint(params: unknown): Promise<void> {
    // Validate input
    const parseResult = CheckpointRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid checkpoint request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      // Add checkpoint to in_flight messages
      const task = this.repository.findById(request.id);
      if (!task) {
        throw new Error(`Task ${request.id} not found`);
      }

      const inFlight = task.in_flight || [];
      inFlight.push({
        timestamp: new Date().toISOString(),
        message: request.message,
        confidence: request.confidence,
      });

      const updates: Partial<Task> = { in_flight: inFlight };
      if (request.confidence !== undefined) {
        updates.confidence = request.confidence;
      }

      this.repository.update(request.id, updates);
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to add checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Complete a task and generate reflection draft
   */
  async complete(params: unknown): Promise<ReflectionDraft> {
    // Validate input
    const parseResult = CompleteRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid complete request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      const task = this.repository.findById(request.id);
      if (!task) {
        throw new Error(`Task ${request.id} not found`);
      }

      // Mark task as complete
      this.repository.complete(
        request.id,
        request.outcome,
        request.key_learning,
        request.patterns_used,
      );

      // Generate reflection draft for apex.reflect
      const reflectionDraft: ReflectionDraft = {
        task: {
          id: task.id,
          title: task.title,
        },
        outcome: request.outcome,
        claims: {
          patterns_used: (request.patterns_used || []).map((pattern) => ({
            pattern_id: pattern,
            evidence: [], // AI will fill this in
          })),
          trust_updates: (request.patterns_used || []).map((pattern) => ({
            pattern_id: pattern,
            outcome: request.outcome === "success" ? "worked-perfectly" : "partial-success",
          })),
        },
      };

      return reflectionDraft;
    } catch (error) {
      throw new ToolExecutionError(
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate a task brief from intent
   * TODO: This is a simplified version - enhance with AI or more sophisticated parsing
   */
  private generateBrief(intent: string, type?: string): TaskBrief {
    // Parse intent to extract key information
    const words = intent.toLowerCase().split(/\s+/);
    
    // Extract action verbs
    const actionVerbs = ["implement", "fix", "create", "add", "update", "refactor", "test"];
    const action = words.find((w) => actionVerbs.includes(w)) || "implement";
    
    // Generate TL;DR
    const tldr = intent.length > 50 ? intent.substring(0, 50) + "..." : intent;
    
    // Generate objectives based on type and intent
    const objectives = this.generateObjectives(intent, type);
    
    // Generate plan steps
    const plan = this.generatePlan(intent, type);
    
    return {
      tl_dr: tldr,
      objectives,
      constraints: [
        "Maintain backwards compatibility",
        "Follow existing code patterns",
        "Include comprehensive tests",
      ],
      acceptance_criteria: [
        `${action} functionality as described`,
        "All tests pass",
        "Code follows project conventions",
      ],
      plan,
      facts: [],
      snippets: [],
      risks_and_gotchas: [
        "Check for existing implementations",
        "Consider performance implications",
      ],
      open_questions: [],
      test_scaffold: `// Test scaffold for: ${intent}\n// TODO: Implement tests`,
    };
  }

  /**
   * Generate objectives from intent
   */
  private generateObjectives(intent: string, type?: string): string[] {
    const objectives: string[] = [];
    
    switch (type) {
      case "bug":
        objectives.push("Identify root cause of the issue");
        objectives.push("Implement fix without side effects");
        objectives.push("Add tests to prevent regression");
        break;
      case "feature":
        objectives.push("Design and implement new functionality");
        objectives.push("Ensure integration with existing features");
        objectives.push("Document usage and API");
        break;
      case "refactor":
        objectives.push("Improve code structure and maintainability");
        objectives.push("Maintain existing functionality");
        objectives.push("Update affected tests");
        break;
      case "test":
        objectives.push("Increase test coverage");
        objectives.push("Verify edge cases");
        objectives.push("Ensure test isolation");
        break;
      default:
        objectives.push("Complete the requested task");
        objectives.push("Follow best practices");
        objectives.push("Ensure quality and correctness");
    }
    
    return objectives;
  }

  /**
   * Generate plan steps from intent
   */
  private generatePlan(intent: string, type?: string): Array<{ step: string; action: string; files?: string[] }> {
    const plan = [];
    
    // ARCHITECT phase
    plan.push({
      step: "1",
      action: "Research and design solution approach",
    });
    
    // BUILDER phase
    plan.push({
      step: "2",
      action: "Implement core functionality",
    });
    
    // VALIDATOR phase
    plan.push({
      step: "3",
      action: "Test implementation and validate requirements",
    });
    
    // REVIEWER phase
    plan.push({
      step: "4",
      action: "Review code quality and patterns",
    });
    
    // DOCUMENTER phase
    plan.push({
      step: "5",
      action: "Document learnings and update patterns",
    });
    
    return plan;
  }
}