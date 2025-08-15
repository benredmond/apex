/**
 * Pattern explanation tool for contextualized guidance
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success) - From cache
 * [PAT:ARCHITECTURE:SERVICE_PATTERN] ★★★★☆ (12 uses, 92% success) - From cache
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import { PatternRepository } from "../../storage/repository.js";
import { BetaBernoulliTrustModel } from "../../trust/beta-bernoulli.js";
import { JSONStorageAdapter } from "../../trust/storage-adapter.js";
import { createHash } from "crypto";
import { lookupMetrics } from "./metrics.js";
import { extractEnhancedSignals } from "../../intelligence/signal-extractor.js";
import {
  InvalidParamsError,
  InternalError,
  ToolExecutionError,
} from "../errors.js";
import type {
  Pattern,
  PatternMetadata,
  PatternTrigger,
  PatternVocab,
} from "../../storage/types.js";
import Database from "better-sqlite3";

// Request validation schema
const ExplainRequestSchema = z.object({
  pattern_id: z.string().min(1),

  context: z
    .object({
      task_type: z.string().optional(),
      current_errors: z.array(z.string()).max(10).optional(),
      session_patterns: z
        .array(
          z.object({
            pattern_id: z.string(),
            success: z.boolean(),
          }),
        )
        .max(20)
        .optional(),
    })
    .optional(),

  verbosity: z.enum(["concise", "detailed", "examples"]).default("concise"),
});

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;

interface PatternInfo {
  id: string;
  title: string;
  summary: string;
  type: string;
  category: string;
  confidence_level: string;
}

interface TrustContext {
  trust_score: number;
  usage_stats: string;
  recent_trend: "improving" | "stable" | "declining";
}

interface Explanation {
  summary: string;
  when_to_use: string[];
  how_to_apply: string;
  common_mistakes: string[];
  related_patterns: string[];
}

interface CodeExample {
  language: string;
  code: string;
  description: string;
}

interface ErrorResolution {
  error: string;
  fix: string;
  code?: string;
  pattern_ref?: string;
}

interface ExplainResponse {
  pattern: PatternInfo;
  explanation: Explanation;
  trust_context: TrustContext;
  examples?: CodeExample[];
  session_boost?: number;
  error_resolution?: ErrorResolution;
  complementary_patterns?: string[];
  conflicting_patterns?: string[];
  workflow_context?: string;
  request_id: string;
  latency_ms: number;
}

// Simple cache implementation
class ExplanationCache {
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private readonly ttl: number = 5 * 60 * 1000; // 5 minutes

  set(key: string, value: any): void {
    this.cache.set(key, {
      data: value,
      expires: Date.now() + this.ttl,
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }
}

export class PatternExplainer {
  private repository: PatternRepository;
  private trustModel: BetaBernoulliTrustModel;
  private cache: ExplanationCache;
  private db: Database.Database;

  constructor(repository: PatternRepository) {
    this.repository = repository;

    // Get database instance from repository instead of creating new one
    // This ensures we use the same project-specific database
    this.db = repository.getDatabase();

    // Initialize trust model with storage adapter
    // The adapter will use the default metadata file location
    const storageAdapter = new JSONStorageAdapter();
    this.trustModel = new BetaBernoulliTrustModel(storageAdapter);

    this.cache = new ExplanationCache();
  }

  async explain(request: ExplainRequest): Promise<ExplainResponse> {
    const startTime = Date.now();
    const requestId = nanoid(8);

    try {
      // Validate request
      const validatedRequest = ExplainRequestSchema.parse(request);

      // Check cache for basic explanations
      const cacheKey = this.getCacheKey(validatedRequest);
      const cached = this.cache.get(cacheKey);
      if (cached && validatedRequest.verbosity === "concise") {
        lookupMetrics.recordLatency(Date.now() - startTime);
        return {
          ...cached,
          request_id: requestId,
          latency_ms: Date.now() - startTime,
        };
      }

      // Fetch pattern (supports ID, alias, or title)
      const pattern = await this.repository.getByIdOrAlias(
        validatedRequest.pattern_id,
      );
      if (!pattern) {
        throw new InvalidParamsError(
          `Pattern not found: ${validatedRequest.pattern_id}`,
        );
      }

      // [FIX:SQLITE:SYNC] ★☆☆☆☆ (2 uses, 100% success) - Synchronous operations
      // Query metadata tables (synchronous to avoid SQLite async issues)
      const metadata = this.getPatternMetadata(pattern.id);
      const triggers = this.getPatternTriggers(pattern.id);
      const vocab = this.getPatternVocab(pattern.id);

      // Build pattern info
      const patternInfo: PatternInfo = {
        id: pattern.id,
        title: pattern.title,
        summary: pattern.summary,
        type: pattern.type,
        category: "general", // TODO: Extract from pattern ID or metadata
        confidence_level: this.calculateConfidenceLevel(pattern.trust_score),
      };

      // Calculate trust context
      const trustContext = await this.calculateTrustContext(pattern);

      // Generate contextual explanation with enhanced context awareness
      const explanationResult = this.generateExplanation(
        pattern,
        metadata,
        triggers,
        vocab,
        validatedRequest.context,
      );

      const {
        explanation,
        errorResolution,
        complementaryPatterns,
        conflictingPatterns,
        workflowContext,
      } = explanationResult;

      // Calculate session boost if context provided
      const sessionBoost = this.calculateSessionBoost(
        pattern.id,
        validatedRequest.context?.session_patterns as
          | Array<{ pattern_id: string; success: boolean }>
          | undefined,
      );

      // Prepare response with enhanced context fields
      const response: ExplainResponse = {
        pattern: patternInfo,
        explanation,
        trust_context: trustContext,
        session_boost: sessionBoost > 0 ? sessionBoost : undefined,
        error_resolution: errorResolution,
        complementary_patterns: complementaryPatterns,
        conflicting_patterns: conflictingPatterns,
        workflow_context: workflowContext,
        request_id: requestId,
        latency_ms: Date.now() - startTime,
      };

      // Add examples if requested
      if (
        validatedRequest.verbosity === "examples" ||
        validatedRequest.verbosity === "detailed"
      ) {
        response.examples = this.extractExamples(pattern);
      }

      // Cache the response
      if (validatedRequest.verbosity === "concise") {
        this.cache.set(cacheKey, response);
      }

      // Record metrics
      lookupMetrics.recordLatency(Date.now() - startTime);
      if (cached) lookupMetrics.recordCacheHit();

      return response;
    } catch (error) {
      lookupMetrics.recordLatency(Date.now() - startTime);

      if (error instanceof z.ZodError) {
        throw new InvalidParamsError(
          `Invalid request: ${error.errors.map((e) => e.message).join(", ")}`,
        );
      }

      if (
        error instanceof InvalidParamsError ||
        error instanceof ToolExecutionError
      ) {
        throw error;
      }

      throw new InternalError(
        `Failed to explain pattern: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async calculateTrustContext(pattern: Pattern): Promise<TrustContext> {
    // Get trust score from model
    const trustScore = pattern.trust_score || 0.5; // Use existing trust score or default

    // Calculate usage stats
    const alpha = pattern.alpha || 1;
    const beta = pattern.beta || 1;
    const totalUses = alpha + beta - 2; // Subtract initial priors
    const successRate = totalUses > 0 ? ((alpha - 1) / totalUses) * 100 : 0;

    const usageStats =
      totalUses > 0
        ? `${totalUses} uses, ${Math.round(successRate)}% success`
        : "New pattern, no usage data";

    // Determine trend based on alpha/beta changes over time
    // For now, we'll use a simple heuristic
    let trend: "improving" | "stable" | "declining" = "stable";
    if (totalUses > 10) {
      if (successRate > 85) {
        trend = "improving";
      } else if (successRate < 50) {
        trend = "declining";
      }
    }

    return {
      trust_score: trustScore,
      usage_stats: usageStats,
      recent_trend: trend,
    };
  }

  private generateExplanation(
    pattern: Pattern,
    metadata: PatternMetadata[],
    triggers: PatternTrigger[],
    vocab: PatternVocab[],
    context?: ExplainRequest["context"],
  ): {
    explanation: Explanation;
    errorResolution?: ErrorResolution;
    complementaryPatterns?: string[];
    conflictingPatterns?: string[];
    workflowContext?: string;
  } {
    // Extract guidance from metadata
    const usageGuidance = metadata.find((m) => m.key === "usage_guidance");
    const commonMistakes = metadata.find((m) => m.key === "common_mistakes");
    const relatedPatterns = metadata.find((m) => m.key === "related_patterns");

    // Build when_to_use from triggers
    const whenToUse: string[] = [];

    // Add error triggers
    const errorTriggers = triggers.filter((t) => t.trigger_type === "error");
    if (errorTriggers.length > 0) {
      whenToUse.push(
        `When encountering errors: ${errorTriggers.map((t) => t.trigger_value).join(", ")}`,
      );
    }

    // Add scenario triggers
    const scenarioTriggers = triggers.filter(
      (t) => t.trigger_type === "scenario",
    );
    scenarioTriggers.forEach((t) => {
      whenToUse.push(t.trigger_value);
    });

    // Add keyword triggers
    const keywordTriggers = triggers.filter(
      (t) => t.trigger_type === "keyword",
    );
    if (keywordTriggers.length > 0) {
      whenToUse.push(
        `For tasks involving: ${keywordTriggers.map((t) => t.trigger_value).join(", ")}`,
      );
    }

    // Enhanced Context-aware adjustments
    let errorResolution: ErrorResolution | undefined;
    let complementaryPatterns: string[] | undefined;
    let conflictingPatterns: string[] | undefined;
    let workflowContext: string | undefined;

    // A. Error-Specific Guidance
    if (context?.current_errors && context.current_errors.length > 0) {
      // Extract error signals for better matching
      const errorSignals = extractEnhancedSignals("", context.current_errors);

      // Find matching error triggers with enhanced matching
      for (const error of context.current_errors) {
        const matchingTrigger = errorTriggers.find((t) => {
          // Exact match or keyword match
          return (
            error.includes(t.trigger_value) ||
            errorSignals.errorKeywords.some((keyword) =>
              t.trigger_value.toLowerCase().includes(keyword.toLowerCase()),
            )
          );
        });

        if (matchingTrigger) {
          // Find fix pattern from metadata
          const fixMetadata = metadata.find(
            (m) => m.key === `error_fix_${matchingTrigger.trigger_value}`,
          );
          const codeExample = metadata.find(
            (m) => m.key === `error_code_${matchingTrigger.trigger_value}`,
          );

          errorResolution = {
            error: this.sanitizeError(error),
            fix:
              (fixMetadata?.value as string) ||
              `Apply ${pattern.id} pattern to resolve this error`,
            code: codeExample?.value as string,
            pattern_ref: pattern.id,
          };

          whenToUse.unshift(
            `⚠️ Directly addresses your current error: "${this.sanitizeError(error)}"`,
          );
          break;
        }
      }
    }

    // B. Session-Aware Recommendations
    if (context?.session_patterns && context.session_patterns.length > 0) {
      const { complementary, conflicting } = this.analyzeSessionPatterns(
        pattern.id,
        context.session_patterns as Array<{
          pattern_id: string;
          success: boolean;
        }>,
        metadata,
      );

      if (complementary.length > 0) {
        complementaryPatterns = complementary;
      }

      if (conflicting.length > 0) {
        conflictingPatterns = conflicting;
      }
    }

    // C. Task-Type Customization
    if (context?.task_type) {
      workflowContext = this.getWorkflowContext(
        context.task_type,
        pattern,
        vocab,
      );

      // Adjust when_to_use based on task type
      if (context.task_type.includes("test")) {
        whenToUse.unshift("Essential for test implementation and mocking");
      } else if (context.task_type.includes("fix")) {
        whenToUse.unshift("Recommended fix pattern for this type of issue");
      } else if (context.task_type.includes("refactor")) {
        whenToUse.unshift("Improves code structure and maintainability");
      }
    }

    const explanation: Explanation = {
      summary: pattern.summary,
      when_to_use:
        whenToUse.length > 0 ? whenToUse : ["General purpose pattern"],
      how_to_apply:
        (usageGuidance?.value as string) ||
        "Follow the pattern structure as shown in examples",
      common_mistakes: (commonMistakes?.value as string[]) || [],
      related_patterns: (relatedPatterns?.value as string[]) || [],
    };

    return {
      explanation,
      errorResolution,
      complementaryPatterns,
      conflictingPatterns,
      workflowContext,
    };
  }

  private calculateSessionBoost(
    patternId: string,
    sessionPatterns?: Array<{ pattern_id: string; success: boolean }>,
  ): number {
    if (!sessionPatterns || sessionPatterns.length === 0) {
      return 0;
    }

    // Check recent usage
    const recentUse = sessionPatterns.find((p) => p.pattern_id === patternId);
    if (recentUse) {
      return recentUse.success ? 0.1 : -0.05;
    }

    // Check for complementary patterns
    // This is a simplified version - in production, you'd have a mapping of complementary patterns
    const hasRelatedPattern = sessionPatterns.some((p) => {
      // Example: ERROR_HANDLING complements API patterns
      if (patternId.includes("ERROR") && p.pattern_id.includes("API")) {
        return true;
      }
      if (patternId.includes("TEST") && p.pattern_id.includes("MOCK")) {
        return true;
      }
      return false;
    });

    return hasRelatedPattern ? 0.05 : 0;
  }

  private extractExamples(pattern: Pattern): CodeExample[] {
    const examples: CodeExample[] = [];

    // Parse JSON canonical for snippets
    try {
      const fullPattern = JSON.parse(pattern.json_canonical);
      if (fullPattern.snippets && Array.isArray(fullPattern.snippets)) {
        fullPattern.snippets.forEach((snippet: any, index: number) => {
          if (snippet.code) {
            examples.push({
              language: snippet.language || "javascript",
              code: snippet.code,
              description: snippet.label || `Example ${index + 1}`,
            });
          }
        });
      }
    } catch (e) {
      // Failed to parse snippets
    }

    return examples;
  }

  private getCacheKey(request: ExplainRequest): string {
    // Enhanced cache key generation - exclude volatile session patterns
    const cacheContext = request.context
      ? {
          task_type: request.context.task_type,
          current_errors: request.context.current_errors?.slice(0, 3), // Only first 3 errors
          // Exclude session_patterns as they're too volatile
        }
      : null;

    const contextKey = cacheContext
      ? createHash("md5").update(JSON.stringify(cacheContext)).digest("hex")
      : "no-context";
    return `explain:${request.pattern_id}:${request.verbosity}:${contextKey}`;
  }

  private calculateConfidenceLevel(trustScore: number): string {
    if (trustScore >= 0.9) return "very_high";
    if (trustScore >= 0.7) return "high";
    if (trustScore >= 0.5) return "medium";
    if (trustScore >= 0.3) return "low";
    return "very_low";
  }

  // New helper methods for metadata queries
  private getPatternMetadata(patternId: string): PatternMetadata[] {
    // [FIX:SQLITE:SYNC] ★☆☆☆☆ - Synchronous database query
    const stmt = this.db.prepare(
      "SELECT * FROM pattern_metadata WHERE pattern_id = ?",
    );
    const rows = stmt.all(patternId) as PatternMetadata[];
    return rows || [];
  }

  private getPatternTriggers(patternId: string): PatternTrigger[] {
    // [FIX:SQLITE:SYNC] ★☆☆☆☆ - Synchronous database query
    const stmt = this.db.prepare(
      "SELECT * FROM pattern_triggers WHERE pattern_id = ? ORDER BY priority DESC",
    );
    const rows = stmt.all(patternId) as PatternTrigger[];
    return rows || [];
  }

  private getPatternVocab(patternId: string): PatternVocab[] {
    // [FIX:SQLITE:SYNC] ★☆☆☆☆ - Synchronous database query
    const stmt = this.db.prepare(
      "SELECT * FROM pattern_vocab WHERE pattern_id = ? ORDER BY weight DESC",
    );
    const rows = stmt.all(patternId) as PatternVocab[];
    return rows || [];
  }

  // Helper to sanitize error messages (remove sensitive paths/data)
  private sanitizeError(error: string): string {
    // Remove absolute paths
    let sanitized = error.replace(/\/[\w\/-]+\/(\w+\.\w+)/g, "$1");
    // Remove potential secrets (anything that looks like a key/token)
    sanitized = sanitized.replace(/[a-zA-Z0-9]{32,}/g, "[REDACTED]");
    // Limit length
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 197) + "...";
    }
    return sanitized;
  }

  // Analyze session patterns for complementary/conflicting relationships
  private analyzeSessionPatterns(
    currentPatternId: string,
    sessionPatterns: Array<{ pattern_id: string; success: boolean }>,
    metadata: PatternMetadata[],
  ): { complementary: string[]; conflicting: string[] } {
    const complementary: string[] = [];
    const conflicting: string[] = [];

    // Define complementary pattern relationships (from semantic-scorer.ts)
    const complementaryPairs = [
      { primary: "API", complement: "ERROR_HANDLING" },
      { primary: "AUTH", complement: "SESSION" },
      { primary: "TEST", complement: "MOCK" },
      { primary: "DATABASE", complement: "MIGRATION" },
      { primary: "ASYNC", complement: "ERROR_HANDLING" },
    ];

    // Define conflicting patterns
    const conflictingPairs = [
      { pattern1: "ASYNC", pattern2: "SYNC" },
      { pattern1: "CLASS", pattern2: "FUNCTIONAL" },
      { pattern1: "REST", pattern2: "GRAPHQL" },
    ];

    // Check for complementary patterns
    for (const pair of complementaryPairs) {
      if (currentPatternId.includes(pair.primary)) {
        const complement = sessionPatterns.find(
          (p) => p.pattern_id.includes(pair.complement) && p.success,
        );
        if (complement) {
          complementary.push(complement.pattern_id);
        }
      } else if (currentPatternId.includes(pair.complement)) {
        const primary = sessionPatterns.find(
          (p) => p.pattern_id.includes(pair.primary) && p.success,
        );
        if (primary) {
          complementary.push(primary.pattern_id);
        }
      }
    }

    // Check for conflicting patterns
    for (const pair of conflictingPairs) {
      if (currentPatternId.includes(pair.pattern1)) {
        const conflict = sessionPatterns.find((p) =>
          p.pattern_id.includes(pair.pattern2),
        );
        if (conflict) {
          conflicting.push(conflict.pattern_id);
        }
      } else if (currentPatternId.includes(pair.pattern2)) {
        const conflict = sessionPatterns.find((p) =>
          p.pattern_id.includes(pair.pattern1),
        );
        if (conflict) {
          conflicting.push(conflict.pattern_id);
        }
      }
    }

    // Check metadata for explicit relationships
    const relatedMeta = metadata.find(
      (m) => m.key === "complementary_patterns",
    );
    if (relatedMeta && Array.isArray(relatedMeta.value)) {
      for (const related of relatedMeta.value as string[]) {
        if (
          sessionPatterns.some((p) => p.pattern_id === related && p.success)
        ) {
          if (!complementary.includes(related)) {
            complementary.push(related);
          }
        }
      }
    }

    return { complementary, conflicting };
  }

  // Get workflow context based on task type
  private getWorkflowContext(
    taskType: string,
    pattern: Pattern,
    vocab: PatternVocab[],
  ): string {
    const taskLower = taskType.toLowerCase();

    // Check vocab for workflow-specific terms
    const relevantTerms = vocab.filter(
      (v) => v.term_type === "verb" || v.term_type === "concept",
    );

    if (taskLower.includes("test") || taskLower.includes("spec")) {
      return "Testing phase: This pattern helps ensure reliable test implementation";
    } else if (taskLower.includes("fix") || taskLower.includes("bug")) {
      return "Bug fixing phase: Apply this pattern to resolve the issue correctly";
    } else if (taskLower.includes("refactor")) {
      return "Refactoring phase: Use this pattern to improve code structure";
    } else if (
      taskLower.includes("implement") ||
      taskLower.includes("feature")
    ) {
      return "Implementation phase: Follow this pattern for consistent feature development";
    } else if (
      taskLower.includes("optimize") ||
      taskLower.includes("performance")
    ) {
      return "Optimization phase: This pattern can improve performance";
    } else if (relevantTerms.length > 0) {
      // Use vocabulary to determine context
      const topTerm = relevantTerms[0];
      return `${topTerm.term} context: Pattern optimized for ${topTerm.term} operations`;
    }

    return "General development context: Pattern applicable across various scenarios";
  }
}
