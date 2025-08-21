import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import { ApexConfig } from "../../config/apex-config.js";

/**
 * Get the platform-specific Claude configuration directory
 * @returns {string} The configuration file path
 */
export function getClaudeConfigPath() {
  const platform = process.platform;
  const homeDir = os.homedir();

  let configDir;
  switch (platform) {
  case "darwin":
    configDir = path.join(
      homeDir,
      "Library",
      "Application Support",
      "Claude",
    );
    break;
  case "win32":
    configDir = path.join(homeDir, "AppData", "Roaming", "Claude");
    break;
  case "linux":
    configDir = path.join(homeDir, ".config", "Claude");
    break;
  default:
    throw new Error(`Unsupported platform: ${platform}`);
  }

  return path.join(configDir, "claude_desktop_config.json");
}

/**
 * Configure MCP for the current project
 * @param {object} spinner - Optional ora spinner instance
 * @param {object} options - Configuration options
 * @returns {Promise<string>} The configuration file path
 */
export async function configureMCPForProject(spinner) {
  try {
    // Get platform-specific config path
    const configPath = getClaudeConfigPath();

    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    try {
      await fs.ensureDir(configDir);
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error.message}`);
    }

    // Read existing config or create new one
    let config = {};
    if (await fs.pathExists(configPath)) {
      try {
        config = await fs.readJson(configPath);
      } catch (error) {
        console.warn(
          chalk.yellow(
            "Warning: Could not parse existing claude_desktop_config.json",
          ),
        );
        console.warn(
          chalk.yellow("Creating backup at claude_desktop_config.json.backup"),
        );

        // Create backup of corrupted config
        try {
          await fs.copy(configPath, `${configPath}.backup`);
        } catch (backupError) {
          console.warn(
            chalk.yellow(`Could not create backup: ${backupError.message}`),
          );
        }

        config = {};
      }
    }

    // Ensure mcpServers object exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    // Get the APEX package root (go up from dist/cli/utils to root)
    const apexPath = path.resolve(path.join(import.meta.dirname, "../../.."));

    // Validate APEX server file exists
    const serverPath = path.join(apexPath, "dist", "mcp", "server.js");
    if (!(await fs.pathExists(serverPath))) {
      throw new Error(
        `APEX MCP server not found at ${serverPath}. Please build the project first.`,
      );
    }

    // Validate project has .apex directory or project-specific database
    const isInitialized = await ApexConfig.isInitialized();
    if (!isInitialized) {
      throw new Error(
        "APEX not initialized in current directory. Run 'apex init' first.",
      );
    }

    // Get the project-specific database path using centralized configuration
    // This will return ~/.apex/<repo-id>/patterns.db for the current project
    const dbPath = await ApexConfig.getProjectDbPath();

    // Configure the MCP server
    config.mcpServers["apex-mcp"] = {
      command: "node",
      args: ["--experimental-vm-modules", serverPath],
      env: {
        APEX_PATTERNS_DB: dbPath,
      },
    };

    // Write updated config with error handling
    try {
      await fs.writeJson(configPath, config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to write configuration: ${error.message}`);
    }

    if (spinner) {
      spinner.text = "MCP configured successfully";
    }

    return configPath;
  } catch (error) {
    // Re-throw with context
    throw new Error(`MCP configuration failed: ${error.message}`);
  }
}
