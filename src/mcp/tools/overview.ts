/**
 * Pattern overview tool
 * Provides filterable, paginated list of patterns with optional statistics
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import type { PatternRepository } from "../../storage/repository.js";
import type { Pattern, ListOptions } from "../../storage/types.js";
import {
  InvalidParamsError,
  InternalError,
  ToolExecutionError,
} from "../errors.js";

// Rate limiter (reuse pattern from lookup.ts and discover.ts)
class RateLimiter {
  private requests: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 50, windowMs: number = 60000) {
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

// Request validation schema
export const OverviewRequestSchema = z.object({
  // Filters (all optional)
  type: z
    .union([
      z.array(
        z.enum([
          "CODEBASE",
          "LANG",
          "ANTI",
          "FAILURE",
          "POLICY",
          "TEST",
          "MIGRATION",
        ]),
      ),
      z.literal("all"),
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  min_trust: z.number().min(0).max(1).optional(),
  max_age_days: z.number().min(1).optional(),
  status: z.enum(["active", "quarantined", "all"]).default("active"),

  // Sorting
  order_by: z
    .enum(["trust_score", "usage_count", "created_at", "updated_at", "title"])
    .default("trust_score"),
  order: z.enum(["asc", "desc"]).default("desc"),

  // Pagination
  page: z.number().min(1).default(1),
  page_size: z.number().min(1).max(100).default(50),

  // Output control
  include_stats: z.boolean().default(false),
  include_metadata: z.boolean().default(false),
});

export type OverviewRequest = z.infer<typeof OverviewRequestSchema>;

// Compressed pattern format for overview
export interface CompressedPattern {
  id: string;
  type: string;
  title: string;
  summary: string; // Truncated to 200 chars
  trust_score: number;
  usage_count: number;
  success_rate?: number;
  tags: string[];
  alias?: string;
  created_at: string;
  updated_at: string;
  key_insight?: string;
  when_to_use?: string;
}

// Overview statistics
export interface OverviewStats {
  total_patterns: number;
  by_type: Record<string, number>;
  avg_trust_score: number;
  high_trust_patterns: number; // > 0.8
  recently_added: number; // last 7 days
  recently_updated: number; // last 7 days
}

export interface OverviewResponse {
  patterns: CompressedPattern[];
  stats?: OverviewStats;
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  request_id: string;
  latency_ms: number;
  cache_hit: boolean;
}

/**
 * Pattern Overview Service
 * Provides filterable, paginated overview of all patterns
 */
export class PatternOverviewService {
  private statsCache: Map<
    string,
    { stats: OverviewStats; timestamp: number }
  > = new Map();
  private readonly STATS_CACHE_TTL = 60000; // 1 minute
  private rateLimiter: RateLimiter;

  constructor(private repository: PatternRepository) {
    // Lower rate limit than lookup (50 vs 100) since overview can be expensive with stats
    this.rateLimiter = new RateLimiter(50, 60000); // 50 req/min
  }

