/**
 * Semantic scoring pipeline for pattern discovery
 * Combines multiple signals with weighted scoring for relevance ranking
 */

import {
  Pattern,
  PatternMetadata,
  PatternTrigger,
  PatternVocab,
} from "../storage/types.js";
// import { BetaBernoulliTrustModel } from '../trust/index.js';  // Will use when storage is available

export interface ScoringWeights {
  fts: number; // Full-text search relevance
  facets: number; // Type/category matches
  triggers: number; // Error/keyword triggers
  trust: number; // Trust score factor
  recency: number; // Recent usage boost
}

export interface PatternScore {
  pattern: Pattern;
  score: number;
  breakdown: {
    fts: number;
    facets: number;
    triggers: number;
    trust: number;
    recency: number;
  };
  explanation: string;
}

export interface SessionContext {
  recent_patterns: Array<{
    pattern_id: string;
    success: boolean;
    timestamp: string;
  }>;
  failed_patterns: string[];
}

export interface SemanticScoringOptions {
  weights?: Partial<ScoringWeights>;
  maxResults?: number;
  minScore?: number;
  includeBreakdown?: boolean;
  sessionContext?: SessionContext;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  fts: 0.3,
  facets: 0.3,
  triggers: 0.2,
  trust: 0.1,
  recency: 0.1,
};

export class SemanticScorer {
  private weights: ScoringWeights;
  // private trustModel: BetaBernoulliTrustModel;  // Will be initialized with storage

