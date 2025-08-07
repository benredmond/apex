/**
 * Task Service - MCP tools for task lifecycle management
 * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern for MCP tools
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { z } from "zod";
import type Database from "better-sqlite3";
import { TaskRepository } from "../../storage/repositories/task-repository.js";
import { BriefGenerator } from "../../intelligence/brief-generator.js";
import { ReflectionService } from "./reflect.js";
import { TagExpander } from "../../intelligence/tag-expander.js";
import {
  InvalidParamsError,
  InternalError,
  ToolExecutionError,
} from "../errors.js";
import type {
  Task,
  TaskBrief,
  Phase,
  PhaseHandoff,
  CreateRequest,
  CreateResponse,
  FindRequest,
  FindSimilarRequest,
  UpdateRequest,
  CheckpointRequest,
  CompleteRequest,
  ReflectionDraft,
  SimilarTask,
  EvidenceEntry,
  AppendEvidenceRequest,
  GetEvidenceRequest,
} from "../../schemas/task/types.js";
import type { TaskBrief as NewTaskBrief } from "../../schemas/task/brief-types.js";
import { newToOldTaskBrief } from "../../schemas/task/brief-adapter.js";
import {
  PhaseEnum,
  CreateRequestSchema,
  FindRequestSchema,
  FindSimilarRequestSchema,
  UpdateRequestSchema,
  CheckpointRequestSchema,
  CompleteRequestSchema,
  AppendEvidenceRequestSchema,
  GetEvidenceRequestSchema,
} from "../../schemas/task/types.js";

export class TaskService {
  private briefGenerator?: BriefGenerator;
  private reflectionService?: ReflectionService;
  private tagExpander: TagExpander;

  constructor(
    private repository: TaskRepository,
    private db?: Database.Database,
  ) {
    this.tagExpander = new TagExpander();
  }

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
      // [APE-63] Sanitize and expand AI-provided tags
      let sanitizedTags: string[] | undefined;
      if (request.tags && request.tags.length > 0) {
        // Sanitize tags for security
        sanitizedTags = request.tags
          .map((tag) => this.tagExpander.sanitizeTag(tag))
          .filter((tag) => tag.length > 0)
          .slice(0, 15); // Limit to 15 tags
      }

      // First create a basic task to get ID
      const tempBrief = this.generateBasicBrief(request.intent, request.type);

      // Create task in database
      const task = this.repository.create(
        {
          identifier: request.identifier,
          intent: request.intent,
          task_type: request.type,
          tags: sanitizedTags, // [APE-63] Store sanitized tags
        },
        tempBrief,
      );

      // Now generate enhanced brief if BriefGenerator is available
      let brief: TaskBrief = tempBrief;
      if (this.db && !this.briefGenerator) {
        this.briefGenerator = new BriefGenerator(this.db);
      }

      if (this.briefGenerator) {
        // Generate PRD-compliant brief with intelligence
        const newBrief = await this.briefGenerator.generateBrief(task, {
          useCache: true,
          includeInFlight: true,
          maxSimilarTasks: 5,
          maxPatterns: 10,
        });

        // Convert to old format for backward compatibility
        brief = newToOldTaskBrief(newBrief);

        // Update task with enhanced brief
        // Note: This assumes TaskRepository has an updateBrief method
        // If not, we'll use the temp brief for now
      }

      return {
        id: task.id,
        brief,
      };
    } catch (error) {
      throw new ToolExecutionError(
        "create",
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
        "find",
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
        "findSimilar",
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
        "getCurrent",
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
      if (request.confidence !== undefined)
        updates.confidence = request.confidence;
      if (request.files) updates.files_touched = request.files;
      if (request.errors)
        updates.errors_encountered = request.errors as Array<{
          error: string;
          fix?: string;
        }>;

      // Store handoff in phase_handoffs - append to array
      if (request.handoff) {
        const task = this.repository.findById(request.id);
        if (task) {
          let handoffs: PhaseHandoff[];
          
          // Handle both old Record format and new array format
          if (Array.isArray(task.phase_handoffs)) {
            handoffs = task.phase_handoffs;
          } else if (task.phase_handoffs && typeof task.phase_handoffs === 'object') {
            // Convert old Record format to array format
            handoffs = Object.entries(task.phase_handoffs).map(([p, h]) => ({
              phase: p as Phase,
              handoff: h,
              timestamp: task.created_at, // Use task creation time for migrated handoffs
            }));
          } else {
            handoffs = [];
          }
          
          // Append new handoff
          handoffs.push({
            phase: task.phase || "ARCHITECT",
            handoff: request.handoff,
            timestamp: new Date().toISOString(),
          });
          
          updates.phase_handoffs = handoffs;
        }
      }

      this.repository.update(request.id, updates);
    } catch (error) {
      throw new ToolExecutionError(
        "update",
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
      const checkpoint = `${new Date().toISOString()}: ${request.message}${request.confidence ? ` (confidence: ${request.confidence})` : ""}`;
      inFlight.push(checkpoint);

      const updates: Partial<Task> = { in_flight: inFlight };
      if (request.confidence !== undefined) {
        updates.confidence = request.confidence;
      }

      this.repository.update(request.id, updates);
    } catch (error) {
      throw new ToolExecutionError(
        "checkpoint",
        `Failed to add checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Complete a task and generate reflection draft
   * [REFACTORED] - No longer automatically submits reflection
   * Agent must explicitly call apex.reflect with the returned draft
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

      // Build comprehensive reflection draft with evidence
      // Note: Reflection is no longer automatic - agent must call apex.reflect explicitly
      const reflectionDraft = this.buildReflectionDraft(task, request);

      // Mark task as complete without automatic reflection
      // [REFACTORED] - Removed automatic reflection for atomic tool principle
      this.repository.complete(
        request.id,
        request.outcome,
        request.key_learning,
        request.patterns_used,
        undefined, // No automatic reflection ID
      );

      return reflectionDraft;
    } catch (error) {
      throw new ToolExecutionError(
        "complete",
        `Failed to complete task: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Build comprehensive reflection draft with evidence
   */
  private buildReflectionDraft(
    task: Task,
    request: CompleteRequest,
  ): ReflectionDraft {
    // Map task outcome to reflection outcome
    const outcomeMapping = {
      success: "worked-perfectly",
      partial: "partial-success",
      failure: "failed-completely",
    };

    return {
      task: {
        id: task.id,
        title: task.title,
      },
      outcome: request.outcome,
      claims: {
        patterns_used: (request.patterns_used || []).map((pattern) => ({
          pattern_id: pattern,
          evidence: this.buildPatternEvidence(task, pattern),
        })),
        trust_updates: (request.patterns_used || []).map((pattern) => ({
          pattern_id: pattern,
          outcome: outcomeMapping[request.outcome] || "partial-success",
        })),
      },
    };
  }

  /**
   * Build evidence for pattern usage from task context
   */
  private buildPatternEvidence(task: Task, patternId: string): any[] {
    const evidence: any[] = [];

    // Add git_lines evidence from files touched
    if (task.files_touched && task.files_touched.length > 0) {
      // Take first file as evidence location
      evidence.push({
        kind: "git_lines",
        file: task.files_touched[0],
        sha: "HEAD",
        start: 1,
        end: 100, // Default range
      });
    }

    // If no files, add generic evidence
    if (evidence.length === 0) {
      evidence.push({
        kind: "git_lines",
        file: "task-execution",
        sha: "HEAD",
        start: 1,
        end: 1,
      });
    }

    return evidence;
  }

  /**
   * Extract new patterns discovered during task
   */
  private extractNewPatterns(task: Task): any[] {
    // TODO: Implement pattern extraction from task handoffs
    // For now, return empty array
    return [];
  }

  /**
   * Build evidence for learning assertions
   */
  private buildLearningEvidence(task: Task): any[] {
    const evidence: any[] = [];

    // Add evidence from files touched during task
    if (task.files_touched && task.files_touched.length > 0) {
      evidence.push({
        kind: "git_lines",
        file: task.files_touched[0],
        sha: "HEAD",
        start: 1,
        end: 50,
      });
    }

    return evidence;
  }

  /**
   * Extract anti-patterns from errors encountered
   */
  private extractAntiPatterns(task: Task): any[] {
    if (!task.errors_encountered || task.errors_encountered.length === 0) {
      return [];
    }

    return task.errors_encountered
      .filter((error) => error.error && error.fix)
      .map((error) => ({
        pattern_id: `ANTI:ERROR:${error.error.substring(0, 20).toUpperCase().replace(/\s+/g, "_")}`,
        reason: error.error,
        evidence: [
          {
            kind: "git_lines",
            file: "task-execution",
            sha: "HEAD",
            start: 1,
            end: 1,
          },
        ],
      }));
  }

  /**
   * Generate a basic task brief from intent (fallback when BriefGenerator unavailable)
   * This is used as initial brief before enhancement
   */
  private generateBasicBrief(intent: string, type?: string): TaskBrief {
    // Parse intent to extract key information
    const words = intent.toLowerCase().split(/\s+/);

    // Extract action verbs
    const actionVerbs = [
      "implement",
      "fix",
      "create",
      "add",
      "update",
      "refactor",
      "test",
    ];
    const action = words.find((w) => actionVerbs.includes(w)) || "implement";

    // Generate TL;DR
    const tldr = intent.length > 50 ? intent.substring(0, 50) + "..." : intent;

    // Return minimal brief - AI can gather its own context
    return {
      tl_dr: tldr,
      objectives: [],
      constraints: [],
      acceptance_criteria: [],
      plan: [],
      facts: [],
      snippets: [],
      risks_and_gotchas: [],
      open_questions: [],
      test_scaffold: "",
    };
  }

  /**
   * Append evidence to task execution log
   * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern
   * [PAT:VALIDATION:ZOD] ★★★☆☆ - Validate request with Zod
   * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
   */
  async appendEvidence(params: unknown): Promise<void> {
    // Validate input
    const parseResult = AppendEvidenceRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid append evidence request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      // Check if task exists
      const task = this.repository.findById(request.task_id);
      if (!task) {
        throw new InvalidParamsError(`Task ${request.task_id} not found`);
      }

      // Serialize metadata to JSON if provided
      const metadataJson = request.metadata
        ? JSON.stringify(request.metadata)
        : null;

      // Insert evidence (timestamp added by DEFAULT CURRENT_TIMESTAMP)
      if (!this.db) {
        throw new InternalError("Database not initialized");
      }

      // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous insert
      const stmt = this.db.prepare(
        `INSERT INTO task_evidence (task_id, type, content, metadata) 
         VALUES (?, ?, ?, ?)`,
      );

      stmt.run(request.task_id, request.type, request.content, metadataJson);
    } catch (error) {
      if (error instanceof InvalidParamsError) {
        throw error;
      }
      throw new ToolExecutionError(
        "appendEvidence",
        `Failed to append evidence: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get current phase and handoff for a task
   * Simple Unix-style tool - just read from database
   * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
   */
  async getPhase(params: unknown): Promise<{ phase: Phase; handoff?: string }> {
    // Validate input with simple schema
    const schema = z.object({
      task_id: z.string(),
    });

    const parseResult = schema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid get phase request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const { task_id } = parseResult.data;

    try {
      // Get task from repository
      const task = this.repository.findById(task_id);
      if (!task) {
        throw new InvalidParamsError(`Task ${task_id} not found`);
      }

      // Get current phase (default to ARCHITECT if not set)
      const phase = task.phase || "ARCHITECT";

      // Get handoff from previous phase if exists
      let handoff: string | undefined;
      if (task.phase_handoffs) {
        // Support both old Record format and new array format
        if (Array.isArray(task.phase_handoffs)) {
          // New array format - find the latest handoff for the previous phase
          const phases: Phase[] = [
            "ARCHITECT",
            "BUILDER",
            "VALIDATOR",
            "REVIEWER",
            "DOCUMENTER",
          ];
          const currentIndex = phases.indexOf(phase);
          if (currentIndex > 0) {
            const previousPhase = phases[currentIndex - 1];
            // Find the latest handoff for the previous phase
            const previousHandoffs = task.phase_handoffs
              .filter(h => h.phase === previousPhase)
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
            if (previousHandoffs.length > 0) {
              handoff = previousHandoffs[0].handoff;
            }
          }
        } else {
          // Old Record format - direct lookup
          const phases: Phase[] = [
            "ARCHITECT",
            "BUILDER",
            "VALIDATOR",
            "REVIEWER",
            "DOCUMENTER",
          ];
          const currentIndex = phases.indexOf(phase);
          if (currentIndex > 0) {
            const previousPhase = phases[currentIndex - 1];
            handoff = task.phase_handoffs[previousPhase];
          }
        }
      }

      return { phase, handoff };
    } catch (error) {
      if (error instanceof InvalidParamsError) {
        throw error;
      }
      throw new ToolExecutionError(
        "getPhase",
        `Failed to get phase: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Set phase and optional handoff for a task
   * Simple Unix-style tool - just write to database
   * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
   */
  async setPhase(params: unknown): Promise<void> {
    // Validate input with simple schema
    const schema = z.object({
      task_id: z.string(),
      phase: PhaseEnum,
      handoff: z.string().optional(),
    });

    const parseResult = schema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid set phase request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const { task_id, phase, handoff } = parseResult.data;

    try {
      // Check if task exists
      const task = this.repository.findById(task_id);
      if (!task) {
        throw new InvalidParamsError(`Task ${task_id} not found`);
      }

      // Prepare updates
      const updates: Partial<Task> = {
        phase,
      };

      // Store handoff if provided - append to array
      if (handoff) {
        let handoffs: PhaseHandoff[];
        
        // Handle both old Record format and new array format
        if (Array.isArray(task.phase_handoffs)) {
          handoffs = task.phase_handoffs;
        } else if (task.phase_handoffs && typeof task.phase_handoffs === 'object') {
          // Convert old Record format to array format
          handoffs = Object.entries(task.phase_handoffs).map(([p, h]) => ({
            phase: p as Phase,
            handoff: h,
            timestamp: task.created_at, // Use task creation time for migrated handoffs
          }));
        } else {
          handoffs = [];
        }
        
        // Append new handoff
        handoffs.push({
          phase,
          handoff,
          timestamp: new Date().toISOString(),
        });
        
        updates.phase_handoffs = handoffs;
      }

      // Update task
      this.repository.update(task_id, updates);
    } catch (error) {
      if (error instanceof InvalidParamsError) {
        throw error;
      }
      throw new ToolExecutionError(
        "setPhase",
        `Failed to set phase: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get evidence entries for a task
   * [PAT:MCP:SERVICE] ★★★★☆ - Service class pattern
   * [PAT:VALIDATION:ZOD] ★★★☆☆ - Validate request with Zod
   * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous database operations
   */
  async getEvidence(params: unknown): Promise<EvidenceEntry[]> {
    // Validate input
    const parseResult = GetEvidenceRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid get evidence request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    try {
      if (!this.db) {
        throw new InternalError("Database not initialized");
      }

      // Build query based on whether type filter is provided
      let query = `SELECT * FROM task_evidence WHERE task_id = ?`;
      const queryParams: any[] = [request.task_id];

      if (request.type) {
        query += ` AND type = ?`;
        queryParams.push(request.type);
      }

      // Order by timestamp (chronological)
      query += ` ORDER BY timestamp ASC`;

      // [FIX:SQLITE:SYNC] ★★★★★ - Synchronous query
      const stmt = this.db.prepare(query);
      const rows = stmt.all(...queryParams);

      // Transform rows to EvidenceEntry format
      return rows.map((row: any) => ({
        id: row.id,
        task_id: row.task_id,
        type: row.type,
        content: row.content,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        timestamp: row.timestamp,
      }));
    } catch (error) {
      throw new ToolExecutionError(
        "getEvidence",
        `Failed to get evidence: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
