import {
  Signals,
  RankedPattern,
  RankingConfig,
  defaultConfig,
  PatternMeta,
  ScoringCache,
  CacheEntry,
} from "./types.js";
import { CandidateGenerator } from "./candidate-generator.js";
import { ParallelScorer } from "./parallel-scorer.js";
import { BoundedMaxHeap } from "./utils/heap.js";
import { createHash } from "crypto";

export * from "./types.js";

export class PatternRanker {
  private candidateGenerator: CandidateGenerator;
  private parallelScorer: ParallelScorer;
  private cache: ScoringCache;
  private config: RankingConfig;

  constructor(
    private patterns: PatternMeta[],
    config: Partial<RankingConfig> = {},
  ) {
    this.config = { ...defaultConfig, ...config };
    this.candidateGenerator = new CandidateGenerator(patterns);
    this.parallelScorer = new ParallelScorer();
    this.cache = {
      query: new Map(),
      semver: new Map(),
      path: new Map(),
      wilson: new Map(),
    };
  }

  async rank(signals: Signals, k: number = 10): Promise<RankedPattern[]> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = this.getCacheKey(signals);
    const cached = this.cache.query.get(cacheKey);

    if (cached && cached.length > 0) {
      const age = Date.now() - cached[0].timestamp;
      if (age < 30 * 60 * 1000) {
        // 30 minute TTL
        return cached.slice(0, k).map((entry) => ({
          id: entry.score.toString(), // Need to fix this
          score: entry.score,
          explain: entry.breakdown,
        }));
      }
    }

    // Generate candidates
    const candidateIndices = this.candidateGenerator.generate(
      signals,
      this.config.candidateCap,
    );

    if (process.env.DEBUG) {
      console.log("Candidate indices:", candidateIndices);
    }

    // Score candidates in parallel
    const scored = await this.parallelScorer.scorePatterns(
      this.patterns,
      candidateIndices,
      signals,
      this.config,
    );

    if (process.env.DEBUG) {
      console.log("Scored patterns:", scored.length);
    }

    // Use bounded heap for top-K selection
    const heap = new BoundedMaxHeap<RankedPattern>(k, (item) => item.score);

    for (const item of scored) {
      heap.pushIfTopK({
        id: item.id,
        score: item.score,
        explain: item.breakdown,
      });
    }

    // Get sorted results
    const results = heap.toSortedArrayDesc();

    // Apply tie-breakers
    results.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.001) {
        // Tie-breaker 1: Higher scope score
        const scopeDiff = b.explain.scope.points - a.explain.scope.points;
        if (Math.abs(scopeDiff) > 0.001) return scopeDiff > 0 ? 1 : -1;

        // Tie-breaker 2: Higher trust score
        const trustDiff = b.explain.trust.points - a.explain.trust.points;
        if (Math.abs(trustDiff) > 0.001) return trustDiff > 0 ? 1 : -1;

        // Tie-breaker 3: Lexicographic ID
        return a.id.localeCompare(b.id);
      }
      return b.score - a.score;
    });

    // Cache results
    const cacheEntries: CacheEntry[] = results.map((r) => ({
      score: r.score,
      breakdown: r.explain,
      timestamp: Date.now(),
    }));
    this.cache.query.set(cacheKey, cacheEntries);

    // Log metrics
    const duration = Date.now() - startTime;
    if (process.env.DEBUG) {
      console.log(`Pattern ranking completed in ${duration}ms`);
      console.log(`Candidates: ${candidateIndices.length}`);
      console.log(`Results: ${results.length}`);
    }

    return results;
  }

  private getCacheKey(signals: Signals): string {
    // Create deterministic cache key
    const normalized = {
      paths: signals.paths.slice().sort(),
      languages: signals.languages.slice().sort(),
      frameworks: signals.frameworks
        .map((f) => `${f.name}@${f.version || "*"}`)
        .sort(),
      repo: signals.repo || "",
      org: signals.org || "",
    };

    const json = JSON.stringify(normalized);
    return createHash("sha256").update(json).digest("hex");
  }

  async shutdown(): Promise<void> {
    await this.parallelScorer.shutdown();
  }
}

// Convenience function
export async function rankPatterns(
  patterns: PatternMeta[],
  signals: Signals,
  k: number = 10,
  config?: Partial<RankingConfig>,
): Promise<RankedPattern[]> {
  const ranker = new PatternRanker(patterns, config);
  try {
    return await ranker.rank(signals, k);
  } finally {
    await ranker.shutdown();
  }
}
