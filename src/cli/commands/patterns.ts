// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Incremental TypeScript adoption

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PatternRepository } from "../../storage/repository.js";
import { FormatterFactory } from "./shared/formatters.js";
import { getSharedMCPClient } from "./shared/mcp-client.js";
import {
  validateOptions,
  displayValidationErrors,
  validatePatternId,
} from "./shared/validators.js";
import { PerformanceTimer, withProgress } from "./shared/progress.js";

// Create a new repository instance for each command
// This ensures proper cleanup after command execution
async function getRepository(): Promise<PatternRepository> {
  // Use centralized pattern storage
  const repository = await PatternRepository.createWithProjectPaths({
    enableFallback: true,
  });
  await repository.initialize();
  return repository;
}

export function createPatternsCommand(): Command {
  const patterns = new Command("patterns").description("Manage APEX patterns");

  patterns
    .command("validate")
    .description("Validate all patterns in the patterns directory")
    .action(async () => {
      const spinner = ora("Validating patterns...").start();

      try {
        const repo = await getRepository();
        const results = await repo.validate();

        const valid = results.filter((r) => r.valid);
        const invalid = results.filter((r) => !r.valid);

        spinner.stop();

        console.log(chalk.bold("\nValidation Results:"));
        console.log(chalk.green(`✓ ${valid.length} valid patterns`));

        if (invalid.length > 0) {
          console.log(chalk.red(`✗ ${invalid.length} invalid patterns`));

          for (const result of invalid) {
            console.log(chalk.red(`\n  ${result.pattern_id}:`));
            result.errors?.forEach((error) => {
              console.log(chalk.gray(`    - ${error}`));
            });
          }

          process.exit(1);
        }
      } catch (error) {
        spinner.fail("Validation failed");
        console.error(error);
        process.exit(1);
      }
    });

  patterns
    .command("build")
    .description("Build the pattern index from YAML files")
    .action(async () => {
      const spinner = ora("Building pattern index...").start();

      try {
        const repo = await getRepository();
        await repo.rebuild();

        spinner.succeed("Pattern index built successfully");
      } catch (error) {
        spinner.fail("Build failed");
        console.error(error);
        process.exit(1);
      }
    });

  patterns
    .command("reindex")
    .description("Rebuild the pattern index")
    .action(async () => {
      const spinner = ora("Reindexing patterns...").start();

      try {
        const repo = await getRepository();
        await repo.rebuild();

        spinner.succeed("Patterns reindexed successfully");
      } catch (error) {
        spinner.fail("Reindex failed");
        console.error(error);
        process.exit(1);
      }
    });

  patterns
    .command("bench")
    .description("Run performance benchmarks")
    .action(async () => {
      console.log(chalk.bold("Running performance benchmarks...\n"));

      try {
        const repo = await getRepository();
        const iterations = 1000;

        // Benchmark 1: Pattern lookup by facets
        console.log(chalk.yellow("Benchmark 1: Pattern lookup by facets"));
        const lookupTimes: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          await repo.lookup({
            type: ["LANG", "CODEBASE"],
            languages: ["javascript", "typescript"],
            k: 20,
          });
          const end = process.hrtime.bigint();
          lookupTimes.push(Number(end - start) / 1e6); // Convert to ms
        }

        lookupTimes.sort((a, b) => a - b);
        const p50 = lookupTimes[Math.floor(iterations * 0.5)];
        const p95 = lookupTimes[Math.floor(iterations * 0.95)];
        const p99 = lookupTimes[Math.floor(iterations * 0.99)];

        console.log(`  P50: ${p50.toFixed(2)}ms`);
        console.log(`  P95: ${p95.toFixed(2)}ms`);
        console.log(`  P99: ${p99.toFixed(2)}ms`);

        // Benchmark 2: Full-text search
        console.log(chalk.yellow("\nBenchmark 2: Full-text search"));
        const searchTimes: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const start = process.hrtime.bigint();
          await repo.searchText("pattern", 20);
          const end = process.hrtime.bigint();
          searchTimes.push(Number(end - start) / 1e6);
        }

        searchTimes.sort((a, b) => a - b);
        console.log(
          `  P50: ${searchTimes[Math.floor(iterations * 0.5)].toFixed(2)}ms`,
        );
        console.log(
          `  P95: ${searchTimes[Math.floor(iterations * 0.95)].toFixed(2)}ms`,
        );
        console.log(
          `  P99: ${searchTimes[Math.floor(iterations * 0.99)].toFixed(2)}ms`,
        );

        // Check performance targets
        console.log(chalk.bold("\nPerformance Targets:"));
        if (p50 < 30) {
          console.log(chalk.green("✓ P50 < 30ms target met"));
        } else {
          console.log(chalk.red("✗ P50 < 30ms target not met"));
        }

        if (p95 < 80) {
          console.log(chalk.green("✓ P95 < 80ms target met"));
        } else {
          console.log(chalk.red("✗ P95 < 80ms target not met"));
        }
      } catch (error) {
        console.error(chalk.red("Benchmark failed:"), error);
        process.exit(1);
      } finally {
        // Repository cleanup handled in each command
      }
    });

  patterns
    .command("search <query>")
    .description("Search patterns by text")
    .option("-l, --limit <number>", "Maximum results", "20")
    .action(async (query: string, options: { limit: string }) => {
      try {
        const repo = await getRepository();
        const results = await repo.searchText(query, parseInt(options.limit));

        if (results.length === 0) {
          console.log(chalk.yellow("No patterns found"));
          return;
        }

        console.log(chalk.bold(`\nFound ${results.length} patterns:\n`));

        for (const pattern of results) {
          console.log(chalk.blue(pattern.id));
          console.log(`  ${pattern.title}`);
          console.log(chalk.gray(`  ${pattern.summary}`));
          console.log(
            chalk.gray(`  Trust: ${(pattern.trust_score * 100).toFixed(0)}%`),
          );
          console.log();
        }

        // Clean shutdown
        await repo.shutdown();
      } catch (error) {
        console.error(chalk.red("Search failed:"), error);
        process.exit(1);
      }
    });

  patterns
    .command("get <id>")
    .description("Get a specific pattern by ID")
    .action(async (id: string) => {
      try {
        const repo = await getRepository();
        const pattern = await repo.get(id);

        if (!pattern) {
          console.log(chalk.yellow(`Pattern ${id} not found`));
          return;
        }

        console.log(chalk.bold("\nPattern Details:\n"));
        console.log(JSON.stringify(pattern, null, 2));

        // Clean shutdown
        await repo.shutdown();
      } catch (error) {
        console.error(chalk.red("Get failed:"), error);
        process.exit(1);
      }
    });

  // [PAT:CLI:COMMANDER] ★★★★☆ (245 uses, 92% success) - New subcommands
  patterns
    .command("list")
    .description("List patterns with filtering and formatting options")
    .option("--pack <name>", "Filter by pack name")
    .option("--trust-min <score>", "Minimum trust score (0-1)", parseFloat)
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .option("-l, --limit <number>", "Maximum results", "50")
    .action(async (options) => {
      // [FIX:ASYNC:ERROR] ★★★★★ (234 uses, 98% success) - Proper error handling
      try {
        const timer = new PerformanceTimer();

        // Validate options
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        const repo = await getRepository();

        // Build query for repository
        const query: any = {
          limit: parseInt(options.limit),
        };

        if (validation.validated.trustMin !== undefined) {
          query.min_trust = validation.validated.trustMin;
        }

        // Direct repository access for sub-second performance
        const patterns = await repo.list(query);

        // Filter by pack if specified
        let filtered = patterns;
        if (validation.validated.pack) {
          filtered = patterns.filter(
            (p: any) =>
              p.pack === validation.validated.pack ||
              p.tags?.includes(validation.validated.pack),
          );
        }

        // Format and display
        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(filtered));

        // Check performance requirement (< 100ms)
        if (!timer.meetsRequirement(100)) {
          console.warn(
            chalk.yellow(
              `Warning: List operation took ${timer.elapsed().toFixed(0)}ms (target: < 100ms)`,
            ),
          );
        }

        // Clean shutdown
        await repo.shutdown();
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  patterns
    .command("analyze <path>")
    .description("Analyze code for pattern usage and recommendations")
    .option("--selector <query>", "Pattern selector query")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (path: string, options) => {
      try {
        // Use MCP client for analysis
        const mcpClient = getSharedMCPClient();

        const result = await withProgress(
          mcpClient.call("analyzePatterns", {
            path,
            selector: options.selector,
          }),
          "Analyzing patterns...",
          1000, // 1 second timeout
        );

        if (!result.success) {
          console.error(chalk.red("Analysis failed:"), result.error);
          process.exit(1);
        }

        const formatter = FormatterFactory.create(options.format);
        console.log(formatter.format(result.data));
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  patterns
    .command("promote <pattern-id>")
    .description("Promote a pattern from pending to active status")
    .action(async (patternId: string) => {
      try {
        // Validate pattern ID format
        if (!validatePatternId(patternId)) {
          console.error(chalk.red(`Invalid pattern ID format: ${patternId}`));
          console.error(
            chalk.gray("Pattern IDs should follow format: TYPE:CATEGORY:NAME"),
          );
          process.exit(1);
        }

        const spinner = ora(`Promoting pattern ${patternId}...`).start();

        // Use MCP for transactional promotion
        const mcpClient = getSharedMCPClient();
        const result = await mcpClient.call("promotePattern", {
          id: patternId,
        });

        if (!result.success) {
          spinner.fail(`Failed to promote pattern: ${result.error}`);
          process.exit(1);
        }

        spinner.succeed(
          chalk.green(`✓ Pattern ${patternId} promoted successfully`),
        );

        // Display promotion details if available
        if (result.data) {
          console.log(
            chalk.gray(
              `  New trust score: ${result.data.trust_score || "N/A"}`,
            ),
          );
          console.log(
            chalk.gray(`  Usage count: ${result.data.usage_count || 0}`),
          );
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  patterns
    .command("audit")
    .description("Audit patterns for quality issues")
    .option("-v, --verbose", "Show detailed audit information", false)
    .option("--fix", "Automatically fix minor issues", false)
    .option(
      "-t, --threshold <score>",
      "Quality score threshold for warnings",
      "0.5",
    )
    .action(async (options) => {
      // Dynamic import to avoid circular dependencies
      const { handler } = await import("./patterns-audit.js");
      await handler(options);
    });

  patterns
    .command("refresh <pattern-id>")
    .description("Refresh a pattern to reset decay and clear quarantine")
    .option(
      "--all-stale",
      "Refresh all stale patterns (freshness < 30%)",
      false,
    )
    .option("-q, --clear-quarantine", "Clear quarantine status", true)
    .option("-v, --verbose", "Show detailed information", false)
    .action(async (patternId: string, options) => {
      // Dynamic import to avoid circular dependencies
      const { handler } = await import("./patterns-refresh.js");
      await handler({ patternId, ...options });
    });

  patterns
    .command("stats")
    .description("Display pattern statistics and usage metrics")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (options) => {
      try {
        const timer = new PerformanceTimer();
        const repo = await getRepository();

        // Calculate statistics from all patterns
        const allPatterns = await repo.list({ limit: 10000 });

        const stats = {
          total_patterns: allPatterns.length,
          active_patterns: allPatterns.filter((p: any) => p.status === "active")
            .length,
          pending_patterns: allPatterns.filter(
            (p: any) => p.status === "pending",
          ).length,
          avg_trust_score:
            allPatterns.reduce(
              (sum: number, p: any) => sum + (p.trust_score || 0),
              0,
            ) / allPatterns.length,
          total_uses: allPatterns.reduce(
            (sum: number, p: any) => sum + (p.usage_count || 0),
            0,
          ),
          overall_success_rate:
            allPatterns.reduce(
              (sum: number, p: any) => sum + (p.success_rate || 0),
              0,
            ) / allPatterns.length,
          last_updated: new Date().toISOString(),
          by_type: {} as Record<string, number>,
        };

        // Count by type
        for (const pattern of allPatterns) {
          const type = (pattern as any).type || "unknown";
          stats.by_type[type] = (stats.by_type[type] || 0) + 1;
        }

        // Format and display
        const formatter = FormatterFactory.create(options.format);
        console.log(formatter.format(stats));

        // Display performance info in verbose mode
        if (options.verbose) {
          console.log(
            chalk.gray(`\nQuery completed in ${timer.elapsed().toFixed(0)}ms`),
          );
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  patterns
    .command("books")
    .description("List pre-loaded book patterns with clean-code tags")
    .option("--pack <name>", "Filter by book pack name")
    .option(
      "--category <cat>",
      "Filter by category (testing|refactoring|comments|etc)",
    )
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .option("-l, --limit <number>", "Maximum results", "50")
    .action(async (options) => {
      try {
        const timer = new PerformanceTimer();
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        const repo = await getRepository();
        const query = {
          limit: parseInt(options.limit || "50"),
          tags: ["book-pack:clean-code"], // Filter for book patterns
        };

        const patterns = await repo.list(query);
        let filtered = patterns;

        // Filter by pack if specified
        if (validation.validated.pack) {
          filtered = patterns.filter((p) =>
            p.tags?.includes(`book-pack:${validation.validated.pack}`),
          );
        }

        // Filter by category if specified
        if (options.category) {
          filtered = filtered.filter((p) =>
            p.tags?.some((tag) =>
              tag.includes(`clean-code:${options.category.toLowerCase()}`),
            ),
          );
        }

        // Format output
        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(filtered));

        // Display summary
        if (
          validation.validated.format === "table" ||
          !validation.validated.format
        ) {
          console.log(chalk.gray(`\n${filtered.length} book patterns found`));
          if (filtered.length > 0) {
            const categories = new Set<string>();
            filtered.forEach((p) => {
              p.tags?.forEach((tag) => {
                if (tag.startsWith("clean-code:")) {
                  categories.add(tag.replace("clean-code:", ""));
                }
              });
            });
            if (categories.size > 0) {
              console.log(
                chalk.gray(`Categories: ${Array.from(categories).join(", ")}`),
              );
            }
          }
        }

        if (!timer.meetsRequirement(100)) {
          console.warn(
            chalk.yellow(
              `Warning: Books operation took ${timer.elapsed().toFixed(0)}ms (target: < 100ms)`,
            ),
          );
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  return patterns;
}

// No cleanup needed - each command handles its own repository lifecycle
