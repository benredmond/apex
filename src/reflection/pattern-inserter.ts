/**
 * Service to insert patterns directly into the patterns table
 * instead of creating drafts
 */

import * as crypto from "crypto";
import { nanoid } from "nanoid";
import type { DatabaseAdapter } from "../storage/database-adapter.js";
import { NewPattern, AntiPattern } from "./types.js";
import { Pattern } from "../storage/types.js";
import { FacetWriter } from "../storage/facet-writer.js";
// [PAT:IMPORT:ESM] ★★★★☆ (67 uses, 89% success) - From cache
import { PATTERN_SCHEMA_VERSION } from "../config/constants.js";

const parseTagsValue = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
};

export class PatternInserter {
  private db: DatabaseAdapter;
  private facetWriter: FacetWriter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
    this.facetWriter = new FacetWriter(db);
    // [PAT:DI:CONSTRUCTOR] ★★★★★ (156 uses, 98% success) - Database injected via constructor
    // [FIX:DB:SHARED_CONNECTION] ★★★★★ (23 uses, 100% success) - Shared connection prevents locking
  }

  /**
   * Generate a URL-safe alias from a pattern title
   * [PAT:SLUG:GENERATION] ★★★★★ (156 uses, 98% success) - From cache
   */
  private generateAlias(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 100);
  }

  /**
   * Validate if a pattern ID follows the required format
   * Minimum 2 segments separated by colons (e.g., PAT:DATABASE or PAT:DATABASE:CONNECTION)
   * First segment must be PAT or ANTI for it to be considered valid
   */
  private isValidPatternId(patternId: string): boolean {
    if (!patternId) return false;
    const segments = patternId.split(":");
    if (segments.length < 2) return false;

    // First segment must be PAT or ANTI
    if (segments[0] !== "PAT" && segments[0] !== "ANTI") {
      return false;
    }

    // Each segment should contain only letters, numbers, underscores, dots
    return segments.every(
      (segment) => segment.length > 0 && /^[A-Za-z0-9_.-]+$/.test(segment),
    );
  }

  /**
   * Generate a semantic pattern ID from title
   * Examples:
   * - "Shared Database Instance" → "PAT:DATABASE:SHARED_INSTANCE"
   * - "Creating Multiple Connections" → "ANTI:DATABASE:MULTIPLE_CONNECTIONS"
   */
  private generateSemanticId(
    title: string,
    kind: "NEW_PATTERN" | "ANTI_PATTERN",
  ): string {
    const prefix = kind === "ANTI_PATTERN" ? "ANTI" : "PAT";

    // Convert title to uppercase segments
    const words = title
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      // Fallback to auto-generated if title is not suitable
      return `APEX.SYSTEM:${prefix}:AUTO:${nanoid(8)}`;
    }

    // Try to identify a category from common keywords
    const categoryKeywords = {
      DATABASE: ["DATABASE", "DB", "SQL", "QUERY", "CONNECTION", "SQLITE"],
      API: ["API", "ENDPOINT", "REST", "HTTP", "REQUEST", "RESPONSE"],
      AUTH: ["AUTH", "AUTHENTICATION", "LOGIN", "SESSION", "TOKEN", "JWT"],
      TEST: ["TEST", "MOCK", "JEST", "TESTING", "SPEC"],
      ERROR: ["ERROR", "EXCEPTION", "FAILURE", "HANDLING"],
      CACHE: ["CACHE", "REDIS", "MEMORY", "STORAGE"],
      UI: ["UI", "COMPONENT", "REACT", "VIEW", "FRONTEND"],
      VALIDATION: ["VALIDATION", "VALIDATE", "SCHEMA", "CHECK"],
    };

    let category = "GENERAL";
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
      if (words.some((word) => keywords.includes(word))) {
        category = cat;
        break;
      }
    }

    // Generate specific name from remaining words
    const specificName = words.slice(0, 3).join("_");

    // Expand to 4-segment format for database compliance
    return `APEX.SYSTEM:${prefix}:${category}:${specificName}`;
  }

  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }
    if (obj !== null && typeof obj === "object") {
      return Object.keys(obj)
        .sort()
        .reduce((result, key) => {
          result[key] = this.sortObjectKeys(obj[key]);
          return result;
        }, {} as any);
    }
    return obj;
  }

  private canonicalize(obj: any): string {
    return JSON.stringify(obj);
  }

  /**
   * Expand a 2-3 segment ID to 4-segment format
   * Examples:
   * - "PAT:DATABASE" → "APEX.SYSTEM:PAT:DATABASE:DEFAULT"
   * - "PAT:DATABASE:CONNECTION" → "APEX.SYSTEM:PAT:DATABASE:CONNECTION"
   * - "ANTI:DATABASE" → "APEX.SYSTEM:ANTI:DATABASE:DEFAULT"
   * Special case: If a custom ID doesn't start with PAT or ANTI, we need to determine
   * the type from the kind parameter passed to insertNewPattern
   */
  private expandTo4Segments(
    patternId: string,
    kind?: "NEW_PATTERN" | "ANTI_PATTERN",
  ): string {
    const segments = patternId.split(":");

    if (segments.length >= 4) {
      return patternId; // Already 4+ segments
    }

    // Determine if it's a pattern or anti-pattern
    let prefix = segments[0];

    // If the first segment is not PAT or ANTI, we need to determine the type
    if (prefix !== "PAT" && prefix !== "ANTI") {
      // Use the kind parameter to determine type, or default to PAT
      const typePrefix = kind === "ANTI_PATTERN" ? "ANTI" : "PAT";

      if (segments.length === 2) {
        // e.g., "TEST:ANTI" with kind=ANTI_PATTERN → "APEX.SYSTEM:ANTI:TEST:ANTI"
        return `APEX.SYSTEM:${typePrefix}:${segments[0]}:${segments[1]}`;
      } else if (segments.length === 3) {
        // e.g., "TEST:DATABASE:CONNECTION" → "APEX.SYSTEM:PAT:TEST:DATABASE_CONNECTION"
        return `APEX.SYSTEM:${typePrefix}:${segments[0]}:${segments.slice(1).join("_")}`;
      }
    }

    // Standard expansion for PAT or ANTI prefixed IDs
    if (segments.length === 2) {
      // e.g., "PAT:DATABASE" → "APEX.SYSTEM:PAT:DATABASE:DEFAULT"
      return `APEX.SYSTEM:${segments[0]}:${segments[1]}:DEFAULT`;
    } else if (segments.length === 3) {
      // e.g., "PAT:DATABASE:CONNECTION" → "APEX.SYSTEM:PAT:DATABASE:CONNECTION"
      return `APEX.SYSTEM:${segments[0]}:${segments[1]}:${segments[2]}`;
    }

    // Shouldn't reach here if validation passed
    const isAnti = prefix === "ANTI" || kind === "ANTI_PATTERN";
    return `APEX.SYSTEM:${isAnti ? "ANTI" : "PAT"}:AUTO:${nanoid(8)}`;
  }

  /**
   * Extract keywords from pattern data for search
   */
  private extractKeywords(data: any): string {
    const keywords: Set<string> = new Set();

    // Extract from title
    if (data.title) {
      const titleWords = data.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w: string) => w.length > 2);
      titleWords.forEach((w: string) => keywords.add(w));
    }

    // Extract from summary
    if (data.summary) {
      const summaryWords = data.summary
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w: string) => w.length > 2);
      summaryWords.forEach((w: string) => keywords.add(w));
    }

    // Extract from snippets
    if (data.snippets && Array.isArray(data.snippets)) {
      data.snippets.forEach((snippet: any) => {
        if (snippet.language) {
          keywords.add(snippet.language.toLowerCase());
        }
      });
    }

    // Extract from pattern ID segments
    if (data.id) {
      const idParts = data.id.split(":");
      idParts.forEach((part: string) => {
        if (
          part &&
          !["APEX", "SYSTEM", "PAT", "FIX", "CODE", "CMD"].includes(part)
        ) {
          keywords.add(part.toLowerCase());
        }
      });
    }

    return Array.from(keywords).join(" ");
  }

  /**
   * Build search index from all pattern content
   */
  private buildSearchIndex(data: any): string {
    const indexParts: string[] = [];

    // Add title with weight
    if (data.title) {
      indexParts.push(data.title);
      indexParts.push(data.title); // Double weight
    }

    // Add summary
    if (data.summary) {
      indexParts.push(data.summary);
    }

    // Add snippet content
    if (data.snippets && Array.isArray(data.snippets)) {
      data.snippets.forEach((snippet: any) => {
        if (snippet.content) {
          indexParts.push(snippet.content);
        }
      });
    }

    return indexParts.join(" ");
  }

  /**
   * Check if a pattern with the given ID already exists
   * [PAT:VALIDATION:SCHEMA] ★★★★★ (40 uses, 95% success) - Pre-validation check
   */
  private checkDuplicatePattern(patternId: string): {
    exists: boolean;
    existingPattern?: any;
  } {
    const existing = this.db
      .prepare("SELECT id, title, type FROM patterns WHERE id = ?")
      .get(patternId);
    return {
      exists: !!existing,
      existingPattern: existing,
    };
  }

  /**
   * Insert a new pattern directly into the patterns table
   * with initial trust score based on Beta(1,1) = 0.5
   */
  insertNewPattern(
    pattern: NewPattern | AntiPattern,
    kind: "NEW_PATTERN" | "ANTI_PATTERN",
  ): string {
    // Generate pattern ID
    // [FIX:PATTERN:4_SEGMENT_ID] - Generate compliant 4-segment IDs
    // [FIX:PATTERN:AUTO_INSERT] ★★★☆☆ (2 uses, 100% success) - From cache
    let patternId: string;
    let customIdProvided = false;

    // Check for the new pattern_id field first
    if ("pattern_id" in pattern && pattern.pattern_id) {
      customIdProvided = true;
      if (this.isValidPatternId(pattern.pattern_id)) {
        // Valid custom ID - expand to 4 segments if needed
        patternId = this.expandTo4Segments(pattern.pattern_id, kind);
      } else {
        // Invalid custom ID - fall back to auto-generated format
        // Store the invalid ID as alias later
        patternId = `APEX.SYSTEM:${kind === "ANTI_PATTERN" ? "ANTI" : "PAT"}:AUTO:${nanoid(8)}`;
      }
    }
    // Check for legacy id field (backward compatibility)
    else if ("id" in pattern && pattern.id) {
      const idParts = ((pattern as any).id as string)?.split(":");
      // If it's already 4-segment, use as-is
      if (idParts.length >= 4) {
        patternId = (pattern as any).id as string;
      } else {
        // Otherwise, use the traditional auto-generated format for backward compatibility
        patternId = `APEX.SYSTEM:${kind === "ANTI_PATTERN" ? "ANTI" : "PAT"}:AUTO:${nanoid(8)}`;
      }
    } else {
      // No ID provided - use traditional auto-generated format for backward compatibility
      // Only use semantic generation when explicitly requested via pattern_id field
      patternId = `APEX.SYSTEM:${kind === "ANTI_PATTERN" ? "ANTI" : "PAT"}:AUTO:${nanoid(8)}`;
    }

    // Determine pattern type
    const type = kind === "ANTI_PATTERN" ? "ANTI" : "CODEBASE";

    // Create canonical JSON based on pattern type
    let title: string;
    let summary: string;
    let snippets: any[] = [];
    let evidence: any[] = [];

    if ("summary" in pattern) {
      // NewPattern
      title = pattern.title;
      summary = pattern.summary;
      snippets = pattern.snippets || [];
      evidence = pattern.evidence || [];
    } else {
      // AntiPattern - type guard
      const antiPattern = pattern as AntiPattern;
      title = antiPattern.title;
      summary = antiPattern.reason || "Anti-pattern";
      evidence = antiPattern.evidence || [];
    }

    const rawTags = Array.isArray((pattern as any).tags)
      ? (pattern as any).tags
      : parseTagsValue((pattern as any).tags);
    const scope = (pattern as any).scope;

    const canonicalData = {
      id: patternId,
      type,
      title,
      summary,
      snippets,
      evidence,
      tags: rawTags,
      ...(scope ? { scope } : {}),
    };

    const canonicalSorted = this.sortObjectKeys(canonicalData);
    const jsonCanonical = this.canonicalize(canonicalSorted);

    const digestSource = { ...canonicalData };
    delete (digestSource as any).tags;
    delete (digestSource as any).scope;
    const digestCanonical = this.canonicalize(
      this.sortObjectKeys(digestSource),
    );

    // Create digest
    const digest = crypto
      .createHash("sha256")
      .update(digestCanonical)
      .digest("hex");

    const now = new Date().toISOString();

    // Extract search fields from canonical data
    const tags = JSON.stringify(rawTags);
    const keywords = this.extractKeywords(canonicalData);
    const searchIndex = this.buildSearchIndex(canonicalData);

    // Use originalId as alias if provided, otherwise use pattern_id if invalid, otherwise generate from title
    let finalAlias: string;
    if ("originalId" in pattern && (pattern as any).originalId) {
      // Use the original non-compliant ID as the alias
      finalAlias = (pattern as any).originalId;
    } else if (
      customIdProvided &&
      "pattern_id" in pattern &&
      pattern.pattern_id &&
      !this.isValidPatternId(pattern.pattern_id)
    ) {
      // If custom pattern_id was invalid, use it as alias
      finalAlias = pattern.pattern_id;
    } else if (
      "id" in pattern &&
      pattern.id &&
      ((pattern as any).id as string)?.split(":").length < 4
    ) {
      // If the provided id is non-compliant (less than 4 segments), use it as alias
      finalAlias = (pattern as any).id as string;
    } else {
      // Generate alias from title and ensure uniqueness
      let baseAlias = this.generateAlias(title);
      finalAlias = baseAlias;
      let counter = 1;

      // Check for existing aliases
      const checkAliasStmt = this.db.prepare(
        "SELECT COUNT(*) as count FROM patterns WHERE alias = ?",
      );
      while ((checkAliasStmt.get(finalAlias) as any).count > 0) {
        finalAlias = `${baseAlias}-${counter}`;
        counter++;
      }
    }

    // [PAT:VALIDATION:SCHEMA] ★★★★★ - Pre-check for duplicate pattern
    const duplicateCheck = this.checkDuplicatePattern(patternId as string);
    if (duplicateCheck.exists) {
      // [PAT:ERROR:HANDLING] ★★★★☆ - Clear duplicate detection message
      console.log(
        `[PatternInserter] Duplicate pattern detected: ${patternId} (${duplicateCheck.existingPattern?.title})`,
      );
      // Return existing pattern ID for idempotency
      return patternId as string;
    }

    // Insert into patterns table
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO patterns (
        id, schema_version, pattern_version, type, title, summary,
        trust_score, created_at, updated_at, pattern_digest, json_canonical,
        alpha, beta, invalid, alias, tags, keywords, search_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      patternId,
      PATTERN_SCHEMA_VERSION, // schema version from config
      "1.0.0", // pattern version (individual pattern version, not schema)
      type,
      title,
      summary,
      0.5, // Initial trust score (Beta(1,1))
      now,
      now,
      digest,
      jsonCanonical,
      1.0, // alpha
      1.0, // beta
      0, // not invalid
      finalAlias, // alias
      tags, // tags for FTS5 search
      keywords, // keywords for FTS5 search
      searchIndex, // search_index for FTS5 search
    );

    // If pattern already existed (race condition), return existing ID
    // [FIX:DB:SHARED_CONNECTION] ★★★★★ - Handle race conditions gracefully
    if (info.changes === 0) {
      const existing = this.db
        .prepare("SELECT id FROM patterns WHERE id = ?")
        .get(patternId) as { id: string };
      console.log(
        `[PatternInserter] Race condition handled: Pattern ${patternId} was inserted by another process`,
      );
      return existing.id;
    }

    // Insert snippets if provided (only for NewPattern)
    if (snippets.length > 0) {
      const snippetStmt = this.db.prepare(`
        INSERT INTO pattern_snippets (pattern_id, snippet_id, content, language)
        VALUES (?, ?, ?, ?)
      `);

      for (const snippet of snippets) {
        snippetStmt.run(
          patternId,
          snippet.snippet_id || nanoid(8),
          snippet.content || "",
          snippet.language || "unknown",
        );
      }
    }

    this.facetWriter.upsertFacets(patternId, {
      ...pattern,
      tags: rawTags,
      scope,
    });

    return patternId as string;
  }

  /**
   * Get a pattern by ID
   */
  getPattern(id: string): Pattern | null {
    const row = this.db
      .prepare(
        `
      SELECT * FROM patterns WHERE id = ?
    `,
      )
      .get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      schema_version: row.schema_version,
      pattern_version: row.pattern_version,
      type: row.type,
      title: row.title,
      summary: row.summary,
      trust_score: row.trust_score,
      alpha: row.alpha,
      beta: row.beta,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source_repo: row.source_repo,
      tags: parseTagsValue(row.tags), // [APE-63] JSON format with CSV fallback
      pattern_digest: row.pattern_digest,
      json_canonical: row.json_canonical,
      invalid: row.invalid === 1,
      invalid_reason: row.invalid_reason,
    };
  }

  /**
   * Update pattern trust score
   */
  updateTrustScore(
    id: string,
    alpha: number,
    beta: number,
    trustScore: number,
  ): void {
    const stmt = this.db.prepare(`
      UPDATE patterns 
      SET alpha = ?, beta = ?, trust_score = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(alpha, beta, trustScore, new Date().toISOString(), id);
  }
}
