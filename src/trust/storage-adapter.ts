/**
 * Storage Adapter for Beta-Bernoulli Trust Model
 * Bridges the trust model with existing pattern storage
 */

import { PatternStorage, StoredPattern } from "./types.js";
import fs from "fs-extra";
import path from "path";

/**
 * JSON file-based storage adapter
 * Implements PatternStorage interface for the trust model
 */
export class JSONStorageAdapter implements PatternStorage {
  private metadataPath: string;
  private cache: Map<string, StoredPattern>;

  constructor(metadataPath: string = ".apex/PATTERN_METADATA.json") {
    this.metadataPath = metadataPath;
    this.cache = new Map();
  }

  async getPattern(patternId: string): Promise<StoredPattern | null> {
    // Check cache first
    if (this.cache.has(patternId)) {
      return this.cache.get(patternId)!;
    }

    try {
      const metadata = await this.loadMetadata();
      const pattern = metadata.patterns[patternId];

      if (!pattern) {
        return null;
      }

      // Convert to StoredPattern format
      const storedPattern: StoredPattern = {
        id: patternId,
        type: pattern.type || "UNKNOWN",
        trust: {
          alpha: pattern.trust?.alpha || 3, // Default from current system
          beta: pattern.trust?.beta || 2,
          lastUpdated: pattern.lastUpdated || new Date().toISOString(),
          decayApplied: pattern.trust?.decayApplied || false,
        },
      };

      this.cache.set(patternId, storedPattern);
      return storedPattern;
    } catch (error) {
      console.error(`Error loading pattern ${patternId}:`, error);
      return null;
    }
  }

  async updatePattern(
    patternId: string,
    updates: Partial<StoredPattern>,
  ): Promise<void> {
    try {
      const metadata = await this.loadMetadata();

      if (!metadata.patterns[patternId]) {
        metadata.patterns[patternId] = {
          id: patternId,
          uses: 0,
          successes: 0,
          lastUpdated: new Date().toISOString(),
        };
      }

      // Update pattern data
      if (updates.trust) {
        metadata.patterns[patternId].trust = {
          ...metadata.patterns[patternId].trust,
          ...updates.trust,
        };

        // Also update success/uses for backward compatibility
        if (
          updates.trust.alpha !== undefined &&
          updates.trust.beta !== undefined
        ) {
          const total = updates.trust.alpha + updates.trust.beta - 5; // Subtract default priors
          const successes = updates.trust.alpha - 3;
          metadata.patterns[patternId].uses = Math.max(0, total);
          metadata.patterns[patternId].successes = Math.max(0, successes);
        }
      }

      if (updates.type) {
        metadata.patterns[patternId].type = updates.type;
      }

      metadata.patterns[patternId].lastUpdated = new Date().toISOString();

      // Update statistics
      this.updateStatistics(metadata);

      // Save metadata
      await this.saveMetadata(metadata);

      // Update cache
      if (this.cache.has(patternId)) {
        const cached = this.cache.get(patternId)!;
        Object.assign(cached, updates);
      }
    } catch (error) {
      throw new Error(`Failed to update pattern ${patternId}: ${error}`);
    }
  }

