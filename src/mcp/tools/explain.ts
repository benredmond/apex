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

interface ExplainResponse {
  pattern: PatternInfo;
  explanation: Explanation;
  trust_context: TrustContext;
  examples?: CodeExample[];
  session_boost?: number;
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

  constructor(repository: PatternRepository) {
    this.repository = repository;

    // Initialize trust model with storage adapter
    const storageAdapter = new JSONStorageAdapter("patterns.db");
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
      // For now, we'll use empty arrays for metadata until Phase 1 integration is complete
      // TODO: Query pattern_metadata, pattern_triggers, pattern_vocab tables
      const metadata: PatternMetadata[] = [];
      const triggers: PatternTrigger[] = [];
      const vocab: PatternVocab[] = [];

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

      // Generate contextual explanation
      const explanation = this.generateExplanation(
        pattern,
        metadata,
        triggers,
        vocab,
        validatedRequest.context,
      );

      // Calculate session boost if context provided
      const sessionBoost = this.calculateSessionBoost(
        pattern.id,
        validatedRequest.context?.session_patterns as
          | Array<{ pattern_id: string; success: boolean }>
          | undefined,
      );

      // Prepare response
      const response: ExplainResponse = {
        pattern: patternInfo,
        explanation,
        trust_context: trustContext,
        session_boost: sessionBoost > 0 ? sessionBoost : undefined,
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
  ): Explanation {
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

    // Context-aware adjustments
    if (context?.current_errors && errorTriggers.length > 0) {
      const relevantError = context.current_errors.find((err) =>
        errorTriggers.some((t) => err.includes(t.trigger_value)),
      );
      if (relevantError) {
        whenToUse.unshift(
          `⚠️ Directly addresses your current error: "${relevantError}"`,
        );
      }
    }

    return {
      summary: pattern.summary,
      when_to_use:
        whenToUse.length > 0 ? whenToUse : ["General purpose pattern"],
      how_to_apply:
        (usageGuidance?.value as string) ||
        "Follow the pattern structure as shown in examples",
      common_mistakes: (commonMistakes?.value as string[]) || [],
      related_patterns: (relatedPatterns?.value as string[]) || [],
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
    const contextKey = request.context
      ? createHash("md5").update(JSON.stringify(request.context)).digest("hex")
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
}
