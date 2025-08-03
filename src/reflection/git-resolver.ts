/**
 * Git reference resolver for flexible SHA support
 * [PAT:VALIDATION:SCHEMA] ★★★★★ (40 uses, 100% success) - From cache
 * [PAT:CACHING:TTL] ★★★★☆ (3 uses, 100% success) - From cache
 */

import { spawn } from "child_process";
import { promisify } from "util";

export interface GitResolverConfig {
  cacheTTL: number; // milliseconds
  gitRepoPath: string; // repository path
  cacheEnabled: boolean; // enable/disable caching
}

export class GitResolver {
  private refCache: Map<string, { sha: string; timestamp: number }>;
  private config: GitResolverConfig;

  constructor(config: Partial<GitResolverConfig> = {}) {
    this.config = {
      cacheTTL: 5 * 60 * 1000, // 5 minutes default
      gitRepoPath: process.cwd(),
      cacheEnabled: true,
      ...config,
    };
    this.refCache = new Map();
  }

  /**
   * Resolve a git reference to a full SHA
   * [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success) - From cache
   */
  async resolveRef(ref: string): Promise<string> {
    // Validate ref format first
    if (!this.isValidRef(ref)) {
      throw new Error(`Invalid git reference format: ${ref}`);
    }

    // If already a full SHA, return as-is
    if (this.isFullSha(ref)) {
      return ref;
    }

    // Check cache if enabled
    // [PAT:CACHING:TTL] ★★★★☆ (3 uses, 100% success) - From cache
    if (this.config.cacheEnabled) {
      const cacheKey = `ref:${ref}`;
      const cached = this.refCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return cached.sha;
      }
    }

    // Resolve using git rev-parse
    try {
      const sha = await this.gitCommand(["rev-parse", "--verify", ref]);

      // Cache both ref->SHA and SHA->SHA mappings
      if (this.config.cacheEnabled) {
        const timestamp = Date.now();
        this.refCache.set(`ref:${ref}`, { sha, timestamp });
        this.refCache.set(sha, { sha, timestamp }); // Self-reference for full SHAs
      }

      return sha;
    } catch (error) {
      // Handle ambiguous refs - check for specific ambiguous error
      if (
        error.message.includes("is ambiguous") ||
        (error.message.includes("ambiguous argument") &&
          !error.message.includes("unknown revision"))
      ) {
        throw new Error(
          `Ambiguous git reference '${ref}'. Please use a longer SHA or more specific ref.`,
        );
      }
      throw new Error(
        `Failed to resolve git reference '${ref}': ${error.message}`,
      );
    }
  }

  /**
   * Batch resolve multiple refs for performance
   */
  async resolveRefs(refs: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Group refs by whether they need resolution
    const toResolve: string[] = [];

    for (const ref of refs) {
      if (this.isFullSha(ref)) {
        results.set(ref, ref);
      } else if (this.config.cacheEnabled) {
        const cached = this.refCache.get(`ref:${ref}`);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
          results.set(ref, cached.sha);
        } else {
          toResolve.push(ref);
        }
      } else {
        toResolve.push(ref);
      }
    }

    // Resolve remaining refs in parallel
    const resolvePromises = toResolve.map(async (ref) => {
      try {
        const sha = await this.resolveRef(ref);
        results.set(ref, sha);
      } catch (error) {
        // Store error for this ref
        results.set(ref, `ERROR: ${error.message}`);
      }
    });

    await Promise.all(resolvePromises);
    return results;
  }

  /**
   * Validate ref format for security
   * [ANTI:SECURITY:PATH_TRAVERSAL] prevention - From cache
   */
  isValidRef(ref: string): boolean {
    // Maximum length check
    if (ref.length > 255) {
      return false;
    }

    // Security: No path traversal patterns
    if (ref.includes("../") || ref.includes("/.git")) {
      return false;
    }

    // Allow alphanumeric, @{}, _, ., /, -
    return /^[a-zA-Z0-9@{}_.\/-]+$/.test(ref);
  }

  /**
   * Check if ref is already a full 40-character SHA
   */
  isFullSha(ref: string): boolean {
    return /^[a-f0-9]{40}$/.test(ref);
  }

  /**
   * Clear the ref cache
   */
  clearCache(): void {
    this.refCache.clear();
  }

  /**
   * Execute git command safely
   * Reused from validator.ts pattern
   */
  private async gitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const git = spawn("git", args, {
        cwd: this.config.gitRepoPath,
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
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(
            new Error(stderr.trim() || `Git command failed with code ${code}`),
          );
        }
      });

      git.on("error", (error) => {
        reject(new Error(`Failed to spawn git process: ${error.message}`));
      });
    });
  }
}
