/**
 * Semantic pattern discovery tool
 * Natural language queries with enhanced signal extraction and scoring
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import { PatternRepository } from "../../storage/repository.js";
import {
  SemanticScorer,
  type PatternScore,
} from "../../ranking/semantic-scorer.js";
import {
  extractEnhancedSignals,
  buildQueryFromSignals,
} from "../../intelligence/signal-extractor.js";
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
import type { PatternPack } from "../../ranking/types.js";

// Request validation schema
const DiscoverRequestSchema = z.object({
  // Natural language query
  query: z.string().min(3).max(500),

  // Optional filters
  filters: z
    .object({
      types: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      min_trust: z.number().min(0).max(1).optional(),
      max_age_days: z.number().min(1).optional(),
    })
    .optional(),

  // Context for better matching
  context: z
    .object({
      current_errors: z.array(z.string()).max(5).optional(),
      current_file: z.string().optional(),
      recent_patterns: z.array(z.string()).max(10).optional(),
    })
    .optional(),

  // Result control
  max_results: z.number().min(1).max(50).default(10),
  min_score: z.number().min(0).max(1).default(0.3),
  include_explanation: z.boolean().default(true),
});

export type DiscoverRequest = z.infer<typeof DiscoverRequestSchema>;

export interface DiscoverResponse {
  patterns: Array<{
    pattern: Pattern;
    score: number;
    explanation: string;
    metadata?: Record<string, any>;
  }>;
  query_interpretation: {
    keywords: string[];
    inferred_types: string[];
    inferred_categories: string[];
    detected_technologies: string[];
  };
  request_id: string;
  latency_ms: number;
  cache_hit: boolean;
}

// Rate limiter (reuse pattern from lookup.ts)
class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }
}

export class PatternDiscoverer {
  private repository: PatternRepository;
  private scorer: SemanticScorer;
  private cache: Map<string, DiscoverResponse>;
  private cacheOptions: { maxSize: number; ttlMs: number };
  private rateLimiter: RateLimiter;

  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.scorer = new SemanticScorer();
    this.cache = new Map();
    this.cacheOptions = {
      maxSize: 100,
      ttlMs: 5 * 60 * 1000, // 5 minutes
    };
    this.rateLimiter = new RateLimiter();
  }

  async discover(rawRequest: unknown): Promise<DiscoverResponse> {
    const startTime = Date.now();
    const requestId = nanoid(8);

    try {
      // Rate limiting
      if (!this.rateLimiter.check()) {
        throw new ToolExecutionError(
          "apex.patterns.discover",
          "Rate limit exceeded. Please try again later.",
        );
      }

      // Validate request
      const validationResult = DiscoverRequestSchema.safeParse(rawRequest);
      if (!validationResult.success) {
        const errors = validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw new InvalidParamsError(`Invalid request parameters: ${errors}`);
      }

      const request = validationResult.data;

      // Check cache
      const cacheKey = this.generateCacheKey(request);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        const latency = Date.now() - startTime;
        return {
          ...cached,
          request_id: requestId,
          latency_ms: latency,
          cache_hit: true,
        };
      }

      // Extract enhanced signals from query
      const signals = extractEnhancedSignals(
        request.query,
        request.context?.current_errors,
        {
          currentFile: request.context?.current_file,
        },
      );

      // Build query components
      const queryComponents = buildQueryFromSignals(signals);

      // Apply additional filters
      if (request.filters?.types) {
        queryComponents.facets.types = [
          ...(queryComponents.facets.types || []),
          ...request.filters.types,
        ];
      }
      if (request.filters?.categories) {
        queryComponents.facets.categories = [
          ...(queryComponents.facets.categories || []),
          ...request.filters.categories,
        ];
      }

      // Query patterns using lookup with facets
      const lookupResult = await this.repository.lookup({
        task: queryComponents.ftsQuery, // Use FTS query as task
        type: queryComponents.facets.types as Pattern["type"][],
        // Note: categories would need to be mapped to tags
        tags: queryComponents.facets.categories, // Use categories as tags
        k: 100, // Get more for scoring
      });

      const searchResults = lookupResult.patterns;

      // Load metadata for scoring
      const patternIds = searchResults.map((p) => p.id);
      const metadata = await this.loadPatternMetadata(patternIds);

      // Calculate FTS scores (normalize search rankings)
      const ftsScores = new Map<string, number>();
      searchResults.forEach((pattern, index) => {
        // Higher rank = higher score
        ftsScores.set(pattern.id, 1 - index / searchResults.length);
      });

      // Calculate facet matches
      const facetMatches = new Map<string, number>();
      for (const pattern of searchResults) {
        let matches = 0;
        if (queryComponents.facets.types?.includes(pattern.type)) matches++;
        // Category matching would need to be implemented via tags or metadata
        facetMatches.set(pattern.id, matches);
      }

      // Check trigger matches
      const triggerMatches = new Map<string, string[]>();
      for (const pattern of searchResults) {
        const triggers = metadata.triggers.get(pattern.id) || [];
        const matches: string[] = [];

        for (const trigger of triggers) {
          // Check if trigger matches our query triggers
          for (const queryTrigger of queryComponents.triggers) {
            if (trigger.trigger_value.includes(queryTrigger.split(":")[1])) {
              matches.push(trigger.trigger_value);
            }
          }
        }

        if (matches.length > 0) {
          triggerMatches.set(pattern.id, matches);
        }
      }

      // Score patterns
      const scored = this.scorer.scorePatterns(
        searchResults,
        {
          ftsScores,
          facetMatches,
          triggerMatches,
          metadata: metadata.metadata,
          triggers: metadata.triggers,
          vocab: metadata.vocab,
        },
        {
          maxResults: request.max_results,
          minScore: request.min_score,
          includeBreakdown: true,
        },
      );

      // Format response
      const patterns = scored.map((score) => ({
        pattern: score.pattern,
        score: score.score,
        explanation: request.include_explanation ? score.explanation : "",
        metadata: this.extractRelevantMetadata(score.pattern.id, metadata),
      }));

      const response: DiscoverResponse = {
        patterns,
        query_interpretation: {
          keywords: signals.keywords,
          inferred_types: signals.suggestedTypes,
          inferred_categories: signals.suggestedCategories,
          detected_technologies: [...signals.languages, ...signals.frameworks],
        },
        request_id: requestId,
        latency_ms: Date.now() - startTime,
        cache_hit: false,
      };

      // Cache response
      if (this.cache.size >= this.cacheOptions.maxSize) {
        // Remove oldest entry
        const firstKey = this.cache.keys().next().value;
        if (firstKey) this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, response);

      return response;
    } catch (error) {
      const errorMessage = (error as Error).message || "Unknown error";
      throw new InternalError(`Discovery failed: ${errorMessage}`);
    }
  }

  private async loadPatternMetadata(patternIds: string[]): Promise<{
    metadata: Map<string, PatternMetadata[]>;
    triggers: Map<string, PatternTrigger[]>;
    vocab: Map<string, PatternVocab[]>;
  }> {
    const metadata = new Map<string, PatternMetadata[]>();
    const triggers = new Map<string, PatternTrigger[]>();
    const vocab = new Map<string, PatternVocab[]>();

    // In a real implementation, these would be loaded from the database
    // For now, returning empty maps
    // TODO: Implement database queries for pattern_metadata, pattern_triggers, pattern_vocab tables

    return { metadata, triggers, vocab };
  }

  private extractRelevantMetadata(
    patternId: string,
    metadata: {
      metadata: Map<string, PatternMetadata[]>;
      triggers: Map<string, PatternTrigger[]>;
      vocab: Map<string, PatternVocab[]>;
    },
  ): Record<string, any> {
    const result: Record<string, any> = {};

    // Extract useful metadata
    const patternMeta = metadata.metadata.get(patternId);
    if (patternMeta) {
      for (const meta of patternMeta) {
        if (
          ["difficulty", "time_estimate", "prerequisites"].includes(meta.key)
        ) {
          result[meta.key] = meta.value;
        }
      }
    }

    // Include trigger count
    const triggers = metadata.triggers.get(patternId);
    if (triggers && triggers.length > 0) {
      result.trigger_count = triggers.length;
    }

    return result;
  }

  private generateCacheKey(request: DiscoverRequest): string {
    const normalized = {
      query: request.query.toLowerCase().trim(),
      filters: request.filters || {},
      context: request.context || {},
      max_results: request.max_results,
      min_score: request.min_score,
    };
    const hash = createHash("sha256");
    hash.update(JSON.stringify(normalized));
    return hash.digest("hex");
  }
}
