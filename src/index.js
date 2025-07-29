/**
 * APEX - Autonomous Pattern-Enhanced eXecution
 * Main entry point for APEX Intelligence
 */

export { PatternManager } from './intelligence/pattern-manager.js';
export { TrustCalculator } from './intelligence/trust-calculator.js';
export { FailureTracker } from './intelligence/failure-tracker.js';

// Core APEX Intelligence class
export class ApexIntelligence {
  constructor(projectRoot = '.') {
    this.projectRoot = projectRoot;
    this.patternManager =
      new (require('./intelligence/pattern-manager.js').PatternManager)(
        projectRoot,
      );
    this.trustCalculator =
      new (require('./intelligence/trust-calculator.js').TrustCalculator)();
    this.failureTracker =
      new (require('./intelligence/failure-tracker.js').FailureTracker)(
        projectRoot,
      );
  }

  /**
   * Analyze a task and provide intelligence
   */
  async analyzeTask(taskDescription, taskContext = {}) {
    const analysis = {
      patterns: [],
      warnings: [],
      complexity: 0,
      recommendations: [],
    };

    // Find relevant patterns
    analysis.patterns = await this.patternManager.findRelevantPatterns(
      taskDescription,
      taskContext,
    );

    // Check for potential failures
    analysis.warnings =
      await this.failureTracker.checkForPotentialFailures(taskContext);

    // Calculate complexity
    analysis.complexity = this.calculateComplexity(
      taskDescription,
      taskContext,
    );

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Calculate task complexity (1-10 scale)
   */
  calculateComplexity(description, context) {
    let complexity = 1;

    // Factors that increase complexity
    const complexityFactors = {
      // Keywords indicating complexity
      keywords: [
        'refactor',
        'migrate',
        'optimize',
        'integrate',
        'redesign',
        'architect',
      ],
      // File count
      files: context.files ? Math.min(context.files.length / 5, 2) : 0,
      // Technology diversity
      technologies: context.technologies
        ? Math.min(context.technologies.length / 3, 2)
        : 0,
      // Unknown factors
      unknowns: context.unknowns ? Math.min(context.unknowns, 3) : 0,
    };

    // Check keywords
    const descLower = description.toLowerCase();
    const keywordMatches = complexityFactors.keywords.filter((kw) =>
      descLower.includes(kw),
    ).length;
    complexity += Math.min(keywordMatches * 2, 4);

    // Add other factors
    complexity += complexityFactors.files;
    complexity += complexityFactors.technologies;
    complexity += complexityFactors.unknowns;

    return Math.min(Math.round(complexity), 10);
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    // Pattern recommendations
    if (analysis.patterns.length > 0) {
      const topPattern = analysis.patterns[0];
      if (topPattern.trustScore > 0.8) {
        recommendations.push({
          type: 'pattern',
          priority: 'high',
          message: `Use pattern ${topPattern.id} - ${topPattern.uses} successful uses`,
          pattern: topPattern,
        });
      }
    }

    // Failure prevention
    if (analysis.warnings.length > 0) {
      const topWarning = analysis.warnings[0];
      recommendations.push({
        type: 'warning',
        priority: 'high',
        message: `Potential issue: ${topWarning.error_type} (occurred ${topWarning.occurrences} times)`,
        prevention: topWarning.prevention,
      });
    }

    // Complexity-based recommendations
    if (analysis.complexity >= 7) {
      recommendations.push({
        type: 'approach',
        priority: 'medium',
        message: 'High complexity task - consider breaking into subtasks',
        suggestion: 'Use Gemini for architectural analysis',
      });
    } else if (analysis.complexity >= 5) {
      recommendations.push({
        type: 'approach',
        priority: 'medium',
        message: 'Moderate complexity - follow APEX phases carefully',
        suggestion: 'Consider peer review before implementation',
      });
    }

    return recommendations;
  }

  /**
   * Record task outcome for learning
   */
  async recordOutcome(taskId, outcome) {
    // Record pattern usage
    if (outcome.patternsUsed) {
      for (const patternId of outcome.patternsUsed) {
        await this.patternManager.recordUsage(patternId, outcome.success);
      }
    }

    // Record any failures
    if (!outcome.success && outcome.error) {
      await this.failureTracker.recordFailure({
        task_id: taskId,
        error_type: outcome.error.type,
        error_message: outcome.error.message,
        file_pattern: outcome.error.file,
        context: outcome.context,
        fix_applied: outcome.fix,
      });
    }

    return true;
  }

  /**
   * Get intelligence statistics
   */
  async getStatistics() {
    const patternAnalysis = await this.patternManager.analyzePatterns();
    const failureStats = await this.failureTracker.getStatistics();

    return {
      patterns: patternAnalysis,
      failures: failureStats,
      intelligence: {
        maturity: this.calculateMaturity(patternAnalysis, failureStats),
        effectiveness: this.calculateEffectiveness(
          patternAnalysis,
          failureStats,
        ),
      },
    };
  }

  /**
   * Calculate system maturity (0-100)
   */
  calculateMaturity(patternAnalysis, failureStats) {
    let score = 0;

    // Pattern maturity (40 points)
    score += Math.min(patternAnalysis.active * 2, 20); // Active patterns
    score += Math.min(patternAnalysis.highPerformers.length * 4, 20); // High performers

    // Failure learning (30 points)
    const fixedFailures =
      failureStats.total > 0
        ? Object.values(failureStats.byType).filter((count) => count > 1).length
        : 0;
    score += Math.min(fixedFailures * 5, 30);

    // Usage consistency (30 points)
    const recentUsage = patternAnalysis.recentlyUsed.length;
    score += Math.min(recentUsage * 6, 30);

    return score;
  }

  /**
   * Calculate effectiveness score (0-1)
   */
  calculateEffectiveness(patternAnalysis, failureStats) {
    if (patternAnalysis.total === 0) return 0;

    // Success rate of patterns
    const avgSuccessRate =
      patternAnalysis.highPerformers.length /
      Math.max(patternAnalysis.active, 1);

    // Failure prevention rate (lower is better)
    const failureRate =
      failureStats.recentFailures.length /
      Math.max(patternAnalysis.recentlyUsed.length, 1);

    return avgSuccessRate * (1 - Math.min(failureRate, 0.5));
  }
}

export default ApexIntelligence;
