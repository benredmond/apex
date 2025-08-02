/**
 * Beta-Bernoulli Trust Model
 * Main module exports
 */

export * from "./types.js";
export * from "./beta-bernoulli.js";
export * from "./decay.js";
export * from "./batch-processor.js";
export * from "./visualization.js";

// Re-export main class as default
export { BetaBernoulliTrustModel as default } from "./beta-bernoulli.js";

// Convenience factory function
import { BetaBernoulliTrustModel } from "./beta-bernoulli.js";
import { PatternStorage, TrustModelConfig } from "./types.js";

export function createTrustModel(
  storage: PatternStorage,
  config?: Partial<TrustModelConfig>,
): BetaBernoulliTrustModel {
  return new BetaBernoulliTrustModel(storage, config);
}
