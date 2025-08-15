#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { createPatternRepository } from "../../../dist/storage/index.js"; // [FIX:NODE:ESMODULE_IMPORTS] ★★★★★

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create the doctor command for system health checks
 */
export function createDoctorCommand() {
  const doctor = new Command("doctor");

  doctor
    .description("Check APEX system health and diagnose issues")
    .option("-v, --verbose", "Show detailed diagnostic information")
    .action(async (options) => {
      console.log(chalk.cyan.bold("\n🩺 APEX System Health Check\n"));

      const checks = [];
      let hasWarnings = false;
      let hasFailures = false;

      // Run all health checks
      checks.push(await checkDatabase());
      checks.push(await checkMcpServer());
      checks.push(await checkPatternPerformance());
      checks.push(await checkRepositoryHealth());

      // Display results
      for (const check of checks) {
        let icon, color;

        switch (check.status) {
          case "pass":
            icon = "✅";
            color = chalk.green;
            break;
          case "warn":
            icon = "⚠️";
            color = chalk.yellow;
            hasWarnings = true;
            break;
          case "fail":
            icon = "❌";
            color = chalk.red;
            hasFailures = true;
            break;
        }

        let output = `${icon} ${chalk.bold(check.name)}: ${color(check.message)}`;

        if (check.metric && check.target) {
          output += chalk.gray(` (${check.metric}, target: ${check.target})`);
        } else if (check.metric) {
          output += chalk.gray(` (${check.metric})`);
        }

        console.log(output);

        if (options.verbose && check.fix && check.status !== "pass") {
          console.log(chalk.gray(`   💡 ${check.fix}`));
        }
      }

      // Summary
      console.log();
      if (hasFailures) {
        console.log(
          chalk.red.bold(
            `${checks.filter((c) => c.status === "fail").length} failure(s) found.`,
          ),
        );
        if (!options.verbose) {
          console.log(
            chalk.gray("Run 'apex doctor --verbose' for fix suggestions."),
          );
        }
        process.exit(1);
      } else if (hasWarnings) {
        console.log(
          chalk.yellow.bold(
            `${checks.filter((c) => c.status === "warn").length} warning(s) found.`,
          ),
        );
        if (!options.verbose) {
          console.log(chalk.gray("Run 'apex doctor --verbose' for details."));
        }
      } else {
        console.log(chalk.green.bold("All systems operational! 🚀"));
      }
    });

  return doctor;
}

/**
 * Check database connection and status
 */
async function checkDatabase() {
  try {
    // Use centralized config for database path
    const { ApexConfig } = await import("../../config/apex-config.js");
    const dbPath = await ApexConfig.getProjectDbPath();

    if (!fs.existsSync(dbPath)) {
      return {
        name: "Database",
        status: "fail",
        message: "Not found",
        metric: null,
        fix: "Run 'apex start' to initialize the database",
      };
    }

    // Check file permissions
    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      return {
        name: "Database",
        status: "fail",
        message: "Permission denied",
        metric: null,
        fix: `Fix permissions: chmod 664 ${dbPath}`,
      };
    }

    // Get file size
    const stats = fs.statSync(dbPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

    // Try to open repository and test connection
    let repo;
    try {
      repo = await createPatternRepository({ dbPath });
      // Quick test query
      await repo.list({ limit: 1 });

      return {
        name: "Database",
        status: "pass",
        message: "Connected",
        metric: `patterns.db, ${sizeMB}MB`,
      };
    } catch (dbError) {
      return {
        name: "Database",
        status: "fail",
        message: "Database error",
        metric: dbError.message,
        fix: "Database may be corrupted. Run 'apex migrate up' to repair",
      };
    } finally {
      if (repo) {
        await repo.shutdown();
      }
    }
  } catch (error) {
    return {
      name: "Database",
      status: "fail",
      message: "Check failed",
      metric: error.message,
      fix: "Unexpected error accessing database",
    };
  }
}

/**
 * Check MCP server status
 */
