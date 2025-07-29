/**
 * APEX Intelligence - Failure Tracker
 * Learns from failures to prevent repeated mistakes
 */

import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';

export class FailureTracker {
  constructor(projectRoot = '.') {
    this.projectRoot = projectRoot;
    this.failuresPath = path.join(
      projectRoot,
      '.apex',
      '09_LEARNING',
      'failures.jsonl',
    );
    this.cache = null;
    this.cacheTimestamp = 0;
    this.cacheLifetime = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate a hash for failure deduplication
   */
  generateFailureHash(failure) {
    const key = `${failure.error_type}:${failure.file_pattern}:${failure.error_pattern}`;
    return createHash('md5').update(key).digest('hex').substring(0, 8);
  }

  /**
   * Load failures from JSONL file
   */
  async loadFailures() {
    // Check cache
    if (this.cache && Date.now() - this.cacheTimestamp < this.cacheLifetime) {
      return this.cache;
    }

    try {
      const content = await fs.readFile(this.failuresPath, 'utf-8');
      const failures = content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));

      this.cache = failures;
      this.cacheTimestamp = Date.now();
      return failures;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Record a new failure
   */
  async recordFailure(failureData) {
    const failure = {
      id: this.generateFailureHash(failureData),
      timestamp: new Date().toISOString(),
      task_id: failureData.task_id,
      error_type: failureData.error_type,
      error_message: failureData.error_message,
      error_pattern: this.extractErrorPattern(failureData.error_message),
      file_pattern: failureData.file_pattern || 'unknown',
      context: failureData.context || {},
      fix_applied: failureData.fix_applied || null,
      prevented_by: failureData.prevented_by || null,
      occurrences: 1,
    };

    // Check if similar failure exists
    const failures = await this.loadFailures();
    const existingIndex = failures.findIndex((f) => f.id === failure.id);

    if (existingIndex >= 0) {
      // Update occurrence count
      failures[existingIndex].occurrences++;
      failures[existingIndex].last_seen = failure.timestamp;

      // Save updated failures
      await this.saveFailures(failures);
      return failures[existingIndex];
    } else {
      // Append new failure
      await fs.appendFile(this.failuresPath, JSON.stringify(failure) + '\n');

      // Clear cache
      this.cache = null;
      return failure;
    }
  }

  /**
   * Save all failures (for updates)
   */
  async saveFailures(failures) {
    const content = failures.map((f) => JSON.stringify(f)).join('\n') + '\n';
    await fs.writeFile(this.failuresPath, content);

    // Update cache
    this.cache = failures;
    this.cacheTimestamp = Date.now();
  }

  /**
   * Extract pattern from error message
   */
  extractErrorPattern(errorMessage) {
    if (!errorMessage) return 'unknown';

    // Remove specific values but keep structure
    return errorMessage
      .replace(/\b\d+\b/g, 'N') // Replace numbers
      .replace(/['"][^'"]+['"]/g, 'STRING') // Replace strings
      .replace(/\/[^/\s]+/g, '/PATH') // Replace paths
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 200); // Limit length
  }

  /**
   * Check if a task might encounter known failures
   */
  async checkForPotentialFailures(taskContext) {
    const failures = await this.loadFailures();
    const warnings = [];

    for (const failure of failures) {
      const relevance = this.calculateRelevance(failure, taskContext);

      if (relevance > 0.7) {
        warnings.push({
          failure_id: failure.id,
          error_type: failure.error_type,
          occurrences: failure.occurrences,
          relevance: relevance,
          prevention: this.suggestPrevention(failure),
          last_seen: failure.last_seen || failure.timestamp,
        });
      }
    }

    // Sort by relevance and occurrences
    return warnings.sort((a, b) => {
      const scoreA = a.relevance * Math.log(a.occurrences + 1);
      const scoreB = b.relevance * Math.log(b.occurrences + 1);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate relevance of a failure to current context
   */
  calculateRelevance(failure, context) {
    let score = 0;
    let factors = 0;

    // File pattern match
    if (context.files && failure.file_pattern) {
      const fileMatch = context.files.some(
        (f) =>
          f.includes(failure.file_pattern) ||
          failure.file_pattern.includes(path.extname(f)),
      );
      if (fileMatch) score += 0.4;
      factors++;
    }

    // Technology match
    if (context.technologies && failure.context.technologies) {
      const techMatch = context.technologies.filter((t) =>
        failure.context.technologies.includes(t),
      ).length;
      if (techMatch > 0) {
        score += 0.3 * (techMatch / context.technologies.length);
        factors++;
      }
    }

    // Task type match
    if (context.task_type && failure.context.task_type) {
      if (context.task_type === failure.context.task_type) {
        score += 0.3;
      }
      factors++;
    }

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Suggest prevention for a failure
   */
  suggestPrevention(failure) {
    const suggestions = {
      ModuleNotFoundError:
        'Check imports and ensure all dependencies are installed',
      TypeError: 'Verify variable types and add type checking',
      SyntaxError: 'Review syntax, especially brackets and quotes',
      TestFailure: 'Run tests locally before committing',
      LintError: 'Run linter and fix issues before implementation',
      AsyncError: 'Ensure proper async/await usage and error handling',
    };

    // Check if we have a specific fix that worked
    if (failure.fix_applied) {
      return `Previously fixed by: ${failure.fix_applied}`;
    }

    // Return generic suggestion based on error type
    for (const [errorType, suggestion] of Object.entries(suggestions)) {
      if (failure.error_type.includes(errorType)) {
        return suggestion;
      }
    }

    return 'Review similar past failures and their solutions';
  }

  /**
   * Get failure statistics
   */
  async getStatistics() {
    const failures = await this.loadFailures();

    const stats = {
      total: failures.length,
      unique: new Set(failures.map((f) => f.id)).size,
      byType: {},
      byFile: {},
      mostCommon: [],
      recentFailures: [],
    };

    // Count by type
    for (const failure of failures) {
      stats.byType[failure.error_type] =
        (stats.byType[failure.error_type] || 0) + 1;
      stats.byFile[failure.file_pattern] =
        (stats.byFile[failure.file_pattern] || 0) + 1;
    }

    // Find most common
    const sortedByOccurrence = [...failures].sort(
      (a, b) => b.occurrences - a.occurrences,
    );
    stats.mostCommon = sortedByOccurrence.slice(0, 5).map((f) => ({
      id: f.id,
      type: f.error_type,
      occurrences: f.occurrences,
      pattern: f.error_pattern,
    }));

    // Recent failures (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    stats.recentFailures = failures
      .filter((f) => new Date(f.timestamp) > weekAgo)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);

    return stats;
  }

  /**
   * Learn from a successful fix
   */
  async recordSuccessfulFix(failureId, fixDescription) {
    const failures = await this.loadFailures();
    const failure = failures.find((f) => f.id === failureId);

    if (failure) {
      failure.fix_applied = fixDescription;
      failure.fixed_at = new Date().toISOString();
      await this.saveFailures(failures);
      return true;
    }

    return false;
  }
}

export default FailureTracker;
