/**
 * Migration to add tags column to tasks table
 * Implements APE-63: Multi-Dimensional Pattern Tagging System
 */

export const migration = {
  id: "010-add-task-tags",
  version: 10,
  name: "Add tags column to tasks table",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    db.transaction(() => {
      // Check if tags column already exists
      const columns = db.pragma("table_info(tasks)").map((col) => col.name);

      if (!columns.includes("tags")) {
        // Add tags column as JSON array stored in TEXT
        db.exec(`
          ALTER TABLE tasks 
          ADD COLUMN tags TEXT
        `);
        console.log("Added tags column to tasks table");

        // Create index for tags column
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_tasks_tags 
          ON tasks(tags)
        `);
        console.log("Created index on tasks.tags");
      } else {
        console.log("Tags column already exists in tasks table");
      }
    })();
  },

  down: (db) => {
    db.transaction(() => {
      // Drop the index
      db.exec("DROP INDEX IF EXISTS idx_tasks_tags");

      // Note: SQLite doesn't support dropping columns easily
      // We would need to recreate the table without the tags column
      // For safety, we'll just log that the column remains
      console.log(
        "Rolled back task tags migration (column remains for safety)",
      );
    })();
  },

  validate: (db) => {
    try {
      // Check that tags column exists
      const columns = db.pragma("table_info(tasks)").map((col) => col.name);
      if (!columns.includes("tags")) {
        console.error(
          "Validation failed: tags column not found in tasks table",
        );
        return false;
      }

      // Check that index exists
      const index = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_tasks_tags'",
        )
        .get();
      if (!index) {
        console.error("Validation failed: idx_tasks_tags index not found");
        return false;
      }

      // Test insert with tags - schema-aware approach
      const testStart = Date.now();
      
      // Build dynamic insert based on available columns
      const testId = "TEST_TAGS_001";
      const testTitle = "Test Task with Tags";
      const testTags = JSON.stringify(["test", "validation", "tags"]);
      
      // Determine which columns we can use for the test insert
      const availableColumns = ["id", "title", "tags"];
      const values = [testId, testTitle, testTags];
      
      // Add optional columns if they exist
      if (columns.includes("task_type")) {
        availableColumns.push("task_type");
        values.push("test");
      }
      if (columns.includes("status")) {
        availableColumns.push("status");
        values.push("active");
      }
      if (columns.includes("phase")) {
        availableColumns.push("phase");
        values.push("ARCHITECT");
      }
      
      // Build and execute the insert statement
      const placeholders = availableColumns.map(() => "?").join(", ");
      const insertSql = `INSERT INTO tasks (${availableColumns.join(", ")}) VALUES (${placeholders})`;
      db.prepare(insertSql).run(...values);

      // Query test
      const result = db
        .prepare("SELECT tags FROM tasks WHERE id = ?")
        .get(testId);

      // Verify tags can be parsed back
      const tags = JSON.parse(result.tags);
      if (!Array.isArray(tags) || tags.length !== 3) {
        console.error("Validation failed: tags not stored/retrieved correctly");
        return false;
      }

      // Clean up test data
      db.prepare("DELETE FROM tasks WHERE id = ?").run(testId);

      const duration = Date.now() - testStart;
      console.log(
        `Migration 010 validation passed (performance: ${duration}ms)`,
      );
      return true;
    } catch (error) {
      console.error("Migration 010 validation error:", error);
      return false;
    }
  },
};
