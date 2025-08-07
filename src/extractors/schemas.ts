import { z } from "zod";

// Book source metadata schema
export const BookSourceSchema = z.object({
  book: z.string(),
  author: z.string(),
  chapter: z.number().optional(),
  page: z.number().optional(),
  isbn: z.string().optional(),
  section: z.string().optional(),
});

// Code snippet schema
export const CodeSnippetSchema = z.object({
  language: z.string(),
  snippet: z.string(),
  context: z.string().optional(),
});

// Pattern extracted from book
export const BookPatternSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  code: CodeSnippetSchema,
  tags: z.array(z.string()).default([]),
  keyInsight: z.string().optional(),
  whenToUse: z.string().optional(),
  commonPitfalls: z.array(z.string()).optional(),
});

// LLM response schema
export const LLMExtractionResponseSchema = z.object({
  patterns: z.array(BookPatternSchema),
  metadata: z
    .object({
      chapterTitle: z.string().optional(),
      mainConcepts: z.array(z.string()).optional(),
      extractionConfidence: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

// Complete book pattern with metadata
export const CompleteBookPatternSchema = z.object({
  id: z.string(),
  type: z.literal("PAT"),
  title: z.string(),
  summary: z.string(),
  source: BookSourceSchema,
  snippets: z.array(
    z.object({
      snippet_id: z.string(),
      language: z.string(),
      code: z.string(),
      source_ref: z.object({
        kind: z.literal("book"),
        book: z.string(),
        chapter: z.number().optional(),
        page: z.number().optional(),
      }),
    }),
  ),
  tags: z.array(z.string()),
  trust_score: z.number().default(0.0), // Zero initial trust per architecture decision
  evidence: z.array(z.any()).default([]),
});

// Extraction job configuration
export const ExtractionConfigSchema = z.object({
  bookFile: z.string(),
  bookMetadata: z.object({
    title: z.string(),
    author: z.string(),
    isbn: z.string().optional(),
  }),
  chapterRange: z
    .object({
      start: z.number().optional(),
      end: z.number().optional(),
    })
    .optional(),
  maxPatternsPerChapter: z.number().default(10),
  llmModel: z.string().default("claude-3-5-sonnet-20241022"),
  batchSize: z.number().default(1), // Chapters per LLM call
  dryRun: z.boolean().default(false),
});

export type BookSource = z.infer<typeof BookSourceSchema>;
export type CodeSnippet = z.infer<typeof CodeSnippetSchema>;
export type BookPattern = z.infer<typeof BookPatternSchema>;
export type LLMExtractionResponse = z.infer<typeof LLMExtractionResponseSchema>;
export type CompleteBookPattern = z.infer<typeof CompleteBookPatternSchema>;
export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;
