/**
 * Migration to consolidate pattern_drafts into patterns table
 * All patterns start with low trust scores and build up based on usage
 */
import crypto from "crypto";
// [PAT:IMPORT:ESM] ★★★★☆ (67 uses, 89% success) - From cache
import { PATTERN_SCHEMA_VERSION } from "../config/constants.js";
export const migration = {
  id: "001-consolidate-patterns",
  version: 1,
  name: "Consolidate pattern drafts into patterns table",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      // 1. Add columns to patterns table if they don't exist
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);
      if (!columns.includes("alpha")) {
        db.exec("ALTER TABLE patterns ADD COLUMN alpha REAL DEFAULT 1.0");
      }
      if (!columns.includes("beta")) {
        db.exec("ALTER TABLE patterns ADD COLUMN beta REAL DEFAULT 1.0");
      }
      if (!columns.includes("usage_count")) {
        db.exec(
          "ALTER TABLE patterns ADD COLUMN usage_count INTEGER DEFAULT 0",
        );
      }
      if (!columns.includes("success_count")) {
        db.exec(
          "ALTER TABLE patterns ADD COLUMN success_count INTEGER DEFAULT 0",
        );
      }
      if (!columns.includes("status")) {
        db.exec("ALTER TABLE patterns ADD COLUMN status TEXT DEFAULT \"active\"");
      }
      // 2. Get all drafts
      const drafts = db
        .prepare(
          `
        SELECT draft_id, kind, json, created_at 
        FROM pattern_drafts 
        WHERE status = 'DRAFT'
      `,
        )
        .all();
      console.log(`Found ${drafts.length} drafts to migrate`);
      // 3. Insert drafts into patterns table
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO patterns (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, pattern_digest, json_canonical,
          alpha, beta, usage_count, success_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const draft of drafts) {
        try {
          const patternData = JSON.parse(draft.json);
          // Generate pattern ID from draft ID or create new one
          const patternId =
            patternData.id || draft.draft_id.replace("draft:", "");
          // Determine pattern type
          const type = draft.kind === "ANTI_PATTERN" ? "ANTI" : "CODEBASE";
          // Initial trust score for new patterns (Beta(1,1) = 0.5)
          const initialTrustScore = 0.5;
          // Create canonical JSON
          const canonicalData = {
            id: patternId,
            type,
            title: patternData.title,
            summary: patternData.summary,
            snippets: patternData.snippets || [],
            evidence: patternData.evidence || [],
          };
          const jsonCanonical = JSON.stringify(canonicalData, null, 2);
          // Create digest
          const digest = crypto
            .createHash("sha256")
            .update(jsonCanonical)
            .digest("hex");
          insertStmt.run(
            patternId,
            PATTERN_SCHEMA_VERSION, // schema version from config
            "1.0.0", // pattern version (individual pattern version, not schema)
            type,
            patternData.title,
            patternData.summary,
            initialTrustScore,
            draft.created_at,
            draft.created_at,
            digest,
            jsonCanonical,
            1.0, // alpha (Beta distribution)
            1.0, // beta (Beta distribution)
            0, // usage_count
            0, // success_count
            "draft",
          );
          console.log(`Migrated pattern: ${patternId}`);
        } catch (error) {
          console.error(`Failed to migrate draft ${draft.draft_id}:`, error);
        }
      }
      // 4. Update pattern_drafts to mark as migrated
      db.prepare(
        `
        UPDATE pattern_drafts 
        SET status = 'APPROVED' 
        WHERE status = 'DRAFT'
      `,
      ).run();
      console.log("Migration completed successfully");
    })();
  },
  down: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction
    db.transaction(() => {
      // Revert drafts back to DRAFT status
      db.prepare(
        `
        UPDATE pattern_drafts 
        SET status = 'DRAFT' 
        WHERE status = 'APPROVED'
      `,
      ).run();
      // Note: We don't remove columns from patterns table as SQLite doesn't support
      // dropping columns easily, and they don't harm if left in place
      // Remove migrated patterns that came from drafts
      db.prepare(
        `
        DELETE FROM patterns 
        WHERE status = 'draft'
      `,
      ).run();
      console.log("Rollback completed successfully");
    })();
  },
};
