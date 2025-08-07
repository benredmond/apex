/**
 * Migration 012: Rename tags_csv column to tags
 * [APE-63] Complete unification of tag storage format
 *
 * Renames the tags_csv column to tags to match the tasks table structure
 * This should be run AFTER migration 011 which converts the data format
 */

import type { Migration } from "./types.js";

export const migration: Migration = {
  id: "012-rename-tags-csv-column",
  version: 12,
  name: "Rename tags_csv column to tags in patterns table",

  up: (db) => {
    db.transaction(() => {
      console.log("Renaming tags_csv column to tags...");

      // SQLite doesn't support ALTER TABLE RENAME COLUMN in older versions
      // So we need to recreate the table

      // Check if tags_csv column exists
      const columns = (db.pragma("table_info(patterns)") as any[]).map(
        (col: any) => col.name,
      );

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
      const tableInfo = db.pragma("table_info(patterns)") as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
        pk: number;
      }>;

      // Build CREATE TABLE statement dynamically based on existing columns
      let createTableSQL = "CREATE TABLE patterns_new (";
      const columnDefs: string[] = [];

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
      const oldColumns: string[] = [];
      const newColumns: string[] = [];

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
      const columns = (db.pragma("table_info(patterns)") as any[]).map(
        (col: any) => col.name,
      );

      if (!columns.includes("tags")) {
        console.log("tags column doesn't exist, checking for tags_csv...");
        if (columns.includes("tags_csv")) {
          console.log("tags_csv column already exists, revert not needed");
          return;
        }
      }

      // Get current table structure to build dynamic CREATE TABLE
      const tableInfo = db.pragma("table_info(patterns)") as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
        pk: number;
      }>;

      // Build CREATE TABLE statement dynamically
      let createTableSQL = "CREATE TABLE patterns_old (";
      const columnDefs: string[] = [];

      for (const col of tableInfo) {
        if (col.name === "tags") {
          // Rename tags back to tags_csv
          columnDefs.push(
            `tags_csv ${col.type}${col.notnull ? " NOT NULL" : ""}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ""}`,
          );
        } else if (col.name !== "tags_csv") {
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
      const oldColumns: string[] = [];
      const newColumns: string[] = [];

      for (const col of tableInfo) {
        if (col.name === "tags") {
          newColumns.push("tags_csv");
          oldColumns.push("tags");
        } else if (col.name !== "tags_csv") {
          newColumns.push(col.name);
          oldColumns.push(col.name);
        }
      }

      // Copy data back
      db.exec(`
        INSERT INTO patterns_old (${newColumns.join(", ")})
        SELECT ${oldColumns.join(", ")}
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
      const columns = (db.pragma("table_info(patterns)") as any[]).map(
        (col: any) => col.name,
      );

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
