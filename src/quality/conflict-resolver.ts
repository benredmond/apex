/**
 * Pattern conflict detection and resolution
 * [APE-29] Implements priority-based conflict resolution
 */

import { PatternRepository } from "../storage/repository.js";

export interface PatternConflict {
  pattern1Id: string;
  pattern2Id: string;
  type: ConflictType;
  resolution: ConflictResolution;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export enum ConflictType {
  OVERLAPPING_SCOPE = "overlapping_scope",
  VERSION_INCOMPATIBLE = "version_incompatible",
  MUTUAL_EXCLUSION = "mutual_exclusion",
  DUPLICATE_FUNCTIONALITY = "duplicate_functionality",
}

export interface ConflictResolution {
  winnerId: string;
  reason: string;
  priority: number;
  appliedRule: ConflictRule;
}

export enum ConflictRule {
  POLICY_OVERRIDE = "policy_override",
  HIGHER_TRUST = "higher_trust",
  MORE_SPECIFIC = "more_specific",
  NEWER_PATTERN = "newer_pattern",
}

export class ConflictResolver {
  private repository: PatternRepository;
  private conflictCache: Map<string, PatternConflict[]>;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps: Map<string, number>;

  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.conflictCache = new Map();
    this.cacheTimestamps = new Map();
  }

