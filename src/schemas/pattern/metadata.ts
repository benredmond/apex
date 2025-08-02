/**
 * Zod schemas for pattern metadata validation
 * Used to validate x_meta fields and auxiliary table data
 */

import { z } from "zod";

// Trigger type enum
export const TriggerTypeSchema = z.enum([
  "error",
  "keyword",
  "scenario",
  "file_glob",
]);

// Term type enum
export const TermTypeSchema = z.enum(["verb", "noun", "tech", "concept"]);

// Pattern trigger schema
export const PatternTriggerSchema = z.object({
  pattern_id: z.string().min(1),
  trigger_type: TriggerTypeSchema,
  trigger_value: z.string().min(1),
  regex: z.boolean().default(false),
  priority: z.number().int().min(0).default(0),
});

// Pattern vocabulary schema
export const PatternVocabSchema = z.object({
  pattern_id: z.string().min(1),
  term: z.string().min(1),
  term_type: TermTypeSchema,
  weight: z.number().min(0).max(10).default(1.0),
});

// General metadata key-value schema
export const PatternMetadataSchema = z.object({
  pattern_id: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(), // JSON value, validated separately based on key
  created_at: z.string().datetime().optional(), // Auto-set by database
});

// Extended pattern metadata structure (value for specific keys)
export const ExtendedPatternMetadataSchema = z.object({
  complexity: z.enum(["low", "medium", "high"]).optional(),
  performance_impact: z.enum(["minimal", "moderate", "significant"]).optional(),
  prerequisites: z.array(z.string()).optional(),
  related_patterns: z.array(z.string()).optional(),
  common_mistakes: z.array(z.string()).optional(),
  time_estimate: z.string().optional(), // e.g., "30min", "2h"
  review_required: z.boolean().optional(),
});

// Structured x_meta schema for patterns
export const XMetaSchema = z
  .object({
    // Triggers for pattern discovery
    triggers: z
      .array(
        z.object({
          type: TriggerTypeSchema,
          value: z.string(),
          regex: z.boolean().optional(),
        }),
      )
      .optional(),

    // Vocabulary for semantic matching
    vocabulary: z
      .array(
        z.object({
          term: z.string(),
          type: TermTypeSchema,
          weight: z.number().optional(),
        }),
      )
      .optional(),

    // Context hints
    context: z
      .object({
        preconditions: z.array(z.string()).optional(),
        common_mistakes: z.array(z.string()).optional(),
        related_patterns: z.array(z.string()).optional(),
      })
      .optional(),

    // Usage guidance
    guidance: z
      .object({
        difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
        time_estimate: z.string().optional(),
        review_required: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough(); // Allow additional fields for flexibility

// Type exports
export type PatternTrigger = z.infer<typeof PatternTriggerSchema>;
export type PatternVocab = z.infer<typeof PatternVocabSchema>;
export type PatternMetadata = z.infer<typeof PatternMetadataSchema>;
export type ExtendedPatternMetadata = z.infer<
  typeof ExtendedPatternMetadataSchema
>;
export type XMeta = z.infer<typeof XMetaSchema>;

// Validation helpers
export function validateTrigger(data: unknown): PatternTrigger {
  return PatternTriggerSchema.parse(data);
}

export function validateVocab(data: unknown): PatternVocab {
  return PatternVocabSchema.parse(data);
}

export function validateMetadata(data: unknown): PatternMetadata {
  return PatternMetadataSchema.parse(data);
}

export function validateXMeta(data: unknown): XMeta {
  return XMetaSchema.parse(data);
}
