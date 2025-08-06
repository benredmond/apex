/**
 * Failure Corpus Integration
 * Analyzes historical failures to predict risks for new tasks
 * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous operations
 */

import fs from "fs";
import path from "path";
import type { TaskSignals } from "../schemas/task/types.js";

export interface FailureEntry {
  id: string;
  task: string;
  error: string;
  cause: string;
  fix: string;
  pattern?: string;
  frequency: number;
  last_seen: string;
  contexts?: string[];
}

export class FailureCorpus {
  private failures: FailureEntry[] = [];
  private failuresPath: string;

  constructor(apexPath: string = ".apex") {
    this.failuresPath = path.join(apexPath, "09_LEARNING", "failures.jsonl");
    this.loadFailures();
  }

  /**
   * Load failures from JSONL file synchronously
   * [FIX:SQLITE:SYNC] ★★★★★ - Synchronous file operations
   */
  private loadFailures(): void {
    if (!fs.existsSync(this.failuresPath)) {
      return;
    }

    const content = fs.readFileSync(this.failuresPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    this.failures = lines
      .map((line) => {
        try {
          return JSON.parse(line) as FailureEntry;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as FailureEntry[];
  }

  /**
   * Find failures relevant to task signals
   */
  findRelevantFailures(signals: TaskSignals): FailureEntry[] {
    const relevantFailures: FailureEntry[] = [];

    for (const failure of this.failures) {
      let relevanceScore = 0;

      // Check tag overlap
      if (failure.contexts) {
        const contextSet = new Set(
          failure.contexts.map((c) => c.toLowerCase()),
        );
        for (const tag of signals.tags) {
          if (contextSet.has(tag.toLowerCase())) {
            relevanceScore += 2;
          }
        }
      }

      // Check component overlap
      for (const component of signals.components) {
        if (
          failure.error.toLowerCase().includes(component.toLowerCase()) ||
          failure.cause.toLowerCase().includes(component.toLowerCase())
        ) {
          relevanceScore += 1;
        }
      }

      // Check theme relevance
      for (const theme of signals.themes) {
        if (failure.pattern?.toLowerCase().includes(theme.toLowerCase())) {
          relevanceScore += 1;
        }
      }

      // Include if relevant
      if (relevanceScore > 0) {
        relevantFailures.push(failure);
      }
    }

    // Sort by frequency (most common first) and limit to top 10
    return relevantFailures
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  /**
   * Extract risk predictions from failures
   */
  extractRisks(failures: FailureEntry[]): string[] {
    const risks: string[] = [];

    // Group by pattern for better risk descriptions
    const patternGroups = new Map<string, FailureEntry[]>();

    for (const failure of failures) {
      const key = failure.pattern || failure.error;
      if (!patternGroups.has(key)) {
        patternGroups.set(key, []);
      }
      patternGroups.get(key)!.push(failure);
    }

    // Generate risk descriptions
    for (const [pattern, group] of patternGroups) {
      const totalFreq = group.reduce((sum, f) => sum + f.frequency, 0);
      const latestFailure = group.sort(
        (a, b) =>
          new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(),
      )[0];

      if (totalFreq >= 5) {
        risks.push(
          `⚠️ High risk: ${pattern} (${totalFreq} occurrences). ` +
            `Fix: ${latestFailure.fix}`,
        );
      } else if (totalFreq >= 2) {
        risks.push(
          `⚡ Medium risk: ${pattern} (${totalFreq} occurrences). ` +
            `Prevention: ${latestFailure.fix}`,
        );
      }
    }

    return risks;
  }

  /**
   * Get failure statistics
   */
  getStats(): {
    total: number;
    unique_patterns: number;
    high_frequency: number;
  } {
    const patterns = new Set(
      this.failures.map((f) => f.pattern).filter(Boolean),
    );
    const highFreq = this.failures.filter((f) => f.frequency >= 5).length;

    return {
      total: this.failures.length,
      unique_patterns: patterns.size,
      high_frequency: highFreq,
    };
  }
}
