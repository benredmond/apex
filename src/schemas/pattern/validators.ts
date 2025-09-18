import { z } from "zod";
import fs from "fs-extra";
import yaml from "js-yaml";
import { PatternSchema, Pattern } from "./index.js";
import {
  PatternIdSchema,
  TrustScoreSchema,
  SemverSchema,
  EvidenceRefSchema,
  SnippetSchema,
} from "./base.js";

export {
  PatternIdSchema,
  TrustScoreSchema,
  SemverSchema,
  EvidenceRefSchema,
  SnippetSchema,
};

// Validation result types
export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  data?: Pattern;
  errors?: ValidationError[];
  warnings?: string[];
}

// [PAT:ERROR:HANDLING] ★★★★☆ (23 uses) - Format Zod errors into readable messages
export function formatZodError(error: z.ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
  }));
}

// Check for pattern warnings (non-blocking issues)
export async function checkPatternWarnings(
  pattern: Pattern,
): Promise<string[]> {
  const warnings: string[] = [];

  // Check snippet sizes
  if (pattern.snippets) {
    const totalLines = pattern.snippets.reduce((sum, snippet) => {
      return sum + snippet.code.split("\n").length;
    }, 0);

    if (totalLines > 200) {
      warnings.push(
        `Total snippet lines (${totalLines}) exceeds recommended limit of 200`,
      );
    }
  }

  // Check for missing recommended fields
  if (
    pattern.type === "ANTI" &&
    (!pattern.evidence || pattern.evidence.length === 0)
  ) {
    warnings.push("ANTI patterns should include evidence references");
  }

  if (
    pattern.type === "FAILURE" &&
    !pattern.signature &&
    (!pattern.evidence || pattern.evidence.length === 0)
  ) {
    warnings.push(
      "FAILURE patterns should include either signature or evidence",
    );
  }

  // Check trust score vs usage
  if (
    pattern.trust_score > 0.8 &&
    (!pattern.usage || (pattern.usage.successes || 0) < 3)
  ) {
    warnings.push(
      "High trust score (>0.8) with low usage count (<3) is unusual",
    );
  }

  // Check for deprecated patterns with high trust
  if (pattern.deprecated && pattern.trust_score > 0.5) {
    warnings.push("Deprecated patterns should have lower trust scores");
  }

  return warnings;
}

// Main validation function
export async function validatePatternFile(
  filePath: string,
): Promise<ValidationResult> {
  try {
    // Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // Parse based on file extension
    let data: unknown;
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      data = yaml.load(content);
    } else if (filePath.endsWith(".json")) {
      data = JSON.parse(content);
    } else {
      return {
        valid: false,
        errors: [
          {
            path: "file",
            message: "File must have .json, .yaml, or .yml extension",
          },
        ],
      };
    }

    // Validate against schema
    const result = PatternSchema.safeParse(data);

    if (!result.success) {
      return {
        valid: false,
        errors: formatZodError(result.error),
      };
    }

    // Check for warnings
    const warnings = await checkPatternWarnings(result.data);

    return {
      valid: true,
      data: result.data,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        {
          path: "file",
          message: `Failed to read/parse file: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

// Validate pattern data directly (for programmatic use)
export function validatePattern(data: unknown): ValidationResult {
  const result = PatternSchema.safeParse(data);

  if (!result.success) {
    return {
      valid: false,
      errors: formatZodError(result.error),
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

// Migration helper: Convert star rating to trust score
export function starRatingToTrustScore(stars: number): number {
  return Math.max(0, Math.min(1, stars / 5));
}

// Migration helper: Convert trust score to star rating
export function trustScoreToStarRating(score: number): string {
  const stars = Math.round(score * 5);
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(5 - stars);
  return filled + empty;
}
