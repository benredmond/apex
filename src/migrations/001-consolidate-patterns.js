/**
 * Migration to consolidate pattern_drafts into patterns table
 * All patterns start with low trust scores and build up based on usage
 */
import Database from "better-sqlite3";
import crypto from "crypto";
export async function migrateDraftsToPatterns(dbPath) {
  const db = new Database(dbPath);
  try {
    // Start transaction
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
        db.exec('ALTER TABLE patterns ADD COLUMN status TEXT DEFAULT "active"');
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
            "1.0.0", // schema version
            "1.0.0", // pattern version
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
            "draft", // status - mark as draft initially
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
  } finally {
    db.close();
  }
}
// Export for use in CLI or programmatic migration
export default {
  id: "001-consolidate-patterns",
  name: "Consolidate pattern drafts into patterns table",
  run: migrateDraftsToPatterns,
};
