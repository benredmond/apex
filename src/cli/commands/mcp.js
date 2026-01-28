import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import {
  configureMCPForProject,
  getClaudeConfigPath,
} from "../utils/mcp-config.js";

export function createMCPCommand() {
  const mcp = new Command("mcp");

  mcp.description("Manage MCP (Model Context Protocol) configuration for APEX");

  mcp
    .command("install")
    .description("Install and configure MCP for APEX")
    .option(
      "--config-path <path>",
      "Custom path for claude_desktop_config.json",
    )
    .action(async (_options) => {
      console.log(chalk.cyan("\n🔧 Installing APEX MCP Server...\n"));

      const spinner = ora("Configuring MCP...").start();

      try {
        // Check if apex directory exists
        if (!(await fs.pathExists("apex"))) {
          spinner.fail("APEX not initialized. Run 'apex init' first.");
          process.exit(1);
        }

        // Configure MCP with proper error handling
        const configPath = await configureMCPForProject(spinner);

        spinner.succeed("MCP configured successfully!");

        console.log(chalk.green("\n✨ APEX MCP Server installed!\n"));
        console.log("Configuration written to:");
        console.log(chalk.cyan(`  ${configPath}\n`));
        console.log("Next steps:");
        console.log(chalk.cyan("  1. Restart Claude Desktop"));
        console.log(chalk.cyan("  2. The APEX MCP server will be available"));
        console.log(
          chalk.cyan(
            "  3. Use MCP tools like apex_patterns_lookup in Claude\n",
          ),
        );
      } catch (error) {
        spinner.fail(`Failed to configure MCP: ${error.message}`);
        console.error(chalk.red("\nError details:"), error);
        process.exit(1);
      }
    });

  mcp
    .command("verify")
    .description("Verify MCP installation and configuration")
    .action(async () => {
      const spinner = ora("Verifying MCP configuration...").start();

      try {
        // Use platform-specific config path
        const configPath = getClaudeConfigPath();

        // Check if config exists
        if (!(await fs.pathExists(configPath))) {
          spinner.fail("MCP config not found. Run 'apex mcp install' first.");
          process.exit(1);
        }

        // Read and validate config with error handling
        let config;
        try {
          config = await fs.readJson(configPath);
        } catch (error) {
          spinner.fail(`Failed to read config file: ${error.message}`);
          process.exit(1);
        }

        if (!config.mcpServers || !config.mcpServers["apex-mcp"]) {
          spinner.fail(
            "APEX MCP server not configured. Run 'apex mcp install'.",
          );
          process.exit(1);
        }

        spinner.stop();

        console.log(chalk.green("\n✅ MCP Configuration Valid\n"));
        console.log("APEX MCP Server configuration:");
        console.log(
          chalk.cyan(JSON.stringify(config.mcpServers["apex-mcp"], null, 2)),
        );

        // Check if the server file exists with proper error handling
        const serverPath = config.mcpServers["apex-mcp"].args[1];
        try {
          if (await fs.pathExists(serverPath)) {
            console.log(chalk.green("\n✓ Server file exists"));
          } else {
            console.log(
              chalk.yellow("\n⚠ Server file not found at configured path"),
            );
          }
        } catch (error) {
          console.log(
            chalk.yellow(`\n⚠ Could not verify server file: ${error.message}`),
          );
        }

        // Check if patterns DB exists with proper error handling
        const dbPath = config.mcpServers["apex-mcp"].env.APEX_PATTERNS_DB;
        try {
          if (await fs.pathExists(dbPath)) {
            console.log(chalk.green("✓ Patterns database exists"));
          } else {
            console.log(
              chalk.yellow(
                "⚠ Patterns database not found (will be created on first use)",
              ),
            );
          }
        } catch (error) {
          console.log(
            chalk.yellow(`⚠ Could not verify database: ${error.message}`),
          );
        }
      } catch (error) {
        spinner.fail(`Failed to verify MCP: ${error.message}`);
        process.exit(1);
      }
    });

  return mcp;
}