  async batchGetPatterns(
    patternIds: string[],
  ): Promise<Map<string, StoredPattern>> {
    const patterns = new Map<string, StoredPattern>();

    // Try to get all from cache first
    const uncachedIds: string[] = [];
    for (const id of patternIds) {
      if (this.cache.has(id)) {
        patterns.set(id, this.cache.get(id)!);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) {
      return patterns;
    }

    // Load uncached patterns
    try {
      const metadata = await this.loadMetadata();

      for (const id of uncachedIds) {
        const pattern = metadata.patterns[id];
        if (pattern) {
          const storedPattern: StoredPattern = {
            id,
            type: pattern.type || "UNKNOWN",
            trust: {
              alpha: pattern.trust?.alpha || 3,
              beta: pattern.trust?.beta || 2,
              lastUpdated: pattern.lastUpdated || new Date().toISOString(),
              decayApplied: pattern.trust?.decayApplied || false,
            },
          };

          patterns.set(id, storedPattern);
          this.cache.set(id, storedPattern);
        }
      }
    } catch (error) {
      console.error("Error batch loading patterns:", error);
    }

    return patterns;
  }

  async batchUpdatePatterns(
    updates: Map<string, Partial<StoredPattern>>,
  ): Promise<void> {
    try {
      const metadata = await this.loadMetadata();

      for (const [patternId, update] of updates) {
        if (!metadata.patterns[patternId]) {
          metadata.patterns[patternId] = {
            id: patternId,
            uses: 0,
            successes: 0,
            lastUpdated: new Date().toISOString(),
          };
        }

        // Apply updates
        if (update.trust) {
          metadata.patterns[patternId].trust = {
            ...metadata.patterns[patternId].trust,
            ...update.trust,
          };

          // Update success/uses for compatibility
          if (
            update.trust.alpha !== undefined &&
            update.trust.beta !== undefined
          ) {
            const total = update.trust.alpha + update.trust.beta - 5;
            const successes = update.trust.alpha - 3;
            metadata.patterns[patternId].uses = Math.max(0, total);
            metadata.patterns[patternId].successes = Math.max(0, successes);
          }
        }

        if (update.type) {
          metadata.patterns[patternId].type = update.type;
        }

        metadata.patterns[patternId].lastUpdated = new Date().toISOString();

        // Update cache
        if (this.cache.has(patternId)) {
          const cached = this.cache.get(patternId)!;
          Object.assign(cached, update);
        }
      }

      // Update statistics
      this.updateStatistics(metadata);

      // Save metadata
      await this.saveMetadata(metadata);
    } catch (error) {
      throw new Error(`Failed to batch update patterns: ${error}`);
    }
  }

  private async loadMetadata(): Promise<any> {
    try {
      const exists = await fs.pathExists(this.metadataPath);
      if (!exists) {
        return this.createEmptyMetadata();
      }

      const content = await fs.readFile(this.metadataPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("Error loading metadata:", error);
      return this.createEmptyMetadata();
    }
  }

  private async saveMetadata(metadata: any): Promise<void> {
    const dir = path.dirname(this.metadataPath);
    await fs.ensureDir(dir);
    await fs.writeFile(this.metadataPath, JSON.stringify(metadata, null, 2));
  }

  private createEmptyMetadata(): any {
    return {
      version: "1.0",
      lastUpdated: new Date().toISOString(),
      patterns: {},
      statistics: {
        totalPatterns: 0,
        activePatterns: 0,
        pendingPatterns: 0,
        averageTrustScore: 0,
        totalUsageCount: 0,
      },
    };
  }

  private updateStatistics(metadata: any): void {
    const patterns = Object.values(metadata.patterns) as any[];

    metadata.statistics.totalPatterns = patterns.length;
    metadata.statistics.activePatterns = patterns.filter(
      (p) => p.uses >= 3 && p.successes / p.uses >= 0.8,
    ).length;
    metadata.statistics.pendingPatterns = patterns.filter(
      (p) => p.uses < 3 || p.successes / p.uses < 0.8,
    ).length;

    const totalUsage = patterns.reduce((sum, p) => sum + (p.uses || 0), 0);
    metadata.statistics.totalUsageCount = totalUsage;

    if (patterns.length > 0) {
      const avgTrust =
        patterns.reduce((sum, p) => {
          const alpha = p.trust?.alpha || 3;
          const beta = p.trust?.beta || 2;
          return sum + alpha / (alpha + beta);
        }, 0) / patterns.length;
      metadata.statistics.averageTrustScore =
        Math.round(avgTrust * 1000) / 1000;
    }

    metadata.lastUpdated = new Date().toISOString();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * In-memory storage adapter for testing
 */
export class MemoryStorageAdapter implements PatternStorage {
  private patterns: Map<string, StoredPattern>;

  constructor() {
    this.patterns = new Map();
  }

  async getPattern(patternId: string): Promise<StoredPattern | null> {
    return this.patterns.get(patternId) || null;
  }

  async updatePattern(
    patternId: string,
    updates: Partial<StoredPattern>,
  ): Promise<void> {
    const existing = this.patterns.get(patternId);
    if (existing) {
      Object.assign(existing, updates);
      if (updates.trust) {
        existing.trust = { ...existing.trust, ...updates.trust };
      }
    } else {
      throw new Error(`Pattern ${patternId} not found`);
    }
  }

  async batchGetPatterns(
    patternIds: string[],
  ): Promise<Map<string, StoredPattern>> {
    const result = new Map<string, StoredPattern>();
    for (const id of patternIds) {
      const pattern = this.patterns.get(id);
      if (pattern) {
        result.set(id, pattern);
      }
    }
    return result;
  }

  async batchUpdatePatterns(
    updates: Map<string, Partial<StoredPattern>>,
  ): Promise<void> {
    for (const [id, update] of updates) {
      await this.updatePattern(id, update);
    }
  }

  /**
   * Add a pattern for testing
   */
  addPattern(pattern: StoredPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
  }
}
