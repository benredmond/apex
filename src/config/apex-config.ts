/**
 * Centralized configuration for APEX
 * Single source of truth for all paths and settings
 */

import path from "path";
import os from "os";
import fs from "fs";
import { fileURLToPath } from "url";
import { RepoIdentifier } from "../utils/repo-identifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ApexConfig {
  // Database - project-specific by default
  static readonly DB_PATH = "patterns.db"; // Legacy fallback

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
   * Get the full database path (legacy method for backward compatibility)
   */
  static getDbPath(): string {
    return path.join(ApexConfig.getProjectRoot(), ApexConfig.DB_PATH);
  }

  /**
   * Get project-specific database path
   * Priority order:
   * 1. APEX_PATTERNS_DB environment variable
   * 2. Project-specific path in ~/.apex/<repo-id>/patterns.db
   * 3. Legacy project location (.apex/patterns.db or patterns.db)
   */
  static async getProjectDbPath(): Promise<string> {
    // Check environment variable override first
    if (process.env.APEX_PATTERNS_DB) {
      return process.env.APEX_PATTERNS_DB;
    }

    // Get all possible database paths
    const paths = await RepoIdentifier.getDatabasePaths();

    // If legacy database exists and primary doesn't, use legacy for now
    // This ensures backward compatibility during transition
    if (paths.legacy && !fs.existsSync(paths.primary)) {
      return paths.legacy;
    }

    // Return project-specific path (will be created if doesn't exist)
    return paths.primary;
  }

  /**
   * Get global/shared patterns database path
   */
  static async getGlobalDbPath(): Promise<string> {
    const paths = await RepoIdentifier.getDatabasePaths();
    return paths.fallback;
  }

  /**
   * Get all database paths (primary, fallback, legacy)
   */
  static async getAllDbPaths(): Promise<{
    primary: string;
    fallback: string;
    legacy?: string;
  }> {
    return await RepoIdentifier.getDatabasePaths();
  }

  /**
   * Ensure directory exists for a database path
   */
  static ensureDbDirectory(dbPath: string): void {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Migrate legacy database to project-specific location
   * Returns true if migration was performed
   */
  static async migrateLegacyDatabase(): Promise<boolean> {
    const paths = await RepoIdentifier.getDatabasePaths();
    
    // Check if migration is needed
    if (!paths.legacy || !fs.existsSync(paths.legacy)) {
      return false; // No legacy database to migrate
    }
    
    if (fs.existsSync(paths.primary)) {
      return false; // Project database already exists
    }
    
    try {
      // Ensure target directory exists
      ApexConfig.ensureDbDirectory(paths.primary);
      
      // Copy legacy database to new location
      fs.copyFileSync(paths.legacy, paths.primary);
      
      console.log(`Migrated database from ${paths.legacy} to ${paths.primary}`);
      return true;
    } catch (error) {
      console.error('Failed to migrate legacy database:', error);
      // Remove partial migration if it failed
      if (fs.existsSync(paths.primary)) {
        fs.unlinkSync(paths.primary);
      }
      return false;
    }
  }

  /**
   * Check if APEX is initialized in current project
   * Checks both legacy and new locations
   */
  static async isInitialized(): Promise<boolean> {
    // Check legacy location first
    if (fs.existsSync(ApexConfig.getDbPath())) {
      return true;
    }

    // Check new project-specific location
    const projectDb = await ApexConfig.getProjectDbPath();
    return fs.existsSync(projectDb);
  }
}
