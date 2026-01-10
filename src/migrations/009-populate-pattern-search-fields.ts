// [ARCH:DB:MIGRATION] ★★★★★ (156 uses, 98% success) - Safe database migration pattern
import type { Migration } from "./types.js";
import { createHash } from "crypto";

/**
 * Extract keywords from pattern data for search optimization
 */
function extractKeywords(data: any): string {
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
      // Add first few words from snippet content as keywords
      if (snippet.content) {
        const snippetWords = snippet.content
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .slice(0, 10) // First 10 words only
          .filter((w: string) => w.length > 2);
        snippetWords.forEach((w: string) => keywords.add(w));
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
 * Build comprehensive search index from all pattern content
 */
function buildSearchIndex(data: any): string {
  const indexParts: string[] = [];

  // Add title multiple times for weight
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

  // Add evidence descriptions
  if (data.evidence && Array.isArray(data.evidence)) {
    data.evidence.forEach((ev: any) => {
      if (ev.file) {
        indexParts.push(ev.file);
      }
    });
  }

  return indexParts.join(" ");
}

function normalizeTags(rawTags: unknown): string {
  if (!rawTags) return "[]";

  if (Array.isArray(rawTags)) {
    const cleaned = rawTags
      .map((tag) => (typeof tag === "string" ? tag.trim() : String(tag)))
      .filter((tag) => tag.length > 0);
    return JSON.stringify(cleaned);
  }

  if (typeof rawTags === "string") {
    const trimmed = rawTags.trim();
    if (!trimmed) return "[]";

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .map((tag) => (typeof tag === "string" ? tag.trim() : String(tag)))
            .filter((tag) => tag.length > 0);
          return JSON.stringify(cleaned);
        }
      } catch {
        // Fall through to CSV handling
      }
    }

    const cleaned = trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    return JSON.stringify(cleaned);
  }

  return "[]";
}

const migration: Migration = {
  version: 9,
  id: "009-populate-pattern-search-fields",
  name: "Populate search fields from json_canonical for existing patterns",

  // [FIX:DB:MIGRATION_ROLLBACK] ★★★★★ (89 uses, 96% success) - Handle migration failures gracefully
  up(db) {
    // Don't wrap in transaction initially - we'll handle transactions per pattern
    try {
      // [PAT:VALIDATION:SCHEMA] ★★★★★ - Pre-validation check
      // First, check if we have patterns with NULL search fields
      const needsUpdate = db
        .prepare(
          `
        SELECT COUNT(*) as count 
        FROM patterns 
        WHERE (tags IS NULL OR keywords IS NULL OR search_index IS NULL)
          AND json_canonical IS NOT NULL
      `,
        )
        .get() as { count: number } | undefined;

      if (!needsUpdate || needsUpdate.count === undefined) {
        console.log(`[Migration 009] No patterns table or no patterns found`);
        return;
      }

      console.log(
        `[Migration 009] Found ${needsUpdate.count} patterns needing search field population`,
      );

      if (needsUpdate.count === 0) {
        console.log(`[Migration 009] No patterns need updating, skipping`);
        return;
      }

      // Get all patterns that need search field population
      const patterns = db
        .prepare(
          `
        SELECT id, json_canonical 
        FROM patterns 
        WHERE (tags IS NULL OR keywords IS NULL OR search_index IS NULL)
          AND json_canonical IS NOT NULL
      `,
        )
        .all() as Array<{ id: string; json_canonical: string }>;

      // Prepare update statement
      const updateStmt = db.prepare(`
        UPDATE patterns 
        SET tags = ?, keywords = ?, search_index = ?
        WHERE id = ?
      `);

      // Drop trigger temporarily to avoid SQL logic errors during UPDATE
      console.log(`[Migration 009] Dropping update trigger temporarily...`);
      db.exec(`DROP TRIGGER IF EXISTS patterns_au`);

      // Process each pattern
      let successCount = 0;
      let errorCount = 0;

      for (const pattern of patterns) {
        try {
          // Parse the JSON canonical data
          const data = JSON.parse(pattern.json_canonical);

          const tagsStr = normalizeTags(data.tags);

          // Extract keywords from various fields
          const keywords = extractKeywords(data);

          // Build comprehensive search index
          const searchIndex = buildSearchIndex(data);

          // Update the pattern
          updateStmt.run(tagsStr, keywords, searchIndex, pattern.id);
          successCount++;
        } catch (error) {
          console.error(
            `[Migration 009] Error processing pattern ${pattern.id}:`,
            error,
          );
          errorCount++;
        }
      }

      console.log(
        `[Migration 009] Successfully updated ${successCount} patterns, ${errorCount} errors`,
      );

      // Recreate the update trigger
      console.log(`[Migration 009] Recreating update trigger...`);
      db.exec(`
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
      `);

      // Rebuild the FTS3 index to ensure it's in sync
      console.log(`[Migration 009] Rebuilding FTS3 index...`);

      // Delete and repopulate FTS table
      db.exec(`DELETE FROM patterns_fts`);

      // Repopulate with all patterns
      db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, tags, keywords, search_index
        FROM patterns
        WHERE invalid = 0
      `);

      // Optimize the FTS index
      db.exec(`INSERT INTO patterns_fts(patterns_fts) VALUES('optimize')`);

      console.log(`[Migration 009] FTS3 index rebuilt successfully`);
    } catch (error) {
      throw new Error(`Migration 009 failed: ${(error as Error).message}`);
    }
  },

  down(db) {
    // This migration only populates data, no schema changes
    // Reverting would mean clearing the search fields
    try {
      console.log(`[Migration 009] Rolling back - clearing search fields`);

      // Drop trigger temporarily to avoid SQL logic errors during UPDATE
      db.exec(`DROP TRIGGER IF EXISTS patterns_au`);

      db.exec(`
        UPDATE patterns 
        SET tags = NULL, keywords = NULL, search_index = NULL
      `);

      // Clear and rebuild FTS
      db.exec(`DELETE FROM patterns_fts`);
      db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, NULL, NULL, NULL
        FROM patterns
      `);

      // Recreate the update trigger
      db.exec(`
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
      `);

      console.log(`[Migration 009] Rollback complete`);
    } catch (error) {
      throw new Error(
        `Migration 009 rollback failed: ${(error as Error).message}`,
      );
    }
  },

  get checksum() {
    const hash = createHash("sha256");
    hash.update(this.up.toString());
    hash.update(this.down.toString());
    return hash.digest("hex");
  },
};

export default migration;
