/**
 * APEX Intelligence - Trust Calculator
 * Calculates and manages trust scores for patterns
 */

export class TrustCalculator {
  constructor(config = {}) {
    this.config = {
      baseWeight: 0.5, // Base weight for success rate
      usageWeight: 0.3, // Weight for usage count
      recencyWeight: 0.2, // Weight for recency
      minUsageForTrust: 3, // Minimum uses before trust is meaningful
      decayDays: 90, // Days before trust starts decaying
      ...config,
    };
  }

  /**
   * Calculate trust score from multiple factors
   */
  calculate(stats) {
    if (!stats || stats.uses === 0) return 0;

    // Base success rate
    const successRate = stats.successes / stats.uses;

    // Usage factor (logarithmic scale)
    const usageFactor = this.calculateUsageFactor(stats.uses);

    // Recency factor
    const recencyFactor = this.calculateRecencyFactor(stats.lastUsed);

    // Weighted calculation
    const trustScore =
      successRate * this.config.baseWeight +
      usageFactor * this.config.usageWeight +
      recencyFactor * this.config.recencyWeight;

    // Apply minimum usage threshold
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
}

export default TrustCalculator;
