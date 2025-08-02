/**
 * APEX Intelligence - Trust Calculator
 * Calculates and manages trust scores for patterns
 * Enhanced with Beta-Bernoulli statistical model
 */

import { BetaBernoulliTrustModel } from "../trust/index.js";
import { JSONStorageAdapter } from "../trust/storage-adapter.js";

export class TrustCalculator {
  constructor(config = {}) {
    this.config = {
      baseWeight: 0.5, // Base weight for success rate
      usageWeight: 0.3, // Weight for usage count
      recencyWeight: 0.2, // Weight for recency
      minUsageForTrust: 3, // Minimum uses before trust is meaningful
      decayDays: 90, // Days before trust starts decaying
      useBetaBernoulli: true, // Use statistical model
      ...config,
    };

    // Initialize Beta-Bernoulli model if enabled
    if (this.config.useBetaBernoulli) {
      const storage = new JSONStorageAdapter(config.metadataPath);
      this.betaModel = new BetaBernoulliTrustModel(storage, {
        defaultAlpha: 3, // Match existing defaults
        defaultBeta: 2,
        defaultHalfLife: this.config.decayDays,
      });
    }
  }

  /**
   * Calculate trust score from multiple factors
   */
  calculate(stats) {
    if (!stats || stats.uses === 0) return 0;

    // Use Beta-Bernoulli model if available
    if (this.config.useBetaBernoulli && this.betaModel) {
      const failures = stats.uses - stats.successes;
      const trust = this.betaModel.calculateTrust(stats.successes, failures);

      // Apply recency weighting if needed
      if (this.config.recencyWeight > 0 && stats.lastUsed) {
        const recencyFactor = this.calculateRecencyFactor(stats.lastUsed);
        const recencyAdjusted =
          trust.value * (1 - this.config.recencyWeight) +
          recencyFactor * this.config.recencyWeight;
        return Math.min(recencyAdjusted, 1.0);
      }

      return trust.value;
    }

    // Fallback to legacy calculation
    const successRate = stats.successes / stats.uses;
    const usageFactor = this.calculateUsageFactor(stats.uses);
    const recencyFactor = this.calculateRecencyFactor(stats.lastUsed);

    const trustScore =
      successRate * this.config.baseWeight +
      usageFactor * this.config.usageWeight +
      recencyFactor * this.config.recencyWeight;

    if (stats.uses < this.config.minUsageForTrust) {
      return trustScore * (stats.uses / this.config.minUsageForTrust);
    }

    return Math.min(trustScore, 1.0);
  }

  /**
   * Calculate usage factor (0-1 scale)
   * Uses logarithmic scale to prevent overweighting high usage
   */
  calculateUsageFactor(uses) {
    if (uses <= 0) return 0;

    // Logarithmic scale: 10 uses = 0.5, 100 uses = 0.75, 1000 uses = 0.875
    const factor = 1 - Math.pow(0.5, Math.log10(uses));
    return Math.min(factor, 1.0);
  }

  /**
   * Calculate recency factor (0-1 scale)
   * Recent usage increases trust
   */
  calculateRecencyFactor(lastUsed) {
    if (!lastUsed) return 0.5; // Neutral if never used

    const daysSinceUse =
      (Date.now() - new Date(lastUsed)) / (1000 * 60 * 60 * 24);

    if (daysSinceUse < 1) return 1.0; // Used today
    if (daysSinceUse < 7) return 0.9; // Used this week
    if (daysSinceUse < 30) return 0.8; // Used this month
    if (daysSinceUse < this.config.decayDays) return 0.7; // Used recently

    // Decay factor for old patterns
    const decayFactor = Math.max(0.5, 1 - daysSinceUse / 365);
    return decayFactor;
  }

  /**
   * Get confidence level from trust score
   */
  getConfidenceLevel(trustScore) {
    if (trustScore >= 0.95) return "VERY_HIGH";
    if (trustScore >= 0.85) return "HIGH";
    if (trustScore >= 0.7) return "MEDIUM";
    if (trustScore >= 0.5) return "LOW";
    return "VERY_LOW";
  }

