/**
 * Migration to add human-readable aliases to patterns table
 * Implements APE-44: Human-Readable Pattern Aliases
 */
/**
 * Generate a URL-safe alias from a pattern title
 * [PAT:SLUG:GENERATION] ★★★★★ (156 uses, 98% success) - From cache
 */
function generateAlias(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}
export const migration = {
  id: "003-add-pattern-aliases",
  version: 3,
  name: "Add human-readable aliases to patterns",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    db.transaction(() => {
      // 1. Check if alias column already exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);
      if (!columns.includes("alias")) {
        // 2. Add alias column
        db.exec("ALTER TABLE patterns ADD COLUMN alias TEXT");
      }
      // 3. Create unique index for fast lookups
      // Drop if exists to ensure clean state
      db.exec("DROP INDEX IF EXISTS idx_pattern_alias");
      db.exec("CREATE UNIQUE INDEX idx_pattern_alias ON patterns(alias)");
      // 4. Backfill existing patterns with generated aliases
      const patterns = db
        .prepare("SELECT id, title FROM patterns WHERE alias IS NULL")
        .all();
      console.log(`Found ${patterns.length} patterns to add aliases`);
      const updateStmt = db.prepare(
        "UPDATE patterns SET alias = ? WHERE id = ?",
      );
      const checkAliasStmt = db.prepare(
        "SELECT COUNT(*) as count FROM patterns WHERE alias = ?",
      );
      for (const pattern of patterns) {
        let baseAlias = generateAlias(pattern.title);
        let finalAlias = baseAlias;
        let counter = 1;
        // Handle collisions by appending counter
        while (checkAliasStmt.get(finalAlias).count > 0) {
          finalAlias = `${baseAlias}-${counter}`;
          counter++;
        }
        updateStmt.run(finalAlias, pattern.id);
      }
      console.log(
        `Migration complete: added aliases to ${patterns.length} patterns`,
      );
    })();
  },
  down: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Synchronous transaction for rollback
    db.transaction(() => {
      // Remove the index first
      db.exec("DROP INDEX IF EXISTS idx_pattern_alias");
      // SQLite doesn't support DROP COLUMN directly
      // We would need to recreate the table without the alias column
      // For now, we'll just clear the data
      db.exec("UPDATE patterns SET alias = NULL");
      console.log("Rolled back pattern aliases");
    })();
  },
  validate: (db) => {
    try {
      // Check column exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);
      if (!columns.includes("alias")) {
        return false;
      }
      // Check index exists
      const indices = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pattern_alias'",
        )
        .all();
      if (indices.length === 0) {
        return false;
      }
      // Check all patterns have aliases
      const missingAliases = db
        .prepare("SELECT COUNT(*) as count FROM patterns WHERE alias IS NULL")
        .get();
      return missingAliases.count === 0;
    } catch (error) {
      console.error("Validation error:", error);
      return false;
    }
  },
};
