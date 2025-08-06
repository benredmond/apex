/**
 * Migration to add evidence log table for task execution tracking
 * Implements APE-57: Create Simple Evidence Append Tool
 */
export const migration = {
    id: "007-add-evidence-log-table",
    version: 7,
    name: "Add task evidence log table",
    up: (db) => {
        // [FIX:SQLITE:SYNC] ★★★★★ - All operations are synchronous within transaction
        db.transaction(() => {
            // Check if task_evidence table already exists
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'")
                .all();
            if (tables.length === 0) {
                // Create task_evidence table (append-only log)
                db.exec(`
          CREATE TABLE task_evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('file', 'pattern', 'error', 'decision', 'learning')),
            content TEXT NOT NULL,
            metadata TEXT, -- JSON field for optional metadata
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          )
        `);
                console.log("Created task_evidence table");
                // Create indexes for performance
                db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_task ON task_evidence(task_id)");
                db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_task_type ON task_evidence(task_id, type)");
                db.exec("CREATE INDEX IF NOT EXISTS idx_evidence_timestamp ON task_evidence(timestamp DESC)");
                console.log("Created indexes for task_evidence table");
            }
            else {
                console.log("task_evidence table already exists, skipping creation");
            }
        })();
    },
    down: (db) => {
        db.transaction(() => {
            // Drop indexes first
            db.exec("DROP INDEX IF EXISTS idx_evidence_task");
            db.exec("DROP INDEX IF EXISTS idx_evidence_task_type");
            db.exec("DROP INDEX IF EXISTS idx_evidence_timestamp");
            // Drop table
            db.exec("DROP TABLE IF EXISTS task_evidence");
            console.log("Rolled back task evidence schema");
        })();
    },
    // [PAT:MIGRATION:VALIDATION] ★★★★☆ - Validate migration success
    validate: (db) => {
        try {
            // Check table exists
            const table = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'")
                .get();
            if (!table) {
                console.error("Validation failed: task_evidence table not found");
                return false;
            }
            // Check indexes exist
            const indexes = [
                "idx_evidence_task",
                "idx_evidence_task_type",
                "idx_evidence_timestamp",
            ];
            for (const indexName of indexes) {
                const index = db
                    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
                    .get(indexName);
                if (!index) {
                    console.error(`Validation failed: ${indexName} index not found`);
                    return false;
                }
            }
            // Test insert and query
            const testStart = Date.now();
            // Create test task first (required for foreign key)
            db.prepare(`INSERT OR IGNORE INTO tasks (id, title, task_type, status) 
         VALUES ('TEST_EVIDENCE_001', 'Test Task', 'test', 'active')`).run();
            // Insert test evidence
            db.prepare(`INSERT INTO task_evidence (task_id, type, content, metadata) 
         VALUES ('TEST_EVIDENCE_001', 'file', 'Test content', '{"test": true}')`).run();
            // Query test
            const result = db
                .prepare("SELECT * FROM task_evidence WHERE task_id = ?")
                .all("TEST_EVIDENCE_001");
            // Clean up test data
            db.prepare("DELETE FROM task_evidence WHERE task_id = ?").run("TEST_EVIDENCE_001");
            db.prepare("DELETE FROM tasks WHERE id = ?").run("TEST_EVIDENCE_001");
            const duration = Date.now() - testStart;
            if (duration > 500) {
                console.error(`Validation warning: Query performance ${duration}ms exceeds 500ms target`);
            }
            console.log(`Migration 007 validation passed (performance: ${duration}ms)`);
            return true;
        }
        catch (error) {
            console.error("Migration 007 validation error:", error);
            return false;
        }
    },
};
