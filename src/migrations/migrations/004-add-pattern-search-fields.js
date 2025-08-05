import { createHash } from "crypto";
const migration = {
  version: 4,
  id: "004-add-pattern-search-fields",
  name: "Add enhanced search fields to patterns table",
  // [FIX:DB:MIGRATION_ROLLBACK] ★★★★★ (89 uses, 96% success) - Handle migration failures gracefully
  up(db) {
    const transaction = db.transaction(() => {
      // Add new columns for enhanced search
      // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we need to handle this differently
      try {
        // Try to add columns - will fail if they already exist
        db.exec("ALTER TABLE patterns ADD COLUMN tags TEXT;");
      } catch (e) {
        // Column might already exist, continue
      }
      try {
        db.exec("ALTER TABLE patterns ADD COLUMN keywords TEXT;");
      } catch (e) {
        // Column might already exist, continue
      }
      try {
        db.exec("ALTER TABLE patterns ADD COLUMN search_index TEXT;");
      } catch (e) {
        // Column might already exist, continue
      }
      // Drop existing FTS table
      db.exec("DROP TABLE IF EXISTS patterns_fts;");
      // Recreate FTS5 table with expanded fields
      // Using unicode61 tokenizer for international support (from Gemini review)
      db.exec(`
        CREATE VIRTUAL TABLE patterns_fts USING fts5(
          id UNINDEXED,
          title,
          summary,
          tags,
          keywords,
          search_index,
          tokenize='unicode61'
        );
      `);
      // Repopulate FTS table with existing data
      db.exec(`
        INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
        SELECT rowid, id, title, summary, tags, keywords, search_index
        FROM patterns;
      `);
      // Recreate triggers for FTS synchronization
      db.exec(`
        DROP TRIGGER IF EXISTS patterns_ai;
        DROP TRIGGER IF EXISTS patterns_ad;
        DROP TRIGGER IF EXISTS patterns_au;
        
        CREATE TRIGGER patterns_ai AFTER INSERT ON patterns BEGIN
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
        
        CREATE TRIGGER patterns_ad AFTER DELETE ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
        END;
        
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary, tags, keywords, search_index ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary, tags, keywords, search_index)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.tags, old.keywords, old.search_index);
          INSERT INTO patterns_fts (rowid, id, title, summary, tags, keywords, search_index)
          VALUES (new.rowid, new.id, new.title, new.summary, new.tags, new.keywords, new.search_index);
        END;
      `);
      // Create index for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_patterns_tags ON patterns(tags);
        CREATE INDEX IF NOT EXISTS idx_patterns_keywords ON patterns(keywords);
      `);
    });
    try {
      transaction();
    } catch (error) {
      throw new Error(`Migration failed: ${error.message}`);
    }
  },
  down(db) {
    const transaction = db.transaction(() => {
      // Restore original FTS table structure
      db.exec("DROP TABLE IF EXISTS patterns_fts;");
      db.exec(`
        CREATE VIRTUAL TABLE patterns_fts USING fts5(
          id UNINDEXED,
          title,
          summary,
          content=''
        );
      `);
      // Restore original triggers
      db.exec(`
        DROP TRIGGER IF EXISTS patterns_ai;
        DROP TRIGGER IF EXISTS patterns_ad;
        DROP TRIGGER IF EXISTS patterns_au;
        
        CREATE TRIGGER patterns_ai AFTER INSERT ON patterns BEGIN
          INSERT INTO patterns_fts (rowid, id, title, summary)
          VALUES (new.rowid, new.id, new.title, new.summary);
        END;
        
        CREATE TRIGGER patterns_ad AFTER DELETE ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary);
        END;
        
        CREATE TRIGGER patterns_au AFTER UPDATE OF title, summary ON patterns BEGIN
          INSERT INTO patterns_fts (patterns_fts, rowid, id, title, summary)
          VALUES ('delete', old.rowid, old.id, old.title, old.summary);
          INSERT INTO patterns_fts (rowid, id, title, summary)
          VALUES (new.rowid, new.id, new.title, new.summary);
        END;
      `);
      // Note: We're not removing the columns as that would require recreating the table
      // This is safer and maintains data integrity
    });
    try {
      transaction();
    } catch (error) {
      throw new Error(`Migration rollback failed: ${error.message}`);
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