  constructor(options?: { weights?: Partial<ScoringWeights> }) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options?.weights };
    // Trust model will be initialized with storage when available
    // For now, we'll calculate trust scores directly

    // Normalize weights to sum to 1
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(this.weights) as (keyof ScoringWeights)[]) {
      this.weights[key] = this.weights[key] / sum;
    }
  }

  /**
   * Score patterns based on multiple signals
   */
  scorePatterns(
    patterns: Pattern[],
    context: {
      ftsScores?: Map<string, number>; // Pattern ID -> FTS relevance (0-1)
      facetMatches?: Map<string, number>; // Pattern ID -> facet match count
      triggerMatches?: Map<string, string[]>; // Pattern ID -> matched triggers
      metadata?: Map<string, PatternMetadata[]>; // Pattern ID -> metadata
      triggers?: Map<string, PatternTrigger[]>; // Pattern ID -> triggers
      vocab?: Map<string, PatternVocab[]>; // Pattern ID -> vocabulary
    },
    options: SemanticScoringOptions = {},
  ): PatternScore[] {
    const scored: PatternScore[] = [];
    const now = Date.now();

    for (const pattern of patterns) {
      const breakdown = {
        fts: 0,
        facets: 0,
        triggers: 0,
        trust: 0,
        recency: 0,
      };

      // FTS score (0-1)
      if (context.ftsScores?.has(pattern.id)) {
        breakdown.fts = context.ftsScores.get(pattern.id)!;
      }

      // Facet matches (normalized by max possible)
      if (context.facetMatches?.has(pattern.id)) {
        const matches = context.facetMatches.get(pattern.id)!;
        breakdown.facets = Math.min(matches / 2, 1); // Max 2 facets (type + category)
      }

      // Trigger matches (normalized by number of triggers)
      if (context.triggerMatches?.has(pattern.id)) {
        const matches = context.triggerMatches.get(pattern.id)!;
        const totalTriggers = context.triggers?.get(pattern.id)?.length || 1;
        breakdown.triggers = Math.min(matches.length / totalTriggers, 1);
      }

      // Trust score (0-1)
      if (pattern.alpha !== undefined && pattern.beta !== undefined) {
        // Calculate trust directly from alpha/beta
        const total = pattern.alpha + pattern.beta;
        const successRate = pattern.alpha / total;
        const trust = {
          value: successRate,
          confidence: 1 - 1 / Math.sqrt(total + 1), // Simple confidence estimate
        };
        breakdown.trust = trust.value;
      } else if (pattern.trust_score !== undefined) {
        // Use pre-calculated trust score if available
        breakdown.trust = pattern.trust_score;
      }

      // Recency boost (decay over 30 days)
      if (pattern.updated_at) {
        const daysSinceUse =
          (now - new Date(pattern.updated_at).getTime()) /
          (1000 * 60 * 60 * 24);
        breakdown.recency = Math.max(0, 1 - daysSinceUse / 30);
      }

      // Calculate weighted score
      const score =
        breakdown.fts * this.weights.fts +
        breakdown.facets * this.weights.facets +
        breakdown.triggers * this.weights.triggers +
        breakdown.trust * this.weights.trust +
        breakdown.recency * this.weights.recency;

      // Generate explanation
      const explanation = this.generateExplanation(pattern, breakdown, context);

      scored.push({
        pattern,
        score,
        breakdown,
        explanation,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Apply filters
    let results = scored;
    if (options.minScore !== undefined) {
      results = results.filter((s) => s.score >= options.minScore);
    }
    if (options.maxResults !== undefined) {
      results = results.slice(0, options.maxResults);
    }

    return results;
  }

  /**
   * Generate human-readable explanation for why pattern matched
   */
  private generateExplanation(
    pattern: Pattern,
    breakdown: PatternScore["breakdown"],
    context: {
      triggerMatches?: Map<string, string[]>;
      metadata?: Map<string, PatternMetadata[]>;
    },
  ): string {
    const parts: string[] = [];

    // Highest scoring component
    const components = Object.entries(breakdown)
      .filter(([_, score]) => score > 0)
      .sort(([_, a], [__, b]) => b - a);

    if (components.length === 0) {
      return "Low relevance match";
    }

    const [topComponent, topScore] = components[0];

    switch (topComponent) {
      case "fts":
        parts.push(`Strong text match (${Math.round(topScore * 100)}%)`);
        break;
      case "facets":
        parts.push(`Matches type/category filters`);
        break;
      case "triggers":
        const triggers = context.triggerMatches?.get(pattern.id) || [];
        if (triggers.length > 0) {
          parts.push(`Triggered by: ${triggers.slice(0, 3).join(", ")}`);
        }
        break;
      case "trust":
        parts.push(`High trust score (${Math.round(topScore * 100)}%)`);
        break;
      case "recency":
        parts.push(`Recently used`);
        break;
    }

    // Add context from metadata if available
    const metadata = context.metadata?.get(pattern.id);
    if (metadata) {
      const contextHint = metadata.find((m) => m.key === "context_hint");
      if (contextHint && contextHint.value) {
        parts.push(contextHint.value as string);
      }
    }

    return parts.join(" • ");
  }

  /**
   * Calculate composite relevance score for a single pattern
   */
  calculateRelevance(
    pattern: Pattern,
    signals: {
      textMatch?: number;
      facetMatch?: boolean;
      triggerCount?: number;
      errorMatch?: boolean;
    },
  ): number {
    let score = 0;

    // Base text relevance
    if (signals.textMatch !== undefined) {
      score += signals.textMatch * this.weights.fts;
    }

    // Facet bonus
    if (signals.facetMatch) {
      score += this.weights.facets;
    }

    // Trigger bonus (normalized)
    if (signals.triggerCount) {
      score += Math.min(signals.triggerCount / 3, 1) * this.weights.triggers;
    }

    // Error match is high priority
    if (signals.errorMatch) {
      score += 0.2; // Bonus for error matches
    }

    // Trust factor
    if (pattern.alpha !== undefined && pattern.beta !== undefined) {
      const total = pattern.alpha + pattern.beta;
      const successRate = pattern.alpha / total;
      const trust = {
        value: successRate,
        confidence: 1 - 1 / Math.sqrt(total + 1),
      };
      score += trust.value * this.weights.trust;
    } else if (pattern.trust_score !== undefined) {
      score += pattern.trust_score * this.weights.trust;
    }

    return Math.min(score, 1); // Cap at 1
  }

  /**
   * Calculate session-aware boost for a pattern
   * Recent success = +0.1 boost
   * Recent failure = -0.05 penalty
   * Complementary pattern = +0.05 boost
   */
  calculateSessionBoost(
    patternId: string,
    sessionContext?: SessionContext,
  ): number {
    if (!sessionContext) return 0;

    // Check if pattern was recently used
    const recentUse = sessionContext.recent_patterns.find(
      (p) => p.pattern_id === patternId,
    );
    if (recentUse) {
      return recentUse.success ? 0.1 : -0.05;
    }

    // Check if pattern complements recently used patterns
    if (
      this.isComplementaryPattern(patternId, sessionContext.recent_patterns)
    ) {
      return 0.05;
    }

    return 0;
  }

  /**
   * Check if a pattern complements recently used patterns
   */
  private isComplementaryPattern(
    patternId: string,
    recentPatterns: SessionContext["recent_patterns"],
  ): boolean {
    // Define complementary pattern relationships
    const complementaryPairs = [
      { primary: "API", complement: "ERROR_HANDLING" },
      { primary: "AUTH", complement: "SESSION" },
      { primary: "DB", complement: "TRANSACTION" },
      { primary: "TEST", complement: "MOCK" },
      { primary: "BUILD", complement: "DEPLOY" },
      { primary: "FRONTEND", complement: "STATE" },
    ];

    for (const recent of recentPatterns) {
      for (const pair of complementaryPairs) {
        if (
          (recent.pattern_id.includes(pair.primary) &&
            patternId.includes(pair.complement)) ||
          (recent.pattern_id.includes(pair.complement) &&
            patternId.includes(pair.primary))
        ) {
          return true;
        }
      }
    }

    return false;
  }
}
