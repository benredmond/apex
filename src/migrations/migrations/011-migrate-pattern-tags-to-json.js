/**
 * Migration 011: Migrate pattern tags from CSV to JSON format
 * [APE-63] Unify tag storage format between patterns and tasks
 *
 * Converts pattern tags from CSV strings to JSON arrays for consistency
 * with task tag storage format.
 */

export const migration = {
  id: "011-migrate-pattern-tags-to-json",
  version: 11,
  name: "Migrate pattern tags from CSV to JSON format",

  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    db.transaction(() => {
      console.log("Starting pattern tags migration from CSV to JSON...");

      // Get all patterns with tags_csv (the old column name)
      // Include empty strings as they should become empty arrays
      const patterns = db
        .prepare(
          `
        SELECT id, tags_csv 
        FROM patterns 
        WHERE tags_csv IS NOT NULL
      `,
        )
        .all();

      console.log(`Found ${patterns.length} patterns with tags to migrate`);

      // Prepare update statement
      const updateStmt = db.prepare(`
        UPDATE patterns 
        SET tags_csv = ? 
        WHERE id = ?
      `);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const pattern of patterns) {
        try {
          // Check if already JSON (starts with '[')
          if (pattern.tags_csv && pattern.tags_csv.trim().startsWith("[")) {
            console.log(
              `Pattern ${pattern.id} already uses JSON format, skipping`,
            );
            skippedCount++;
            continue;
          }

          // Convert CSV to JSON array
          const csvTags =
            pattern.tags_csv && pattern.tags_csv.trim()
              ? pattern.tags_csv
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
              : [];

          const jsonTags = JSON.stringify(csvTags);

          // Update the pattern
          updateStmt.run(jsonTags, pattern.id);
          migratedCount++;

          console.log(
            `Migrated ${pattern.id}: "${pattern.tags_csv}" -> ${jsonTags}`,
          );
        } catch (error) {
          console.error(`Failed to migrate pattern ${pattern.id}:`, error);
          throw error;
        }
      }

      console.log(
        `Migration complete: ${migratedCount} patterns migrated, ${skippedCount} skipped`,
      );

      // Also update pattern_metadata table if it exists
      const metadataTableExists = db
        .prepare(
          `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='pattern_metadata'
      `,
        )
        .get();

      if (metadataTableExists) {
        console.log("Updating pattern_metadata table...");

        const metadataPatterns = db
          .prepare(
            `
          SELECT pattern_id, tags 
          FROM pattern_metadata 
          WHERE tags IS NOT NULL AND tags != ''
        `,
          )
          .all();

        const updateMetadataStmt = db.prepare(`
          UPDATE pattern_metadata 
          SET tags = ? 
          WHERE pattern_id = ?
        `);

        let metadataMigrated = 0;

        for (const meta of metadataPatterns) {
          try {
            // Check if already JSON
            if (meta.tags.trim().startsWith("[")) {
              continue;
            }

            // Convert CSV to JSON array
            const csvTags = meta.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0);

            const jsonTags = JSON.stringify(csvTags);
            updateMetadataStmt.run(jsonTags, meta.pattern_id);
            metadataMigrated++;
          } catch (error) {
            console.error(
              `Failed to migrate metadata for ${meta.pattern_id}:`,
              error,
            );
          }
        }

        console.log(`Updated ${metadataMigrated} pattern_metadata entries`);
      }
    })();
  },

  down: (db) => {
    // Revert JSON arrays back to CSV format
    db.transaction(() => {
      console.log("Reverting pattern tags from JSON to CSV...");

      const patterns = db
        .prepare(
          `
        SELECT id, tags_csv 
        FROM patterns 
        WHERE tags_csv IS NOT NULL AND tags_csv != ''
      `,
        )
        .all();

      const updateStmt = db.prepare(`
        UPDATE patterns 
        SET tags_csv = ? 
        WHERE id = ?
      `);

      let revertedCount = 0;

      for (const pattern of patterns) {
        try {
          // Check if JSON format
          if (!pattern.tags_csv.trim().startsWith("[")) {
            continue;
          }

          // Parse JSON and convert to CSV
          const jsonTags = JSON.parse(pattern.tags_csv);
          const csvTags = jsonTags.join(",");

          updateStmt.run(csvTags, pattern.id);
          revertedCount++;

          console.log(
            `Reverted ${pattern.id}: ${pattern.tags_csv} -> "${csvTags}"`,
          );
        } catch (error) {
          console.error(`Failed to revert pattern ${pattern.id}:`, error);
        }
      }

      console.log(`Reverted ${revertedCount} patterns to CSV format`);

      // Also revert pattern_metadata if exists
      const metadataTableExists = db
        .prepare(
          `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='pattern_metadata'
      `,
        )
        .get();

      if (metadataTableExists) {
        const metadataPatterns = db
          .prepare(
            `
          SELECT pattern_id, tags 
          FROM pattern_metadata 
          WHERE tags IS NOT NULL AND tags != ''
        `,
          )
          .all();

        const updateMetadataStmt = db.prepare(`
          UPDATE pattern_metadata 
          SET tags = ? 
          WHERE pattern_id = ?
        `);

        for (const meta of metadataPatterns) {
          try {
            if (!meta.tags.trim().startsWith("[")) {
              continue;
            }

            const jsonTags = JSON.parse(meta.tags);
            const csvTags = jsonTags.join(",");
            updateMetadataStmt.run(csvTags, meta.pattern_id);
          } catch (error) {
            console.error(
              `Failed to revert metadata for ${meta.pattern_id}:`,
              error,
            );
          }
        }
      }
    })();
  },

  validate: (db) => {
    try {
      // Check that all pattern tags are valid JSON arrays
      const patterns = db
        .prepare(
          `
        SELECT id, tags_csv 
        FROM patterns 
        WHERE tags_csv IS NOT NULL AND tags_csv != ''
        LIMIT 100
      `,
        )
        .all();

      let validCount = 0;
      let invalidCount = 0;

      for (const pattern of patterns) {
        try {
          const tags = JSON.parse(pattern.tags_csv);
          if (Array.isArray(tags)) {
            validCount++;
          } else {
            console.error(
              `Pattern ${pattern.id} has non-array JSON tags:`,
              pattern.tags_csv,
            );
            invalidCount++;
          }
        } catch (error) {
          console.error(
            `Pattern ${pattern.id} has invalid JSON tags:`,
            pattern.tags_csv,
          );
          invalidCount++;
        }
      }

      console.log(`Validation: ${validCount} valid, ${invalidCount} invalid`);

      if (invalidCount > 0) {
        return false;
      }

      // Test querying with JSON tags (using tags_csv since column not renamed yet)
      db.prepare(
        `
        SELECT id FROM patterns 
        WHERE tags_csv LIKE ? 
        LIMIT 1
      `,
      ).get("%\"test\"%");

      console.log("Migration 011 validation passed");
      return true;
    } catch (error) {
      console.error("Migration 011 validation error:", error);
      return false;
    }
  },
};
