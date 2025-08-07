/**
 * Tag expansion engine with sanitization and caching
 * [APE-63] Multi-Dimensional Pattern Tagging System
 *
 * Expands AI-provided tags using relationship mappings with security controls.
 */

import { TAG_RELATIONSHIPS, getRelatedTags } from "./tag-relationships.js";

export interface TagExpansionOptions {
  maxDepth?: number; // Maximum expansion depth (default: 2)
  maxTags?: number; // Maximum expanded tags (default: 50)
  cacheResults?: boolean; // Cache expanded sets (default: true)
}

export class TagExpander {
  private cache: Map<string, Set<string>>;
  private readonly maxCacheSize = 1000;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Sanitize AI-provided tags for FTS5 safety
   * Removes SQL injection attempts and special characters
   */
  sanitizeTag(tag: string): string {
    // Remove any SQL-like patterns
    let sanitized = tag
      .toLowerCase()
      .replace(/['"`;\\]/g, "") // Remove quotes, semicolons, backslashes
      .replace(
        /\b(select|insert|update|delete|drop|union|exec|script|from|where|table|alter|create|truncate|grant|revoke)\b/gi,
        "",
      )
      .replace(/--.*$/g, "") // Remove SQL comments
      .replace(/\/\*.*?\*\//g, "") // Remove multi-line comments
      .replace(/[^a-z0-9\-_]/g, "") // Only allow alphanumeric, dash, underscore
      .trim();

    // Limit length to prevent DoS
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50);
    }

    return sanitized;
  }

  /**
   * Expand a set of tags using relationship mappings
   * Implements 2-level expansion with cycle detection
   */
  expand(tags: string[], options: TagExpansionOptions = {}): string[] {
    const { maxDepth = 2, maxTags = 50, cacheResults = true } = options;

    // Handle null/undefined input
    if (!tags || !Array.isArray(tags)) {
      return [];
    }

    // Sanitize all input tags
    const sanitizedTags = tags
      .filter((tag) => tag && typeof tag === "string")
      .map((tag) => this.sanitizeTag(tag))
      .filter((tag) => tag.length > 0);

    if (sanitizedTags.length === 0) {
      return [];
    }

    // Check cache
    const cacheKey = sanitizedTags.sort().join(",");
    if (cacheResults && this.cache.has(cacheKey)) {
      return Array.from(this.cache.get(cacheKey)!);
    }

    // Perform expansion
    const expanded = new Set<string>();
    const visited = new Set<string>();

    // BFS expansion with depth tracking
    const queue: Array<{ tag: string; depth: number }> = sanitizedTags.map(
      (tag) => ({ tag, depth: 0 }),
    );

    while (queue.length > 0 && expanded.size < maxTags) {
      const { tag, depth } = queue.shift()!;

      // Skip if already visited (cycle detection)
      if (visited.has(tag)) continue;
      visited.add(tag);

      // Add to expanded set
      expanded.add(tag);

      // Only expand further if within depth limit
      if (depth < maxDepth) {
        const related = TAG_RELATIONSHIPS[tag] || [];
        for (const relatedTag of related) {
          if (!visited.has(relatedTag) && expanded.size < maxTags) {
            queue.push({ tag: relatedTag, depth: depth + 1 });
          }
        }
      }
    }

    // Cache result
    if (cacheResults) {
      // Limit cache size
      if (this.cache.size >= this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, expanded);
    }

    return Array.from(expanded);
  }

  /**
   * Calculate overlap score between two tag sets
   * Used for ranking patterns by tag relevance
   */
  calculateOverlapScore(queryTags: string[], patternTags: string[]): number {
    if (queryTags.length === 0 || patternTags.length === 0) {
      return 0;
    }

    // Expand both tag sets
    const expandedQuery = new Set(this.expand(queryTags));
    const expandedPattern = new Set(this.expand(patternTags));

    // Count matches
    let matches = 0;
    for (const tag of expandedQuery) {
      if (expandedPattern.has(tag)) {
        matches++;
      }
    }

    // Normalize by smaller set size (Jaccard-like similarity)
    const minSize = Math.min(expandedQuery.size, expandedPattern.size);
    return minSize > 0 ? matches / minSize : 0;
  }

  /**
   * Get tag expansion statistics for monitoring
   */
  getStats(): { cacheSize: number; cacheHitRate: number } {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: 0, // Would need to track hits/misses for real rate
    };
  }

  /**
   * Clear the expansion cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Probabilistic tag quarantine (trust-based filtering)
   * Tags with low trust scores are filtered out
   */
  quarantineTags(tags: string[], trustScores?: Map<string, number>): string[] {
    if (!trustScores) {
      // If no trust scores provided, sanitize but don't filter
      return tags
        .map((tag) => this.sanitizeTag(tag))
        .filter((tag) => tag.length > 0);
    }

    const threshold = 0.3; // Minimum trust score
    return tags
      .map((tag) => this.sanitizeTag(tag))
      .filter((tag) => {
        const trust = trustScores.get(tag) || 0.5; // Default trust
        return tag.length > 0 && trust >= threshold;
      });
  }
}
