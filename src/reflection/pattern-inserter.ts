/**
 * Service to insert patterns directly into the patterns table
 * instead of creating drafts
 */

import crypto from "crypto";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { NewPattern, AntiPattern } from "./types.js";
import { Pattern } from "../storage/types.js";
// [PAT:IMPORT:ESM] ★★★★☆ (67 uses, 89% success) - From cache
import { PATTERN_SCHEMA_VERSION } from "../config/constants.js";

export class PatternInserter {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
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

    // Check for explicit id field first
    if ("id" in pattern && pattern.id) {
      // Use the provided ID directly
      const idParts = ((pattern as any).id as string)?.split(":");
      // If it's already 4-segment, use as-is
      if (idParts.length >= 4) {
        patternId = (pattern as any).id as string;
      } else {
        // Otherwise, generate compliant 4-segment ID
        patternId = `APEX.SYSTEM:${kind === "ANTI_PATTERN" ? "ANTI" : "PAT"}:AUTO:${nanoid(8)}`;
      }
    } else {
      // Generate new 4-segment ID
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

    const canonicalData = {
      id: patternId,
      type,
      title,
      summary,
      snippets,
      evidence,
    };
    const jsonCanonical = JSON.stringify(canonicalData, null, 2);

    // Create digest
    const digest = crypto
      .createHash("sha256")
      .update(jsonCanonical)
      .digest("hex");

    const now = new Date().toISOString();

    // Use originalId as alias if provided, otherwise use id if non-compliant, otherwise generate from title
    let finalAlias: string;
    if ("originalId" in pattern && (pattern as any).originalId) {
      // Use the original non-compliant ID as the alias
      finalAlias = (pattern as any).originalId;
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
        alpha, beta, invalid, alias
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      tags: row.tags_csv ? row.tags_csv.split(",") : [],
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
