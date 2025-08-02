// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import yaml from "js-yaml";
import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { z } from "zod";
import type { Pattern } from "./types.js";

// Import pattern schemas from APE-23
// For now, we'll define a basic schema - in real implementation would import from schemas
const PatternSchema = z.object({
  id: z.string(),
  schema_version: z.string(),
  pattern_version: z.string(),
  type: z.enum([
    "CODEBASE",
    "LANG",
    "ANTI",
    "FAILURE",
    "POLICY",
    "TEST",
    "MIGRATION",
  ]),
  title: z.string(),
  summary: z.string(),
  trust_score: z.number().min(0).max(1),
  created_at: z.string(),
  updated_at: z.string(),
  source_repo: z.string().optional(),
  tags: z.array(z.string()).default([]),
  // Additional fields would be here based on pattern type
});

export class PatternLoader {
  private schemaCache = new Map<string, z.ZodSchema>();

  constructor() {
    // Initialize with base schema
    this.schemaCache.set("base", PatternSchema);
  }

  /**
   * Load and validate a pattern from YAML/JSON file
   */
  public async loadPattern(filePath: string): Promise<
    | {
        pattern: Pattern;
        digest: string;
        canonical: string;
      }
    | { error: string }
  > {
    try {
      // Read file
      const content = await fs.readFile(filePath, "utf-8");

      // Parse based on extension
      const ext = path.extname(filePath).toLowerCase();
      let data: any;

      if (ext === ".yaml" || ext === ".yml") {
        data = yaml.load(content);
      } else if (ext === ".json") {
        data = JSON.parse(content);
      } else {
        return { error: `Unsupported file type: ${ext}` };
      }

      // Validate against schema
      const validation = PatternSchema.safeParse(data);
      if (!validation.success) {
        return { error: validation.error.message };
      }

      // Normalize and create canonical JSON
      const normalized = this.normalize(validation.data);
      const canonical = this.canonicalize(normalized);
      const digest = this.computeDigest(canonical);

      // Create pattern object
      const pattern: Pattern = {
        ...normalized,
        pattern_digest: digest,
        json_canonical: canonical,
        tags_csv: normalized.tags.join(","),
        invalid: false,
      };

      return { pattern, digest, canonical };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Normalize pattern data for consistent storage
   */
  private normalize(data: any): any {
    // Sort object keys for consistency
    const normalized = this.sortObjectKeys(data);

    // Ensure dates are in ISO format
    if (normalized.created_at && !(normalized.created_at instanceof String)) {
      normalized.created_at = new Date(normalized.created_at).toISOString();
    }
    if (normalized.updated_at && !(normalized.updated_at instanceof String)) {
      normalized.updated_at = new Date(normalized.updated_at).toISOString();
    }

    // Ensure tags is always an array
    normalized.tags = normalized.tags || [];

    return normalized;
  }

  /**
   * Create canonical JSON representation
   */
  private canonicalize(obj: any): string {
    // JSON Canonical Serialization (JCS)
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  /**
   * Compute SHA256 digest of canonical JSON
   */
  private computeDigest(canonical: string): string {
    return createHash("sha256").update(canonical).digest("hex");
  }

  /**
   * Sort object keys recursively
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    } else if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((result, key) => {
          result[key] = this.sortObjectKeys(obj[key]);
          return result;
        }, {} as any);
    }
    return obj;
  }

  /**
   * Batch load patterns from a directory
   */
  public async loadDirectory(dirPath: string): Promise<
    Array<{
      path: string;
      result: Awaited<ReturnType<typeof this.loadPattern>>;
    }>
  > {
    const files = await fs.readdir(dirPath, { recursive: true });
    const patternFiles = files.filter((f) => {
      const fileName = typeof f === "string" ? f : f.toString();
      return (
        fileName.endsWith(".yaml") ||
        fileName.endsWith(".yml") ||
        fileName.endsWith(".json")
      );
    });

    const results = await Promise.all(
      patternFiles.map(async (file) => {
        const fileName = typeof file === "string" ? file : file.toString();
        const fullPath = path.join(dirPath, fileName);
        const result = await this.loadPattern(fullPath);
        return { path: fullPath, result };
      }),
    );

    return results;
  }

  /**
   * Validate a pattern without loading from file
   */
  public validatePattern(
    data: any,
  ): { valid: true; data: any } | { valid: false; errors: string[] } {
    const validation = PatternSchema.safeParse(data);
    if (validation.success) {
      return { valid: true, data: validation.data };
    } else {
      return {
        valid: false,
        errors: validation.error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`,
        ),
      };
    }
  }
}
