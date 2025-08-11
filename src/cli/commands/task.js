#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { TaskRepository } from "../../../dist/storage/repositories/task-repository.js";
import { PatternDatabase } from "../../../dist/storage/database.js";
import { FormatterFactory } from "../../../dist/cli/commands/shared/formatters.js";
import {
  validateOptions,
  displayValidationErrors,
  validateTaskId,
} from "../../../dist/cli/commands/shared/validators.js";
import { PerformanceTimer } from "../../../dist/cli/commands/shared/progress.js";

// [FIX:NODE:ESMODULE_IMPORTS] ★★★★☆ - All imports use .js extension
// [APEX.SYSTEM:PAT:AUTO:gRp2Ji6F] - MCP Tool Registry Pattern

let repository = null;
async function getRepository() {
  if (!repository) {
    // Use the main patterns.db file in project root
    const database = new PatternDatabase("patterns.db");
    repository = new TaskRepository(database.database); // Use the getter
  }
  return repository;
}

export function createTaskCommand() {
  const tasks = new Command("tasks").description("Manage APEX tasks");

  // List tasks command
  tasks
    .command("list")
    .description("List tasks with filtering and formatting options")
    .option(
      "--status <status>",
      "Filter by status (active|completed|failed|blocked)",
    )
    .option(
      "--phase <phase>",
      "Filter by phase (ARCHITECT|BUILDER|VALIDATOR|REVIEWER|DOCUMENTER)",
    )
    .option("--since <date>", "Show tasks created or updated since date")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .option("-l, --limit <number>", "Maximum results", "20")
    .action(async (options) => {
      try {
        const timer = new PerformanceTimer();
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        const repo = await getRepository();
        let tasks = [];

        // Apply filters based on options
        if (validation.validated.status === "active") {
          tasks = await repo.findActive();
        } else if (validation.validated.status) {
          tasks = await repo.findByStatus(
            validation.validated.status,
            parseInt(validation.validated.limit || "20"),
          );
        } else {
          // Get all recent tasks
          tasks = await repo.findRecent(
            parseInt(validation.validated.limit || "20"),
          );
        }

        // Filter by phase if specified
        if (validation.validated.phase) {
          tasks = tasks.filter(
            (t) => t.current_phase === validation.validated.phase,
          );
        }

        // Filter by date if specified
        if (validation.validated.since) {
          const sinceDate = new Date(validation.validated.since);
          tasks = tasks.filter((t) => {
            const taskDate = new Date(t.updated_at || t.created_at);
            return taskDate >= sinceDate;
          });
        }

        // Limit results
        const limit = parseInt(validation.validated.limit || "20");
        tasks = tasks.slice(0, limit);

        // Format output
        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(tasks));

        if (!timer.meetsRequirement(100)) {
          console.warn(
            chalk.yellow(
              `Warning: List operation took ${timer.elapsed().toFixed(0)}ms (target: < 100ms)`,
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

  // Show task details command
  tasks
    .command("show <id>")
    .description("Show detailed information about a specific task")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .option("--evidence", "Include execution evidence")
    .option("--brief", "Show full brief details")
    .action(async (id, options) => {
      try {
        const timer = new PerformanceTimer();
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        // Validate task ID
        if (!validateTaskId(id)) {
          console.error(chalk.red("Error: Invalid task ID format"));
          process.exit(1);
        }

        const repo = await getRepository();
        const task = await repo.findById(id);

        if (!task) {
          console.error(chalk.red(`Error: Task '${id}' not found`));
          process.exit(1);
        }

        // Include evidence if requested
        if (validation.validated.evidence && task.evidence) {
          task.evidence_entries = task.evidence;
        }

        // Include full brief if requested
        if (validation.validated.brief && task.brief) {
          task.full_brief = task.brief;
        }

        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(task));

        if (!timer.meetsRequirement(50)) {
          console.warn(
            chalk.yellow(
              `Warning: Show operation took ${timer.elapsed().toFixed(0)}ms (target: < 50ms)`,
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

  // Task statistics command
  tasks
    .command("stats")
    .description("Show task statistics and metrics")
    .option("--period <period>", "Time period (today|week|month|all)", "week")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (options) => {
      try {
        const timer = new PerformanceTimer();
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        const repo = await getRepository();
        const stats = await repo.getStatistics(
          validation.validated.period || "week",
        );

        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(stats));

        if (!timer.meetsRequirement(200)) {
          console.warn(
            chalk.yellow(
              `Warning: Stats operation took ${timer.elapsed().toFixed(0)}ms (target: < 200ms)`,
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

  // Recent tasks command
  tasks
    .command("recent")
    .description("Show recently completed tasks")
    .option("-l, --limit <number>", "Maximum results", "10")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (options) => {
      try {
        const timer = new PerformanceTimer();
        const validation = validateOptions(options);
        if (!validation.valid) {
          displayValidationErrors(validation.errors);
          process.exit(1);
        }

        const repo = await getRepository();
        const tasks = await repo.findByStatus(
          "completed",
          parseInt(validation.validated.limit || "10"),
        );

        const formatter = FormatterFactory.create(
          validation.validated.format || "table",
        );
        console.log(formatter.format(tasks));

        if (!timer.meetsRequirement(100)) {
          console.warn(
            chalk.yellow(
              `Warning: Recent operation took ${timer.elapsed().toFixed(0)}ms (target: < 100ms)`,
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

  return tasks;
}
