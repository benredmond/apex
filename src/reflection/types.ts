/**
 * Type definitions for the APEX Reflection System
 * [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - TypeScript-first approach
 */

import { z } from "zod";

// Evidence types for verification
export const EvidenceRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("git_lines"),
    file: z.string(),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    start: z.number().positive(),
    end: z.number().positive(),
  }),
  z.object({
    kind: z.literal("commit"),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  z.object({
    kind: z.literal("pr"),
    number: z.number().positive(),
    repo: z.string().optional(),
  }),
  z.object({
    kind: z.literal("ci_run"),
    id: z.string(),
    provider: z.string(),
  }),
]);

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// Pattern usage claim
export const PatternUsageSchema = z.object({
  pattern_id: z.string(),
  evidence: z.array(EvidenceRefSchema),
  snippet_id: z.string().optional(),
  notes: z.string().optional(),
});

export type PatternUsage = z.infer<typeof PatternUsageSchema>;

// New pattern discovery
export const NewPatternSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  scope: z
    .object({
      languages: z.array(z.string()).optional(),
      frameworks: z.array(z.string()).optional(),
      paths: z.array(z.string()).optional(),
    })
    .optional(),
  snippets: z.array(
    z.object({
      label: z.string().optional(),
      language: z.string().optional(),
      source_ref: EvidenceRefSchema,
      snippet_id: z.string(),
    }),
  ),
  evidence: z.array(EvidenceRefSchema),
});

export type NewPattern = z.infer<typeof NewPatternSchema>;

// Anti-pattern identification
export const AntiPatternSchema = z.object({
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(1000),
  evidence: z.array(EvidenceRefSchema),
});

export type AntiPattern = z.infer<typeof AntiPatternSchema>;

// Learning capture
export const LearningSchema = z.object({
  assertion: z.string().min(1).max(1000),
  evidence: z.array(EvidenceRefSchema).optional(),
});

export type Learning = z.infer<typeof LearningSchema>;

// Trust update request
export const TrustUpdateSchema = z.object({
  pattern_id: z.string(),
  delta: z.object({
    alpha: z.number().nonnegative(),
    beta: z.number().nonnegative(),
  }),
});

export type TrustUpdate = z.infer<typeof TrustUpdateSchema>;

// Main reflection request
export const ReflectRequestSchema = z.object({
  task: z.object({
    id: z.string(),
    title: z.string(),
  }),
  brief_id: z.string().optional(),
  outcome: z.enum(["success", "partial", "failure"]),
  artifacts: z
    .object({
      pr: z
        .object({
          number: z.number().positive(),
          repo: z.string(),
        })
        .optional(),
      commits: z.array(z.string().regex(/^[a-f0-9]{40}$/)).optional(),
      ci_runs: z
        .array(
          z.object({
            id: z.string(),
            provider: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  claims: z.object({
    patterns_used: z.array(PatternUsageSchema),
    new_patterns: z.array(NewPatternSchema).optional(),
    anti_patterns: z.array(AntiPatternSchema).optional(),
    learnings: z.array(LearningSchema).optional(),
    trust_updates: z.array(TrustUpdateSchema),
  }),
  options: z
    .object({
      dry_run: z.boolean().default(false),
      auto_mine: z.boolean().default(false),
      return_explain: z.boolean().default(true),
    })
    .default({}),
});

export type ReflectRequest = z.infer<typeof ReflectRequestSchema>;

// Response types
export interface ReflectResponse {
  ok: boolean;
  persisted: boolean;
  outcome?: "success" | "partial" | "failure";
  accepted?: {
    patterns_used: PatternUsage[];
    new_patterns: NewPattern[];
    anti_patterns: AntiPattern[];
    learnings: Learning[];
    trust_updates: Array<{
      pattern_id: string;
      applied_delta: { alpha: number; beta: number };
      alpha_after: number;
      beta_after: number;
      wilson_lb_after: number;
    }>;
  };
  rejected: Array<{
    path: string;
    code: string;
    message: string;
  }>;
  drafts_created: Array<{
    draft_id: string;
    kind: "NEW_PATTERN" | "ANTI_PATTERN";
  }>;
  anti_candidates?: Array<{
    title: string;
    count_30d: number;
  }>;
  explain?: {
    validators: string[];
    hints: string[];
  };
  meta: {
    received_at: string;
    validated_in_ms: number;
    persisted_in_ms?: number;
    schema_version: string;
  };
}

// Error codes for validation
export enum ValidationErrorCode {
  LINE_RANGE_NOT_FOUND = "LINE_RANGE_NOT_FOUND",
  PR_NOT_FOUND = "PR_NOT_FOUND",
  CI_RUN_NOT_FOUND = "CI_RUN_NOT_FOUND",
  SNIPPET_HASH_MISMATCH = "SNIPPET_HASH_MISMATCH",
  PATTERN_NOT_FOUND = "PATTERN_NOT_FOUND",
  DUPLICATE_TRUST_UPDATE = "DUPLICATE_TRUST_UPDATE",
  MALFORMED_EVIDENCE = "MALFORMED_EVIDENCE",
  SIZE_LIMIT_EXCEEDED = "SIZE_LIMIT_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

// Storage types
export interface ReflectionRecord {
  id?: number;
  task_id: string;
  brief_id?: string;
  outcome: "success" | "partial" | "failure";
  json: string;
  created_at: string;
}

export interface PatternDraft {
  draft_id: string;
  kind: "NEW_PATTERN" | "ANTI_PATTERN";
  json: string;
  status: "DRAFT" | "APPROVED" | "REJECTED";
  created_at: string;
}

export interface AuditEvent {
  id?: number;
  task_id: string;
  kind: string;
  pattern_id?: string;
  evidence_digest?: string;
  created_at: string;
}
