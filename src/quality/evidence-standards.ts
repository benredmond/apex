/**
 * Evidence quality standards and tracking
 * [APE-29] Implements evidence quality metrics for patterns
 */

import { PatternRepository } from "../storage/repository.js";

export interface EvidenceMetrics {
  totalUses: number;
  successfulUses: number;
  failedUses: number;
  automatedTestPasses: number;
  manualVerifications: number;
  productionUsages: number;
  qualityScore: number; // Weighted score (0-1)
}

export interface EvidenceEntry {
  patternId: string;
  timestamp: Date;
  type: EvidenceType;
  outcome: "success" | "failure";
  context?: {
    taskId?: string;
    environment?: "test" | "development" | "production";
    automated?: boolean;
  };
}

export enum EvidenceType {
  AUTOMATED_TEST = "automated_test",
  MANUAL_VERIFICATION = "manual_verification",
  PRODUCTION_USAGE = "production_usage",
  DEVELOPMENT_USAGE = "development_usage",
  CI_VALIDATION = "ci_validation",
}

export class EvidenceStandards {
  private repository: PatternRepository;
  private evidenceWeights: Map<EvidenceType, number>;
  private minimumEvidenceForPromotion: number;

  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.minimumEvidenceForPromotion = 3;

    // Initialize evidence weights
    this.evidenceWeights = new Map([
      [EvidenceType.AUTOMATED_TEST, 1.0],
      [EvidenceType.PRODUCTION_USAGE, 1.0],
      [EvidenceType.CI_VALIDATION, 0.9],
      [EvidenceType.MANUAL_VERIFICATION, 0.8],
      [EvidenceType.DEVELOPMENT_USAGE, 0.6],
    ]);
  }

  /**
   * Calculate evidence quality score for a pattern
   */
  async calculateEvidenceQuality(patternId: string): Promise<number> {
    const pattern = await this.repository.getByIdOrAlias(patternId);
    if (!pattern) {
      return 0;
    }

    // Get evidence metrics from pattern metadata
    const metrics = this.extractEvidenceMetrics(pattern);

    // Calculate quality score
    return this.computeQualityScore(metrics);
  }

  /**
   * Extract evidence metrics from pattern metadata
   */
  private extractEvidenceMetrics(pattern: any): EvidenceMetrics {
    const metadata = pattern.metadata || {};

    return {
      totalUses: metadata.usageCount || 0,
      successfulUses: metadata.successCount || 0,
      failedUses: (metadata.usageCount || 0) - (metadata.successCount || 0),
      automatedTestPasses: metadata.automatedTestPasses || 0,
      manualVerifications: metadata.manualVerifications || 0,
      productionUsages: metadata.productionUsages || 0,
      qualityScore: 0, // Will be calculated
    };
  }

  /**
   * Compute quality score from evidence metrics
   */
  private computeQualityScore(metrics: EvidenceMetrics): number {
    // No evidence means no quality
    if (metrics.totalUses === 0) {
      return 0;
    }

    // Calculate success rate
    const successRate = metrics.successfulUses / metrics.totalUses;

    // Calculate evidence diversity score
    const diversityScore = this.calculateDiversityScore(metrics);

    // Calculate evidence quantity score (logarithmic scale)
    const quantityScore = this.calculateQuantityScore(metrics.totalUses);

    // Calculate weighted evidence score
    const weightedScore = this.calculateWeightedScore(metrics);

    // Combine scores with weights
    const qualityScore =
      successRate * 0.4 + // 40% weight on success rate
      diversityScore * 0.2 + // 20% weight on diversity
      quantityScore * 0.2 + // 20% weight on quantity
      weightedScore * 0.2; // 20% weight on evidence quality

    return Math.min(Math.max(qualityScore, 0), 1); // Clamp to [0, 1]
  }

  /**
   * Calculate diversity of evidence types
   */
  private calculateDiversityScore(metrics: EvidenceMetrics): number {
    let typesPresent = 0;

    if (metrics.automatedTestPasses > 0) typesPresent++;
    if (metrics.manualVerifications > 0) typesPresent++;
    if (metrics.productionUsages > 0) typesPresent++;

    // More diverse evidence = higher score
    return typesPresent / 3; // Max 3 types tracked
  }

  /**
   * Calculate quantity score (logarithmic)
   */
  private calculateQuantityScore(totalUses: number): number {
    if (totalUses === 0) return 0;

    // Logarithmic scale: 3 uses = 0.5, 10 uses = 0.7, 100 uses = 0.9
    const score = Math.log10(totalUses + 1) / Math.log10(101);
    return Math.min(score, 1);
  }

  /**
   * Calculate weighted score based on evidence quality
   */
  private calculateWeightedScore(metrics: EvidenceMetrics): number {
    const totalWeightedEvidence =
      metrics.automatedTestPasses *
        this.evidenceWeights.get(EvidenceType.AUTOMATED_TEST)! +
      metrics.manualVerifications *
        this.evidenceWeights.get(EvidenceType.MANUAL_VERIFICATION)! +
      metrics.productionUsages *
        this.evidenceWeights.get(EvidenceType.PRODUCTION_USAGE)!;

    const maxPossibleWeight = metrics.totalUses * 1.0; // Max weight is 1.0

    if (maxPossibleWeight === 0) return 0;

    return Math.min(totalWeightedEvidence / maxPossibleWeight, 1);
  }

  /**
   * Check if pattern meets evidence standards for promotion
   */
  async meetsPromotionStandards(patternId: string): Promise<{
    meets: boolean;
    reason?: string;
    metrics?: EvidenceMetrics;
  }> {
    const pattern = await this.repository.getByIdOrAlias(patternId);
    if (!pattern) {
      return {
        meets: false,
        reason: "Pattern not found",
      };
    }

    const metrics = this.extractEvidenceMetrics(pattern);

    // Check minimum usage requirement
    if (metrics.totalUses < this.minimumEvidenceForPromotion) {
      return {
        meets: false,
        reason: `Insufficient evidence: ${metrics.totalUses}/${this.minimumEvidenceForPromotion} uses`,
        metrics,
      };
    }

    // Check success rate (must be > 80%)
    const successRate = metrics.successfulUses / metrics.totalUses;
    if (successRate < 0.8) {
      return {
        meets: false,
        reason: `Success rate too low: ${(successRate * 100).toFixed(1)}% (minimum 80%)`,
        metrics,
      };
    }

    // Check evidence quality score
    const qualityScore = this.computeQualityScore(metrics);
    if (qualityScore < 0.6) {
      return {
        meets: false,
        reason: `Evidence quality too low: ${(qualityScore * 100).toFixed(1)}% (minimum 60%)`,
        metrics,
      };
    }

    return {
      meets: true,
      metrics,
    };
  }

  /**
   * Record new evidence for a pattern
   */
  async recordEvidence(entry: EvidenceEntry): Promise<void> {
    const pattern = await this.repository.getByIdOrAlias(entry.patternId);
    if (!pattern) {
      throw new Error(`Pattern ${entry.patternId} not found`);
    }

    // Update pattern metadata based on evidence type
    const updates: any = {
      usage_count: (pattern.usage_count || 0) + 1,
      updated_at: entry.timestamp.toISOString(),
      last_activity_at: entry.timestamp.toISOString(),
    };

    if (entry.outcome === "success") {
      updates.success_count = (pattern.success_count || 0) + 1;
    }

    // Track specific evidence types
    switch (entry.type) {
      case EvidenceType.AUTOMATED_TEST:
        if (entry.outcome === "success") {
          updates.automatedTestPasses =
            ((pattern as any).automatedTestPasses || 0) + 1;
        }
        break;
      case EvidenceType.MANUAL_VERIFICATION:
        updates.manualVerifications =
          ((pattern as any).manualVerifications || 0) + 1;
        break;
      case EvidenceType.PRODUCTION_USAGE:
        updates.productionUsages = ((pattern as any).productionUsages || 0) + 1;
        break;
    }

    // Update pattern in repository - use updateQualityMetadata for quality fields
    await this.repository.updateQualityMetadata(entry.patternId, {
      lastActivityAt: updates.last_activity_at,
    });
    // Update regular metadata for counts
    delete updates.last_activity_at;
    await this.repository.update(entry.patternId, updates);
  }

  /**
   * Get evidence summary for a pattern
   */
  async getEvidenceSummary(patternId: string): Promise<{
    metrics: EvidenceMetrics;
    qualityScore: number;
    meetsStandards: boolean;
    recommendation: string;
  }> {
    const pattern = await this.repository.getByIdOrAlias(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    const metrics = this.extractEvidenceMetrics(pattern);
    const qualityScore = this.computeQualityScore(metrics);
    const promotionCheck = await this.meetsPromotionStandards(patternId);

    let recommendation = "";
    if (metrics.totalUses === 0) {
      recommendation = "Pattern needs initial usage evidence";
    } else if (metrics.totalUses < this.minimumEvidenceForPromotion) {
      recommendation = `Needs ${this.minimumEvidenceForPromotion - metrics.totalUses} more uses for promotion`;
    } else if (metrics.successfulUses / metrics.totalUses < 0.8) {
      recommendation = "Improve success rate before promotion";
    } else if (!promotionCheck.meets) {
      recommendation =
        promotionCheck.reason || "Does not meet promotion standards";
    } else {
      recommendation = "Ready for promotion";
    }

    return {
      metrics,
      qualityScore,
      meetsStandards: promotionCheck.meets,
      recommendation,
    };
  }

  /**
   * Set custom evidence weight
   */
  setEvidenceWeight(type: EvidenceType, weight: number): void {
    if (weight < 0 || weight > 1) {
      throw new Error("Evidence weight must be between 0 and 1");
    }
    this.evidenceWeights.set(type, weight);
  }

  /**
   * Set minimum evidence threshold for promotion
   */
  setPromotionThreshold(threshold: number): void {
    if (threshold < 1) {
      throw new Error("Promotion threshold must be at least 1");
    }
    this.minimumEvidenceForPromotion = threshold;
  }
}
