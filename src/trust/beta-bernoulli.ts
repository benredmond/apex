/**
 * Beta-Bernoulli Trust Model Implementation
 * Core statistical calculations for pattern trust scoring
 */

import {
  TrustScore,
  TrustUpdate,
  BatchUpdateResult,
  TrustPrior,
  TrustModel,
  TrustModelConfig,
  PatternTypeConfig,
  PatternStorage,
} from "./types.js";
import { applyDecay, calculateDecayFactor } from "./decay.js";
import { BatchProcessor } from "./batch-processor.js";

// Constants
const Z_95 = 1.96; // 95% confidence interval

export class BetaBernoulliTrustModel implements TrustModel {
  private config: TrustModelConfig;
  private storage: PatternStorage;
  private batchProcessor: BatchProcessor;
  private cache: Map<string, any>;

  constructor(storage: PatternStorage, config?: Partial<TrustModelConfig>) {
    this.storage = storage;
    this.config = {
      defaultAlpha: 1,
      defaultBeta: 1,
      defaultHalfLife: 90,
      confidenceLevel: 0.95,
      enableCache: true,
      maxCacheSize: 1000,
      patternTypeConfig: new Map(),
      ...config,
    };

    this.batchProcessor = new BatchProcessor(storage);
    this.cache = new Map();
  }

  /**
   * Calculate trust score from success/failure counts
   */
  calculateTrust(successes: number, failures: number): TrustScore {
    // Validate inputs
    if (!Number.isFinite(successes) || successes < 0) {
      throw new Error(`Invalid successes: ${successes}`);
    }
    if (!Number.isFinite(failures) || failures < 0) {
      throw new Error(`Invalid failures: ${failures}`);
    }

    // Add priors
    const alpha = this.config.defaultAlpha + successes;
    const beta = this.config.defaultBeta + failures;

    // Mean of Beta distribution
    const value = alpha / (alpha + beta);

    // Wilson lower bound for compatibility
    const wilsonLower = this.calculateWilsonLowerBound(alpha, beta);

    // Confidence interval
    const interval = this.calculateConfidenceInterval(alpha, beta);

    // Confidence measure (inverse of interval width)
    const intervalWidth = interval[1] - interval[0];
    const confidence = 1 - intervalWidth;

    // Total samples (excluding priors)
    const samples = successes + failures;

    return {
      value,
      confidence,
      samples,
      interval,
      wilsonLower,
      lastUpdated: new Date(),
      decayApplied: false,
      alpha,
      beta,
    };
  }

  /**
   * Update trust score for a pattern
   */
  async updateTrust(patternId: string, outcome: boolean): Promise<TrustScore> {
    const pattern = await this.storage.getPattern(patternId);

    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Get current parameters
    let { alpha, beta } = pattern.trust;

    // Apply decay if needed
    const lastUpdated = new Date(pattern.trust.lastUpdated);
    const daysSinceUpdate =
      (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 1) {
      const decayed = this.applyDecayToParameters(
        alpha,
        beta,
        daysSinceUpdate,
        pattern.type,
      );
      alpha = decayed.alpha;
      beta = decayed.beta;
    }

    // Update based on outcome
    if (outcome) {
      alpha += 1;
    } else {
      beta += 1;
    }

    // Calculate new trust score
    const trustScore = this.calculateTrustFromParameters(alpha, beta);

    // Update storage
    await this.storage.updatePattern(patternId, {
      trust: {
        alpha,
        beta,
        lastUpdated: new Date().toISOString(),
        decayApplied: daysSinceUpdate > 1,
      },
    });

    // Invalidate cache
    this.invalidateCache(patternId);

    return trustScore;
  }

