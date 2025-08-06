/**
 * Migration: Add enhanced metadata fields to patterns table
 * 
 * Adds fields for richer pattern metadata:
 * - key_insight: Core takeaway for the pattern
 * - when_to_use: Usage context/scenarios
 * - common_pitfalls: JSON array of gotchas to avoid
 */

export const migration008 = {
  id: "008-add-pattern-metadata-fields",
  version: 8,
  name: "Add enhanced metadata fields to patterns table",
  
  up: (db) => {
    // Check if columns already exist before adding
    const tableInfo = db.prepare("PRAGMA table_info(patterns)").all();
    const existingColumns = new Set(tableInfo.map((col) => col.name));

    // Add key_insight column if it doesn't exist
    if (!existingColumns.has("key_insight")) {
      db.exec("ALTER TABLE patterns ADD COLUMN key_insight TEXT");
      console.log("✓ Added key_insight column to patterns table");
    } else {
      console.log("⊘ key_insight column already exists");
    }

    // Add when_to_use column if it doesn't exist
    if (!existingColumns.has("when_to_use")) {
      db.exec("ALTER TABLE patterns ADD COLUMN when_to_use TEXT");
      console.log("✓ Added when_to_use column to patterns table");
    } else {
      console.log("⊘ when_to_use column already exists");
    }

    // Add common_pitfalls column if it doesn't exist (stored as JSON)
    if (!existingColumns.has("common_pitfalls")) {
      db.exec("ALTER TABLE patterns ADD COLUMN common_pitfalls TEXT");
      console.log("✓ Added common_pitfalls column to patterns table");
    } else {
      console.log("⊘ common_pitfalls column already exists");
    }

    // Create index on reflections for efficient last_used_task lookup
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_reflections_pattern_task 
        ON reflections(json_extract(json, '$.claims.patterns_used[0].pattern_id'), created_at DESC)
      `);
      console.log("✓ Created index for pattern usage tracking");
    } catch (error) {
      // Index might already exist or reflections table might not exist
      console.log("⊘ Could not create reflections index (may already exist)");
    }
  },

  down: (db) => {
    // Note: SQLite doesn't support DROP COLUMN directly
    // Would need to recreate table without these columns
    console.log("⚠ Rollback not implemented - would require table recreation");
    throw new Error("Rollback not implemented for this migration");
  },

  validate: (db) => {
    try {
      const tableInfo = db.prepare("PRAGMA table_info(patterns)").all();
      const columns = new Set(tableInfo.map((col) => col.name));

      const hasKeyInsight = columns.has("key_insight");
      const hasWhenToUse = columns.has("when_to_use");
      const hasCommonPitfalls = columns.has("common_pitfalls");

      return hasKeyInsight && hasWhenToUse && hasCommonPitfalls;
    } catch (error) {
      return false;
    }
  },
};

export default migration008;