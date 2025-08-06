import { PatternRepository } from "../storage/repository.js";
import type { Pattern } from "../storage/types.js";
import { BudgetManager } from "./budget-manager.js";
import { Deduper } from "./deduper.js";
import { SnippetTrimmer } from "./snippet-trimmer.js";
import { PackSerializer } from "./pack-serializer.js";
import {
  RankedPattern,
  PatternPack,
  PackCandidate,
  PackOptions,
  PackSnippet,
} from "./types.js";

interface PatternWithDetails {
  id: string;
  score: number;
  explain: any;
  pattern: Pattern;
}

interface PackBuilderResult {
  pack: PatternPack;
  json: string;
  bytes: number;
  gzipBytes?: number;
}

/**
 * PackBuilder - Main orchestrator for building PatternPacks
 * Implements the priority-based selection and size-constrained packaging
 */
export class PackBuilder {
  private repository: PatternRepository;
  private budgetManager: BudgetManager;
  private deduper: Deduper;
  private snippetTrimmer: SnippetTrimmer;
  private serializer: PackSerializer;

  constructor(repository: PatternRepository) {
    this.repository = repository;
    this.budgetManager = new BudgetManager();
    this.deduper = new Deduper();
    this.snippetTrimmer = new SnippetTrimmer();
    this.serializer = new PackSerializer();
  }

  /**
   * Build a PatternPack from ranked patterns
   */
  async buildPatternPack(
    task: string,
    ranked: RankedPattern[],
    options: PackOptions = {},
  ): Promise<PackBuilderResult> {
    const opts = {
      budgetBytes: 8192,
      debug: false,
      snippetLinesInit: 18,
      snippetLinesMin: 8,
      topCandidatesQuota: 3,
      failuresQuota: 2,
      antisQuota: 1,
      testsQuota: 1,
      ...options,
    };

    // Reset state
    this.budgetManager = new BudgetManager(opts.budgetBytes);
    this.deduper.reset();
    this.snippetTrimmer.clearCache();

    // Initialize pack structure
    const pack: PatternPack = {
      task,
      candidates: [],
      anti_patterns: [],
      policies: [],
      tests: [],
      meta: {
        total_ranked: ranked.length,
        considered: 0,
        included: 0,
        bytes: 0,
        budget_bytes: opts.budgetBytes,
      },
    };

    // Account for base structure size
    this.addBaseStructureSize(pack);

    // Load pattern details
    const patterns = await this.loadPatternDetails(ranked);
    pack.meta.considered = patterns.length;

    // Categorize patterns by type
    const categorized = this.categorizePatterns(patterns);

    // Phase 1: Add policies (always include)
    await this.addPolicies(pack, categorized.policies, opts);

    // Phase 2: Add top candidates
    await this.addTopCandidates(
      pack,
      categorized.candidates.filter((p) => p.score >= 80),
      opts.topCandidatesQuota,
      opts,
    );

    // Phase 3: Add recent failures
    await this.addFailures(
      pack,
      categorized.failures,
      opts.failuresQuota,
      opts,
    );

    // Phase 4: Add anti-patterns
    await this.addAntiPatterns(pack, categorized.antis, opts.antisQuota, opts);

    // Phase 5: Add test patterns
    await this.addTestPatterns(pack, categorized.tests, opts.testsQuota, opts);

    // Phase 6: Fill with remaining candidates
    const lowScoreCandidates = categorized.candidates.filter(
      (p) => p.score < 80,
    );
    await this.fillWithRemaining(pack, lowScoreCandidates, opts);

    // Phase 7: Check actual size and perform ablation if needed
    let currentMetrics = await this.serializer.getMetrics(pack);
    if (currentMetrics.bytes > opts.budgetBytes) {
      await this.performAblation(pack, opts);
    }

    // Finalize
    pack.meta.included =
      pack.candidates.length +
      pack.anti_patterns.length +
      pack.policies.length +
      pack.tests.length;

    // Get final metrics
    const metrics = await this.serializer.getMetrics(pack);
    pack.meta.bytes = metrics.bytes;

    // Final validation - ensure we're under budget
    if (metrics.bytes > opts.budgetBytes) {
      console.warn(
        `PatternPack exceeded budget: ${metrics.bytes} > ${opts.budgetBytes}`,
      );
    }

    // Add debug info if requested
    if (opts.debug) {
      pack.meta.explain = true;
      pack.meta.reasons = this.generateExplanations(pack);
    }

    return {
      pack,
      json: metrics.json,
      bytes: metrics.bytes,
      gzipBytes: metrics.gzipBytes,
    };
  }

