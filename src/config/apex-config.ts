/**
 * Centralized configuration for APEX
 * Single source of truth for all paths and settings
 */

import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ApexConfig {
  // Database - always in project root for simplicity
  static readonly DB_PATH = "patterns.db";

  // Directories
  static readonly APEX_DIR = ".apex";
  static readonly PATTERNS_DIR = path.join(ApexConfig.APEX_DIR, "patterns");
  static readonly MCP_CONFIG = path.join(ApexConfig.APEX_DIR, "mcp.json");

  // Performance settings
  static readonly DEFAULT_CACHE_SIZE = 100;
  static readonly COMMAND_TIMEOUT = 100; // ms - target for list operations
  static readonly PROGRESS_THRESHOLD = 500; // ms - show progress indicator after this

  // Migration settings
  static readonly AUTO_MIGRATE = true; // Auto-apply migrations
  static readonly MIGRATIONS_DIR = path.join(
    __dirname,
    "..",
    "migrations",
    "migrations",
  );

  // User-friendly messages
  static readonly ERROR_MESSAGES = {
    NO_DB: "Database not initialized. Run 'apex start' to set up your project.",
    NO_MCP:
      "MCP not configured. Run 'apex mcp setup' to integrate with AI assistants.",
    NO_PATTERNS: "No patterns found. Patterns will be discovered as you work.",
    MIGRATION_FAILED:
      "Database update failed. Run 'apex doctor' for diagnostics.",
    COMMAND_NOT_FOUND: (cmd: string) =>
      `Command '${cmd}' not found. Run 'apex --help' for available commands.`,
  };

  // Feature flags for MVP
  static readonly FEATURES = {
    WATCHING: false, // Disable file watching by default
    AUTO_INIT: true, // Auto-initialize on first command
    VERBOSE_ERRORS: false, // Show stack traces
    TELEMETRY: false, // No telemetry in MVP
  };

  /**
   * Get the project root directory
   */
  static getProjectRoot(): string {
    return process.cwd();
  }

  /**
   * Get the full database path
   */
  static getDbPath(): string {
    return path.join(ApexConfig.getProjectRoot(), ApexConfig.DB_PATH);
  }

  /**
   * Check if APEX is initialized in current project
   */
  static isInitialized(): boolean {
    return fs.existsSync(ApexConfig.getDbPath());
  }
}
