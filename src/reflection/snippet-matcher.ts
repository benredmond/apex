/**
 * Snippet matching utilities for content-based evidence validation
 * [PAT:STRING:FUZZY_MATCH] ★★★★☆ (12 uses, 92% success) - Whitespace-tolerant matching
 * [PAT:CACHE:TTL] ★★★★★ (23 uses, 100% success) - Time-based cache invalidation
 */

import { createHash } from "crypto";

export interface MatchResult {
  found: boolean;
  start?: number;
  end?: number;
  confidence: number;
  multipleMatches?: Array<{ start: number; end: number }>;
}

export interface SnippetMatcherConfig {
  maxFileSize: number; // bytes
  maxLineCount: number;
  cacheEnabled: boolean;
  cacheTTL: number; // milliseconds
}

export class SnippetMatcher {
  private config: SnippetMatcherConfig;
  private hashCache: Map<string, { hash: string; timestamp: number }>;

  constructor(config: Partial<SnippetMatcherConfig> = {}) {
    this.config = {
      maxFileSize: 1024 * 1024, // 1MB
      maxLineCount: 20000,
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
    this.hashCache = new Map();
  }

  /**
   * Normalize content for whitespace-tolerant matching
   * [PAT:STRING:FUZZY_MATCH] ★★★★☆ - Whitespace normalization pattern
   */
  normalizeContent(content: string): string {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  /**
   * Generate SHA-256 hash of normalized content
   */
  generateSnippetHash(content: string): string {
    // Create a more robust cache key to avoid collisions
    const cacheKey = createHash("sha256")
      .update(content.substring(0, 200))
      .digest("hex")
      .substring(0, 16);

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.hashCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.hash;
      }
    }

    const normalized = this.normalizeContent(content);
    const hash = createHash("sha256").update(normalized).digest("hex");

    // Cache result
    if (this.config.cacheEnabled) {
      this.hashCache.set(cacheKey, {
        hash,
        timestamp: Date.now(),
      });
    }

    return hash;
  }

  /**
   * Find snippet in file content by hash
   */
  findSnippetByHash(
    fileContent: string,
    snippetHash: string,
    originalStart: number,
    originalEnd: number,
  ): MatchResult {
    // Check file size limits
    const lines = fileContent.split("\n");
    if (
      fileContent.length > this.config.maxFileSize ||
      lines.length > this.config.maxLineCount
    ) {
      return {
        found: false,
        confidence: 0,
      };
    }

    // Calculate expected snippet length
    const expectedLength = originalEnd - originalStart + 1;

    // Find all potential matches
    const matches: Array<{ start: number; end: number }> = [];

    // Sliding window search with radius limit for performance
    const searchRadius = 50; // Look within 50 lines of original position
    const searchStart = Math.max(0, originalStart - 1 - searchRadius);
    const searchEnd = Math.min(
      lines.length - expectedLength,
      originalStart - 1 + searchRadius,
    );

    // First search near original location
    for (let start = searchStart; start <= searchEnd; start++) {
      const end = start + expectedLength - 1;
      const candidateLines = lines.slice(start, end + 1);
      const candidateContent = candidateLines.join("\n");
      const candidateHash = this.generateSnippetHash(candidateContent);

      if (candidateHash === snippetHash) {
        matches.push({ start: start + 1, end: end + 1 }); // Convert to 1-based
      }
    }

    // If no matches found in radius, do full search
    if (matches.length === 0) {
      for (let start = 0; start <= lines.length - expectedLength; start++) {
        // Skip already searched area
        if (start >= searchStart && start <= searchEnd) continue;

        const end = start + expectedLength - 1;
        const candidateLines = lines.slice(start, end + 1);
        const candidateContent = candidateLines.join("\n");
        const candidateHash = this.generateSnippetHash(candidateContent);

        if (candidateHash === snippetHash) {
          matches.push({ start: start + 1, end: end + 1 }); // Convert to 1-based
        }
      }
    }

    // Return results based on match count
    if (matches.length === 0) {
      return {
        found: false,
        confidence: 0,
      };
    } else if (matches.length === 1) {
      return {
        found: true,
        start: matches[0].start,
        end: matches[0].end,
        confidence: 1.0,
      };
    } else {
      // Multiple matches - return first with lower confidence
      return {
        found: true,
        start: matches[0].start,
        end: matches[0].end,
        confidence: 0.5,
        multipleMatches: matches,
      };
    }
  }

  /**
   * Extract content from file by line range
   */
  extractContent(
    fileContent: string,
    start: number,
    end: number,
  ): string | null {
    const lines = fileContent.split("\n");
    if (start < 1 || end > lines.length || start > end) {
      return null;
    }
    return lines.slice(start - 1, end).join("\n");
  }

  /**
   * Clear hash cache
   */
  clearCache(): void {
    this.hashCache.clear();
  }
}
