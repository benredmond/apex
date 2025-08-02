/**
 * Batch Processing for Trust Score Updates
 * Efficiently handles bulk pattern updates
 */

import { TrustUpdate, BatchUpdateResult, PatternStorage } from "./types.js";
import { BetaBernoulliTrustModel } from "./beta-bernoulli.js";

export class BatchProcessor {
  private storage: PatternStorage;

  constructor(storage: PatternStorage) {
    this.storage = storage;
  }

  /**
   * Process a batch of trust updates efficiently
   * Groups updates by pattern and applies them in bulk
   */
  async processBatch(
    updates: TrustUpdate[],
    model: BetaBernoulliTrustModel,
  ): Promise<BatchUpdateResult> {
    const startTime =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const errors: Array<{ patternId: string; error: string }> = [];

    // Group updates by pattern ID
    const updateGroups = this.groupUpdatesByPattern(updates);

    // Get all unique pattern IDs
    const patternIds = Array.from(updateGroups.keys());

    // Batch fetch all patterns
    const patterns = await this.storage.batchGetPatterns(patternIds);

    // Process updates for each pattern
    const updateMap = new Map<string, any>();
    let successCount = 0;
    let failureCount = 0;

    for (const [patternId, patternUpdates] of updateGroups) {
      try {
        const pattern = patterns.get(patternId);

        if (!pattern) {
          errors.push({ patternId, error: "Pattern not found" });
          failureCount += patternUpdates.length;
          continue;
        }

        // Apply all updates to this pattern
        let { alpha, beta } = pattern.trust;
        let lastUpdated = new Date(pattern.trust.lastUpdated);

        for (const update of patternUpdates) {
          // Apply time decay if needed
          const updateTime = update.timestamp || new Date();
          const daysSinceLastUpdate =
            (updateTime.getTime() - lastUpdated.getTime()) /
            (1000 * 60 * 60 * 24);

          if (daysSinceLastUpdate > 1) {
            // Get pattern type config for half-life
            const halfLife = this.getHalfLife(pattern.type, model);
            const decayFactor = Math.exp(
              (-Math.LN2 * daysSinceLastUpdate) / halfLife,
            );

            // Decay towards priors
            const config = model.getConfig();
            alpha =
              config.defaultAlpha + (alpha - config.defaultAlpha) * decayFactor;
            beta =
              config.defaultBeta + (beta - config.defaultBeta) * decayFactor;
          }

          // Apply the update
          if (update.outcome) {
            alpha += 1;
          } else {
            beta += 1;
          }

          lastUpdated = updateTime;
          successCount++;
        }

        // Store the final update
        updateMap.set(patternId, {
          trust: {
            alpha,
            beta,
            lastUpdated: lastUpdated.toISOString(),
            decayApplied: true,
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        errors.push({ patternId, error: errorMessage });
        failureCount += patternUpdates.length;
      }
    }

    // Batch update all patterns
    if (updateMap.size > 0) {
      try {
        await this.storage.batchUpdatePatterns(updateMap);
      } catch (error) {
        // If batch update fails, fall back to individual updates
        for (const [patternId, update] of updateMap) {
          try {
            await this.storage.updatePattern(patternId, update);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            errors.push({
              patternId,
              error: `Batch update failed: ${errorMessage}`,
            });
            failureCount++;
            successCount--;
          }
        }
      }
    }

    const duration =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startTime;

    return {
      updated: successCount,
      failed: failureCount,
      duration,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Group updates by pattern ID for efficient processing
   */
  private groupUpdatesByPattern(
    updates: TrustUpdate[],
  ): Map<string, TrustUpdate[]> {
    const groups = new Map<string, TrustUpdate[]>();

    for (const update of updates) {
      const existing = groups.get(update.patternId) || [];
      existing.push(update);
      groups.set(update.patternId, existing);
    }

    // Sort updates within each group by timestamp
    for (const [patternId, patternUpdates] of groups) {
      patternUpdates.sort((a, b) => {
        const timeA = a.timestamp?.getTime() || 0;
        const timeB = b.timestamp?.getTime() || 0;
        return timeA - timeB;
      });
    }

    return groups;
  }

  /**
   * Get half-life for a pattern type
   */
  private getHalfLife(
    patternType: string,
    model: BetaBernoulliTrustModel,
  ): number {
    const config = model.getConfig();
    const typeConfig = config.patternTypeConfig?.get(patternType);
    return typeConfig?.halfLife || config.defaultHalfLife;
  }
}

/**
 * Utility function to chunk large batches for processing
 * Prevents memory issues with very large update sets
 */
export function chunkBatch<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * Process very large batches in chunks
 */
export async function processLargeBatch(
  updates: TrustUpdate[],
  model: BetaBernoulliTrustModel,
  chunkSize: number = 1000,
): Promise<BatchUpdateResult> {
  const chunks = chunkBatch(updates, chunkSize);
  const results: BatchUpdateResult[] = [];

  for (const chunk of chunks) {
    const result = await model.batchUpdate(chunk);
    results.push(result);
  }

  // Aggregate results
  return {
    updated: results.reduce((sum, r) => sum + r.updated, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
    errors: results
      .filter((r) => r.errors)
      .flatMap((r) => r.errors!)
      .slice(0, 100), // Limit error reporting
  };
}
