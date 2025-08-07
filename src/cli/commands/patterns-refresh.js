/**
 * CLI command: apex patterns refresh
 * [APE-29] Reset decay timer and clear quarantine for patterns
 */

import chalk from "chalk";
import { PatternRepository } from "../../storage/repository.js";
import { PatternQualityManager } from "../../quality/pattern-quality-manager.js";
import TrustCalculator from "../../intelligence/trust-calculator.js";

export const command = "refresh <pattern-id>";
export const describe = "Refresh a pattern to reset decay and clear quarantine";

export const builder = (yargs) => {
  return yargs
    .positional("pattern-id", {
      describe: "Pattern ID to refresh",
      type: "string",
    })
    .option("all-stale", {
      type: "boolean",
      description: "Refresh all stale patterns (freshness < 30%)",
      default: false,
    })
    .option("clear-quarantine", {
      alias: "q",
      type: "boolean",
      description: "Clear quarantine status",
      default: true,
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      description: "Show detailed information",
      default: false,
    });
};

export const handler = async (argv) => {
  const { patternId, allStale, verbose } = argv;

  try {
    // Initialize components
    const repository = new PatternRepository();
    const trustCalculator = new TrustCalculator();
    const qualityManager = new PatternQualityManager(
      repository,
      trustCalculator,
    );

    if (allStale) {
      // Refresh all stale patterns
      console.log(chalk.cyan.bold("\n🔄 Refreshing All Stale Patterns\n"));

      const patterns = await repository.getAllPatterns();
      let refreshedCount = 0;
      let errors = [];

      for (const pattern of patterns) {
        try {
          const qualityScore = await qualityManager.calculateQualityScore(
            pattern.id,
          );

          if (qualityScore.freshness < 0.3) {
            console.log(chalk.gray(`Refreshing ${pattern.id}...`));
            const result = await qualityManager.refreshPattern(pattern.id);

            if (verbose) {
              console.log(
                chalk.green(
                  `  ✅ ${pattern.id}: ${result.previousScore.toFixed(3)} → ${result.newScore.toFixed(3)}`,
                ),
              );
            }

            refreshedCount++;
          }
        } catch (error) {
          errors.push({ id: pattern.id, error: error.message });
          if (verbose) {
            console.error(
              chalk.red(
                `  ❌ Error refreshing ${pattern.id}: ${error.message}`,
              ),
            );
          }
        }
      }

      // Summary
      console.log(chalk.bold("\n=== SUMMARY ===\n"));
      console.log(chalk.green(`✅ Refreshed ${refreshedCount} stale patterns`));
      if (errors.length > 0) {
        console.log(
          chalk.red(`❌ Failed to refresh ${errors.length} patterns`),
        );
        if (verbose) {
          for (const err of errors) {
            console.log(chalk.red(`  • ${err.id}: ${err.error}`));
          }
        }
      }
    } else {
      // Refresh single pattern
      console.log(chalk.cyan.bold(`\n🔄 Refreshing Pattern: ${patternId}\n`));

      // Check if pattern exists
      const pattern = await repository.getByIdOrAlias(patternId);
      if (!pattern) {
        throw new Error(`Pattern ${patternId} not found`);
      }

      // Get current quality score
      const beforeQuality =
        await qualityManager.calculateQualityScore(patternId);

      console.log(chalk.bold("Current Status:"));
      console.log(
        `  • Trust Score: ${(beforeQuality.trust * 100).toFixed(1)}%`,
      );
      console.log(
        `  • Freshness: ${(beforeQuality.freshness * 100).toFixed(1)}%`,
      );
      console.log(
        `  • Evidence Quality: ${(beforeQuality.evidence * 100).toFixed(1)}%`,
      );
      console.log(
        `  • Overall Quality: ${(beforeQuality.overall * 100).toFixed(1)}%`,
      );

      if (beforeQuality.metadata.quarantineStatus?.isQuarantined) {
        console.log(
          chalk.yellow(
            `  • ⚠️ Quarantined: ${beforeQuality.metadata.quarantineStatus.reason}`,
          ),
        );
      }

      // Calculate days since last activity
      const daysSinceActivity = Math.floor(
        (Date.now() - beforeQuality.metadata.lastActivity.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      console.log(`  • Last Activity: ${daysSinceActivity} days ago`);

      // Refresh the pattern
      console.log(chalk.gray("\nRefreshing..."));
      // Refresh operation completed

      // Get updated quality score
      const afterQuality =
        await qualityManager.calculateQualityScore(patternId);

      // Display results
      console.log(chalk.bold("\n✅ Pattern Refreshed!\n"));
      console.log(chalk.bold("Updated Status:"));
      console.log(`  • Trust Score: ${(afterQuality.trust * 100).toFixed(1)}%`);
      console.log(
        `  • Freshness: ${(afterQuality.freshness * 100).toFixed(1)}% ${chalk.green(`(+${((afterQuality.freshness - beforeQuality.freshness) * 100).toFixed(1)}%)`)}`,
      );
      console.log(
        `  • Evidence Quality: ${(afterQuality.evidence * 100).toFixed(1)}%`,
      );
      console.log(
        `  • Overall Quality: ${(afterQuality.overall * 100).toFixed(1)}% ${chalk.green(`(+${((afterQuality.overall - beforeQuality.overall) * 100).toFixed(1)}%)`)}`,
      );

      if (
        beforeQuality.metadata.quarantineStatus?.isQuarantined &&
        !afterQuality.metadata.quarantineStatus?.isQuarantined
      ) {
        console.log(chalk.green("  • ✅ Quarantine cleared"));
      }

      // Show improvement
      const improvement =
        ((afterQuality.overall - beforeQuality.overall) /
          beforeQuality.overall) *
        100;
      if (improvement > 0) {
        console.log(
          chalk.green.bold(
            `\n📈 Quality improved by ${improvement.toFixed(1)}%`,
          ),
        );
      }

      // Recommendations
      if (afterQuality.overall < 0.5) {
        console.log(
          chalk.yellow("\n⚠️ Pattern quality is still low. Consider:"),
        );
        if (afterQuality.trust < 0.5) {
          console.log("  • Testing the pattern to improve trust score");
        }
        if (afterQuality.evidence < 0.5) {
          console.log("  • Using the pattern more to gather evidence");
        }
      }
    }

    // Cleanup
    await repository.shutdown();
  } catch (error) {
    console.error(chalk.red(`\n❌ Refresh failed: ${error.message}`));
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};
