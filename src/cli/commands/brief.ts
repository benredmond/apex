// [PAT:CLI:COMMANDER] ★★★★☆ (245 uses, 92% success) - Commander.js CLI framework
// [FIX:ASYNC:ERROR] ★★★★★ (234 uses, 98% success) - Proper async error handling
// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { getSharedMCPClient } from "./shared/mcp-client.js";
import { FormatterFactory } from "./shared/formatters.js";
import { withProgress } from "./shared/progress.js";

/**
 * Create the brief command for managing APEX briefs
 * Briefs are structured task descriptions that guide AI assistants
 */
export function createBriefCommand(): Command {
  const brief = new Command("brief").description(
    "Manage APEX briefs for structured task execution",
  );

  brief
    .command("create <description>")
    .description("Create a new brief for task execution")
    .option("--template <name>", "Use a specific template")
    .option("--priority <level>", "Set priority (low|medium|high)", "medium")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "json")
    .action(async (description: string, options) => {
      try {
        const spinner = ora("Creating brief...").start();

        // Use MCP client to create brief
        const mcpClient = getSharedMCPClient();
        const result = await mcpClient.call("createBrief", {
          description,
          template: options.template,
          priority: options.priority,
        });

        if (!result.success) {
          spinner.fail(`Failed to create brief: ${result.error}`);
          process.exit(1);
        }

        spinner.succeed(
          chalk.green(`✓ Brief created: ${result.data?.id || "unknown"}`),
        );

        // Display brief details
        if (result.data) {
          console.log("\nBrief Details:");
          const formatter = FormatterFactory.create(options.format);
          console.log(formatter.format(result.data));
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  brief
    .command("show <brief-id>")
    .description("Display details of a specific brief")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .action(async (briefId: string, options) => {
      try {
        // Use MCP client to fetch brief
        const mcpClient = getSharedMCPClient();

        const result = await withProgress(
          mcpClient.call("showBrief", { id: briefId }),
          `Fetching brief ${briefId}...`,
        );

        if (!result.success) {
          console.error(chalk.red(`Brief not found: ${result.error}`));
          process.exit(1);
        }

        // Display brief
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

  brief
    .command("ack <brief-id>")
    .description("Acknowledge a brief to mark it as understood")
    .action(async (briefId: string) => {
      try {
        const spinner = ora(`Acknowledging brief ${briefId}...`).start();

        // Use MCP client to acknowledge brief
        const mcpClient = getSharedMCPClient();
        const result = await mcpClient.call("ackBrief", { id: briefId });

        if (!result.success) {
          spinner.fail(`Failed to acknowledge brief: ${result.error}`);
          process.exit(1);
        }

        spinner.succeed(chalk.green(`✓ Brief ${briefId} acknowledged`));

        // Display any additional information
        if (result.data?.message) {
          console.log(chalk.gray(`  ${result.data.message}`));
        }
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  brief
    .command("list")
    .description("List all available briefs")
    .option(
      "--status <status>",
      "Filter by status (pending|acknowledged|completed)",
    )
    .option("--priority <level>", "Filter by priority (low|medium|high)")
    .option("-f, --format <type>", "Output format (json|table|yaml)", "table")
    .option("-l, --limit <number>", "Maximum results", "20")
    .action(async (options) => {
      try {
        const spinner = ora("Fetching briefs...").start();

        // Use MCP client to list briefs
        const mcpClient = getSharedMCPClient();
        const result = await mcpClient.call("listBriefs", {
          status: options.status,
          priority: options.priority,
          limit: parseInt(options.limit),
        });

        spinner.stop();

        if (!result.success) {
          console.error(chalk.red(`Failed to list briefs: ${result.error}`));
          process.exit(1);
        }

        const briefs = result.data || [];

        if (briefs.length === 0) {
          console.log(chalk.yellow("No briefs found"));
          return;
        }

        console.log(chalk.bold(`\nFound ${briefs.length} brief(s):\n`));

        // Format and display
        const formatter = FormatterFactory.create(options.format);
        console.log(formatter.format(briefs));
      } catch (error) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  return brief;
}

// Note: MCP server tools for briefs (apex_brief_create, apex_brief_show, apex_brief_ack)
// will need to be implemented in the MCP server to support these commands
