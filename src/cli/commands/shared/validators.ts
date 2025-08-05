// [PAT:BUILD:MODULE:ESM] ★★★☆☆ (3 uses, 100% success) - ES modules with .js extensions

import { Pattern } from "../../../storage/types.js";
import chalk from "chalk";

/**
 * Pattern validation utilities for CLI commands
 */

/**
 * Validate pattern ID format
 */
export function validatePatternId(id: string): boolean {
  // Pattern IDs follow format: TYPE:CATEGORY:NAME or PAT:CATEGORY:NAME
  const pattern = /^[A-Z]+:[A-Z]+:[A-Z_]+$/;
  return pattern.test(id);
}

/**
 * Validate trust score range
 */
export function validateTrustScore(score: number): boolean {
  return score >= 0 && score <= 1;
}

/**
 * Validate pattern structure at read-time
 */
export function validatePattern(pattern: Pattern): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!pattern.id) {
    errors.push("Pattern ID is required");
  } else if (!validatePatternId(pattern.id)) {
    errors.push(`Invalid pattern ID format: ${pattern.id}`);
  }

  if (!pattern.title) {
    errors.push("Pattern title is required");
  }

  if (!pattern.type) {
    errors.push("Pattern type is required");
  }

  // Trust score validation
  if (
    pattern.trust_score !== undefined &&
    !validateTrustScore(pattern.trust_score)
  ) {
    errors.push(`Invalid trust score: ${pattern.trust_score} (must be 0-1)`);
  }

  // Success rate validation (extended pattern)
  const extPattern = pattern as any;
  if (extPattern.success_rate !== undefined) {
    if (extPattern.success_rate < 0 || extPattern.success_rate > 1) {
      errors.push(
        `Invalid success rate: ${extPattern.success_rate} (must be 0-1)`,
      );
    }
  }

  // Usage count validation (extended pattern)
  if (extPattern.usage_count !== undefined && extPattern.usage_count < 0) {
    errors.push(
      `Invalid usage count: ${extPattern.usage_count} (must be >= 0)`,
    );
  }

  // Code snippets validation (extended pattern)
  if (extPattern.code && Array.isArray(extPattern.code)) {
    for (let i = 0; i < extPattern.code.length; i++) {
      const snippet = extPattern.code[i];
      if (!snippet.language) {
        errors.push(`Code snippet ${i + 1} missing language`);
      }
      if (!snippet.code) {
        errors.push(`Code snippet ${i + 1} missing code content`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file path for analysis
 */
export function validateFilePath(path: string): {
  valid: boolean;
  error?: string;
} {
  if (!path) {
    return { valid: false, error: "Path is required" };
  }

  // Check for dangerous paths
  if (path.includes("..")) {
    return { valid: false, error: "Path traversal not allowed" };
  }

  // Check for absolute paths outside project
  if (path.startsWith("/") && !path.startsWith(process.cwd())) {
    return {
      valid: false,
      error: "Absolute paths outside project not allowed",
    };
  }

  return { valid: true };
}

/**
 * Validate output format
 */
export function validateOutputFormat(format: string): boolean {
  const validFormats = ["json", "table", "yaml", "yml"];
  return validFormats.includes(format.toLowerCase());
}

/**
 * Validate and parse command options
 */
export interface ValidatedOptions {
  format?: string;
  trustMin?: number;
  pack?: string;
  selector?: string;
  context?: string;
  verbose?: boolean;
}

export function validateOptions(options: any): {
  valid: boolean;
  errors: string[];
  validated: ValidatedOptions;
} {
  const errors: string[] = [];
  const validated: ValidatedOptions = {};

  // Validate format
  if (options.format) {
    if (!validateOutputFormat(options.format)) {
      errors.push(
        `Invalid output format: ${options.format}. Valid formats: json, table, yaml`,
      );
    } else {
      validated.format = options.format;
    }
  }

  // Validate trust score minimum
  if (options.trustMin !== undefined) {
    const score = parseFloat(options.trustMin);
    if (isNaN(score) || !validateTrustScore(score)) {
      errors.push(
        `Invalid trust score: ${options.trustMin}. Must be between 0 and 1`,
      );
    } else {
      validated.trustMin = score;
    }
  }

  // Pass through other options
  if (options.pack) validated.pack = options.pack;
  if (options.selector) validated.selector = options.selector;
  if (options.context) validated.context = options.context;
  if (options.verbose) validated.verbose = options.verbose;

  return {
    valid: errors.length === 0,
    errors,
    validated,
  };
}

/**
 * Display validation errors
 */
export function displayValidationErrors(errors: string[]): void {
  console.error(chalk.red("Validation failed:"));
  for (const error of errors) {
    console.error(chalk.red(`  • ${error}`));
  }
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: {
  valid: boolean;
  errors?: string[];
}): string {
  if (result.valid) {
    return chalk.green("✓ Valid");
  } else {
    const errorList = result.errors?.map((e) => `  • ${e}`).join("\n") || "";
    return chalk.red(`✗ Invalid\n${errorList}`);
  }
}