  /**
   * Detect conflicts for a specific pattern
   */
  async detectConflicts(patternId: string): Promise<PatternConflict[]> {
    // Check cache
    const cached = this.conflictCache.get(patternId);
    const cacheTime = this.cacheTimestamps.get(patternId);

    if (cached && cacheTime && Date.now() - cacheTime < this.cacheTTL) {
      return cached;
    }

    const pattern = await this.repository.getByIdOrAlias(patternId);
    if (!pattern) {
      return [];
    }

    // Get all patterns that could potentially conflict
    const allPatterns = await this.repository.getAllPatterns();
    const conflicts: PatternConflict[] = [];

    for (const otherPattern of allPatterns) {
      if (otherPattern.id === pattern.id) continue;

      // Check for various types of conflicts
      const conflict = await this.checkConflict(pattern, otherPattern);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    // Cache results
    this.conflictCache.set(patternId, conflicts);
    this.cacheTimestamps.set(patternId, Date.now());

    return conflicts;
  }

  /**
   * Check for conflict between two patterns
   */
  private async checkConflict(
    pattern1: any,
    pattern2: any,
  ): Promise<PatternConflict | null> {
    // Check for overlapping scope
    const scopeConflict = this.checkScopeConflict(pattern1, pattern2);
    if (scopeConflict) {
      return this.resolveConflict(pattern1, pattern2, scopeConflict);
    }

    // Check for duplicate functionality
    const duplicateConflict = this.checkDuplicateFunctionality(
      pattern1,
      pattern2,
    );
    if (duplicateConflict) {
      return this.resolveConflict(pattern1, pattern2, duplicateConflict);
    }

    // Check for mutual exclusion
    const exclusionConflict = this.checkMutualExclusion(pattern1, pattern2);
    if (exclusionConflict) {
      return this.resolveConflict(pattern1, pattern2, exclusionConflict);
    }

    return null;
  }

  /**
   * Check for overlapping scope between patterns
   */
  private checkScopeConflict(
    pattern1: any,
    pattern2: any,
  ): Partial<PatternConflict> | null {
    // Parse pattern IDs to check scope overlap
    const id1Parts = pattern1.id.split(":");
    const id2Parts = pattern2.id.split(":");

    // Skip if different types
    if (id1Parts[0] !== id2Parts[0]) {
      return null;
    }

    // Check for same category and similar names
    if (id1Parts[1] === id2Parts[1]) {
      // Check if names are very similar (could be duplicates)
      const name1 = id1Parts[2] || "";
      const name2 = id2Parts[2] || "";

      if (this.areSimilarNames(name1, name2)) {
        return {
          type: ConflictType.OVERLAPPING_SCOPE,
          severity: "medium",
          description: `Patterns have overlapping scope in category ${id1Parts[1]}`,
        };
      }
    }

    // Check tag overlap if available
    const tags1 = pattern1.tags || [];
    const tags2 = pattern2.tags || [];
    const tagOverlap = this.calculateTagOverlap(tags1, tags2);

    if (tagOverlap > 0.7) {
      return {
        type: ConflictType.OVERLAPPING_SCOPE,
        severity: tagOverlap > 0.9 ? "high" : "medium",
        description: `High tag overlap (${(tagOverlap * 100).toFixed(0)}%) suggests overlapping scope`,
      };
    }

    return null;
  }

  /**
   * Check for duplicate functionality
   */
  private checkDuplicateFunctionality(
    pattern1: any,
    pattern2: any,
  ): Partial<PatternConflict> | null {
    // Check if titles are very similar
    const title1 = pattern1.title?.toLowerCase() || "";
    const title2 = pattern2.title?.toLowerCase() || "";

    if (this.areSimilarNames(title1, title2, 0.8)) {
      return {
        type: ConflictType.DUPLICATE_FUNCTIONALITY,
        severity: "high",
        description: "Patterns appear to provide duplicate functionality",
      };
    }

    // Check if summaries are very similar (if available)
    const summary1 = pattern1.summary?.toLowerCase() || "";
    const summary2 = pattern2.summary?.toLowerCase() || "";

    if (
      summary1 &&
      summary2 &&
      this.calculateTextSimilarity(summary1, summary2) > 0.7
    ) {
      return {
        type: ConflictType.DUPLICATE_FUNCTIONALITY,
        severity: "medium",
        description: "Pattern summaries suggest duplicate functionality",
      };
    }

    return null;
  }

  /**
   * Check for mutual exclusion
   */
  private checkMutualExclusion(
    pattern1: any,
    pattern2: any,
  ): Partial<PatternConflict> | null {
    // Check if patterns are explicitly marked as mutually exclusive
    const exclusions1 = (pattern1 as any).excludes || [];
    const exclusions2 = (pattern2 as any).excludes || [];

    if (
      exclusions1.includes(pattern2.id) ||
      exclusions2.includes(pattern1.id)
    ) {
      return {
        type: ConflictType.MUTUAL_EXCLUSION,
        severity: "critical",
        description: "Patterns are explicitly marked as mutually exclusive",
      };
    }

    // Check for known incompatible pattern types
    const id1Parts = pattern1.id.split(":");
    const id2Parts = pattern2.id.split(":");

    // Example: FIX patterns often conflict with their broken counterparts
    if (id1Parts[0] === "FIX" && id2Parts[0] === "PAT") {
      if (id1Parts[1] === id2Parts[1] && id1Parts[2] === id2Parts[2]) {
        return {
          type: ConflictType.MUTUAL_EXCLUSION,
          severity: "high",
          description: "Fix pattern conflicts with the pattern it fixes",
        };
      }
    }

    return null;
  }

  /**
   * Resolve conflict between two patterns
   */
  private resolveConflict(
    pattern1: any,
    pattern2: any,
    conflict: Partial<PatternConflict>,
  ): PatternConflict {
    const resolution = this.applyResolutionRules(pattern1, pattern2);

    return {
      pattern1Id: pattern1.id,
      pattern2Id: pattern2.id,
      type: conflict.type!,
      resolution,
      severity: conflict.severity!,
      description: conflict.description!,
    };
  }

  /**
   * Apply resolution rules in priority order
   */
  private applyResolutionRules(
    pattern1: any,
    pattern2: any,
  ): ConflictResolution {
    // Rule 1: POLICY patterns always win
    if (pattern1.id.startsWith("POLICY:")) {
      return {
        winnerId: pattern1.id,
        reason: "Policy patterns have highest priority",
        priority: 1,
        appliedRule: ConflictRule.POLICY_OVERRIDE,
      };
    }
    if (pattern2.id.startsWith("POLICY:")) {
      return {
        winnerId: pattern2.id,
        reason: "Policy patterns have highest priority",
        priority: 1,
        appliedRule: ConflictRule.POLICY_OVERRIDE,
      };
    }

    // Rule 2: Higher trust score wins
    const trust1 = pattern1.trust_score || 0;
    const trust2 = pattern2.trust_score || 0;

    if (Math.abs(trust1 - trust2) > 0.1) {
      const winner = trust1 > trust2 ? pattern1 : pattern2;
      return {
        winnerId: winner.id,
        reason: `Higher trust score (${Math.max(trust1, trust2).toFixed(2)} vs ${Math.min(trust1, trust2).toFixed(2)})`,
        priority: 2,
        appliedRule: ConflictRule.HIGHER_TRUST,
      };
    }

    // Rule 3: More specific scope wins
    const specificity1 = this.calculateSpecificity(pattern1);
    const specificity2 = this.calculateSpecificity(pattern2);

    if (specificity1 !== specificity2) {
      const winner = specificity1 > specificity2 ? pattern1 : pattern2;
      return {
        winnerId: winner.id,
        reason: `More specific scope (${Math.max(specificity1, specificity2)} vs ${Math.min(specificity1, specificity2)} parts)`,
        priority: 3,
        appliedRule: ConflictRule.MORE_SPECIFIC,
      };
    }

    // Rule 4: Newer pattern wins (tiebreaker)
    const created1 = new Date(pattern1.createdAt || 0).getTime();
    const created2 = new Date(pattern2.createdAt || 0).getTime();

    const winner = created1 > created2 ? pattern1 : pattern2;
    return {
      winnerId: winner.id,
      reason: "Newer pattern (tiebreaker)",
      priority: 4,
      appliedRule: ConflictRule.NEWER_PATTERN,
    };
  }

  /**
   * Calculate pattern specificity
   */
  private calculateSpecificity(pattern: any): number {
    // Count non-empty parts in pattern ID
    const parts = pattern.id.split(":").filter((p) => p && p !== "DEFAULT");

    // Add bonus for specific metadata
    let specificity = parts.length;

    // Add bonus for specific metadata (would need to be loaded from separate tables)
    // For now, just use tag count as a proxy for specificity
    if (pattern.tags && pattern.tags.length > 0) {
      specificity += pattern.tags.length * 0.2;
    }

    return specificity;
  }

  /**
   * Check if two names are similar
   */
  private areSimilarNames(
    name1: string,
    name2: string,
    threshold: number = 0.7,
  ): boolean {
    if (name1 === name2) return true;

    // Simple similarity check based on common substrings
    const similarity = this.calculateTextSimilarity(name1, name2);
    return similarity > threshold;
  }

  /**
   * Calculate text similarity (simple implementation)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\W+/));
    const words2 = new Set(text2.toLowerCase().split(/\W+/));

    if (words1.size === 0 || words2.size === 0) return 0;

    let commonWords = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        commonWords++;
      }
    }

    // Jaccard similarity
    const union = new Set([...words1, ...words2]);
    return commonWords / union.size;
  }

  /**
   * Calculate tag overlap between patterns
   */
  private calculateTagOverlap(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 || tags2.length === 0) return 0;

    const set1 = new Set(tags1);
    const set2 = new Set(tags2);

    let overlap = 0;
    for (const tag of set1) {
      if (set2.has(tag)) {
        overlap++;
      }
    }

    // Jaccard similarity
    const union = new Set([...set1, ...set2]);
    return overlap / union.size;
  }

  /**
   * Get all conflicts in the system
   */
  async detectAllConflicts(): Promise<PatternConflict[]> {
    const allPatterns = await this.repository.getAllPatterns();
    const conflicts: PatternConflict[] = [];
    const processed = new Set<string>();

    for (const pattern1 of allPatterns) {
      for (const pattern2 of allPatterns) {
        if (pattern1.id === pattern2.id) continue;

        // Avoid duplicate checks (A-B is same as B-A)
        const pairKey = [pattern1.id, pattern2.id].sort().join("-");
        if (processed.has(pairKey)) continue;
        processed.add(pairKey);

        const conflict = await this.checkConflict(pattern1, pattern2);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Clear conflict cache
   */
  clearCache(): void {
    this.conflictCache.clear();
    this.cacheTimestamps.clear();
  }
}
