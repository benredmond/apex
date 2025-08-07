/**
 * Pattern Quality Manager - Core orchestration for quality scoring
 * [APE-29] Implements lightweight quality controls for patterns
 */

import { TrustScore } from "../trust/types.js";
import { applyDecay, calculateDecayFactor } from "../trust/decay.js";
import TrustCalculator from "../intelligence/trust-calculator.js";
import { PatternRepository } from "../storage/repository.js";
import { SemverValidator } from "./semver-validator.js";
import { ConflictResolver } from "./conflict-resolver.js";
import { EvidenceStandards } from "./evidence-standards.js";

export interface QualityScore {
  trust: number; // From Beta-Bernoulli model (0-1)
  freshness: number; // Decay factor (0-1)
  evidence: number; // Evidence quality (0-1)
  conflicts: number; // Conflict penalty (0-1)
  overall: number; // Weighted combination (0-1)
  metadata: {
    lastActivity: Date;
    decayApplied: boolean;
    cacheTimestamp: Date;
    quarantineStatus?: {
      isQuarantined: boolean;
      reason?: string;
      date?: Date;
      failureRate?: number;
    };
  };
}

export interface QualityConfig {
  decayRate: number; // Monthly decay multiplier (default: 0.95)
  minimumTrust: number; // Trust floor (default: 0.1)
  evidenceThreshold: number; // Min uses for promotion (default: 3)
  quarantineThreshold: number; // Failure rate for auto-quarantine (default: 0.5)
  cacheTTLMs: number; // Cache TTL in milliseconds (default: 3600000)
  halfLifeDays: number; // Half-life for decay calculations (default: 90)
  weights: {
    trust: number; // Weight for trust component (default: 0.4)
    freshness: number; // Weight for freshness (default: 0.3)
    evidence: number; // Weight for evidence quality (default: 0.2)
    conflicts: number; // Weight for conflict penalty (default: 0.1)
  };
}

export class PatternQualityManager {
  private config: QualityConfig;
  private trustCalculator: TrustCalculator;
  private repository: PatternRepository;
  private semverValidator: SemverValidator;
  private conflictResolver: ConflictResolver;
  private evidenceStandards: EvidenceStandards;
  private qualityCache: Map<string, { score: QualityScore; timestamp: number }>;

  constructor(
    repository: PatternRepository,
    trustCalculator: TrustCalculator,
    config: Partial<QualityConfig> = {},
  ) {
    this.config = {
      decayRate: 0.95,
      minimumTrust: 0.1,
      evidenceThreshold: 3,
      quarantineThreshold: 0.5,
      cacheTTLMs: 3600000, // 1 hour
      halfLifeDays: 90,
      weights: {
        trust: 0.4,
        freshness: 0.3,
        evidence: 0.2,
        conflicts: 0.1,
      },
      ...config,
    };

    this.repository = repository;
    this.trustCalculator = trustCalculator;
    this.semverValidator = new SemverValidator();
    this.conflictResolver = new ConflictResolver(repository);
    this.evidenceStandards = new EvidenceStandards(repository);
    this.qualityCache = new Map();
  }

  /**
   * Calculate quality score for a pattern with caching
   * Implements on-demand decay calculation
   */
  async calculateQualityScore(patternId: string): Promise<QualityScore> {
    // Check cache first
    const cached = this.qualityCache.get(patternId);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTLMs) {
      return cached.score;
    }

    // Get pattern from repository
    const pattern = await this.repository.getByIdOrAlias(patternId);
    if (!pattern) {
      throw new Error(`Pattern ${patternId} not found`);
    }

    // Calculate trust score with Beta-Bernoulli model
    const trustScore = await this.calculateTrustWithDecay(pattern);

    // Calculate freshness (decay factor)
    const freshnessScore = await this.calculateFreshness(pattern);

    // Calculate evidence quality
    const evidenceScore =
      await this.evidenceStandards.calculateEvidenceQuality(patternId);

    // Check for conflicts and calculate penalty
    const conflictPenalty = await this.calculateConflictPenalty(patternId);

    // Check quarantine status
    const quarantineStatus = await this.checkQuarantineStatus(pattern);

    // Calculate overall score
    const overall = this.calculateOverallScore(
      trustScore,
      freshnessScore,
      evidenceScore,
      1 - conflictPenalty, // Convert penalty to score
    );

    const qualityScore: QualityScore = {
      trust: trustScore,
      freshness: freshnessScore,
      evidence: evidenceScore,
      conflicts: 1 - conflictPenalty,
      overall,
      metadata: {
        lastActivity: (pattern as any).last_activity_at
          ? new Date((pattern as any).last_activity_at)
          : new Date(pattern.updated_at || Date.now()),
        decayApplied: true,
        cacheTimestamp: new Date(),
        quarantineStatus,
      },
    };

    // Cache the score
    this.qualityCache.set(patternId, {
      score: qualityScore,
      timestamp: Date.now(),
    });

    // Update cached score in database
    await this.updateCachedScore(patternId, qualityScore);

