/**
 * Evidence validation for the reflection system
 * [PAT:VALIDATION:SCHEMA] ★★★★★ (40+ uses) - Comprehensive validation patterns
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import * as path from "path";
import { PatternRepository } from "../storage/repository.js";
import {
  EvidenceRef,
  PatternUsage,
  TrustUpdate,
  ValidationErrorCode,
  ReflectRequest,
} from "./types.js";
import { SnippetMatcher } from "./snippet-matcher.js";
import { OutcomeProcessor } from "./outcome-processor.js";
import { GitResolver } from "./git-resolver.js";

const execAsync = promisify(spawn);

// Configuration for allowed PR repositories
interface ValidatorConfig {
  allowedRepoUrls: string[];
  gitRepoPath: string;
  cacheEnabled: boolean;
  cacheTTL: number; // milliseconds
}

export class EvidenceValidator {
  private config: ValidatorConfig;
  private repository: PatternRepository;
  private validationCache: Map<string, { result: boolean; timestamp: number }>;
  private fileContentCache: Map<string, { content: string; timestamp: number }>;
  private snippetMatcher: SnippetMatcher;
  private gitResolver: GitResolver;

  constructor(
    repository: PatternRepository,
    config: Partial<ValidatorConfig> = {},
  ) {
    this.repository = repository;
    this.config = {
      allowedRepoUrls: ["https://github.com/"],
      gitRepoPath: process.cwd(),
      cacheEnabled: true,
      cacheTTL: 5 * 60 * 1000, // 5 minutes
      ...config,
    };
    this.validationCache = new Map();
    this.fileContentCache = new Map();
    this.snippetMatcher = new SnippetMatcher({
      cacheEnabled: this.config.cacheEnabled,
      cacheTTL: this.config.cacheTTL,
    });
    this.gitResolver = new GitResolver({
      cacheEnabled: this.config.cacheEnabled,
      cacheTTL: this.config.cacheTTL,
      gitRepoPath: this.config.gitRepoPath,
    });
  }

  /**
   * Validate all evidence in a reflection request
   * [PAT:ERROR:HANDLING] ★★☆☆☆ - Graceful degradation pattern
   */
  async validateRequest(request: ReflectRequest): Promise<{
    valid: boolean;
    errors: Array<{ path: string; code: string; message: string }>;
    warnings?: Array<{ path: string; code: string; message: string }>;
    queued?: Array<{ item: any; reason: string }>;
  }> {
    const errors: Array<{ path: string; code: string; message: string }> = [];
    const warnings: Array<{ path: string; code: string; message: string }> = [];
    const queued: Array<{ item: any; reason: string }> = [];
    const validators: string[] = [];

    // Check validation mode from environment
    // Default to permissive mode unless explicitly set to "strict"
    const isPermissive = process.env.APEX_REFLECTION_MODE !== "strict";

    // Validate pattern IDs exist
    for (const [index, usage] of request.claims.patterns_used.entries()) {
      validators.push("pattern_exists");
      const pattern = await this.repository.getByIdOrAlias(usage.pattern_id);
      if (!pattern) {
        const error = {
          path: `claims.patterns_used[${index}].pattern_id`,
          code: ValidationErrorCode.PATTERN_NOT_FOUND,
          message: `Pattern ${usage.pattern_id} not found`,
        };

        if (isPermissive) {
          warnings.push(error);
          queued.push({
            item: usage,
            reason: `Pattern not found: ${usage.pattern_id}`,
          });
        } else {
          errors.push(error);
        }
      }

      // Validate evidence for each pattern usage
      for (const [evidenceIndex, evidence] of usage.evidence.entries()) {
        const isValid = await this.validateEvidence(evidence);
        if (!isValid.valid) {
          errors.push({
            path: `claims.patterns_used[${index}].evidence[${evidenceIndex}]`,
            code: isValid.code || ValidationErrorCode.MALFORMED_EVIDENCE,
            message: isValid.message || "Invalid evidence",
          });
        }
        if (isValid.warning) {
          warnings.push({
            path: `claims.patterns_used[${index}].evidence[${evidenceIndex}]`,
            code: ValidationErrorCode.MALFORMED_EVIDENCE,
            message: isValid.warning,
          });
        }
      }
    }

    // Validate no duplicate trust updates
    validators.push("duplicate_trust_guard");
    const trustPatternIds = new Set<string>();
    for (const [index, update] of request.claims.trust_updates.entries()) {
      try {
        // Process outcome to delta if needed
        const processed = OutcomeProcessor.processTrustUpdate(update);

        // Check for duplicates
        if (trustPatternIds.has(processed.pattern_id)) {
          errors.push({
            path: `claims.trust_updates[${index}]`,
            code: ValidationErrorCode.DUPLICATE_TRUST_UPDATE,
            message: `Duplicate trust update for pattern ${processed.pattern_id}`,
          });
        }
        trustPatternIds.add(processed.pattern_id);

        // Validate pattern exists
        validators.push("pattern_exists");
        const pattern = await this.repository.getByIdOrAlias(
          processed.pattern_id,
        );
        if (!pattern) {
          errors.push({
            path: `claims.trust_updates[${index}].pattern_id`,
            code: ValidationErrorCode.PATTERN_NOT_FOUND,
            message: `Pattern ${processed.pattern_id} not found`,
          });
        }
      } catch (error) {
        errors.push({
          path: `claims.trust_updates[${index}]`,
          code: ValidationErrorCode.MALFORMED_EVIDENCE,
          message: error.message,
        });
      }
    }

    // Validate PR if provided
    if (request.artifacts?.pr) {
      validators.push("pr_exists");
      const prValid = await this.validatePR(
        request.artifacts.pr.repo,
        request.artifacts.pr.number,
      );
      if (!prValid.valid) {
        errors.push({
          path: "artifacts.pr",
          code: ValidationErrorCode.PR_NOT_FOUND,
          message: prValid.message || "Invalid PR",
        });
      }
    }

    // Validate commits if provided
    if (request.artifacts?.commits) {
      validators.push("git_commits");
      for (const [index, sha] of request.artifacts.commits.entries()) {
        const commitValid = await this.validateCommit(sha);
        if (!commitValid.valid) {
          errors.push({
            path: `artifacts.commits[${index}]`,
            code: ValidationErrorCode.MALFORMED_EVIDENCE,
            message:
              commitValid.message || `Commit ${sha} not found in repository`,
          });
        }
        if (commitValid.warning) {
          warnings.push({
            path: `artifacts.commits[${index}]`,
            code: ValidationErrorCode.MALFORMED_EVIDENCE,
            message: commitValid.warning,
          });
        }
      }
    }

    // In permissive mode, we're valid if there are no critical errors (only warnings)
    const valid = isPermissive
      ? errors.length === 0 ||
        (errors.length > 0 &&
          warnings.length > 0 &&
          errors.every((e) => warnings.some((w) => w.path === e.path)))
      : errors.length === 0;

    return {
      valid,
      errors,
      ...(warnings.length > 0 && { warnings }),
      ...(queued.length > 0 && { queued }),
    };
  }

  /**
   * Validate a single evidence reference
   */
  async validateEvidence(evidence: EvidenceRef): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    warning?: string;
    confidence?: number;
  }> {
    const cacheKey = this.getEvidenceCacheKey(evidence);

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.validationCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return { valid: cached.result };
      }
    }

    let result: {
      valid: boolean;
      code?: string;
      message?: string;
      warning?: string;
      confidence?: number;
    };

    switch (evidence.kind) {
      case "git_lines":
        result = await this.validateGitLines(
          evidence.file,
          evidence.sha,
          evidence.start,
          evidence.end,
          evidence.snippet_hash,
        );
        break;

      case "commit":
        result = await this.validateCommit(evidence.sha);
        break;

      case "pr":
        result = await this.validatePR(evidence.repo || "", evidence.number);
        break;

      case "ci_run":
        // Basic validation for now - could enhance with API calls later
        result = {
          valid: evidence.id.length > 0 && evidence.provider.length > 0,
          code: ValidationErrorCode.CI_RUN_NOT_FOUND,
          message: "Invalid CI run",
        };
        break;

      default:
        result = {
          valid: false,
          code: ValidationErrorCode.MALFORMED_EVIDENCE,
          message: "Unknown evidence type",
        };
    }

    // Cache result
    if (this.config.cacheEnabled && result.valid) {
      this.validationCache.set(cacheKey, {
        result: result.valid,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Validate git lines exist at specific SHA with optional snippet hash fallback
   * Implements two-stage validation strategy
   */
  private async validateGitLines(
    file: string,
    sha: string,
    start: number,
    end: number,
    snippetHash?: string,
  ): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    confidence?: number;
    warning?: string;
  }> {
    // Check validation mode
    // Default to permissive mode unless explicitly set to "strict"
    const isPermissive = process.env.APEX_REFLECTION_MODE !== "strict";
    const gitRefs = ["HEAD", "main", "master", "origin/main", "origin/master"];
    const isGitRef = gitRefs.includes(sha);

    // Resolve git ref to full SHA
    let resolvedSha: string;
    try {
      resolvedSha = await this.gitResolver.resolveRef(sha);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isRepositoryUnavailable =
        /not a git repository|failed to spawn git process|spawn git ENOENT/i.test(
          message,
        );
      const isKnownMissing =
        /unknown revision|needed a single revision|did not match any file|bad revision/i.test(
          message,
        );

      if (
        isPermissive &&
        (isGitRef || isRepositoryUnavailable) &&
        (isKnownMissing || isRepositoryUnavailable)
      ) {
        return {
          valid: true,
          warning: `SHA ${sha} could not be resolved (${message}); continuing in permissive mode`,
          confidence: 0.5,
        };
      }

      return {
        valid: false,
        code: ValidationErrorCode.MALFORMED_EVIDENCE,
        message,
      };
    }

    // Validate file path to prevent traversal attacks
    const normalizedPath = path.normalize(file);
    const resolvedPath = path.resolve(this.config.gitRepoPath, normalizedPath);

    if (!resolvedPath.startsWith(this.config.gitRepoPath)) {
      return {
        valid: false,
        code: ValidationErrorCode.MALFORMED_EVIDENCE,
        message: "Invalid file path - potential path traversal attempt",
      };
    }

    try {
      // Check if SHA exists in repo (already resolved)
      // Note: git cat-file -e returns no output, just exit code
      // If gitCommand succeeds (doesn't throw), the SHA exists
      try {
        await this.gitCommand(["cat-file", "-e", resolvedSha]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isPermissive) {
          return {
            valid: true,
            warning: `SHA ${resolvedSha} could not be verified (${message}); continuing in permissive mode`,
            confidence: 0.5,
          };
        }
        return {
          valid: false,
          code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
          message: `SHA ${resolvedSha} not found in repository`,
        };
      }

      // Get file content at SHA - use normalized path with caching
      const contentCacheKey = `${resolvedSha}:${normalizedPath}`;
      let content: string;

      const loadFileContent = async (): Promise<string> =>
        this.gitCommand(["show", `${resolvedSha}:${normalizedPath}`]);

      if (this.config.cacheEnabled) {
        const cached = this.fileContentCache.get(contentCacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
          content = cached.content;
        } else {
          try {
            content = await loadFileContent();
            this.fileContentCache.set(contentCacheKey, {
              content,
              timestamp: Date.now(),
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (isPermissive) {
              return {
                valid: true,
                warning: `File ${file} at ${resolvedSha} could not be read (${message}); continuing in permissive mode`,
                confidence: 0.4,
              };
            }
            return {
              valid: false,
              code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
              message: `File ${file} not found at SHA ${resolvedSha}`,
            };
          }
        }
      } else {
        try {
          content = await loadFileContent();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (isPermissive) {
            return {
              valid: true,
              warning: `File ${file} at ${resolvedSha} could not be read (${message}); continuing in permissive mode`,
              confidence: 0.4,
            };
          }
          return {
            valid: false,
            code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
            message: `File ${file} not found at SHA ${resolvedSha}`,
          };
        }
      }
      if (!content) {
        return {
          valid: false,
          code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
          message: `File ${file} not found at SHA ${resolvedSha}`,
        };
      }

      // Stage 1: Try line-based validation (fast path)
      const lines = content.split("\n");
      const stage1Valid = start >= 1 && end <= lines.length && start <= end;

      if (stage1Valid) {
        // Lines are valid - verify content if snippet hash provided
        if (snippetHash) {
          const snippetContent = this.snippetMatcher.extractContent(
            content,
            start,
            end,
          );
          if (snippetContent) {
            const computedHash =
              this.snippetMatcher.generateSnippetHash(snippetContent);
            if (computedHash === snippetHash) {
              return { valid: true, confidence: 1.0 };
            }
            // Hash mismatch - fall through to Stage 2
          }
        } else {
          // No snippet hash - trust line numbers
          return { valid: true, confidence: 1.0 };
        }
      }

      // Stage 2: Content-based fallback validation
      if (snippetHash) {
        const matchResult = this.snippetMatcher.findSnippetByHash(
          content,
          snippetHash,
          start,
          end,
        );

        if (matchResult.found) {
          // Found the snippet at a different location
          const message = matchResult.multipleMatches
            ? `Found snippet at ${matchResult.multipleMatches.length} locations, using first match`
            : `Found snippet at lines ${matchResult.start}-${matchResult.end} (was ${start}-${end})`;

          return {
            valid: true,
            confidence: matchResult.confidence,
            message,
          };
        } else {
          return {
            valid: false,
            code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
            message: `Snippet not found in file (neither at lines ${start}-${end} nor by content hash)`,
          };
        }
      }

      // No snippet hash and invalid lines
      return {
        valid: false,
        code: ValidationErrorCode.LINE_RANGE_NOT_FOUND,
        message: `Invalid line range ${start}-${end} for file with ${lines.length} lines`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isPermissive) {
        return {
          valid: true,
          warning: `Git operation failed for ${file}@${sha}: ${message}; continuing in permissive mode`,
          confidence: 0.4,
        };
      }
      return {
        valid: false,
        code: ValidationErrorCode.INTERNAL_ERROR,
        message: `Git operation failed: ${message}`,
      };
    }
  }

  /**
   * Validate commit exists in repository
   */
  private async validateCommit(sha: string): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    warning?: string;
    confidence?: number;
  }> {
    const isPermissive = process.env.APEX_REFLECTION_MODE !== "strict";

    const looksLikeFlexibleRef = (() => {
      const ref = sha.trim();
      if (ref.length === 0) return false;
      if (/^HEAD/.test(ref)) return true;
      if (ref.includes("/")) return true;
      if (ref.includes("@")) return true;
      const commonRefs = new Set([
        "main",
        "master",
        "develop",
        "development",
        "dev",
        "release",
        "staging",
        "feature",
        "bugfix",
        "hotfix",
      ]);
      if (commonRefs.has(ref)) return true;
      if (/^[vV]\d/.test(ref)) return true; // semantic version-style tags (e.g., v1.2.3)
      return false;
    })();

    // Resolve git ref to full SHA when possible
    let resolvedSha = sha;
    try {
      resolvedSha = await this.gitResolver.resolveRef(sha);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Security-sensitive refs should always be rejected
      if (message.includes("Invalid git reference format")) {
        return {
          valid: false,
          code: ValidationErrorCode.MALFORMED_EVIDENCE,
          message,
        };
      }

      // Ambiguous refs should surface a clear error regardless of mode
      if (message.includes("Ambiguous git reference")) {
        return {
          valid: false,
          code: ValidationErrorCode.MALFORMED_EVIDENCE,
          message,
        };
      }

      const isUnknownRevision =
        /unknown revision|needed a single revision|bad revision|did not match any file/i.test(
          message,
        );
      const isGitUnavailable =
        message.includes("Failed to spawn git process") ||
        message.includes("not a git repository") ||
        message.includes("spawn git ENOENT");

      if (
        isPermissive &&
        looksLikeFlexibleRef &&
        (isUnknownRevision || isGitUnavailable)
      ) {
        return {
          valid: true,
          warning: `Unable to resolve commit reference '${sha}': ${message}. Continuing in permissive mode without verification.`,
          confidence: 0.5,
        };
      }

      return {
        valid: false,
        code: ValidationErrorCode.MALFORMED_EVIDENCE,
        message,
      };
    }

    try {
      await this.gitCommand(["cat-file", "-e", resolvedSha]);
      return {
        valid: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isPermissive) {
        return {
          valid: true,
          warning: `Unable to verify commit '${resolvedSha}': ${message}. Continuing in permissive mode without confirmation.`,
          confidence: 0.5,
        };
      }

      return {
        valid: false,
        code: ValidationErrorCode.MALFORMED_EVIDENCE,
        message: `Commit ${resolvedSha} not found in repository`,
      };
    }
  }

  /**
   * Validate PR URL against allowed patterns
   */
  private async validatePR(
    repo: string,
    number: number,
  ): Promise<{ valid: boolean; code?: string; message?: string }> {
    // Check if repo URL starts with any allowed pattern
    const allowedPatterns = this.config.allowedRepoUrls ?? [];
    const isAllowed =
      allowedPatterns.length === 0 ||
      allowedPatterns.some((allowed) => repo.startsWith(allowed));

    if (!isAllowed) {
      return {
        valid: false,
        code: ValidationErrorCode.PR_NOT_FOUND,
        message: `Repository ${repo} not in allowed list`,
      };
    }

    // Validate PR URL format (basic check)
    const prUrlPattern = /^https:\/\/github\.com\/[\w-]+\/[\w-]+$/;
    if (!prUrlPattern.test(repo)) {
      return {
        valid: false,
        code: ValidationErrorCode.PR_NOT_FOUND,
        message: "Invalid repository URL format",
      };
    }

    return { valid: true };
  }

  /**
   * Execute git command safely
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
        reject(error);
      });
    });
  }

  /**
   * Generate cache key for evidence
   */
  private getEvidenceCacheKey(evidence: EvidenceRef): string {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(evidence));
    return `evidence_${hash.digest("hex")}`;
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
    this.fileContentCache.clear();
    this.snippetMatcher.clearCache();
    this.gitResolver.clearCache();
  }
}
