/**
 * Task system type definitions and schemas
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { z } from "zod";

// Task type enumeration
export const TaskTypeEnum = z.enum([
  "bug",
  "feature",
  "refactor",
  "test",
  "docs",
  "perf",
]);
export type TaskType = z.infer<typeof TaskTypeEnum>;

// Task status enumeration
export const TaskStatusEnum = z.enum([
  "active",
  "completed",
  "failed",
  "blocked",
]);
export type TaskStatus = z.infer<typeof TaskStatusEnum>;

// Phase enumeration for 5-phase workflow
export const PhaseEnum = z.enum([
  "ARCHITECT",
  "BUILDER",
  "VALIDATOR",
  "REVIEWER",
  "DOCUMENTER",
]);
export type Phase = z.infer<typeof PhaseEnum>;

// Task outcome enumeration
export const TaskOutcomeEnum = z.enum(["success", "partial", "failure"]);
export type TaskOutcome = z.infer<typeof TaskOutcomeEnum>;

// Core Task interface (matches database schema)
export interface Task {
  // Core identifiers
  id: string;
  identifier?: string;
  title: string;
  intent?: string;
  task_type?: TaskType;
  status: TaskStatus;
  tags?: string[]; // [APE-63] AI-provided tags for discovery

  // Task Brief Components (stored as JSON strings in DB)
  tl_dr?: string;
  objectives?: string[];
  constraints?: string[];
  acceptance_criteria?: string[];
  plan?: Array<{ step: string; action: string; files?: string[] }>;
  decisions?: string[];
  facts?: string[];
  snippets?: Array<{ code: string; language: string; description: string }>;
  risks_and_gotchas?: string[];
  open_questions?: string[];
  in_flight?: string[];
  test_scaffold?: string;

  // Execution tracking
  phase?: Phase;
  phase_handoffs?: Record<string, any>;
  confidence?: number;

  // Evidence Collection
  files_touched?: string[];
  patterns_used?: string[];
  errors_encountered?: Array<{ error: string; fix?: string }>;
  claims?: any;

  // Learning & Intelligence
  prior_impls?: string[];
  failure_corpus?: string[];
  policy?: string;
  assumptions?: string[];

  // Results
  outcome?: TaskOutcome;
  reflection_id?: string;
  key_learning?: string;
  duration_ms?: number;

  // Timestamps
  created_at: string;
  completed_at?: string;
}

// Task Brief interface (generated during task creation)
export interface TaskBrief {
  tl_dr: string;
  objectives: string[];
  constraints: string[];
  acceptance_criteria: string[];
  plan: Array<{ step: string; action: string; files?: string[] }>;
  facts: string[];
  snippets: Array<{ code: string; language: string; description: string }>;
  risks_and_gotchas: string[];
  open_questions: string[];
  test_scaffold: string;
}

// Similar task interface
export interface SimilarTask {
  task: Task;
  similarity: number;
  reason: string;
}

// Task search and tagging interfaces
export interface TaskSignals {
  tags: string[]; // Extracted keywords (cache, api, auth, database, redis)
  themes: string[]; // High-level patterns (performance, security, refactor, bugfix)
  components: string[]; // System parts affected (user-service, api, cache-layer)
  filePatterns: string[]; // File overlap patterns
}

export interface TaskTags {
  tags: string[];
  themes: string[];
  components: string[];
}

// Request schemas with Zod validation
// [PAT:VALIDATION:ZOD] ★★★☆☆ - Zod schema validation

export const CreateRequestSchema = z.object({
  identifier: z.string().optional(),
  intent: z.string().min(1).max(1000),
  type: TaskTypeEnum.optional(),
  tags: z.array(z.string()).max(15).optional(), // [APE-63] AI-provided tags
});
export type CreateRequest = z.infer<typeof CreateRequestSchema>;

export const FindRequestSchema = z.object({
  tags: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  components: z.array(z.string()).optional(),
  status: TaskStatusEnum.optional(),
  limit: z.number().min(1).max(100).default(10),
});
export type FindRequest = z.infer<typeof FindRequestSchema>;

export const FindSimilarRequestSchema = z.object({
  taskId: z.string().optional(),
});
export type FindSimilarRequest = z.infer<typeof FindSimilarRequestSchema>;

export const UpdateRequestSchema = z.object({
  id: z.string(),
  phase: PhaseEnum.optional(),
  decisions: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  errors: z
    .array(
      z.object({
        error: z.string(),
        fix: z.string().optional(),
      }),
    )
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  handoff: z.string().optional(),
});
export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;

export const CheckpointRequestSchema = z.object({
  id: z.string(),
  message: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1).optional(),
});
export type CheckpointRequest = z.infer<typeof CheckpointRequestSchema>;

export const CompleteRequestSchema = z.object({
  id: z.string(),
  outcome: TaskOutcomeEnum,
  key_learning: z.string().min(1).max(500),
  patterns_used: z.array(z.string()).optional(),
});
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;

// Evidence types for APE-57
export const EvidenceTypeEnum = z.enum([
  "file",
  "pattern",
  "error",
  "decision",
  "learning",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeEnum>;

export interface EvidenceEntry {
  id: number;
  task_id: string;
  type: EvidenceType;
  content: string;
  metadata?: {
    file?: string;
    line_start?: number;
    line_end?: number;
    pattern_id?: string;
  };
  timestamp: string;
}

// Evidence request schemas
export const AppendEvidenceRequestSchema = z.object({
  task_id: z.string(),
  type: EvidenceTypeEnum,
  content: z.string(),
  metadata: z
    .object({
      file: z.string().optional(),
      line_start: z.number().optional(),
      line_end: z.number().optional(),
      pattern_id: z.string().optional(),
    })
    .optional(),
});
export type AppendEvidenceRequest = z.infer<typeof AppendEvidenceRequestSchema>;

export const GetEvidenceRequestSchema = z.object({
  task_id: z.string(),
  type: EvidenceTypeEnum.optional(),
});
export type GetEvidenceRequest = z.infer<typeof GetEvidenceRequestSchema>;

// Response interfaces
export interface CreateResponse {
  id: string;
  brief: TaskBrief;
}

export interface ReflectionDraft {
  task: {
    id: string;
    title: string;
  };
  outcome: TaskOutcome;
  claims: {
    patterns_used: Array<{
      pattern_id: string;
      evidence: any[];
    }>;
    trust_updates: Array<{
      pattern_id: string;
      outcome: string;
    }>;
  };
}
