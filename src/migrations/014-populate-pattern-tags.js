/**
 * Migration 014: Populate pattern_tags table from JSON tags data
 * [FMuAAB7afmSJR_kNYtFKo] Improve pattern search functionality
 *
 * Populates the empty pattern_tags table by extracting tags from the JSON
 * tags column in the patterns table. This enables tag-based filtering.
 */
export const migration = {
  id: "014-populate-pattern-tags",
  version: 14,
  name: "Populate pattern_tags table from JSON tags data",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    // CRITICAL: No async operations inside transaction
    db.transaction(() => {
      console.log("Populating pattern_tags table from JSON tags data...");
      // First, clear any existing data in pattern_tags to ensure clean state
      const deleteStmt = db.prepare("DELETE FROM pattern_tags");
      const deleteResult = deleteStmt.run();
      console.log(
        `Cleared ${deleteResult.changes} existing pattern_tags entries`,
      );
      // Get all patterns with non-empty tags
      const patternsWithTags = db
        .prepare(
          "SELECT id, tags FROM patterns WHERE tags IS NOT NULL AND tags <> '[]'",
        )
        .all();
      console.log(
        `Found ${patternsWithTags.length} patterns with tags to migrate`,
      );
      // Prepare insert statement
      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO pattern_tags (pattern_id, tag) VALUES (?, ?)",
      );
      let totalInserted = 0;
      let errors = 0;
      // Process each pattern
      for (const pattern of patternsWithTags) {
        try {
          // Parse JSON tags
          const tags = JSON.parse(pattern.tags);
          if (!Array.isArray(tags)) {
            console.warn(
              `Pattern ${pattern.id} has non-array tags: ${pattern.tags}`,
            );
            errors++;
            continue;
          }
          // Insert each tag
          for (const tag of tags) {
            if (typeof tag === "string" && tag.trim()) {
              const result = insertStmt.run(pattern.id, tag.trim());
              if (result.changes > 0) {
                totalInserted++;
              }
            }
          }
        } catch (error) {
          console.error(
            `Failed to parse tags for pattern ${pattern.id}:`,
            error,
          );
          errors++;
        }
      }
      console.log(
        `Successfully inserted ${totalInserted} pattern-tag relationships`,
      );
      if (errors > 0) {
        console.warn(`Encountered ${errors} errors during migration`);
      }
      // Verify the migration
      const count = db
        .prepare("SELECT COUNT(*) as count FROM pattern_tags")
        .get();
      console.log(`pattern_tags table now contains ${count.count} entries`);
    })();
  },
  down: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction pattern
    db.transaction(() => {
      console.log("Reverting pattern_tags population...");
      // Simply clear the pattern_tags table
      const deleteStmt = db.prepare("DELETE FROM pattern_tags");
      const result = deleteStmt.run();
      console.log(`Removed ${result.changes} pattern-tag relationships`);
      // Verify reversion
      const count = db
        .prepare("SELECT COUNT(*) as count FROM pattern_tags")
        .get();
      console.log(
        `pattern_tags table now contains ${count.count} entries (should be 0)`,
      );
    })();
  },
  validate: (db) => {
    try {
      // Check that pattern_tags has data
      const count = db
        .prepare("SELECT COUNT(*) as count FROM pattern_tags")
        .get();
      if (count.count === 0) {
        console.error("Validation failed: pattern_tags table is empty");
        return false;
      }
      // Check that we can query pattern_tags
      const sample = db
        .prepare("SELECT pattern_id, tag FROM pattern_tags LIMIT 5")
        .all();
      // Verify at least some patterns were migrated
      const patternsWithTags = db
        .prepare(
          "SELECT COUNT(*) as count FROM patterns WHERE tags IS NOT NULL AND tags <> '[]'",
        )
        .get();
      if (patternsWithTags.count > 0 && count.count === 0) {
        console.error(
          "Validation failed: patterns have tags but pattern_tags is empty",
        );
        return false;
      }
      console.log(
        `Migration 014 validation passed: ${count.count} pattern-tag entries`,
      );
      return true;
    } catch (error) {
      console.error("Migration 014 validation error:", error);
      return false;
    }
  },
};