    return qualityScore;
  }

  /**
   * Calculate trust score with on-demand decay
   */
  private async calculateTrustWithDecay(pattern: any): Promise<number> {
    const stats = {
      uses: pattern.usage_count || 0,
      successes: pattern.success_count || 0,
      lastUsed: pattern.updated_at,
    };

    // Calculate base trust score
    let trustValue = this.trustCalculator.calculate(stats);

    // Apply decay if pattern is inactive
    const lastActivity =
      (pattern as any).last_activity_at || pattern.updated_at;
    if (lastActivity) {
      const daysSinceActivity =
        (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);

      // Apply monthly decay: 0.95^(months)
      const monthsSinceActivity = daysSinceActivity / 30;
      if (monthsSinceActivity > 1) {
        const decayFactor = Math.pow(
          this.config.decayRate,
          monthsSinceActivity,
        );
        trustValue = trustValue * decayFactor;

        // Apply minimum trust floor
        trustValue = Math.max(trustValue, this.config.minimumTrust);
      }
    }

    return trustValue;
  }

  /**
   * Calculate freshness score using exponential decay
   */
  private async calculateFreshness(pattern: any): Promise<number> {
    const lastActivity =
      (pattern as any).last_activity_at || pattern.updated_at;
    if (!lastActivity) {
      return 0.5; // Default for patterns without activity data
    }

    const daysSinceActivity =
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);

    // Use existing decay calculation
    const freshnessScore = calculateDecayFactor(
      daysSinceActivity,
      this.config.halfLifeDays,
    );

    return freshnessScore;
  }

  /**
   * Calculate conflict penalty for a pattern
   */
  private async calculateConflictPenalty(patternId: string): Promise<number> {
    const conflicts = await this.conflictResolver.detectConflicts(patternId);

    if (conflicts.length === 0) {
      return 0; // No penalty
    }

    // Calculate penalty based on conflict severity
    let totalPenalty = 0;
    for (const conflict of conflicts) {
      switch (conflict.severity) {
        case "critical":
          totalPenalty += 0.5;
          break;
        case "high":
          totalPenalty += 0.3;
          break;
        case "medium":
          totalPenalty += 0.15;
          break;
        case "low":
          totalPenalty += 0.05;
          break;
      }
    }

    // Cap penalty at 0.8 (minimum conflict score of 0.2)
    return Math.min(totalPenalty, 0.8);
  }

  /**
   * Check if pattern should be quarantined
   */
  private async checkQuarantineStatus(pattern: any): Promise<any> {
    const usageCount = pattern.usage_count || 0;
    const successCount = pattern.success_count || 0;

    // Need minimum uses to evaluate
    if (usageCount < 10) {
      return { isQuarantined: false };
    }

    const failureRate = 1 - successCount / usageCount;

    // Check if failure rate exceeds threshold
    if (failureRate > this.config.quarantineThreshold) {
      return {
        isQuarantined: true,
        reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
        date: new Date(),
        failureRate,
      };
    }

    // Check if already quarantined
    if ((pattern as any).quarantine_reason) {
      return {
        isQuarantined: true,
        reason: (pattern as any).quarantine_reason,
        date: (pattern as any).quarantine_date
          ? new Date((pattern as any).quarantine_date)
          : undefined,
        failureRate,
      };
    }

    return { isQuarantined: false };
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(
    trust: number,
    freshness: number,
    evidence: number,
    conflicts: number,
  ): number {
    const { weights } = this.config;

    const overall =
      trust * weights.trust +
      freshness * weights.freshness +
      evidence * weights.evidence +
      conflicts * weights.conflicts;

    return Math.min(Math.max(overall, 0), 1); // Clamp to [0, 1]
  }

  /**
   * Update cached quality score in database
   * [PAT:dA0w9N1I9-4m] ★★★☆☆ - Using synchronous SQLite transactions
   */
  private async updateCachedScore(
    patternId: string,
    score: QualityScore,
  ): Promise<void> {
    // This will be called by repository with proper transaction handling
    await this.repository.updateQualityMetadata(patternId, {
      qualityScoreCached: score.overall,
      cacheTimestamp: score.metadata.cacheTimestamp.toISOString(),
      lastActivityAt: score.metadata.lastActivity.toISOString(),
      quarantineReason: score.metadata.quarantineStatus?.reason || null,
      quarantineDate:
        score.metadata.quarantineStatus?.date?.toISOString() || null,
    });
  }

  /**
   * Refresh a pattern's quality score (reset decay, clear quarantine)
   */
  async refreshPattern(patternId: string): Promise<{
    previousScore: number;
    newScore: number;
    message: string;
  }> {
    // Get current score
    const previousQuality = await this.calculateQualityScore(patternId);
    const previousScore = previousQuality.overall;

    // Update last activity to now
    await this.repository.updateQualityMetadata(patternId, {
      lastActivityAt: new Date().toISOString(),
      quarantineReason: null,
      quarantineDate: null,
    });

    // Clear cache to force recalculation
    this.qualityCache.delete(patternId);

    // Recalculate score
    const newQuality = await this.calculateQualityScore(patternId);
    const newScore = newQuality.overall;

    return {
      previousScore,
      newScore,
      message: `Pattern refreshed. Score changed from ${previousScore.toFixed(3)} to ${newScore.toFixed(3)}`,
    };
  }

  /**
   * Clear quality cache
   */
  clearCache(): void {
    this.qualityCache.clear();
  }
}
