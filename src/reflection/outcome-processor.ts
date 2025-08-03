/**
 * Process natural language outcomes to Bayesian trust deltas
 * [PAT:VALIDATION:SCHEMA] ★★★★★ (40+ uses) - Comprehensive validation patterns
 */

import { TrustUpdate, PatternOutcome } from "./types.js";

// Mapping configuration with clear semantics
const OUTCOME_TO_DELTAS: Record<
  PatternOutcome,
  { alpha: number; beta: number }
> = {
  "worked-perfectly": { alpha: 1.0, beta: 0.0 },
  "worked-with-tweaks": { alpha: 0.7, beta: 0.3 },
  "partial-success": { alpha: 0.5, beta: 0.5 },
  "failed-minor-issues": { alpha: 0.3, beta: 0.7 },
  "failed-completely": { alpha: 0.0, beta: 1.0 },
};

export class OutcomeProcessor {
  /**
   * Process a trust update, converting outcome to delta if needed
   */
  static processTrustUpdate(update: TrustUpdate): {
    pattern_id: string;
    delta: { alpha: number; beta: number };
  } {
    // Handle backward compatible delta format
    if (update.delta) {
      // Delta is validated by schema to have both alpha and beta
      return {
        pattern_id: update.pattern_id,
        delta: {
          alpha: update.delta.alpha,
          beta: update.delta.beta,
        },
      };
    }

    // Convert outcome to delta
    if (update.outcome) {
      const delta = OUTCOME_TO_DELTAS[update.outcome];
      return { pattern_id: update.pattern_id, delta };
    }

    // This should never happen due to schema validation
    throw new Error("No delta or outcome provided");
  }

  /**
   * Get human-readable descriptions for each outcome
   */
  static getOutcomeDescriptions(): Record<PatternOutcome, string> {
    return {
      "worked-perfectly": "Pattern worked without modification",
      "worked-with-tweaks": "Pattern worked but needed adaptation",
      "partial-success": "Pattern partially helped",
      "failed-minor-issues": "Pattern had minor problems",
      "failed-completely": "Pattern didn't work at all",
    };
  }

  /**
   * Suggest a valid outcome based on fuzzy matching
   */
  static suggestOutcome(input: string): PatternOutcome | null {
    // Simple fuzzy matching for error messages
    const normalized = input.toLowerCase().replace(/-/g, " ");
    const outcomes = Object.keys(OUTCOME_TO_DELTAS) as PatternOutcome[];

    for (const outcome of outcomes) {
      const outcomeNormalized = outcome.replace(/-/g, " ");

      // Check if input contains outcome or outcome contains input
      if (
        outcomeNormalized.includes(normalized) ||
        normalized.includes(outcomeNormalized)
      ) {
        return outcome;
      }

      // Check for common variations
      if (
        (normalized.includes("perfect") && outcome === "worked-perfectly") ||
        (normalized.includes("tweak") && outcome === "worked-with-tweaks") ||
        (normalized.includes("partial") && outcome === "partial-success") ||
        (normalized.includes("minor") && outcome === "failed-minor-issues") ||
        (normalized.includes("complete") &&
          normalized.includes("fail") &&
          outcome === "failed-completely")
      ) {
        return outcome;
      }
    }

    return null;
  }

  /**
   * Get the delta values for a specific outcome
   */
  static getOutcomeDelta(outcome: PatternOutcome): {
    alpha: number;
    beta: number;
  } {
    return OUTCOME_TO_DELTAS[outcome];
  }

  /**
   * Get all valid outcomes
   */
  static getValidOutcomes(): PatternOutcome[] {
    return Object.keys(OUTCOME_TO_DELTAS) as PatternOutcome[];
  }
}
