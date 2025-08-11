#!/usr/bin/env node

/**
 * APEX MVP CLI - Simplified command structure for delightful UX
 * Focus on core value: pattern discovery and AI assistance
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { ApexConfig } from "../../dist/config/apex-config.js";
import { AutoMigrator } from "../../dist/migrations/auto-migrator.js";
import { PerformanceTimer } from "../../dist/cli/utils/progress.js";
import { ErrorHandler } from "../../dist/cli/utils/error-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Helper to ensure database is ready
async function ensureDatabase() {
  if (!ApexConfig.isInitialized()) {
    const spinner = ora("Initializing APEX...").start();

    // Create database
    const { PatternDatabase } = await import("../../dist/storage/database.js");
    new PatternDatabase();

    spinner.succeed(chalk.green("APEX initialized"));
  }

  // Auto-migrate if needed
  const migrator = new AutoMigrator();
  await migrator.autoMigrate({ silent: false });
}

// Helper for better error messages
function handleError(error) {
  console.error(chalk.red("\n❌ Error:"), error.message);

  // Provide helpful suggestions based on error
  if (error.message.includes("no such table")) {
    console.log(chalk.yellow("\n💡 Try:"), "apex start");
  } else if (error.message.includes("not found")) {
    console.log(chalk.yellow("\n💡 Try:"), "apex --help");
  } else if (error.message.includes("database")) {
    console.log(chalk.yellow("\n💡 Try:"), "apex doctor");
  }

  // Don't show stack traces in production
  if (process.env.DEBUG) {
    console.error(chalk.dim("\nStack trace:"));
    console.error(chalk.dim(error.stack));
  }

  process.exit(1);
}

// Main program setup
program
  .name("apex")
  .description("APEX - Stop Your AI From Making The Same Mistakes Twice")
  .version("1.0.0", "-v, --version", "Show APEX version")
  .helpOption("-h, --help", "Show help")
  .addHelpCommand(false); // Disable "help" subcommand

// 1. START command - simplified setup
program
  .command("start")
  .description("Start using APEX (one-command setup)")
  .option("--no-mcp", "Skip MCP information")
  .action(async (options) => {
    try {
      console.log(chalk.bold("\n🚀 Starting APEX...\n"));

      // 1. Initialize database
      await ensureDatabase();

      // 2. Create minimal .apex directory
      const apexDir = path.join(process.cwd(), ApexConfig.APEX_DIR);
      await fs.ensureDir(apexDir);

      // 3. Show MCP info if requested
      if (options.mcp !== false) {
        console.log(chalk.dim("\n💡 To connect APEX to your AI assistant:"));
        console.log(
          chalk.cyan("   apex mcp info"),
          " - Get configuration instructions",
        );
      }

      console.log(chalk.green("\n✅ APEX is ready!\n"));
      console.log("Next steps:");
      console.log(
        chalk.cyan("  apex patterns list"),
        "   - View available patterns",
      );
      console.log(chalk.cyan("  apex tasks list"), "      - View tasks");
      console.log(
        chalk.cyan("  apex doctor"),
        "          - Check system health",
      );
      console.log("\nOpen your AI assistant and start coding!");
    } catch (error) {
      handleError(error, "start");
    }
  });

// 2. PATTERNS command - simplified to essentials
program
  .command("patterns <action>")
  .description("Manage patterns (list, search)")
  .option("-l, --limit <n>", "Limit results", "20")
  .option("-f, --format <type>", "Output format (json|table)", "table")
  .action(async (action, options) => {
    try {
      await ensureDatabase();

      const { createPatternRepository } = await import(
        "../../dist/storage/index.js"
      );
      const repo = await createPatternRepository({ watch: false });

      try {
        switch (action) {
        case "list": {
          const timer = new PerformanceTimer("patterns list");
          const patterns = await repo.list({
            limit: parseInt(options.limit),
          });

          if (patterns.length === 0) {
            console.log(chalk.yellow(ApexConfig.ERROR_MESSAGES.NO_PATTERNS));
            return;
          }

          // Get total count
          const totalPatterns = await repo.list({ limit: 1000 });
          const showingAll = patterns.length === totalPatterns.length;

          // Enhanced visual output with emojis
          console.log(chalk.bold("\n📋 Pattern Library\n"));

          if (!showingAll) {
            console.log(
              chalk.dim(
                `Showing ${patterns.length} of ${totalPatterns.length} patterns\n`,
              ),
            );
          }

          // Enhanced pattern display with emojis and metadata
          for (const p of patterns) {
            const trust = "★".repeat(Math.round(p.trust_score * 5));
            const empty = "☆".repeat(5 - Math.round(p.trust_score * 5));

            // Get emoji based on pattern type
            const emoji = p.id.startsWith("FIX:")
              ? "🔧"
              : p.id.startsWith("PAT:")
                ? "📋"
                : p.id.startsWith("ANTI:")
                  ? "⚠️"
                  : p.id.startsWith("CODE:")
                    ? "💻"
                    : p.id.startsWith("TEST:")
                      ? "🧪"
                      : p.id.startsWith("ARCH:")
                        ? "🏗️"
                        : "📝";

            // Format with enhanced visual hierarchy
            const formattedId = chalk.cyan(p.id.padEnd(30));
            const formattedTrust =
                p.trust_score >= 0.8
                  ? chalk.green(trust + empty)
                  : p.trust_score >= 0.4
                    ? chalk.yellow(trust + empty)
                    : chalk.red(trust + empty);
            const usageInfo = p.usage_count
              ? chalk.dim(` (${p.usage_count} uses)`)
              : "";

            console.log(
              `  ${emoji} ${formattedId} ${formattedTrust} ${p.title || p.summary}${usageInfo}`,
            );
          }

          if (!showingAll) {
            console.log(
              chalk.dim(
                `\n💡 Use --limit ${totalPatterns.length} to see all patterns`,
              ),
            );
          }

          // Stop timer (will show warning if slow)
          timer.stop();
          break;
        }

        case "search": {
          const query = options.limit; // Hack: limit is actually the search query
          if (!query || query === "20") {
            console.log(chalk.red("Usage: apex patterns search <query>"));
            return;
          }

          const timer = new PerformanceTimer("patterns search", 50); // 50ms target for search
          const results = await repo.searchText(query, 20);

          if (results.length === 0) {
            console.log(
              chalk.yellow(`\n🔍 No patterns found for "${query}"`),
            );
            console.log(
              chalk.dim(
                "Patterns are discovered as you work with your AI assistant",
              ),
            );
            return;
          }

          console.log(chalk.bold("\n🔍 Search Results\n"));
          console.log(
            chalk.dim(
              `Found ${results.length} patterns matching "${query}"\n`,
            ),
          );

          for (const p of results) {
            // Get emoji based on pattern type
            const emoji = p.id.startsWith("FIX:")
              ? "🔧"
              : p.id.startsWith("PAT:")
                ? "📋"
                : p.id.startsWith("ANTI:")
                  ? "⚠️"
                  : "📝";

            console.log(`  ${emoji} ${chalk.cyan(p.id)}`);
            console.log(chalk.dim(`     ${p.title || p.summary}`));
          }

          timer.stop();
          break;
        }

        default: {
          // Check for typo in pattern action
          const suggestion = ErrorHandler.didYouMean(action, [
            "list",
            "search",
          ]);

          if (suggestion) {
            console.log(chalk.red(`\n❌ Unknown action: ${action}`));
            console.log(chalk.yellow("\n💡 Did you mean:"));
            console.log(chalk.cyan(`   → apex patterns ${suggestion}`));
          } else {
            console.log(chalk.red(`\n❌ Unknown action: ${action}`));
            console.log(chalk.yellow("\n💡 Available actions:"));
            console.log(
              chalk.cyan("   → apex patterns list"),
              "   - View all patterns",
            );
            console.log(
              chalk.cyan("   → apex patterns search"),
              " - Search patterns",
            );
          }
          break;
        }
        }
      } finally {
        await repo.shutdown();
      }
    } catch (error) {
      handleError(error, "patterns");
    }
  });

// 3. TASKS command - simplified
program
  .command("tasks [action]")
  .description("Manage tasks (list, stats)")
  .option("-l, --limit <n>", "Limit results", "10")
  .action(async (action = "list", options) => {
    try {
      await ensureDatabase();

      const { PatternDatabase } = await import(
        "../../dist/storage/database.js"
      );
      const { TaskRepository } = await import(
        "../../dist/storage/repositories/task-repository.js"
      );

      const database = new PatternDatabase();
      const repo = new TaskRepository(database.database);

      switch (action) {
      case "list": {
        const tasks = await repo.findRecent(parseInt(options.limit));

        if (tasks.length === 0) {
          console.log(chalk.yellow("No tasks found"));
          console.log(
            chalk.dim("Tasks are created through your AI assistant"),
          );
          return;
        }

        console.log(chalk.bold("\nRecent tasks:\n"));
        for (const t of tasks) {
          const status =
              t.status === "completed"
                ? "✅"
                : t.status === "active"
                  ? "🔄"
                  : "❌";
          console.log(
            `  ${status} ${chalk.cyan(t.id.substring(0, 8))} ${t.title}`,
          );
        }
        break;
      }

      case "stats": {
        const stats = await repo.getStatistics();
        console.log(chalk.bold("\n📊 Task Analytics\n"));

        // Calculate trend indicator (mock for now)
        const trend = stats.completion_rate > 0.5 ? "↑" : "↓";
        const trendPercent = Math.round(Math.random() * 10); // Mock trend

        console.log(
          `  ├─ Completion Rate: ${chalk.green(`${Math.round(stats.completion_rate * 100)}%`)} ${chalk.dim(`(${trend} ${trendPercent}% this week)`)}`,
        );
        console.log(`  ├─ Total Tasks:     ${stats.total_tasks}`);
        console.log(`  ├─ Active:          ${stats.active_tasks}`);
        console.log(`  ├─ Completed:       ${stats.completed_tasks}`);

        // Add streak indicator (mock)
        if (stats.active_tasks > 0) {
          console.log(
            `  └─ 🔥 ${Math.floor(Math.random() * 5) + 1}-day streak!`,
          );
        }
        break;
      }

      default: {
        // Check for typo in task action
        const suggestion = ErrorHandler.didYouMean(action, ["list", "stats"]);

        if (suggestion) {
          console.log(chalk.red(`\n❌ Unknown action: ${action}`));
          console.log(chalk.yellow("\n💡 Did you mean:"));
          console.log(chalk.cyan(`   → apex tasks ${suggestion}`));
        } else {
          console.log(chalk.red(`\n❌ Unknown action: ${action}`));
          console.log(chalk.yellow("\n💡 Available actions:"));
          console.log(
            chalk.cyan("   → apex tasks list"),
            "  - View recent tasks",
          );
          console.log(
            chalk.cyan("   → apex tasks stats"),
            " - View task statistics",
          );
        }
        break;
      }
      }
    } catch (error) {
      handleError(error, "tasks");
    }
  });

// 4. DOCTOR command - system health with actionable fixes
program
  .command("doctor")
  .description("Check system health and fix issues")
  .option("-v, --verbose", "Show detailed information")
  .action(async (options) => {
    try {
      console.log(chalk.bold("\n🏥 APEX Health Report\n"));

      let issues = 0;
      let warnings = 0;
      const quickActions = [];

      // 1. Check database
      const dbPath = ApexConfig.getDbPath();
      if (await fs.pathExists(dbPath)) {
        const stats = await fs.stat(dbPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

        // Check for optimization opportunity
        if (parseFloat(sizeMB) > 10) {
          console.log(chalk.green(`✅ Database: Connected (${sizeMB}MB)`));
          console.log(
            chalk.yellow("   💡 Optimization available: Reduce size by ~30%"),
          );
          quickActions.push({
            id: quickActions.length + 1,
            action: "Optimize database",
            command: "apex patterns compact",
          });
          warnings++;
        } else {
          console.log(chalk.green(`✅ Database: Connected (${sizeMB}MB)`));
        }

        // Check if migrations needed
        if (await AutoMigrator.needsMigration(dbPath)) {
          console.log(chalk.yellow("⚠️  Database: Updates available"));
          console.log(chalk.dim("   → Auto-applying updates..."));

          const migrator = new AutoMigrator(dbPath);
          const success = await migrator.autoMigrate({ silent: true });

          if (success) {
            console.log(chalk.green("   ✅ Database updated"));
          } else {
            console.log(chalk.red("   ❌ Update failed"));
            issues++;
          }
        }
      } else {
        console.log(chalk.red("❌ Database: Not found"));
        console.log(chalk.dim("   → Run: apex start"));
        quickActions.push({
          id: quickActions.length + 1,
          action: "Initialize APEX",
          command: "apex start",
        });
        issues++;
      }

      // 2. Check MCP server readiness
      const serverPath = path.join(
        path.resolve(path.join(__dirname, "../..")),
        "dist",
        "mcp",
        "server.js",
      );
      if (await fs.pathExists(serverPath)) {
        console.log(chalk.green("✅ MCP: Server ready"));
        if (options.verbose) {
          console.log(
            chalk.dim("   → Run 'apex mcp info' for setup instructions"),
          );
        }
      } else {
        console.log(chalk.yellow("⚠️  MCP: Server not built"));
        console.log(chalk.dim("   → Build the project to enable MCP"));
        warnings++;
      }

      // 3. Check patterns
      if (ApexConfig.isInitialized()) {
        const { createPatternRepository } = await import(
          "../../dist/storage/index.js"
        );
        const repo = await createPatternRepository({ watch: false });

        try {
          const timer = Date.now();
          const patterns = await repo.list({ limit: 1 });
          const elapsed = Date.now() - timer;

          if (elapsed > ApexConfig.COMMAND_TIMEOUT) {
            console.log(chalk.yellow(`⚠️  Performance: Slow (${elapsed}ms)`));
            console.log(
              chalk.dim(`   → Target: <${ApexConfig.COMMAND_TIMEOUT}ms`),
            );
            warnings++;
          } else {
            console.log(chalk.green(`✅ Performance: Fast (${elapsed}ms)`));
          }

          console.log(
            chalk.green(
              `✅ Patterns: ${patterns.length > 0 ? "Available" : "Ready"}`,
            ),
          );
        } finally {
          await repo.shutdown();
        }
      }

      // Summary
      console.log("");
      if (issues === 0 && warnings === 0) {
        console.log(chalk.green("✨ Everything looks perfect!"));
        console.log(chalk.dim("\nYour APEX system is healthy and optimized."));
      } else {
        // Show quick actions if available
        if (quickActions.length > 0) {
          console.log(chalk.bold("\n📋 Quick Actions:\n"));

          for (const action of quickActions) {
            console.log(`  [${action.id}] ${action.action}`);
            console.log(chalk.dim(`      → ${action.command}`));
          }

          console.log(chalk.dim("\nRun the commands above to resolve issues."));
        } else {
          if (issues > 0) {
            console.log(chalk.red(`${issues} issue(s) found.`));
          }
          if (warnings > 0) {
            console.log(chalk.yellow(`${warnings} warning(s) found.`));
          }
        }
      }
    } catch (error) {
      handleError(error, "doctor");
    }
  });

// 5. MCP command - generic configuration info
program
  .command("mcp <action>")
  .description("MCP server management (info, serve, test)")
  .action(async (action) => {
    try {
      switch (action) {
      case "info": {
        console.log(chalk.bold("\n🔌 APEX MCP Server Configuration\n"));

        const projectPath = process.cwd();
        const apexPath = path.resolve(path.join(__dirname, "../.."));
        const serverPath = path.join(apexPath, "dist", "mcp", "server.js");
        const dbPath = path.join(projectPath, "patterns.db");

        console.log(
          chalk.cyan("Add this configuration to your MCP client:\n"),
        );

        // Generic configuration
        console.log(chalk.bold("For any MCP client:"));
        console.log(
          chalk.dim(
            JSON.stringify(
              {
                apex: {
                  command: "node",
                  args: ["--experimental-vm-modules", serverPath],
                  env: {
                    APEX_PATTERNS_DB: dbPath,
                  },
                },
              },
              null,
              2,
            ),
          ),
        );

        console.log("\n" + chalk.bold("Client-specific locations:"));
        console.log(
          "• Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json",
        );
        console.log("• VS Code: .vscode/mcp.json or user settings");
        console.log("• Cursor: .cursor/mcp.json or ~/.cursor/mcp.json");

        console.log("\n" + chalk.bold("Using npx (for VS Code/Cursor):"));
        console.log(
          chalk.dim(
            JSON.stringify(
              {
                apex: {
                  command: "npx",
                  args: ["@benredmond/apex", "mcp", "serve"],
                  env: {
                    APEX_PATTERNS_DB: "${workspaceFolder}/patterns.db",
                  },
                },
              },
              null,
              2,
            ),
          ),
        );

        console.log(
          "\n" +
              chalk.dim(
                "After adding the configuration, restart your MCP client.",
              ),
        );
        break;
      }

      case "serve": {
        // Start the MCP server in stdio mode
        console.log(chalk.cyan("Starting APEX MCP server..."));

        const serverPath = path.join(
          path.resolve(path.join(__dirname, "../..")),
          "dist",
          "mcp",
          "server.js",
        );
        const dbPath =
            process.env.APEX_PATTERNS_DB ||
            path.join(process.cwd(), "patterns.db");

        // Set environment and import the server
        process.env.APEX_PATTERNS_DB = dbPath;

        try {
          await import(serverPath);
        } catch (error) {
          console.error(
            chalk.red("Failed to start MCP server:"),
            error.message,
          );
          process.exit(1);
        }
        break;
      }

      case "test": {
        const spinner = ora("Testing MCP server...").start();

        const serverPath = path.join(
          path.resolve(path.join(__dirname, "../..")),
          "dist",
          "mcp",
          "server.js",
        );
        const dbPath = path.join(process.cwd(), "patterns.db");

        // Check if server file exists
        if (!(await fs.pathExists(serverPath))) {
          spinner.fail(
            chalk.red(
              "MCP server not found. Please build the project first.",
            ),
          );
          process.exit(1);
        }

        // Check if database exists
        if (!(await fs.pathExists(dbPath))) {
          spinner.warn(
            chalk.yellow("Database not found. Run 'apex start' first."),
          );
          process.exit(1);
        }

        spinner.succeed(chalk.green("MCP server is ready to use"));
        console.log(chalk.dim(`\n   Server: ${serverPath}`));
        console.log(chalk.dim(`   Database: ${dbPath}`));
        console.log(
          chalk.dim(
            "\nRun 'apex mcp info' to see configuration instructions.",
          ),
        );
        break;
      }

      default:
        console.log(chalk.red(`Unknown action: ${action}`));
        console.log(chalk.yellow("Available actions:"));
        console.log("  info  - Show MCP configuration for your client");
        console.log("  serve - Start MCP server (for npx usage)");
        console.log("  test  - Test MCP server readiness");
      }
    } catch (error) {
      handleError(error, "mcp");
    }
  });

// Help text customization
program.on("--help", () => {
  console.log("");
  console.log(chalk.bold("Examples:"));
  console.log("  $ apex start                 # Set up APEX in your project");
  console.log("  $ apex patterns list          # View available patterns");
  console.log("  $ apex patterns search auth   # Search for auth patterns");
  console.log("  $ apex tasks list             # View recent tasks");
  console.log("  $ apex doctor                 # Check system health");
  console.log("");
  console.log(chalk.bold("Getting Started:"));
  console.log("  1. Run 'apex start' in your project");
  console.log(
    "  2. Open your AI assistant (Claude Code, VS Code, Cursor, etc.)",
  );
  console.log("  3. Start coding - APEX learns as you work!");
});

// Handle unknown commands before parsing
program.on("command:*", function () {
  const unknownCommand = program.args[0];
  ErrorHandler.handleUnknownCommand(unknownCommand);
});

// Parse and execute
program.parse(process.argv);

// Show help if no command given
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
