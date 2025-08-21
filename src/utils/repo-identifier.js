/**
 * Repository identifier utilities for project-based pattern isolation
 * Generates unique, stable identifiers for projects
 */
import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
export class RepoIdentifier {
  /**
     * Get a unique identifier for the current repository/project
     * Priority order:
     * 1. Git remote URL → sanitized identifier
     * 2. Git local repo → hash of .git path
     * 3. Non-git project → hash of absolute path
     */
  static async getIdentifier() {
    try {
      // Try to get git remote URL first
      const remoteUrl = await this.getGitRemoteUrl();
      if (remoteUrl) {
        return this.sanitizeGitUrl(remoteUrl);
      }
    }
    catch {
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
  static async getGitRemoteUrl() {
    return new Promise((resolve) => {
      const git = spawn("git", ["config", "--get", "remote.origin.url"], {
        cwd: process.cwd(),
      });
      let stdout = "";
      let stderr = "";
      git.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      git.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      git.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        }
        else {
          resolve(null);
        }
      });
      git.on("error", () => {
        // Git not available or other spawn error
        resolve(null);
      });
    });
  }
  /**
     * Check if current directory is a git repository
     */
  static async isGitRepo() {
    try {
      const gitDir = path.join(process.cwd(), ".git");
      return fs.existsSync(gitDir);
    }
    catch {
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
  static sanitizeGitUrl(url) {
    // Remove .git extension
    url = url.replace(/\.git$/, "");
    // Handle SSH URLs (git@host:user/repo)
    if (url.startsWith("git@")) {
      url = url.replace(/^git@/, "");
      url = url.replace(":", "-");
    }
    // Handle HTTPS URLs (https://host/user/repo)
    if (url.startsWith("https://") || url.startsWith("http://")) {
      url = url.replace(/^https?:\/\//, "");
    }
    // Extract domain and path
    const parts = url.split("/");
    if (parts.length >= 2) {
      // Get domain (e.g., github.com → github)
      const domain = parts[0].replace(/\.(com|org|net|io)$/, "");
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
  static hashPath(filePath) {
    const hash = crypto.createHash("sha256");
    hash.update(filePath);
    return hash.digest("hex").substring(0, 8);
  }
  /**
     * Get all possible database paths for the current project
     * Returns paths in priority order
     */
  static async getDatabasePaths() {
    const os = await import("os");
    const homeDir = os.homedir();
    const identifier = await this.getIdentifier();
    // Primary: project-specific database
    const primary = path.join(homeDir, ".apex", identifier, "patterns.db");
    // Fallback: global shared patterns
    const fallback = path.join(homeDir, ".apex", "global", "patterns.db");
    // Legacy: check for old database locations
    const legacyPaths = [
      path.join(process.cwd(), ".apex", "patterns.db"),
      path.join(process.cwd(), "patterns.db"),
    ];
    const legacy = legacyPaths.find((p) => fs.existsSync(p));
    return {
      primary,
      fallback,
      ...(legacy && { legacy }),
    };
  }
}
