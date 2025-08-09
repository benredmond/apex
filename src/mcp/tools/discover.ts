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
import { QueryProcessor } from "../../search/query-processor.js";
import { FuzzyMatcher } from "../../search/fuzzy-matcher.js";
import type { PatternPack } from "../../ranking/types.js";
import { TagExpander } from "../../intelligence/tag-expander.js";

// Request validation schema
const DiscoverRequestSchema = z.object({
  // Natural language query
  query: z.string().min(3).max(500),

  // Pagination fields
  page: z.number().min(1).default(1).optional(),
  pageSize: z.number().min(1).max(50).default(50).optional(),

  // AI-provided tags for enhanced discovery [APE-63]
  tags: z.array(z.string()).max(15).optional(),

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
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
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
  private queryProcessor: QueryProcessor;
  private fuzzyMatcher: FuzzyMatcher;
  private tagExpander: TagExpander;

  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.scorer = new SemanticScorer();
    this.cache = new Map();
    this.cacheOptions = {
      maxSize: 100,
      ttlMs: 5 * 60 * 1000, // 5 minutes
    };
    this.rateLimiter = new RateLimiter();
    this.queryProcessor = new QueryProcessor();
    this.fuzzyMatcher = new FuzzyMatcher();
    this.tagExpander = new TagExpander();
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

      // [APE-63] Expand AI-provided tags if present
      let expandedTags: string[] = [];
      if (request.tags && request.tags.length > 0) {
        expandedTags = this.tagExpander.expand(request.tags, {
          maxDepth: 2,
          maxTags: 50,
          cacheResults: true,
        });
      }

      // Process query with enhanced search capabilities
      const processedQuery = this.queryProcessor.processQuery(request.query, {
        enableSynonyms: true,
        enableFuzzy: true,
        performanceMode: false, // Full feature mode
      });

      // Extract enhanced signals for backward compatibility
      const signals = extractEnhancedSignals(
        request.query,
        request.context?.current_errors,
        {
          currentFile: request.context?.current_file,
        },
      );

      // Map signal types to actual pattern types
      const typeMapping: Record<string, Pattern["type"]> = {
        fix: "CODEBASE",
        code: "CODEBASE",
        pattern: "CODEBASE",
        refactor: "CODEBASE",
        command: "CODEBASE",
        test: "TEST",
        policy: "POLICY",
        anti: "ANTI",
        failure: "FAILURE",
        migration: "MIGRATION",
        lang: "LANG",
      };

      // Apply additional filters
      // Don't filter by type unless explicitly requested - too restrictive
      let searchTypes: Pattern["type"][] = [];
      let searchTags = signals.suggestedCategories;

      if (request.filters?.types) {
        // Filter to only valid pattern types
        const validTypes = request.filters.types
          .map((t) => typeMapping[t.toLowerCase()] || t)
          .filter((t) =>
            [
              "CODEBASE",
              "LANG",
              "ANTI",
              "FAILURE",
              "POLICY",
              "TEST",
              "MIGRATION",
            ].includes(t),
          ) as Pattern["type"][];
        searchTypes = [...searchTypes, ...validTypes];
      }
      if (request.filters?.categories) {
        searchTags = [...searchTags, ...request.filters.categories] as any;
      }

      // [APE-63] Combine expanded tags with search tags
      if (expandedTags.length > 0) {
        searchTags = [...new Set([...searchTags, ...expandedTags])] as any;
      }

      // Use enhanced FTS query for search
      // [PAT:SEARCH:FTS] ★★★★★ - Enhanced FTS5 search
      // Don't filter by tags if none exist in the database
      // This was causing empty results when signal extraction suggested tags
      const lookupResult = await this.repository.search({
        task: processedQuery.ftsQuery, // Use processed FTS query
        type:
          searchTypes.length > 0
            ? (searchTypes as Pattern["type"][])
            : undefined,
        tags: undefined, // Temporarily disable tag filtering until patterns have tags
        k: 100, // Get more for scoring and fuzzy matching
      });

      let searchResults = lookupResult.patterns;

      // Apply fuzzy matching if enabled
      // [PAT:SEARCH:FUZZY] ★★★★☆ - Fuzzy matching for typo tolerance
      if (searchResults.length < 5 && processedQuery.expandedTerms.length > 0) {
        searchResults = this.queryProcessor.applyFuzzyMatching(
          searchResults,
          request.query,
          {
            threshold: 0.6,
            maxResults: request.max_results * 2,
            fields: ["title", "summary", "tags"],
          },
        );
      }

      // Load metadata for scoring
      const patternIds = searchResults.map((p) => p.id);
      const metadata = await this.loadPatternMetadata(patternIds);

      // Calculate FTS scores (normalize search rankings)
      const ftsScores = new Map<string, number>();
      searchResults.forEach((pattern, index) => {
        // Higher rank = higher score
        ftsScores.set(pattern.id, 1 - index / searchResults.length);
      });

      // Calculate facet matches based on search criteria
      const facetMatches = new Map<string, number>();
      // [APE-63] Calculate tag overlap scores for AI-provided tags
      const tagOverlapScores = new Map<string, number>();

      for (const pattern of searchResults) {
        let matches = 0;
        if (searchTypes?.includes(pattern.type)) matches++;
        // Tag matching
        if (pattern.tags && searchTags) {
          const patternTagsLower = pattern.tags.map((t) => t.toLowerCase());
          const searchTagsLower = searchTags.map((t) => t.toLowerCase());
          if (patternTagsLower.some((t) => searchTagsLower.includes(t)))
            matches++;
        }
        facetMatches.set(pattern.id, matches);

        // [APE-63] Calculate tag overlap score if AI tags provided
        if (request.tags && request.tags.length > 0 && pattern.tags) {
          const overlapScore = this.tagExpander.calculateOverlapScore(
            request.tags,
            pattern.tags,
          );
          tagOverlapScores.set(pattern.id, overlapScore);
        }
      }

      // Check trigger matches (empty for now as triggers aren't loaded)
      const triggerMatches = new Map<string, string[]>();

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
          maxResults: request.max_results * 2, // Get more to re-rank with tags
          minScore: request.min_score,
          includeBreakdown: true,
        },
      );

      // [APE-63] Adjust scores based on tag overlap if AI tags provided
      let adjustedScored = scored;
      if (tagOverlapScores.size > 0) {
        adjustedScored = scored.map((scoreResult) => {
          const tagScore = tagOverlapScores.get(scoreResult.pattern.id) || 0;
          // Blend tag score with existing score (40% tags, 60% existing)
          const adjustedScore = tagScore * 0.4 + scoreResult.score * 0.6;
          return {
            ...scoreResult,
            score: adjustedScore,
            explanation:
              scoreResult.explanation +
              (tagScore > 0
                ? ` Tag overlap: ${(tagScore * 100).toFixed(0)}%.`
                : ""),
          };
        });
        // Re-sort by adjusted score
        adjustedScored.sort((a, b) => b.score - a.score);
      }

      // Apply pagination
      let paginationInfo = undefined;
      let pagedResults = adjustedScored;

      if (request.page !== undefined || request.pageSize !== undefined) {
        const page = request.page || 1;
        const pageSize = request.pageSize || 50;
        const totalItems = adjustedScored.length;
        const totalPages = Math.ceil(totalItems / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, totalItems);

        // Slice for this page
        pagedResults = adjustedScored.slice(startIndex, endIndex);

        paginationInfo = {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        };
      } else {
        // Use max_results if no pagination specified (backward compatible)
        pagedResults = adjustedScored.slice(0, request.max_results);
      }

      // Format response
      const patterns = pagedResults.map((score) => ({
        pattern: score.pattern,
        score: score.score,
        explanation: request.include_explanation ? score.explanation : "",
        metadata: this.extractRelevantMetadata(score.pattern.id, metadata),
      }));

      // Detect typos and suggest corrections if few results
      let corrections: string[] = [];
      if (patterns.length < 3) {
        const allTitles = searchResults.map((p) => p.title);
        corrections = this.queryProcessor.detectTypos(request.query, allTitles);
      }

      const response: DiscoverResponse = {
        patterns,
        query_interpretation: {
          keywords:
            processedQuery.expandedTerms.length > 0
              ? processedQuery.expandedTerms
              : signals.keywords,
          inferred_types: signals.suggestedTypes,
          inferred_categories: signals.suggestedCategories,
          detected_technologies: [...signals.languages, ...signals.frameworks],
        },
        request_id: requestId,
        latency_ms: Date.now() - startTime,
        cache_hit: false,
        pagination: paginationInfo,
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
    // [PAT:REPO:METHOD] ★★★★★ - Repository method pattern
    // Load metadata, triggers, and vocab in parallel for efficiency
    const [metadata, triggers, vocab] = await Promise.all([
      this.repository.getMetadata(patternIds),
      this.repository.getTriggers(patternIds),
      this.repository.getVocab(patternIds),
    ]);

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
      tags: request.tags || [], // [APE-63] Include tags in cache key
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
