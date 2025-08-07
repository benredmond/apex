/**
 * CLI command: apex patterns audit
 * [APE-29] Find stale, conflicting, and low-quality patterns
 */

import chalk from "chalk";
import { PatternRepository } from "../../storage/repository.js";
import { PatternQualityManager } from "../../quality/pattern-quality-manager.js";
import { ConflictResolver } from "../../quality/conflict-resolver.js";
import TrustCalculator from "../../intelligence/trust-calculator.js";

export const command = "audit";
export const describe = "Audit patterns for quality issues";

export const builder = (yargs) => {
  return yargs
    .option("verbose", {
      alias: "v",
      type: "boolean",
      description: "Show detailed audit information",
      default: false,
    })
    .option("fix", {
      type: "boolean",
      description: "Automatically fix minor issues",
      default: false,
    })
    .option("threshold", {
      alias: "t",
      type: "number",
      description: "Quality score threshold for warnings",
      default: 0.5,
    });
};

export const handler = async (argv) => {
  const { verbose, fix, threshold } = argv;

  console.log(chalk.cyan.bold("\n📊 Pattern Quality Audit\n"));

  try {
    // Initialize components
    const repository = new PatternRepository();
    const trustCalculator = new TrustCalculator();
    const qualityManager = new PatternQualityManager(
      repository,
      trustCalculator,
    );
    const conflictResolver = new ConflictResolver(repository);

    // Get all patterns
    const patterns = await repository.getAllPatterns();
    console.log(chalk.gray(`Analyzing ${patterns.length} patterns...\n`));

    // Categories for issues
    const stalePatterns = [];
    const lowQualityPatterns = [];
    const quarantinedPatterns = [];
    // Categories for issues

    // Analyze each pattern
    for (const pattern of patterns) {
      try {
        const qualityScore = await qualityManager.calculateQualityScore(
          pattern.id,
        );

        // Check for staleness (low freshness)
        if (qualityScore.freshness < 0.3) {
          stalePatterns.push({
            id: pattern.id,
            title: pattern.title || pattern.id,
            freshness: qualityScore.freshness,
            lastActivity: qualityScore.metadata.lastActivity,
          });
        }

        // Check for low overall quality
        if (qualityScore.overall < threshold) {
          lowQualityPatterns.push({
            id: pattern.id,
            title: pattern.title || pattern.id,
            score: qualityScore.overall,
            trust: qualityScore.trust,
            evidence: qualityScore.evidence,
          });
        }

        // Check quarantine status
        if (qualityScore.metadata.quarantineStatus?.isQuarantined) {
          quarantinedPatterns.push({
            id: pattern.id,
            title: pattern.title || pattern.id,
            reason: qualityScore.metadata.quarantineStatus.reason,
            date: qualityScore.metadata.quarantineStatus.date,
          });
        }
      } catch (error) {
        if (verbose) {
          console.error(
            chalk.red(`Error analyzing ${pattern.id}: ${error.message}`),
          );
        }
      }
    }

    // Detect conflicts
    const allConflicts = await conflictResolver.detectAllConflicts();
    const criticalConflicts = allConflicts.filter(
      (c) => c.severity === "critical" || c.severity === "high",
    );

    // Display audit results
    console.log(chalk.bold("\n=== AUDIT RESULTS ===\n"));

    // Stale patterns
    if (stalePatterns.length > 0) {
      console.log(
        chalk.yellow.bold(`⏰ Stale Patterns (${stalePatterns.length}):`),
      );
      for (const pattern of stalePatterns.slice(0, verbose ? undefined : 5)) {
        const daysSinceActivity = Math.floor(
          (Date.now() - new Date(pattern.lastActivity).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        console.log(
          chalk.yellow(
            `  • ${pattern.id}: ${daysSinceActivity} days inactive (freshness: ${(pattern.freshness * 100).toFixed(1)}%)`,
          ),
        );
      }
      if (!verbose && stalePatterns.length > 5) {
        console.log(chalk.gray(`  ... and ${stalePatterns.length - 5} more`));
      }
      console.log();
    }

    // Low quality patterns
    if (lowQualityPatterns.length > 0) {
      console.log(
        chalk.red.bold(
          `📉 Low Quality Patterns (${lowQualityPatterns.length}):`,
        ),
      );
      for (const pattern of lowQualityPatterns.slice(
        0,
        verbose ? undefined : 5,
      )) {
        console.log(
          chalk.red(
            `  • ${pattern.id}: score ${(pattern.score * 100).toFixed(1)}%`,
          ) +
            chalk.gray(
              ` (trust: ${(pattern.trust * 100).toFixed(0)}%, evidence: ${(pattern.evidence * 100).toFixed(0)}%)`,
            ),
        );
      }
      if (!verbose && lowQualityPatterns.length > 5) {
        console.log(
          chalk.gray(`  ... and ${lowQualityPatterns.length - 5} more`),
        );
      }
      console.log();
    }

    // Quarantined patterns
    if (quarantinedPatterns.length > 0) {
      console.log(
        chalk.magenta.bold(
          `🚫 Quarantined Patterns (${quarantinedPatterns.length}):`,
        ),
      );
      for (const pattern of quarantinedPatterns) {
        console.log(chalk.magenta(`  • ${pattern.id}: ${pattern.reason}`));
      }
      console.log();
    }

    // Conflicting patterns
    if (criticalConflicts.length > 0) {
      console.log(
        chalk.cyan.bold(
          `⚔️ Pattern Conflicts (${criticalConflicts.length} critical):`,
        ),
      );
      for (const conflict of criticalConflicts.slice(
        0,
        verbose ? undefined : 5,
      )) {
        console.log(
          chalk.cyan(`  • ${conflict.pattern1Id} ↔ ${conflict.pattern2Id}`) +
            chalk.gray(` (${conflict.type})`),
        );
        console.log(
          chalk.gray(`    Resolution: ${conflict.resolution.reason}`),
        );
      }
      if (!verbose && criticalConflicts.length > 5) {
        console.log(
          chalk.gray(`  ... and ${criticalConflicts.length - 5} more`),
        );
      }
      console.log();
    }

    // Summary and recommendations
    console.log(chalk.bold("\n=== SUMMARY ===\n"));

    const totalIssues =
      stalePatterns.length +
      lowQualityPatterns.length +
      quarantinedPatterns.length +
      criticalConflicts.length;

    if (totalIssues === 0) {
      console.log(chalk.green("✅ All patterns are healthy!"));
    } else {
      console.log(chalk.yellow(`Found ${totalIssues} total issues:`));
      console.log(`  • ${stalePatterns.length} stale patterns`);
      console.log(`  • ${lowQualityPatterns.length} low quality patterns`);
      console.log(`  • ${quarantinedPatterns.length} quarantined patterns`);
      console.log(`  • ${criticalConflicts.length} critical conflicts`);

      console.log(chalk.bold("\n📋 Recommendations:"));

      if (stalePatterns.length > 0) {
        console.log(
          `  • Run ${chalk.cyan("apex patterns refresh <pattern-id>")} to refresh stale patterns`,
        );
      }
      if (lowQualityPatterns.length > 0) {
        console.log(
          "  • Review and test low-quality patterns to improve trust scores",
        );
      }
      if (quarantinedPatterns.length > 0) {
        console.log(
          "  • Investigate quarantined patterns and fix underlying issues",
        );
      }
      if (criticalConflicts.length > 0) {
        console.log(
          "  • Resolve pattern conflicts by removing duplicates or updating scopes",
        );
      }

      if (fix) {
        console.log(chalk.yellow("\n🔧 Auto-fix mode is not yet implemented"));
      }
    }

    // Cleanup
    await repository.close();
  } catch (error) {
    console.error(chalk.red(`\n❌ Audit failed: ${error.message}`));
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};
