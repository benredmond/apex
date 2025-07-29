/**
 * Main pattern lookup implementation
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success)
 */

import { z } from 'zod';
import { nanoid } from 'nanoid';
import { PatternRepository } from '../../storage/repository.js';
import { PatternRanker } from '../../ranking/index.js';
import { PackBuilder } from '../../ranking/pack-builder.js';
import { extractSignals, toRankingSignals } from './signal-extractor.js';
import { RequestCache } from './request-cache.js';
import { lookupMetrics } from './metrics.js';
import { 
  InvalidParamsError, 
  InternalError, 
  ToolExecutionError 
} from '../errors.js';
import type { QueryFacets } from '../../storage/types.js';
import type { PatternPack } from '../../ranking/types.js';

// Request validation schema
// [PAT:VALIDATION:ZOD_DISCRIMINATED_UNION] ★★★☆☆ (2 uses) - Zod validation pattern
const LookupRequestSchema = z.object({
  task: z.string().min(1).max(1000),
  current_file: z.string().optional(),
  language: z.string().optional(),
  framework: z.string().optional(),
  recent_errors: z.array(z.string()).max(10).optional(),
  repo_path: z.string().optional(),
  max_size: z.number().min(1024).max(65536).default(8192),
});

export type LookupRequest = z.infer<typeof LookupRequestSchema>;

export interface LookupResponse {
  pattern_pack: PatternPack;
  request_id: string;
  latency_ms: number;
  cache_hit: boolean;
}

// Simple rate limiter
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
    
    // Remove old requests outside window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    // Check if under limit
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    // Add current request
    this.requests.push(now);
    return true;
  }
}

export class PatternLookupService {
  private repository: PatternRepository;
  private packBuilder: PackBuilder;
  private cache: RequestCache;
  private rateLimiter: RateLimiter;
  
  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.packBuilder = new PackBuilder(repository);
    this.cache = new RequestCache();
    this.rateLimiter = new RateLimiter(100, 60000); // 100 req/min
  }
  
  /**
   * Main lookup method
   */
  async lookup(rawRequest: unknown): Promise<LookupResponse> {
    const startTime = Date.now();
    const requestId = nanoid(12);
    
    try {
      // Rate limiting check
      if (!this.rateLimiter.check()) {
        throw new ToolExecutionError('Rate limit exceeded. Please try again later.');
      }
      
      // Validate request
      const validationResult = LookupRequestSchema.safeParse(rawRequest);
      if (!validationResult.success) {
        lookupMetrics.recordError('validation');
        const errors = validationResult.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new InvalidParamsError(
          `Invalid request parameters: ${errors}`
        );
      }
      
      const request = validationResult.data;
      lookupMetrics.recordRequest(request);
      
      // Check cache
      const cacheKey = this.cache.generateKey(request);
      const cached = this.cache.get(cacheKey);
      
      if (cached) {
        lookupMetrics.recordCacheHit();
        const latency = Date.now() - startTime;
        lookupMetrics.recordLatency(latency);
        
        return {
          pattern_pack: cached.pattern_pack,
          request_id: requestId,
          latency_ms: latency,
          cache_hit: true,
        };
      }
      
      lookupMetrics.recordCacheMiss();
      
      // Extract signals from request
      const extracted = extractSignals(request);
      const signals = toRankingSignals(extracted);
      
      // Build query facets for repository lookup
      const facets: QueryFacets = {
        languages: extracted.languages,
        frameworks: extracted.frameworks.map(f => f.name),
        paths: extracted.paths,
        // TODO: Add more facets as repository supports them
      };
      
      // Query repository with facets
      let patternPack;
      try {
        patternPack = await this.repository.lookup({
          task: request.task,
          ...facets,
          k: 100, // Get top 100 for ranking
        });
      } catch (error) {
        lookupMetrics.recordError('lookup');
        const errorMessage = (error as Error).message || 'Unknown error';
        const sanitized = errorMessage.split('\n')[0].substring(0, 200);
        throw new InternalError(`Failed to query patterns: ${sanitized}`);
      }
      
      // Convert patterns to PatternMeta format for ranker
      const patternMetas = patternPack.patterns.map(p => ({
        id: p.id,
        type: p.type,
        scope: {
          paths: facets.paths || [],
          languages: facets.languages || [],
          frameworks: extracted.frameworks || [],
        },
        trust: {
          score: p.trust_score || 0.8,
        },
        metadata: {
          repo: extracted.repo,
          org: extracted.org,
        },
      }));
      
      // Rank patterns
      let ranked;
      try {
        const ranker = new PatternRanker(patternMetas);
        ranked = await ranker.rank(signals);
      } catch (error) {
        lookupMetrics.recordError('ranking');
        const errorMessage = (error as Error).message || 'Unknown error';
        const sanitized = errorMessage.split('\n')[0].substring(0, 200);
        throw new InternalError(`Failed to rank patterns: ${sanitized}`);
      }
      
      // Build PatternPack with size budget
      const packResult = await this.packBuilder.buildPatternPack(
        request.task,
        ranked,
        {
          budgetBytes: request.max_size,
          debug: false, // Could be controlled by request option
        }
      );
      
      // Record metrics
      lookupMetrics.recordPatternsReturned(packResult.pack.candidates.length);
      
      const latency = Date.now() - startTime;
      lookupMetrics.recordLatency(latency);
      
      // Cache the response
      const response: LookupResponse = {
        pattern_pack: packResult.pack,
        request_id: requestId,
        latency_ms: latency,
        cache_hit: false,
      };
      
      this.cache.set(cacheKey, {
        ...response,
        cached_at: Date.now(),
      });
      
      return response;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      lookupMetrics.recordLatency(latency);
      
      // Re-throw known error types as-is
      if (error instanceof InvalidParamsError || 
          error instanceof ToolExecutionError ||
          error instanceof InternalError) {
        throw error;
      }
      
      // Record other errors
      lookupMetrics.recordError('other');
      
      // Re-throw with sanitized error message
      if (error instanceof Error) {
        // Remove any stack traces or sensitive info
        const sanitized = error.message.split('\n')[0].substring(0, 200);
        throw new ToolExecutionError(sanitized);
      }
      
      throw new InternalError('An unexpected error occurred');
    }
  }
  
  /**
   * Clear the cache (useful for testing or manual invalidation)
   */
  clearCache(): void {
    this.cache.clear();
  }
}