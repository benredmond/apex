/**
 * Migration 012: Rename tags_csv column to tags
 * [APE-63] Complete unification of tag storage format
 *
 * Renames the tags_csv column to tags to match the tasks table structure
 * This should be run AFTER migration 011 which converts the data format
 */

export const migration = {
  id: "012-rename-tags-csv-column",
  version: 12,
  name: "Rename tags_csv column to tags in patterns table",

  up: (db) => {
    db.transaction(() => {
      console.log("Renaming tags_csv column to tags...");

      // SQLite doesn't support ALTER TABLE RENAME COLUMN in older versions
      // So we need to recreate the table

      // Check if tags_csv column exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);

      if (!columns.includes("tags_csv")) {
        console.log(
          "tags_csv column doesn't exist, checking for tags column...",
        );
        if (columns.includes("tags")) {
          console.log("tags column already exists, migration not needed");
          return;
        }
        throw new Error("Neither tags_csv nor tags column found!");
      }

      // Get current table structure
      const tableInfo = db.pragma("table_info(patterns)");

      // Build CREATE TABLE statement dynamically based on existing columns
      let createTableSQL = "CREATE TABLE patterns_new (";
      const columnDefs = [];

      for (const col of tableInfo) {
        if (col.name === "tags_csv") {
          // Rename tags_csv to tags
          columnDefs.push(
            `tags ${col.type}${col.notnull ? " NOT NULL" : ""}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ""}`,
          );
        } else if (col.name !== "tags") {
          // Keep all other columns as-is
          let def = `${col.name} ${col.type}`;
          if (col.notnull) def += " NOT NULL";
          if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
          if (col.pk) def += " PRIMARY KEY";
          columnDefs.push(def);
        }
      }

      createTableSQL += columnDefs.join(", ");

      // Add constraints
      if (tableInfo.some((col) => col.name === "type")) {
        createTableSQL +=
          ", CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION'))";
      }
      if (tableInfo.some((col) => col.name === "alias")) {
        createTableSQL = createTableSQL.replace(
          /alias TEXT/,
          "alias TEXT UNIQUE",
        );
      }

      createTableSQL += ")";

      db.exec(createTableSQL);

      // Build column lists for INSERT
      const oldColumns = [];
      const newColumns = [];

      for (const col of tableInfo) {
        if (col.name === "tags_csv") {
          newColumns.push("tags");
          oldColumns.push("tags_csv");
        } else if (col.name !== "tags") {
          newColumns.push(col.name);
          oldColumns.push(col.name);
        }
      }

      // Copy data from old table to new table
      db.exec(`
        INSERT INTO patterns_new (${newColumns.join(", ")})
        SELECT ${oldColumns.join(", ")}
        FROM patterns
      `);

      // Drop old table and rename new table
      db.exec("DROP TABLE patterns");
      db.exec("ALTER TABLE patterns_new RENAME TO patterns");

      // Recreate indexes
      db.exec("CREATE INDEX idx_patterns_type ON patterns(type)");
      db.exec("CREATE INDEX idx_patterns_trust ON patterns(trust_score DESC)");
      db.exec("CREATE INDEX idx_patterns_created ON patterns(created_at DESC)");
      db.exec("CREATE INDEX idx_patterns_alias ON patterns(alias)");
      db.exec("CREATE INDEX idx_patterns_tags ON patterns(tags)");

      console.log("Successfully renamed tags_csv to tags");
    })();
  },

  down: (db) => {
    db.transaction(() => {
      console.log("Reverting tags column back to tags_csv...");

      // Check if tags column exists
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);

      if (!columns.includes("tags")) {
        console.log("tags column doesn't exist, checking for tags_csv...");
        if (columns.includes("tags_csv")) {
          console.log("tags_csv column already exists, revert not needed");
          return;
        }
      }

      // Create table with tags_csv column
      db.exec(`
        CREATE TABLE patterns_old (
          id                TEXT PRIMARY KEY,
          schema_version    TEXT NOT NULL,
          pattern_version   TEXT NOT NULL,
          type              TEXT NOT NULL CHECK (type IN ('CODEBASE','LANG','ANTI','FAILURE','POLICY','TEST','MIGRATION')),
          title             TEXT NOT NULL,
          summary           TEXT,
          trust_score       REAL NOT NULL DEFAULT 0.5,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL,
          source_repo       TEXT,
          tags_csv          TEXT,
          pattern_digest    TEXT NOT NULL,
          json_canonical    BLOB NOT NULL,
          invalid           INTEGER NOT NULL DEFAULT 0,
          invalid_reason    TEXT,
          alias             TEXT UNIQUE,
          title_searchable  TEXT,
          keywords_searchable TEXT,
          search_text       TEXT,
          fts_populated     INTEGER DEFAULT 0
        )
      `);

      // Copy data back
      db.exec(`
        INSERT INTO patterns_old (
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, source_repo, tags_csv,
          pattern_digest, json_canonical, invalid, invalid_reason, alias,
          title_searchable, keywords_searchable, search_text, fts_populated
        )
        SELECT 
          id, schema_version, pattern_version, type, title, summary,
          trust_score, created_at, updated_at, source_repo, tags,
          pattern_digest, json_canonical, invalid, invalid_reason, alias,
          title_searchable, keywords_searchable, search_text, fts_populated
        FROM patterns
      `);

      // Drop and rename
      db.exec("DROP TABLE patterns");
      db.exec("ALTER TABLE patterns_old RENAME TO patterns");

      // Recreate indexes
      db.exec("CREATE INDEX idx_patterns_type ON patterns(type)");
      db.exec("CREATE INDEX idx_patterns_trust ON patterns(trust_score DESC)");
      db.exec("CREATE INDEX idx_patterns_created ON patterns(created_at DESC)");
      db.exec("CREATE INDEX idx_patterns_alias ON patterns(alias)");

      console.log("Successfully reverted tags to tags_csv");
    })();
  },

  validate: (db) => {
    try {
      // Check that tags column exists (not tags_csv)
      const columns = db.pragma("table_info(patterns)").map((col) => col.name);

      if (!columns.includes("tags")) {
        console.error("Validation failed: tags column not found");
        return false;
      }

      if (columns.includes("tags_csv")) {
        console.error("Validation failed: tags_csv column still exists");
        return false;
      }

      // Check that we can query the tags column
      const testQuery = db
        .prepare("SELECT id, tags FROM patterns LIMIT 1")
        .get();

      console.log("Migration 012 validation passed");
      return true;
    } catch (error) {
      console.error("Migration 012 validation error:", error);
      return false;
    }
  },
};
