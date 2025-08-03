// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Incremental TypeScript adoption

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  createPatternRepository,
  PatternRepository,
} from "../../storage/index.js";

let repository: PatternRepository | null = null;

async function getRepository(): Promise<PatternRepository> {
  if (!repository) {
    repository = await createPatternRepository();
  }
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
        if (repository) {
          await repository.shutdown();
        }
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
      } catch (error) {
        console.error(chalk.red("Get failed:"), error);
        process.exit(1);
      }
    });

  return patterns;
}

// Clean up on exit
process.on("exit", async () => {
  if (repository) {
    await repository.shutdown();
  }
});