  /**
   * Get confidence interval for a pattern
   */
  async getConfidenceInterval(patternId: string): Promise<[number, number]> {
    const cacheKey = `ci_${patternId}`;

    if (this.config.enableCache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const pattern = await this.storage.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const interval = this.calculateConfidenceInterval(
      pattern.trust.alpha,
      pattern.trust.beta,
    );

    if (this.config.enableCache) {
      this.setCache(cacheKey, interval);
    }

    return interval;
  }

  /**
   * Get quantile for a pattern's Beta distribution
   */
  async getQuantile(patternId: string, p: number): Promise<number> {
    if (!patternId || typeof patternId !== "string") {
      throw new Error("Pattern ID must be a non-empty string");
    }
    if (p < 0 || p > 1) {
      throw new Error("Quantile p must be between 0 and 1");
    }

    const pattern = await this.storage.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    return this.betaQuantile(p, pattern.trust.alpha, pattern.trust.beta);
  }

  /**
   * Apply time decay to a pattern's trust
   */
  async decayTrust(patternId: string, days: number): Promise<void> {
    const pattern = await this.storage.getPattern(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const decayed = this.applyDecayToParameters(
      pattern.trust.alpha,
      pattern.trust.beta,
      days,
      pattern.type,
    );

    await this.storage.updatePattern(patternId, {
      trust: {
        ...pattern.trust,
        alpha: decayed.alpha,
        beta: decayed.beta,
        decayApplied: true,
      },
    });

    this.invalidateCache(patternId);
  }

  /**
   * Set half-life for a pattern type
   */
  setHalfLife(patternType: string, days: number): void {
    const typeConfig = this.config.patternTypeConfig?.get(patternType) || {};
    typeConfig.halfLife = days;
    this.config.patternTypeConfig?.set(patternType, typeConfig);
  }

  /**
   * Batch update multiple patterns
   */
  async batchUpdate(updates: TrustUpdate[]): Promise<BatchUpdateResult> {
    return await this.batchProcessor.processBatch(updates, this);
  }

  /**
   * Set prior for a pattern type
   */
  setPrior(patternType: string, alpha: number, beta: number): void {
    const typeConfig = this.config.patternTypeConfig?.get(patternType) || {};
    typeConfig.prior = { alpha, beta, source: "configured" };
    this.config.patternTypeConfig?.set(patternType, typeConfig);
  }

  /**
   * Get prior based on similar patterns
   */
  async getSimilarPatternPrior(patternId: string): Promise<TrustPrior> {
    // For now, return default prior
    // TODO: Implement similarity-based prior selection
    return {
      alpha: this.config.defaultAlpha,
      beta: this.config.defaultBeta,
      source: "default",
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): TrustModelConfig {
    return { ...this.config };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // Private helper methods

  private calculateTrustFromParameters(
    alpha: number,
    beta: number,
  ): TrustScore {
    const value = alpha / (alpha + beta);
    const wilsonLower = this.calculateWilsonLowerBound(alpha, beta);
    const interval = this.calculateConfidenceInterval(alpha, beta);
    const confidence = 1 - (interval[1] - interval[0]);
    const samples =
      alpha + beta - this.config.defaultAlpha - this.config.defaultBeta;

    return {
      value,
      confidence,
      samples: Math.max(0, samples),
      interval,
      wilsonLower,
      lastUpdated: new Date(),
      decayApplied: false,
      alpha,
      beta,
    };
  }

  private calculateWilsonLowerBound(alpha: number, beta: number): number {
    const n = alpha + beta;

    if (
      n === 0 ||
      (alpha === this.config.defaultAlpha && beta === this.config.defaultBeta)
    ) {
      // Calculate from priors instead of magic number
      return (
        this.config.defaultAlpha /
        (this.config.defaultAlpha + this.config.defaultBeta)
      );
    }

    const pHat = alpha / n;
    const z2 = Z_95 * Z_95;

    const numerator =
      pHat +
      z2 / (2 * n) -
      Z_95 * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * n)) / n);
    const denominator = 1 + z2 / n;

    return numerator / denominator;
  }

  private calculateConfidenceInterval(
    alpha: number,
    beta: number,
  ): [number, number] {
    const lower = this.betaQuantile(0.025, alpha, beta);
    const upper = this.betaQuantile(0.975, alpha, beta);
    return [lower, upper];
  }

  /**
   * Beta distribution quantile function (inverse CDF)
   * Uses binary search for simplicity - could be optimized with better algorithms
   */
  private betaQuantile(p: number, alpha: number, beta: number): number {
    // For extreme values, use approximations
    if (alpha === 1 && beta === 1) {
      return p; // Uniform distribution
    }

    // Binary search for the quantile
    let low = 0;
    let high = 1;
    let mid = 0.5;
    const tolerance = 1e-6;
    const maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      mid = (low + high) / 2;
      const cdf = this.betaCDF(mid, alpha, beta);

      if (Math.abs(cdf - p) < tolerance) {
        break;
      }

      if (cdf < p) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return mid;
  }

  /**
   * Beta distribution CDF approximation
   * Uses regularized incomplete beta function approximation
   */
  private betaCDF(x: number, alpha: number, beta: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // For small alpha and beta, use series expansion
    if (alpha < 10 && beta < 10) {
      return this.regularizedBetaIncomplete(x, alpha, beta);
    }

    // For larger values, use normal approximation
    const mean = alpha / (alpha + beta);
    const variance =
      (alpha * beta) / ((alpha + beta) * (alpha + beta) * (alpha + beta + 1));
    const z = (x - mean) / Math.sqrt(variance);

    // Standard normal CDF approximation
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * Regularized incomplete beta function
   * Simple series expansion for small arguments
   */
  private regularizedBetaIncomplete(x: number, a: number, b: number): number {
    if (x < (a + 1) / (a + b + 2)) {
      return this.betaIncompleteSeriesExpansion(x, a, b);
    } else {
      return 1 - this.betaIncompleteSeriesExpansion(1 - x, b, a);
    }
  }

  private betaIncompleteSeriesExpansion(
    x: number,
    a: number,
    b: number,
  ): number {
    const maxTerms = 200;
    let sum = 1.0;
    let term = 1.0;

    for (let i = 1; i < maxTerms; i++) {
      term *= (x * (a + b - 1 + i)) / (a + i - 1);
      sum += term;

      if (Math.abs(term) < 1e-10) {
        break;
      }
    }

    return (
      (Math.pow(x, a) * Math.pow(1 - x, b) * sum) /
      (a * this.betaFunction(a, b))
    );
  }

  private betaFunction(a: number, b: number): number {
    // B(a,b) = Γ(a)Γ(b)/Γ(a+b)
    return Math.exp(this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b));
  }

  private logGamma(z: number): number {
    // Stirling's approximation
    if (z < 0.5) {
      return (
        Math.log(Math.PI) -
        Math.log(Math.sin(Math.PI * z)) -
        this.logGamma(1 - z)
      );
    }

    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];

    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
      x += c[i] / (z + i);
    }

    const t = z + g + 0.5;
    return (
      0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
    );
  }

  private erf(x: number): number {
    // Error function approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private applyDecayToParameters(
    alpha: number,
    beta: number,
    days: number,
    patternType: string,
  ): { alpha: number; beta: number } {
    const halfLife = this.getHalfLife(patternType);
    return applyDecay(
      alpha,
      beta,
      days,
      halfLife,
      this.config.defaultAlpha,
      this.config.defaultBeta,
    );
  }

  private getHalfLife(patternType: string): number {
    const typeConfig = this.config.patternTypeConfig?.get(patternType);
    return typeConfig?.halfLife || this.config.defaultHalfLife;
  }

  private setCache(key: string, value: any): void {
    if (this.cache.size >= this.config.maxCacheSize) {
      // Simple LRU: remove first entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  private invalidateCache(patternId: string): void {
    // Remove all cache entries for this pattern
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(patternId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
  }
}
