// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { DatabaseAdapterFactory, type DatabaseAdapter } from "../../storage/database-adapter.js";
import { PatternDatabase } from "../../storage/database.js";
import {
  MigrationRunner,
  MigrationLoader,
  MigrationValidator,
} from "../../migrations/index.js";
import type { MigrationVersion } from "../../migrations/types.js";
import { ApexConfig } from "../../config/apex-config.js";

export function createMigrateCommand(): Command {
  const migrate = new Command("migrate").description(
    "Manage database migrations",
  );

  migrate
    .command("status")
    .description("Show migration status")
    .action(async () => {
      const spinner = ora("Checking migration status...").start();

      try {
        const dbPath = await ApexConfig.getProjectDbPath();
        const adapter = await DatabaseAdapterFactory.create(dbPath);
        const loader = new MigrationLoader();
        const runner = new MigrationRunner(adapter);

        const migrations = await loader.loadMigrations();
        const status = runner.getStatus(migrations);

        spinner.stop();

        console.log(chalk.bold("\nMigration Status:"));
        console.log(`Total migrations: ${status.total}`);
        console.log(chalk.green(`Applied: ${status.applied.length}`));
        console.log(chalk.yellow(`Pending: ${status.pending.length}`));

        if (status.applied.length > 0) {
          console.log(chalk.bold("\nApplied Migrations:"));
          status.applied.forEach((m: MigrationVersion) => {
            const time = m.execution_time_ms
              ? ` (${m.execution_time_ms}ms)`
              : "";
            const rolledBack = m.rolled_back ? chalk.red(" [ROLLED BACK]") : "";
            console.log(
              `  ${chalk.green("✓")} ${m.version}. ${m.id} - ${m.name}${time}${rolledBack}`,
            );
          });
        }

        if (status.pending.length > 0) {
          console.log(chalk.bold("\nPending Migrations:"));
          status.pending.forEach((m) => {
            console.log(
              `  ${chalk.yellow("○")} ${m.version}. ${m.id} - ${m.name}`,
            );
          });
        }

        adapter.close();
      } catch (error) {
        spinner.fail("Failed to get migration status");
        console.error(error);
        process.exit(1);
      }
    });

  migrate
    .command("up")
    .description("Run pending migrations")
    .option(
      "-t, --target <version>",
      "Migrate up to specific version",
      parseInt,
    )
    .option("-d, --dry-run", "Show what would be migrated without executing")
    .option("-f, --force", "Force run even if checksums don't match")
    .action(async (options) => {
      const spinner = ora("Loading migrations...").start();

      try {
        const dbPath = await ApexConfig.getProjectDbPath();
        const adapter = await DatabaseAdapterFactory.create(dbPath);
        const loader = new MigrationLoader();
        const runner = new MigrationRunner(adapter);

        const migrations = await loader.loadMigrations();
        const status = runner.getStatus(migrations);

        if (status.pending.length === 0) {
          spinner.succeed("No pending migrations");
          adapter.close();
          return;
        }

        spinner.text = options.dryRun
          ? "Checking migrations (dry run)..."
          : "Running migrations...";

        await runner.runMigrations(migrations, {
          dryRun: options.dryRun,
          targetVersion: options.target,
          force: options.force,
        });

        spinner.succeed(
          options.dryRun
            ? "Dry run completed"
            : "Migrations completed successfully",
        );

        adapter.close();
      } catch (error) {
        spinner.fail("Migration failed");
        console.error(error);
        process.exit(1);
      }
    });

  migrate
    .command("down <count>")
    .description("Rollback migrations")
    .option("-d, --dry-run", "Show what would be rolled back without executing")
    .action(async (count: string, options) => {
      const spinner = ora("Loading migrations...").start();

      try {
        const rollbackCount = parseInt(count, 10);
        if (isNaN(rollbackCount) || rollbackCount < 1) {
          throw new Error("Count must be a positive number");
        }

        const dbPath = await ApexConfig.getProjectDbPath();
        const adapter = await DatabaseAdapterFactory.create(dbPath);
        const loader = new MigrationLoader();
        const runner = new MigrationRunner(adapter);

        const migrations = await loader.loadMigrations();
        const status = runner.getStatus(migrations);

        if (status.applied.length === 0) {
          spinner.succeed("No migrations to rollback");
          adapter.close();
          return;
        }

        const targetVersion = Math.max(
          0,
          status.applied.length - rollbackCount,
        );

        spinner.text = options.dryRun
          ? "Checking rollback (dry run)..."
          : "Rolling back migrations...";

        await runner.rollbackMigrations(migrations, targetVersion, {
          dryRun: options.dryRun,
        });

        spinner.succeed(
          options.dryRun
            ? "Dry run completed"
            : "Rollback completed successfully",
        );

        adapter.close();
      } catch (error) {
        spinner.fail("Rollback failed");
        console.error(error);
        process.exit(1);
      }
    });

  migrate
    .command("create <name>")
    .description("Create a new migration file")
    .action(async (name: string) => {
      const spinner = ora("Creating migration...").start();

      try {
        const loader = new MigrationLoader();
        const filePath = await loader.createMigration(name);

        spinner.succeed(`Created migration: ${filePath}`);
      } catch (error) {
        spinner.fail("Failed to create migration");
        console.error(error);
        process.exit(1);
      }
    });

  migrate
    .command("validate")
    .description("Validate all migrations")
    .action(async () => {
      const spinner = ora("Validating migrations...").start();

      try {
        const dbPath = await ApexConfig.getProjectDbPath();
        const adapter = await DatabaseAdapterFactory.create(dbPath);
        const loader = new MigrationLoader();
        const validator = new MigrationValidator(adapter.getInstance());

        const migrations = await loader.loadMigrations();

        spinner.text = "Running validation tests...";

        // Check for common issues first
        const issues = validator.checkCommonIssues(migrations);
        if (issues.length > 0) {
          spinner.warn("Found potential issues:");
          issues.forEach((issue) => console.log(chalk.yellow(`  ⚠ ${issue}`)));
          console.log("");
        }

        // Run full validation
        const valid = await validator.validateMigrations(migrations);

        if (valid) {
          spinner.succeed("All migrations validated successfully");
        } else {
          spinner.fail("Migration validation failed");
          process.exit(1);
        }

        adapter.close();
      } catch (error) {
        spinner.fail("Validation failed");
        console.error(error);
        process.exit(1);
      }
    });

  return migrate;
}
