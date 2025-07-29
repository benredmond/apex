import { z } from "zod";

// [PAT:PROTOCOL:MCP_SERVER] ★★★☆☆ (1 use) - Strict validation patterns
export const PatternIdSchema = z
  .string()
  .regex(
    /^[A-Z0-9_.-]+:[A-Z0-9_]+:[A-Z0-9_]+:[A-Z0-9_]+$/,
    "Pattern ID must match format: ORG.TEAM:TYPE:CATEGORY:NAME",
  );

export const TrustScoreSchema = z
  .number()
  .min(0, "Trust score must be >= 0")
  .max(1, "Trust score must be <= 1");

export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/, "Must be valid semver");

// Evidence types - discriminated union for type safety
export const GitLinesEvidenceSchema = z.object({
  kind: z.literal("git_lines"),
  file: z.string(),
  sha: z.string(),
  start: z.number().int().positive(),
  end: z.number().int().positive(),
});

export const CommitEvidenceSchema = z.object({
  kind: z.literal("commit"),
  sha: z.string(),
});

export const PREvidence = z.object({
  kind: z.literal("pr"),
  number: z.number().int().positive(),
  repo: z.string().optional(),
});

export const IssueEvidenceSchema = z.object({
  kind: z.literal("issue"),
  id: z.string(),
  system: z.enum(["jira", "github", "linear"]).optional(),
});

export const CIRunEvidenceSchema = z.object({
  kind: z.literal("ci_run"),
  id: z.string(),
  provider: z.enum(["gh", "gitlab", "circle"]).optional(),
});

export const EvidenceRefSchema = z.discriminatedUnion("kind", [
  GitLinesEvidenceSchema,
  CommitEvidenceSchema,
  PREvidence,
  IssueEvidenceSchema,
  CIRunEvidenceSchema,
]);

// Snippet definition with recursive support
export const SnippetSchema = z.object({
  label: z.string().min(1),
  language: z.string().min(1),
  code: z.string().max(10000, "Code snippet must not exceed 10,000 characters"),
  source_ref: EvidenceRefSchema.optional(),
  children: z.lazy(() =>
    z
      .array(SnippetSchema)
      .max(10, "Maximum 10 nested snippets allowed")
      .optional(),
  ),
});

export type Snippet = z.infer<typeof SnippetSchema>;

// Usage tracking
export const UsageSchema = z.object({
  successes: z.number().int().min(0).optional(),
  failures: z.number().int().min(0).optional(),
  last_used_at: z.string().datetime().optional(),
});

// Applicability rules
export const ApplicabilitySchema = z.object({
  rule_language: z.enum(["jsonlogic", "cel"]).optional(),
  rule: z.string().optional(),
});

// Deprecation info
export const DeprecationSchema = z.object({
  reason: z.string(),
  replaced_by: z.string().optional(),
});

// Base pattern schema with all common fields
export const BasePatternSchema = z.object({
  // Versioning
  schema_version: z.string().default("0.3.0"),
  pattern_version: SemverSchema,

  // Identification
  id: PatternIdSchema,
  type: z.enum([
    "CODEBASE",
    "LANG",
    "ANTI",
    "FAILURE",
    "POLICY",
    "TEST",
    "MIGRATION",
  ]),
  title: z.string().min(3, "Title must be at least 3 characters"),
  summary: z.string().min(3, "Summary must be at least 3 characters"),

  // Scope and applicability
  scope: z.object({
    languages: z.array(z.string()).optional(),
    frameworks: z.array(z.string()).optional(),
    repos: z.array(z.string()).optional(),
    paths: z.array(z.string()).optional(),
    task_types: z.array(z.string()).optional(),
    envs: z.array(z.string()).optional(),
  }),

  // Semver constraints for dependencies
  semver_constraints: z
    .object({
      dependencies: z.record(z.string()).optional(),
    })
    .optional(),

  // Content
  snippets: z
    .array(SnippetSchema)
    .max(50, "Maximum 50 snippets per pattern")
    .optional(),
  evidence: z.array(EvidenceRefSchema).optional(),

  // Metrics
  usage: UsageSchema.optional(),
  trust_score: TrustScoreSchema,

  // Timestamps
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),

  // Metadata
  source_repo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  applicability: ApplicabilitySchema.optional(),
  deprecated: DeprecationSchema.optional(),
  notes: z.string().optional(),

  // Forward compatibility
  x_meta: z.record(z.unknown()).optional(),
});

// Type exports
export type PatternBase = z.infer<typeof BasePatternSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type Applicability = z.infer<typeof ApplicabilitySchema>;
export type Deprecation = z.infer<typeof DeprecationSchema>;