  async overview(rawRequest: unknown): Promise<OverviewResponse> {
    const startTime = Date.now();
    const requestId = nanoid(8);
    let request: OverviewRequest | undefined;

    try {
      // Check rate limit first
      if (!this.rateLimiter.check()) {
        throw new ToolExecutionError(
          "apex_patterns_overview",
          "Rate limit exceeded (50 requests per minute). Please try again later.",
        );
      }

      // Validate request
      const validationResult = OverviewRequestSchema.safeParse(rawRequest);
      if (!validationResult.success) {
        const errors = validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ");
        throw new InvalidParamsError(`Invalid overview request: ${errors}`);
      }

      request = validationResult.data;

      // Get accurate total count with filters applied
      const totalItems = await this.getFilteredCount(request);

      // Build list options with proper pagination
      const page = request.page;
      const pageSize = request.page_size;
      const listOptions = this.buildListOptions(request, page, pageSize);

      // Query repository with pagination
      let patterns = await this.repository.list(listOptions);

      // Apply additional filters not supported by repository (e.g., max_age_days)
      patterns = this.applyAdditionalFilters(patterns, request);

      // Apply custom sorting if needed (for fields not supported by repository.list())
      if (request.order_by === "title") {
        patterns.sort((a, b) => {
          const comparison = a.title.localeCompare(b.title);
          return request.order === "asc" ? comparison : -comparison;
        });
      }

      // Compress patterns for response
      const compressedPatterns = patterns.map((p) =>
        this.compressPattern(p, request.include_metadata),
      );

      // Calculate statistics if requested
      let stats: OverviewStats | undefined;
      if (request.include_stats) {
        stats = await this.calculateStats(request);
      }

      // Build pagination info
      const totalPages = Math.ceil(totalItems / pageSize);
      const pagination = {
        page,
        page_size: pageSize,
        total_items: totalItems,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      };

      return {
        patterns: compressedPatterns,
        stats,
        pagination,
        request_id: requestId,
        latency_ms: Date.now() - startTime,
        cache_hit: false,
      };
    } catch (error) {
      // Handle known errors
      if (
        error instanceof InvalidParamsError ||
        error instanceof ToolExecutionError ||
        error instanceof InternalError
      ) {
        throw error;
      }

      // Wrap unknown errors with context
      const errorContext = request
        ? `filters={type: ${JSON.stringify(request.type || "all")}, status: ${request.status}}`
        : "unknown";
      throw new ToolExecutionError(
        "apex_patterns_overview",
        `Overview execution failed (${errorContext}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get accurate count of patterns matching filters
   */
  private async getFilteredCount(request: OverviewRequest): Promise<number> {
    const db = this.repository.getDatabase();
    const { whereClause, params } = this.buildWhereClause(request);

    const result = db
      .prepare(`SELECT COUNT(*) as count FROM patterns WHERE ${whereClause}`)
      .get(...params) as { count: number };

    return result.count;
  }

  /**
   * Build WHERE clause and parameters for SQL queries
   */
  private buildWhereClause(request: OverviewRequest): {
    whereClause: string;
    params: any[];
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    // Type filter
    if (request.type && request.type !== "all") {
      const types = request.type as string[];
      conditions.push(`type IN (${types.map(() => "?").join(", ")})`);
      params.push(...types);
    }

    // Trust score filter
    if (request.min_trust !== undefined) {
      conditions.push("trust_score >= ?");
      params.push(request.min_trust);
    }

    // Tags filter
    if (request.tags && request.tags.length > 0) {
      conditions.push(
        `id IN (SELECT pattern_id FROM pattern_tags WHERE tag IN (${request.tags.map(() => "?").join(", ")}))`,
      );
      params.push(...request.tags);
    }

    // Status filter
    if (request.status !== "all") {
      if (request.status === "active") {
        // Active patterns: invalid=0 or NULL (default)
        conditions.push("(invalid = 0 OR invalid IS NULL)");
      } else {
        // Quarantined patterns: invalid=1
        conditions.push("invalid = 1");
      }
    }

    return {
      whereClause: conditions.length > 0 ? conditions.join(" AND ") : "1=1",
      params,
    };
  }

  /**
   * Build ListOptions from request with pagination
   */
  private buildListOptions(
    request: OverviewRequest,
    page: number,
    pageSize: number,
  ): ListOptions {
    // Map order_by to supported repository fields, default to trust_score for unsupported fields
    const supportedOrderByFields = [
      "trust_score",
      "usage_count",
      "created_at",
      "updated_at",
    ];
    const orderBy = supportedOrderByFields.includes(request.order_by)
      ? (request.order_by as "trust_score" | "usage_count" | "created_at" | "updated_at")
      : "trust_score";

    const options: ListOptions = {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      orderBy,
      order: request.order,
      filter: {},
    };

    // Type filter
    if (request.type && request.type !== "all") {
      options.filter!.type = request.type as Pattern["type"][];
    }

    // Trust score filter
    if (request.min_trust !== undefined) {
      options.filter!.minTrust = request.min_trust;
    }

    // Tags filter
    if (request.tags && request.tags.length > 0) {
      options.filter!.tags = request.tags;
    }

    // Status filter (only if not "all")
    if (request.status !== "all") {
      options.filter!.valid = request.status === "active";
    }

    return options;
  }

  /**
   * Apply additional filters not supported by repository.list()
   */
  private applyAdditionalFilters(
    patterns: Pattern[],
    request: OverviewRequest,
  ): Pattern[] {
    let filtered = patterns;

    // Age filter
    if (request.max_age_days !== undefined) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - request.max_age_days);
      filtered = filtered.filter((p) => {
        const createdAt = new Date(p.created_at);
        return createdAt >= cutoffDate;
      });
    }

    return filtered;
  }

  /**
   * Compress pattern for token-efficient response
   */
  private compressPattern(
    pattern: Pattern,
    includeMetadata: boolean,
  ): CompressedPattern {
    // Truncate summary to 200 chars
    const truncatedSummary =
      pattern.summary.length > 200
        ? pattern.summary.substring(0, 197) + "..."
        : pattern.summary;

    // Calculate success rate
    const successRate =
      pattern.usage_count > 0
        ? pattern.success_count / pattern.usage_count
        : undefined;

    const compressed: CompressedPattern = {
      id: pattern.id,
      type: pattern.type,
      title: pattern.title,
      summary: truncatedSummary,
      trust_score: pattern.trust_score,
      usage_count: pattern.usage_count,
      success_rate: successRate,
      tags: pattern.tags || [],
      alias: pattern.alias,
      created_at: pattern.created_at,
      updated_at: pattern.updated_at,
    };

    // Include metadata if requested
    if (includeMetadata) {
      compressed.key_insight = pattern.key_insight;
      compressed.when_to_use = pattern.when_to_use;
    }

    return compressed;
  }

  /**
   * Calculate overview statistics with caching
   * Optimized to use 2 queries instead of 6 for better performance
   */
  private async calculateStats(
    request: OverviewRequest,
  ): Promise<OverviewStats> {
    // Generate cache key from request filters
    const cacheKey = JSON.stringify({
      type: request.type,
      tags: request.tags,
      status: request.status,
    });

    // Check cache
    const cached = this.statsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.STATS_CACHE_TTL) {
      return cached.stats;
    }

    // Calculate stats from database using optimized queries
    const db = this.repository.getDatabase();
    const { whereClause, params } = this.buildWhereClause(request);

    // Calculate cutoff for recent patterns (7 days ago)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCutoff = sevenDaysAgo.toISOString();

    // Query 1: Aggregate statistics (combines 5 queries into 1)
    const aggregateStats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total_patterns,
        AVG(trust_score) as avg_trust,
        SUM(CASE WHEN trust_score > 0.8 THEN 1 ELSE 0 END) as high_trust,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as recently_added,
        SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) as recently_updated
      FROM patterns 
      WHERE ${whereClause}
    `,
      )
      .get(...params, recentCutoff, recentCutoff) as {
      total_patterns: number;
      avg_trust: number | null;
      high_trust: number;
      recently_added: number;
      recently_updated: number;
    };

    // Query 2: By-type distribution (requires GROUP BY)
    const byTypeResults = db
      .prepare(
        `SELECT type, COUNT(*) as count FROM patterns WHERE ${whereClause} GROUP BY type`,
      )
      .all(...params) as Array<{ type: string; count: number }>;
    const byType: Record<string, number> = {};
    for (const row of byTypeResults) {
      byType[row.type] = row.count;
    }

    const stats: OverviewStats = {
      total_patterns: aggregateStats.total_patterns,
      by_type: byType,
      avg_trust_score: Math.round((aggregateStats.avg_trust || 0) * 100) / 100,
      high_trust_patterns: aggregateStats.high_trust,
      recently_added: aggregateStats.recently_added,
      recently_updated: aggregateStats.recently_updated,
    };

    // Cache the results
    this.statsCache.set(cacheKey, {
      stats,
      timestamp: Date.now(),
    });

    // Limit cache size to prevent memory leak
    if (this.statsCache.size > 100) {
      const firstKey = this.statsCache.keys().next().value;
      this.statsCache.delete(firstKey);
    }

    return stats;
  }
}