  /**
   * Load full pattern details for ranked patterns
   */
  private async loadPatternDetails(
    ranked: RankedPattern[],
  ): Promise<PatternWithDetails[]> {
    const patterns: PatternWithDetails[] = [];

    for (const rankedPattern of ranked) {
      const dbPattern = await this.repository.get(rankedPattern.id);
      if (dbPattern) {
        // Parse the json_canonical to get the full pattern structure
        let fullPattern: Pattern;
        try {
          const parsed = JSON.parse(dbPattern.json_canonical);
          // Merge database fields with parsed content
          fullPattern = {
            ...parsed,
            id: dbPattern.id,
            type: dbPattern.type,
            title: dbPattern.title || parsed.title,
            summary: dbPattern.summary || parsed.summary,
            trust_score: dbPattern.trust_score,
            alpha: dbPattern.alpha,
            beta: dbPattern.beta,
            created_at: dbPattern.created_at,
            updated_at: dbPattern.updated_at,
            snippets: (parsed.snippets || []).map((s: any) => ({
              ...s,
              code: s.content || s.code || "", // Map content to code
              reference: s.source_ref
                ? `${s.source_ref.file}:L${s.source_ref.start}-L${s.source_ref.end}`
                : "unknown",
            })),
            evidence: parsed.evidence || [],
          } as Pattern;
        } catch (e) {
          // Fallback to basic pattern structure
          fullPattern = {
            ...dbPattern,
            snippets: [],
            evidence: [],
          } as any;
        }

        patterns.push({
          ...rankedPattern,
          pattern: fullPattern,
        });
      }
    }

    return patterns;
  }

  /**
   * Categorize patterns by type
   */
  private categorizePatterns(patterns: PatternWithDetails[]) {
    const policies: PatternWithDetails[] = [];
    const failures: PatternWithDetails[] = [];
    const antis: PatternWithDetails[] = [];
    const tests: PatternWithDetails[] = [];
    const candidates: PatternWithDetails[] = [];

    for (const pattern of patterns) {
      switch (pattern.pattern.type) {
        case "POLICY":
          policies.push(pattern);
          break;
        case "FAILURE":
          failures.push(pattern);
          break;
        case "ANTI":
          antis.push(pattern);
          break;
        case "TEST":
          tests.push(pattern);
          break;
        default:
          candidates.push(pattern);
      }
    }

    // Sort by score within each category
    const sortByScore = (a: PatternWithDetails, b: PatternWithDetails) =>
      b.score - a.score;

    return {
      policies: policies.sort(sortByScore),
      failures: failures.sort(sortByScore),
      antis: antis.sort(sortByScore),
      tests: tests.sort(sortByScore),
      candidates: candidates.sort(sortByScore),
    };
  }

  /**
   * Add base structure size
   */
  private addBaseStructureSize(pack: PatternPack) {
    // Approximate size of empty structure
    const baseSize = this.serializer.estimateSize({
      task: pack.task,
      candidates: [],
      anti_patterns: [],
      policies: [],
      tests: [],
      meta: pack.meta,
    });

    this.budgetManager.addBytes(baseSize);
  }

  /**
   * Add policies to pack (ID + summary only)
   */
  private async addPolicies(
    pack: PatternPack,
    policies: PatternWithDetails[],
    opts: PackOptions,
  ) {
    for (const policy of policies) {
      const item = {
        id: policy.pattern.id,
        summary: this.truncateSummary(policy.pattern.summary, 120),
      };

      const size = this.serializer.estimateSize(item) + 1; // +1 for comma

      if (this.budgetManager.willFit(size)) {
        pack.policies.push(item);
        this.budgetManager.addBytes(size);
        this.deduper.addPatternId(policy.pattern.id);
      }
    }
  }

