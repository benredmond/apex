/**
 * Repository identifier utilities for project-based pattern isolation
 * Generates unique, stable identifiers for projects
 */

import { spawn as childProcessSpawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export class RepoIdentifier {
  private static apexHomeDir: string | null = null;
  private static spawnImplementation: typeof childProcessSpawn =
    childProcessSpawn;

  /**
   * Override the spawn implementation (primarily for testing with module mocks).
   */
  static setSpawnImplementation(spawnFn: typeof childProcessSpawn): void {
    this.spawnImplementation = spawnFn;
  }

  /**
   * Reset spawn implementation back to the Node default.
   */
  static resetSpawnImplementation(): void {
    this.spawnImplementation = childProcessSpawn;
  }

  /**
   * Get a unique identifier for the current repository/project
   * Priority order:
   * 1. Git remote URL → sanitized identifier
   * 2. Git local repo → hash of .git path
   * 3. Non-git project → hash of absolute path
   */
  static async getIdentifier(): Promise<string> {
    if (process.env.APEX_PROJECT_ID) {
      return process.env.APEX_PROJECT_ID;
    }

    try {
      // Try to get git remote URL first
      const remoteUrl = await this.getGitRemoteUrl();
      if (remoteUrl) {
        return this.sanitizeGitUrl(remoteUrl);
      }
    } catch {
      // Not a git repo or no remote, continue
    }

    // Check if it's a local git repo (no remote)
    if (await this.isGitRepo()) {
      const repoPath = process.cwd();
      return `local-${this.hashPath(repoPath)}`;
    }

    // Non-git project - use path hash
    const projectPath = process.cwd();
    return `path-${this.hashPath(projectPath)}`;
  }

  /**
   * Get git remote URL if available
   * Uses spawn for safe command execution (PAT:SECURITY:SPAWN)
   */
  private static async getGitRemoteUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      const git = this.spawnImplementation(
        "git",
        ["config", "--get", "remote.origin.url"],
        {
          cwd: process.cwd(),
        },
      );

      if (!git) {
        resolve(null);
        return;
      }

      let stdout = "";
      let stderr = "";
      let finished = false;

      const settle = (value: string | null) => {
        if (!finished) {
          finished = true;
          resolve(value);
        }
      };

      git.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      git.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      git.on("close", (code: number | null) => {
        if (code === 0 && stdout.trim()) {
          settle(stdout.trim());
        } else {
          settle(null);
        }
      });

      git.on("error", () => {
        // Git not available or other spawn error
        settle(null);
      });
    });
  }

  /**
   * Check if current directory is a git repository
   */
  private static async isGitRepo(): Promise<boolean> {
    try {
      const gitDir = path.join(process.cwd(), ".git");
      return fs.existsSync(gitDir);
    } catch {
      return false;
    }
  }

  /**
   * Sanitize a git URL into a safe directory name
   * Examples:
   *   git@github.com:benredmond/apex.git → github-benredmond-apex
   *   https://github.com/benredmond/apex.git → github-benredmond-apex
   *   git@gitlab.com:user/project.git → gitlab-user-project
   */
  private static sanitizeGitUrl(url: string): string {
    // First, sanitize dangerous characters to prevent injection
    url = url.replace(/[;&`$|<>(){}[\]\\]/g, "");

    // Remove .git extension (now safer after sanitization)
    url = url.replace(/\.git$/, "");

    // Handle SSH URLs (git@host:user/repo)
    if (url.startsWith("git@")) {
      url = url.replace(/^git@/, "");
      url = url.replace(":", "/");
    }

    // Handle HTTPS URLs (https://host/user/repo)
    if (url.startsWith("https://") || url.startsWith("http://")) {
      url = url.replace(/^https?:\/\//, "");
    }

    // Extract domain and path
    const parts = url.split("/");
    if (parts.length >= 2) {
      // Get domain (e.g., github.com → github, custom.host.com → custom-host)
      const domain = parts[0]
        .replace(/\.(com|org|net|io)$/, "") // Remove TLD
        .replace(/\./g, "-"); // Replace remaining dots with dashes
      // Join remaining parts with dash
      const projectPath = parts.slice(1).join("-");
      return `${domain}-${projectPath}`;
    }

    // Fallback: just sanitize the whole URL
    return url.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  }

  /**
   * Create a short hash from a file path
   * Returns first 8 characters of SHA256 hash
   */
  private static hashPath(filePath: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(filePath);
    return hash.digest("hex").substring(0, 8);
  }

  /**
   * Get all possible database paths for the current project
   * Returns paths in priority order
   */
  static async getDatabasePaths(): Promise<{
    primary: string;
    fallback: string;
  }> {
    const homeDir = this.resolveApexHomeDir();
    const identifier = await this.getIdentifier();

    // Primary: project-specific database
    const primary = path.join(homeDir, ".apex", identifier, "patterns.db");

    // Fallback: global shared patterns
    const fallback = path.join(homeDir, ".apex", "global", "patterns.db");

    return {
      primary,
      fallback,
    };
  }

  /**
   * Resolve APEX home directory with sandbox-aware fallbacks
   */
  private static resolveApexHomeDir(): string {
    if (this.apexHomeDir) {
      return this.apexHomeDir;
    }

    const candidates: string[] = [];

    if (process.env.APEX_HOME && process.env.APEX_HOME.trim().length > 0) {
      candidates.push(path.resolve(process.env.APEX_HOME));
    }

    candidates.push(os.homedir());
    candidates.push(path.join(os.tmpdir(), "apex-home"));
    candidates.push(path.join(process.cwd(), ".apex-home"));

    for (const candidate of candidates) {
      const writable = this.ensureWritableBase(candidate);
      if (writable) {
        this.apexHomeDir = writable;
        return writable;
      }
    }

    // Final fallback - os.tmpdir without checks (should always succeed)
    const fallback = path.join(os.tmpdir(), "apex-home-fallback");
    fs.mkdirSync(fallback, { recursive: true });
    this.apexHomeDir = path.resolve(fallback);
    return this.apexHomeDir;
  }

  /**
   * Verify that a directory is writable (creating it if necessary)
   */
  private static ensureWritableBase(candidate: string): string | null {
    const resolved = path.resolve(candidate);

    try {
      fs.mkdirSync(resolved, { recursive: true });
      const apexDir = path.join(resolved, ".apex");
      fs.mkdirSync(apexDir, { recursive: true });

      const testFile = path.join(
        apexDir,
        `.write-check-${process.pid}-${Date.now()}`,
      );
      fs.writeFileSync(testFile, "");
      fs.unlinkSync(testFile);

      return resolved;
    } catch (error: any) {
      // Ignore permission errors and try next candidate
      if (error?.code === "EEXIST") {
        // Directory exists but may not be writable. Try creating test file.
        try {
          const apexDir = path.join(resolved, ".apex");
          fs.mkdirSync(apexDir, { recursive: true });
          const testFile = path.join(
            apexDir,
            `.write-check-${process.pid}-${Date.now()}`,
          );
          fs.writeFileSync(testFile, "");
          fs.unlinkSync(testFile);
          return resolved;
        } catch {
          return null;
        }
      }

      return null;
    }
  }
}