  /**
   * Get human-readable trust explanation
   */
  explainTrust(stats, trustScore) {
    const confidence = this.getConfidenceLevel(trustScore);
    const successRate =
      stats.uses > 0 ? ((stats.successes / stats.uses) * 100).toFixed(1) : 0;

    const explanations = {
      VERY_HIGH: `Highly trusted pattern with ${successRate}% success rate across ${stats.uses} uses`,
      HIGH: `Reliable pattern with ${successRate}% success rate in ${stats.uses} uses`,
      MEDIUM: `Moderately trusted with ${successRate}% success rate from ${stats.uses} uses`,
      LOW: `Limited trust - ${successRate}% success rate with only ${stats.uses} uses`,
      VERY_LOW: `Unproven pattern - insufficient usage data (${stats.uses} uses)`,
    };

    return explanations[confidence];
  }

  /**
   * Calculate trust delta between two measurements
   */
  calculateDelta(oldStats, newStats) {
    const oldTrust = this.calculate(oldStats);
    const newTrust = this.calculate(newStats);

    return {
      absolute: newTrust - oldTrust,
      percentage: oldStats ? ((newTrust - oldTrust) / oldTrust) * 100 : 100,
      direction:
        newTrust > oldTrust
          ? "improving"
          : newTrust < oldTrust
            ? "declining"
            : "stable",
    };
  }

  /**
   * Predict trust score after N additional uses
   */
  predictTrust(currentStats, additionalUses, expectedSuccessRate) {
    const futureStats = {
      ...currentStats,
      uses: currentStats.uses + additionalUses,
      successes: currentStats.successes + additionalUses * expectedSuccessRate,
      lastUsed: new Date().toISOString(),
    };

    return {
      current: this.calculate(currentStats),
      predicted: this.calculate(futureStats),
      usesNeeded: this.calculateUsesForTarget(
        currentStats,
        0.8,
        expectedSuccessRate,
      ),
    };
  }

  /**
   * Calculate uses needed to reach target trust score
   */
  calculateUsesForTarget(currentStats, targetTrust, expectedSuccessRate) {
    let uses = 0;
    let testStats = { ...currentStats };

    while (this.calculate(testStats) < targetTrust && uses < 1000) {
      uses++;
      testStats.uses++;
      testStats.successes += expectedSuccessRate;
      testStats.lastUsed = new Date().toISOString();
    }

    return uses < 1000 ? uses : null;
  }

  /**
   * Get confidence interval for a pattern (Beta-Bernoulli only)
   */
  async getConfidenceInterval(patternId) {
    if (!this.betaModel) {
      throw new Error("Beta-Bernoulli model not enabled");
    }
    return await this.betaModel.getConfidenceInterval(patternId);
  }

  /**
   * Get full trust score with confidence (Beta-Bernoulli only)
   */
  calculateWithConfidence(stats) {
    if (!stats || stats.uses === 0) {
      return {
        value: 0,
        confidence: 0,
        interval: [0, 0],
        samples: 0,
      };
    }

    if (this.betaModel) {
      const failures = stats.uses - stats.successes;
      return this.betaModel.calculateTrust(stats.successes, failures);
    }

    // Fallback for legacy mode
    const value = this.calculate(stats);
    return {
      value,
      confidence: Math.min(stats.uses / 10, 1), // Simple confidence estimate
      interval: [Math.max(0, value - 0.1), Math.min(1, value + 0.1)],
      samples: stats.uses,
    };
  }

  /**
   * Apply time decay to trust scores (Beta-Bernoulli only)
   */
  async applyDecay(patternId, days) {
    if (!this.betaModel) {
      throw new Error("Beta-Bernoulli model not enabled");
    }
    return await this.betaModel.decayTrust(patternId, days);
  }

  /**
   * Update trust with new outcome (Beta-Bernoulli only)
   */
  async updateTrust(patternId, outcome) {
    if (!this.betaModel) {
      throw new Error("Beta-Bernoulli model not enabled");
    }
    return await this.betaModel.updateTrust(patternId, outcome);
  }

  /**
   * Get visualization data for trust distribution
   */
  getVisualization(stats) {
    if (!stats || stats.uses === 0) {
      return {
        trustScore: 0,
        starRating: "☆☆☆☆☆",
        confidence: "VERY_LOW",
        description: "No usage data",
      };
    }

    const trust = this.calculateWithConfidence(stats);
    const stars = Math.round(trust.value * 5);
    const filled = "★".repeat(stars);
    const empty = "☆".repeat(5 - stars);

    return {
      trustScore: trust.value,
      starRating: filled + empty,
      confidence: this.getConfidenceLevel(trust.value),
      confidenceInterval: trust.interval,
      samples: trust.samples,
      description: this.explainTrust(stats, trust.value),
    };
  }
}

export default TrustCalculator;
