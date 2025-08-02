/**
 * Request-based caching layer for pattern lookups
 * [PAT:CACHE:HYBRID] ★★★☆☆ (2 uses) - Multi-tier caching pattern
 */

import crypto from "crypto";
import { PatternPack } from "../../ranking/types.js";

interface CachedResponse {
  pattern_pack: PatternPack;
  request_id: string;
  latency_ms: number;
  cache_hit: boolean;
  cached_at: number;
}

interface CacheOptions {
  ttlMs?: number;
  maxSize?: number;
}

export class RequestCache {
  private cache: Map<string, CachedResponse>;
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default
    this.maxSize = options.maxSize || 10000; // 10000 entries default (increased for large codebases)
  }

  /**
   * Generate a normalized cache key from request
   */
  generateKey(request: Record<string, any>): string {
    // Normalize the request for consistent hashing
    const normalized = this.normalizeRequest(request);

    // Create hash
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(normalized));
    return hash.digest("hex");
  }

  /**
   * Normalize request object for consistent cache keys
   */
  private normalizeRequest(request: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};

    // Sort keys for consistent ordering
    const keys = Object.keys(request).sort();

    for (const key of keys) {
      const value = request[key];

      if (value === undefined || value === null) {
        // Skip undefined/null values
        continue;
      }

      if (typeof value === "string") {
        // Normalize strings: trim and lowercase
        normalized[key] = value.trim().toLowerCase();
      } else if (Array.isArray(value)) {
        // Sort arrays and normalize string elements
        normalized[key] = value
          .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : v))
          .sort();
      } else if (typeof value === "object") {
        // Recursively normalize nested objects
        normalized[key] = this.normalizeRequest(value);
      } else {
        // Keep other types as-is (numbers, booleans)
        normalized[key] = value;
      }
    }

    return normalized;
  }

  /**
   * Get cached response if available and not expired
   */
  get(key: string): CachedResponse | null {
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.cached_at;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Return with cache_hit = true
    return {
      ...cached,
      cache_hit: true,
    };
  }

  /**
   * Store response in cache
   */
  set(key: string, response: CachedResponse): void {
    // Enforce size limit with simple LRU eviction
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    // Store with current timestamp
    this.cache.set(key, {
      ...response,
      cached_at: Date.now(),
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Remove expired entries (can be called periodically)
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.cached_at > this.ttlMs) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }
}
