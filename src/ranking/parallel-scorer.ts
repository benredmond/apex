import { Worker } from "worker_threads";
import * as os from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PatternMeta, Signals, RankingConfig, Breakdown } from "./types.js";
import { scoreScope } from "./scorers/scope.js";
import { scoreTrust } from "./scorers/trust.js";
import { scoreFreshness } from "./scorers/freshness.js";
import { scoreLocality } from "./scorers/locality.js";

interface ScoredPattern {
  id: string;
  index: number;
  score: number;
  breakdown: Breakdown;
}

export class ParallelScorer {
  private workerPool: Worker[] = [];
  private workerQueue: Array<(worker: Worker) => void> = [];
  private isNode: boolean;

  constructor(private poolSize: number = os.cpus().length) {
    // Check if we're in Node.js environment
    this.isNode =
      typeof process !== "undefined" &&
      process.versions !== undefined &&
      process.versions.node !== undefined;
  }

  async scorePatterns(
    patterns: PatternMeta[],
    candidateIndices: number[],
    signals: Signals,
    config: RankingConfig,
  ): Promise<ScoredPattern[]> {
    // For browser or small batches, use single-threaded scoring
    if (!this.isNode || candidateIndices.length < 100) {
      return this.scoreSingleThreaded(
        patterns,
        candidateIndices,
        signals,
        config,
      );
    }

    // Initialize worker pool
    await this.initializePool();

    // Chunk candidates for parallel processing
    const chunkSize = Math.ceil(candidateIndices.length / this.poolSize);
    const chunks: number[][] = [];

    for (let i = 0; i < candidateIndices.length; i += chunkSize) {
      chunks.push(candidateIndices.slice(i, i + chunkSize));
    }

    // Process chunks in parallel
    const promises = chunks.map((chunk) =>
      this.processChunk(patterns, chunk, signals, config),
    );

    const results = await Promise.all(promises);

    // Flatten results
    return results.flat();
  }

  private async scoreSingleThreaded(
    patterns: PatternMeta[],
    candidateIndices: number[],
    signals: Signals,
    config: RankingConfig,
  ): Promise<ScoredPattern[]> {
    const results: ScoredPattern[] = [];
    const caches = {
      path: new Map<string, number>(),
      semver: new Map<string, boolean>(),
      wilson: new Map<string, number>(),
    };

    for (const index of candidateIndices) {
      const pattern = patterns[index];
      const scored = this.scoreOne(pattern, signals, config, caches);
      results.push({
        id: pattern.id,
        index,
        score: scored.score,
        breakdown: scored.breakdown,
      });
    }

    return results;
  }

  private scoreOne(
    pattern: PatternMeta,
    signals: Signals,
    config: RankingConfig,
    caches: {
      path?: Map<string, number>;
      semver?: Map<string, boolean>;
      wilson?: Map<string, number>;
    },
  ): { score: number; breakdown: Breakdown } {
    // Score each component
    const scopeResult = scoreScope(pattern, signals, caches);

    // Policy boost
    const policyPoints =
      pattern.type === "POLICY" &&
      (scopeResult.raw > 0 || !config.policyBoostRequiresScope)
        ? 20
        : 0;

    const trustResult = scoreTrust(pattern, caches.wilson);
    const freshnessResult = scoreFreshness(
      pattern,
      Date.now(),
      config.halfLifeDefaultDays,
    );
    const localityResult = scoreLocality(pattern, signals);

    // Calculate weighted score
    const score =
      config.weights.scope * scopeResult.points +
      config.weights.policy * policyPoints +
      config.weights.trust * trustResult.points +
      config.weights.freshness * freshnessResult.points +
      config.weights.locality * localityResult.points;

    return {
      score,
      breakdown: {
        scope: scopeResult,
        policy: { points: policyPoints },
        trust: trustResult,
        freshness: freshnessResult,
        locality: localityResult,
      },
    };
  }

  private async initializePool(): Promise<void> {
    if (this.workerPool.length > 0) return;

    // In production, would create actual worker threads
    // For now, we'll use the single-threaded implementation
    // Real implementation would involve creating worker.js files
  }

  private async processChunk(
    patterns: PatternMeta[],
    indices: number[],
    signals: Signals,
    config: RankingConfig,
  ): Promise<ScoredPattern[]> {
    // For now, use single-threaded implementation
    return this.scoreSingleThreaded(patterns, indices, signals, config);
  }

  async shutdown(): Promise<void> {
    // Cleanup worker pool
    for (const worker of this.workerPool) {
      await worker.terminate();
    }
    this.workerPool = [];
  }
}
