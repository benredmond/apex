import { PatternMeta } from '../types.js';
import { BetaBernoulliTrustModel } from '../../trust/index.js';
import { JSONStorageAdapter } from '../../trust/storage-adapter.js';

const Z_95 = 1.96; // 95% confidence interval
const DEFAULT_ALPHA = 3;
const DEFAULT_BETA = 2;

// Singleton instance of Beta-Bernoulli model
let trustModel: BetaBernoulliTrustModel | null = null;

function getTrustModel(): BetaBernoulliTrustModel {
  if (!trustModel) {
    const storage = new JSONStorageAdapter();
    trustModel = new BetaBernoulliTrustModel(storage, {
      defaultAlpha: DEFAULT_ALPHA,
      defaultBeta: DEFAULT_BETA,
      defaultHalfLife: 90,
      enableCache: true,
    });
  }
  return trustModel;
}

export function wilsonLowerBound(alpha: number, beta: number): number {
  const n = alpha + beta;
  
  if (n === 0) {
    return 0.3; // Default trust for new patterns
  }
  
  const pHat = alpha / n;
  const z2 = Z_95 * Z_95;
  
  const numerator = pHat + z2 / (2 * n) - Z_95 * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * n)) / n);
  const denominator = 1 + z2 / n;
  
  return numerator / denominator;
}

export function scoreTrust(pattern: PatternMeta, cache?: Map<string, number>): { points: number; alpha: number; beta: number; wilson: number } {
  // Get alpha/beta from pattern or use defaults
  let alpha = pattern.trust?.alpha ?? DEFAULT_ALPHA;
  let beta = pattern.trust?.beta ?? DEFAULT_BETA;
  
  // If pattern has a trust score but no alpha/beta, derive them
  if (pattern.trust?.score !== undefined && alpha === DEFAULT_ALPHA && beta === DEFAULT_BETA) {
    // Estimate from trust score (assumes reasonable usage count)
    const score = pattern.trust.score;
    const estimatedUsage = 10; // Reasonable default
    alpha = Math.round(score * estimatedUsage);
    beta = Math.round((1 - score) * estimatedUsage);
  }
  
  // Check cache first
  const cacheKey = `${alpha},${beta}`;
  let wilson = cache?.get(cacheKey);
  
  if (wilson === undefined) {
    // Use Wilson lower bound for conservative trust estimate
    // The full Beta-Bernoulli model is available via getTrustModel()
    // for more advanced features like confidence intervals and decay
    wilson = wilsonLowerBound(alpha, beta);
    cache?.set(cacheKey, wilson);
  }
  
  const points = 30 * wilson;
  
  return {
    points: Math.round(points * 10) / 10, // Round to 1 decimal
    alpha,
    beta,
    wilson: Math.round(wilson * 1000) / 1000, // Round to 3 decimals
  };
}