  /**
   * Add top candidates with snippets
   */
  private async addTopCandidates(
    pack: PatternPack,
    candidates: PatternWithDetails[],
    quota: number,
    opts: PackOptions,
  ) {
    let added = 0;

    for (const candidate of candidates) {
      if (added >= quota) break;

      const packCandidate = await this.createPackCandidate(
        candidate,
        opts.snippetLinesInit || 18,
        opts,
      );

      if (packCandidate && this.tryAddCandidate(pack, packCandidate)) {
        added++;
      }
    }
  }

  /**
   * Create a pack candidate with snippet
   */
  private async createPackCandidate(
    pattern: PatternWithDetails,
    snippetLines: number,
    opts: PackOptions,
  ): Promise<PackCandidate | null> {
    if (this.deduper.hasPatternId(pattern.pattern.id)) {
      return null;
    }

    const candidate: PackCandidate = {
      id: pattern.pattern.id,
      type: pattern.pattern.type,
      title: pattern.pattern.title,
      score: pattern.score,
      summary: this.truncateSummary(pattern.pattern.summary, 120),
    };

    // Add enhanced metadata fields (APE-65)
    // Calculate trust score from alpha/beta using Wilson score
    if (
      pattern.pattern.alpha !== undefined &&
      pattern.pattern.beta !== undefined
    ) {
      const alpha = pattern.pattern.alpha;
      const beta = pattern.pattern.beta;
      candidate.trust_score = this.calculateWilsonScore(alpha, beta);
    } else if (pattern.pattern.trust_score) {
      candidate.trust_score = pattern.pattern.trust_score;
    }

    // Add usage statistics
    if (pattern.pattern.usage_count !== undefined) {
      candidate.usage_count = pattern.pattern.usage_count;
    }

    // Calculate success rate
    if (
      pattern.pattern.success_count !== undefined &&
      pattern.pattern.usage_count
    ) {
      candidate.success_rate =
        pattern.pattern.usage_count > 0
          ? pattern.pattern.success_count / pattern.pattern.usage_count
          : 0;
    }

    // Add contextual guidance
    if (pattern.pattern.key_insight) {
      candidate.key_insight = pattern.pattern.key_insight;
    }
    if (pattern.pattern.when_to_use) {
      candidate.when_to_use = pattern.pattern.when_to_use;
    }

    // Parse common_pitfalls from JSON string
    if (pattern.pattern.common_pitfalls) {
      try {
        const pitfalls = JSON.parse(pattern.pattern.common_pitfalls);
        if (Array.isArray(pitfalls)) {
          candidate.common_pitfalls = pitfalls;
        }
      } catch {
        // If not valid JSON, treat as single string
        candidate.common_pitfalls = [pattern.pattern.common_pitfalls];
      }
    }

    // TODO: Add last_used_task from reflections join (requires repository enhancement)

    // Add snippet if available (from parsed JSON)
    const patternData = pattern.pattern as any;
    if (patternData.snippets && patternData.snippets.length > 0) {
      const snippet = await this.selectBestSnippet(
        patternData,
        snippetLines,
      );

      if (snippet) {
        candidate.snippet = snippet;
      }
    }

    // Add references
    const refs = this.extractReferences(pattern.pattern);
    if (refs.policies.length > 0) candidate.policy_refs = refs.policies;
    if (refs.antis.length > 0) candidate.anti_refs = refs.antis;
    if (refs.tests.length > 0) candidate.test_refs = refs.tests;

    return candidate;
  }

  /**
   * Calculate Wilson score from Beta-Bernoulli parameters
   * Returns lower bound of 95% confidence interval
   */
  private calculateWilsonScore(alpha: number, beta: number): number {
    const n = alpha + beta;
    if (n === 0) return 0.5;

    const z = 1.96; // 95% confidence
    const phat = alpha / n;
    const denominator = 1 + (z * z) / n;
    const numerator =
      phat +
      (z * z) / (2 * n) -
      z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);