async function checkMcpServer() {
  try {
    // Check if running as MCP server by looking for MCP environment variables
    const isMcpServer = process.env.MCP_SERVER_NAME === "@benredmond/apex";

    if (isMcpServer) {
      const port = process.env.MCP_PORT || "stdio";
      return {
        name: "MCP Server",
        status: "pass",
        message: "Running",
        metric: `mode: ${port}`,
      };
    }

    // Check if MCP is configured
    const configPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config.mcpServers && config.mcpServers["apex-mcp"]) {
          return {
            name: "MCP Server",
            status: "pass",
            message: "Configured",
            metric: "Ready for Claude Code",
          };
        }
      } catch (err) {
        // Config exists but couldn't parse
      }
    }

    return {
      name: "MCP Server",
      status: "warn",
      message: "Not configured",
      metric: null,
      fix: "Run 'apex mcp install' to configure MCP for Claude Code",
    };
  } catch (error) {
    return {
      name: "MCP Server",
      status: "warn",
      message: "Check skipped",
      metric: error.message,
    };
  }
}

/**
 * Check pattern query performance
 */
async function checkPatternPerformance() {
  try {
    // Use centralized config for database path
    const { ApexConfig } = await import("../../config/apex-config.js");
    const dbPath = await ApexConfig.getProjectDbPath();

    if (!fs.existsSync(dbPath)) {
      return {
        name: "Pattern Retrieval",
        status: "skip",
        message: "Skipped",
        metric: "Database not found",
      };
    }

    let repo;
    try {
      repo = await createPatternRepository({ dbPath });

      // Run 3 queries and average the time
      const times = [];

      for (let i = 0; i < 3; i++) {
        const start = process.hrtime.bigint();
        await repo.list({ limit: 10 }); // Small query
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1000000; // Convert nanoseconds to milliseconds
        times.push(ms);
      }

      const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);

      if (avgMs < 50) {
        return {
          name: "Pattern Retrieval",
          status: "pass",
          message: `${avgMs}ms`,
          target: "<50ms",
        };
      } else if (avgMs < 100) {
        return {
          name: "Pattern Retrieval",
          status: "warn",
          message: `${avgMs}ms`,
          target: "<50ms",
          fix: "Consider running 'apex patterns reindex' to optimize",
        };
      } else {
        return {
          name: "Pattern Retrieval",
          status: "fail",
          message: `${avgMs}ms`,
          target: "<50ms",
          fix: "Database performance is slow. Run 'apex patterns reindex'",
        };
      }
    } finally {
      if (repo) {
        await repo.shutdown();
      }
    }
  } catch (error) {
    return {
      name: "Pattern Retrieval",
      status: "fail",
      message: "Test failed",
      metric: error.message,
    };
  }
}

/**
 * Check repository health
 */
async function checkRepositoryHealth() {
  try {
    // Use centralized config for database path
    const { ApexConfig } = await import("../../config/apex-config.js");
    const dbPath = await ApexConfig.getProjectDbPath();

    if (!fs.existsSync(dbPath)) {
      return {
        name: "Task Repository",
        status: "skip",
        message: "Skipped",
        metric: "Database not found",
      };
    }

    let repo;
    try {
      repo = await createPatternRepository({ dbPath });

      // Count patterns
      const patterns = await repo.list({ limit: 1000 });
      const patternCount = patterns.length;

      // Check for basic integrity
      const hasPatterns = patternCount > 0;

      if (hasPatterns) {
        return {
          name: "Task Repository",
          status: "pass",
          message: "Healthy",
          metric: `${patternCount} patterns`,
        };
      } else {
        return {
          name: "Task Repository",
          status: "warn",
          message: "Empty",
          metric: "0 patterns",
          fix: "Consider running 'apex pack install' to add patterns",
        };
      }
    } catch (queryError) {
      return {
        name: "Task Repository",
        status: "fail",
        message: "Query error",
        metric: queryError.message,
        fix: "Database may need migration. Run 'apex migrate up'",
      };
    } finally {
      if (repo) {
        await repo.shutdown();
      }
    }
  } catch (error) {
    return {
      name: "Task Repository",
      status: "fail",
      message: "Check failed",
      metric: error.message,
    };
  }
}
