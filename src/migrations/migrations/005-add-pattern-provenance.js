/**
 * Migration to add provenance column to patterns table
 * Implements APE-48: Track pattern creation source (auto-created vs manual)
 */
export const migration = {
  id: "005-add-pattern-provenance",
  version: 5,
  name: "Add provenance tracking to patterns",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    // [FIX:SQLITE:SYNC] ★★★★★ - All operations are synchronous within transaction
    db.transaction(() => {
      // 1. Check if provenance column already exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);
      if (!columns.includes("provenance")) {
        // 2. Add provenance column with default value
        db.exec(
          "ALTER TABLE patterns ADD COLUMN provenance TEXT DEFAULT 'manual'",
        );
        console.log("Added provenance column to patterns table");
      }
      // 3. Backfill existing patterns as 'manual' (they were manually created)
      const updateResult = db
        .prepare(
          "UPDATE patterns SET provenance = 'manual' WHERE provenance IS NULL",
        )
        .run();
      console.log(
        `Updated ${updateResult?.changes || 0} existing patterns with provenance='manual'`,
      );
      // 4. Create index for efficient provenance queries
      db.exec("DROP INDEX IF EXISTS idx_pattern_provenance");
      db.exec("CREATE INDEX idx_pattern_provenance ON patterns(provenance)");
      console.log("Created index on provenance column");
    })();
  },
  down: (db) => {
    db.transaction(() => {
      // Remove index first
      db.exec("DROP INDEX IF EXISTS idx_pattern_provenance");
      // SQLite doesn't support dropping columns directly
      // Would need to recreate table without provenance column
      // For now, we'll just clear the values
      db.prepare("UPDATE patterns SET provenance = NULL").run();
      console.log("Rolled back provenance column changes");
    })();
  },
  // [PAT:MIGRATION:VALIDATION] ★★★★☆ - Validate migration success
  validate: (db) => {
    try {
      // Check column exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);
      if (!columns.includes("provenance")) {
        console.error("Validation failed: provenance column not found");
        return false;
      }
      // Check index exists
      const indices = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pattern_provenance'",
        )
        .all();
      if (indices.length === 0) {
        console.error("Validation failed: provenance index not found");
        return false;
      }
      // Check default value works
      const testResult = db
        .prepare("SELECT provenance FROM patterns LIMIT 1")
        .get();
      // All patterns should have a provenance value (either 'manual' or 'auto-created')
      if (testResult && testResult.provenance === null) {
        console.error("Validation failed: NULL provenance values found");
        return false;
      }
      console.log("Migration 005 validation passed");
      return true;
    } catch (error) {
      console.error("Migration 005 validation error:", error);
      return false;
    }
  },
};
