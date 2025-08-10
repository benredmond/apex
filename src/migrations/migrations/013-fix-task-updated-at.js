/**
 * Migration: Fix task updated_at column and add trigger
 * [PAT:MIGRATION:SQLITE] ★★★★☆ - SQLite migration pattern
 *
 * Ensures tasks table has updated_at column with proper default value
 * and adds trigger to automatically update it on record changes
 */

export const up = (db) => {
  // Check if updated_at column exists
  const tableInfo = db.prepare("PRAGMA table_info(tasks)").all();
  const hasUpdatedAt = tableInfo.some((col) => col.name === "updated_at");

  if (!hasUpdatedAt) {
    // Add updated_at column if it doesn't exist
    db.exec(`
      ALTER TABLE tasks 
      ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    `);

    // Update existing records to have updated_at same as created_at
    db.exec(`
      UPDATE tasks 
      SET updated_at = created_at 
      WHERE updated_at IS NULL
    `);
  }

  // Drop existing trigger if it exists (to avoid errors)
  db.exec(`
    DROP TRIGGER IF EXISTS update_tasks_updated_at
  `);

  // Create trigger to automatically update updated_at on changes
  db.exec(`
    CREATE TRIGGER update_tasks_updated_at 
    AFTER UPDATE ON tasks 
    FOR EACH ROW
    BEGIN
      UPDATE tasks 
      SET updated_at = DATETIME('now') 
      WHERE id = NEW.id;
    END
  `);
};

export const down = (db) => {
  // Remove the trigger
  db.exec(`
    DROP TRIGGER IF EXISTS update_tasks_updated_at
  `);

  // Note: We don't remove the column in down migration
  // as it may contain valuable data
};

export const name = "013-fix-task-updated-at";