    return numerator / denominator;
  }

  /**
   * Select the best snippet from a pattern
   */
  private async selectBestSnippet(
    pattern: any,
    targetLines: number,
  ): Promise<PackSnippet | null> {
    if (!pattern.snippets || pattern.snippets.length === 0) {
      return null;
    }

    // Select shortest snippet that demonstrates the pattern
    const snippet = pattern.snippets.reduce((best, current) => {
      const bestLines = best.code.split("\n").length;
      const currentLines = current.code.split("\n").length;
      return currentLines < bestLines ? current : best;
    });

    // Trim if needed
    const trimResult = this.snippetTrimmer.trimSnippet(
      snippet.code,
      snippet.reference || "unknown:L1-L1",
      Math.floor(snippet.code.split("\n").length / 2), // Target middle
      { targetLines },
    );

    return {
      language: snippet.language || "text",
      code: trimResult.code,
      source_ref: this.snippetTrimmer.updateSourceRef(
        snippet.reference || "unknown:L1-L1",
        trimResult.startLine,
        trimResult.endLine,
      ),
      snippet_id: trimResult.snippetId,
    };
  }

  /**
   * Try to add a candidate to the pack
   */
  private tryAddCandidate(
    pack: PatternPack,
    candidate: PackCandidate,
  ): boolean {
    const size = this.serializer.estimateSize(candidate) + 1;

    if (!this.budgetManager.willFit(size)) {
      return false;
    }

    pack.candidates.push(candidate);
    this.budgetManager.addBytes(size);
    this.deduper.addPatternId(candidate.id);

    if (candidate.snippet) {
      this.deduper.addSnippetHash(candidate.snippet.snippet_id);
    }

    this.deduper.trackReferences(
      candidate.policy_refs,
      candidate.anti_refs,
      candidate.test_refs,
    );

    return true;
  }

  /**
   * Add failure patterns
   */
  private async addFailures(
    pack: PatternPack,
    failures: PatternWithDetails[],
    quota: number,
    opts: PackOptions,
  ) {
    // Recent failures (last 90 days)
    const recentFailures = failures.filter((f) => {
      const updatedAt = f.pattern.updated_at;
      if (!updatedAt) return true;

      const daysSince =
        (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 90;
    });

    let added = 0;
    for (const failure of recentFailures) {
      if (added >= quota) break;

      const candidate = await this.createPackCandidate(
        failure,
        opts.snippetLinesInit || 18,
        opts,
      );

      if (candidate && this.tryAddCandidate(pack, candidate)) {
        added++;
      }
    }
  }

  /**
   * Add anti-patterns
   */
  private async addAntiPatterns(
    pack: PatternPack,
    antis: PatternWithDetails[],
    quota: number,
    opts: PackOptions,
  ) {
    let added = 0;

    for (const anti of antis) {
      if (added >= quota) break;

      if (this.deduper.shouldIncludeAnti(anti.pattern.id)) {
        const item = {
          id: anti.pattern.id,
          summary: this.truncateSummary(anti.pattern.summary, 120),
        };

        const size = this.serializer.estimateSize(item) + 1;

        if (this.budgetManager.willFit(size)) {
          pack.anti_patterns.push(item);
          this.budgetManager.addBytes(size);
          added++;
        }
      }
    }
  }

  /**
   * Add test patterns
   */
  private async addTestPatterns(
    pack: PatternPack,
    tests: PatternWithDetails[],
    quota: number,
    opts: PackOptions,
  ) {
    let added = 0;

    for (const test of tests) {
      if (added >= quota) break;

      if (this.deduper.shouldIncludeTest(test.pattern.id)) {
        const item = {
          id: test.pattern.id,
          summary: this.truncateSummary(test.pattern.summary, 120),
        };

        const size = this.serializer.estimateSize(item) + 1;

        if (this.budgetManager.willFit(size)) {
          pack.tests.push(item);
          this.budgetManager.addBytes(size);
          added++;
        }
      }
    }
  }

  /**
   * Fill remaining budget with candidates
   */
  private async fillWithRemaining(
    pack: PatternPack,
    remaining: PatternWithDetails[],
    opts: PackOptions,
  ) {
    for (const pattern of remaining) {
      const candidate = await this.createPackCandidate(
        pattern,
        opts.snippetLinesInit || 18,
        opts,
      );

      if (!candidate || !this.tryAddCandidate(pack, candidate)) {
        // Try with smaller snippet
        const smallerCandidate = await this.createPackCandidate(
          pattern,
          opts.snippetLinesMin || 8,
          opts,
        );

        if (smallerCandidate && this.tryAddCandidate(pack, smallerCandidate)) {
          continue;
        }

        // Budget exhausted
        break;
      }
    }
  }

  /**
   * Perform ablation to fit within budget
   */
  private async performAblation(pack: PatternPack, opts: PackOptions) {
    // Step 1: Tighten snippets
    for (const candidate of pack.candidates) {
      if (candidate.snippet && candidate.snippet.code.split("\n").length > 12) {
        // Re-trim to smaller size
        const pattern = await this.repository.get(candidate.id);
        if (pattern) {
          const smaller = await this.selectBestSnippet(pattern, 12);
          if (smaller) {
            candidate.snippet = smaller;
          }
        }
      }
    }

    // Recalculate size
    const metrics1 = await this.serializer.getMetrics(pack);
    if (metrics1.bytes <= opts.budgetBytes) return;

    // Step 2: Further tighten snippets
    for (const candidate of pack.candidates) {
      if (candidate.snippet && candidate.snippet.code.split("\n").length > 8) {
        const pattern = await this.repository.get(candidate.id);
        if (pattern) {
          const smaller = await this.selectBestSnippet(pattern, 8);
          if (smaller) {
            candidate.snippet = smaller;
          }
        }
      }
    }

    // Recalculate size
    const metrics2 = await this.serializer.getMetrics(pack);
    if (metrics2.bytes <= opts.budgetBytes) return;

    // Step 3: Drop lowest scoring non-policy candidates
    pack.candidates.sort((a, b) => a.score - b.score);
    while (pack.candidates.length > 0) {
      pack.candidates.shift(); // Remove lowest scoring

      const metrics = await this.serializer.getMetrics(pack);
      if (metrics.bytes <= opts.budgetBytes) return;
    }

    // Step 4: Shorten summaries
    for (const item of [
      ...pack.policies,
      ...pack.anti_patterns,
      ...pack.tests,
    ]) {
      item.summary = this.truncateSummary(item.summary, 80);
    }

    // Final check after shortening summaries
    const finalMetrics = await this.serializer.getMetrics(pack);
    if (finalMetrics.bytes > opts.budgetBytes) {
      // Last resort: remove all optional fields
      for (const candidate of pack.candidates) {
        delete candidate.policy_refs;
        delete candidate.anti_refs;
        delete candidate.test_refs;
      }

      // If still over budget, remove snippets from lowest scoring candidates
      const lastCheckMetrics = await this.serializer.getMetrics(pack);
      if (lastCheckMetrics.bytes > opts.budgetBytes) {
        // Sort by score ascending (lowest first)
        pack.candidates.sort((a, b) => a.score - b.score);
        for (const candidate of pack.candidates) {
          if (candidate.snippet) {
            delete candidate.snippet;
            const metrics = await this.serializer.getMetrics(pack);
            if (metrics.bytes <= opts.budgetBytes) {
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Extract references from pattern content
   */
  private extractReferences(pattern: Pattern): {
    policies: string[];
    antis: string[];
    tests: string[];
  } {
    const policies: string[] = [];
    const antis: string[] = [];
    const tests: string[] = [];

    // Simple pattern matching in notes or summary
    const patternData = pattern as any;
    const searchText = patternData.notes || pattern.summary || "";

    const policyMatches = searchText.match(/\[POLICY:[^\]]+\]/g) || [];
    const antiMatches = searchText.match(/\[ANTI:[^\]]+\]/g) || [];
    const testMatches = searchText.match(/\[TEST:[^\]]+\]/g) || [];

    policies.push(...policyMatches.map((m) => m.slice(1, -1)));
    antis.push(...antiMatches.map((m) => m.slice(1, -1)));
    tests.push(...testMatches.map((m) => m.slice(1, -1)));

    return { policies, antis, tests };
  }

  /**
   * Truncate summary to max length
   */
  private truncateSummary(summary: string, maxLength: number): string {
    if (summary.length <= maxLength) {
      return summary;
    }
    return summary.substring(0, maxLength - 3) + "...";
  }

  /**
   * Generate explanations for debug mode
   */
  private generateExplanations(pack: PatternPack): Array<{
    id: string;
    [key: string]: number | string;
  }> {
    const reasons = [];

    for (const candidate of pack.candidates) {
      reasons.push({
        id: candidate.id,
        score: candidate.score,
        snippet_lines: candidate.snippet
          ? candidate.snippet.code.split("\n").length
          : 0,
      });
    }

    return reasons;
  }
}
