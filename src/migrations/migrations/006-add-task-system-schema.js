/**
 * Migration to add task system database schema
 * Implements APE-51: Create foundational database schema for APEX task execution system
 */
export const migration = {
  id: "006-add-task-system-schema",
  version: 6,
  name: "Add task system database schema",
  up: (db) => {
    // [PAT:dA0w9N1I9-4m] ★★★☆☆ - Better-SQLite3 Synchronous Transactions
    // [FIX:SQLITE:SYNC] ★★★★★ - All operations are synchronous within transaction
    db.transaction(() => {
      // 1. Check if tasks table already exists
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
        )
        .all();
      if (tables.length === 0) {
        // 2. Create main tasks table
        db.exec(`
          CREATE TABLE tasks (
            -- Core identifiers
            id TEXT PRIMARY KEY,
            identifier TEXT,
            title TEXT NOT NULL,
            intent TEXT,
            task_type TEXT,
            status TEXT DEFAULT 'active',
            
            -- Task Brief Components (JSON storage for complex structures)
            tl_dr TEXT,
            objectives TEXT,
            constraints TEXT,
            acceptance_criteria TEXT,
            plan TEXT,
            facts TEXT,
            snippets TEXT,
            risks_and_gotchas TEXT,
            open_questions TEXT,
            in_flight TEXT,
            test_scaffold TEXT,
            
            -- Execution tracking (5-phase workflow)
            phase TEXT DEFAULT 'ARCHITECT',
            phase_handoffs TEXT,
            confidence REAL DEFAULT 0.3 CHECK (confidence >= 0.0 AND confidence <= 1.0),
            
            -- Evidence Collection (for reflection)
            files_touched TEXT,
            patterns_used TEXT,
            errors_encountered TEXT,
            claims TEXT,
            
            -- Learning & Intelligence
            prior_impls TEXT,
            failure_corpus TEXT,
            policy TEXT,
            assumptions TEXT,
            
            -- Results (for Shadow Graph)
            outcome TEXT,
            reflection_id TEXT,
            key_learning TEXT,
            duration_ms INTEGER,
            
            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
          )
        `);
        console.log("Created tasks table");
        // 3. Create task_files association table
        db.exec(`
          CREATE TABLE task_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            operation TEXT NOT NULL,
            lines_added INTEGER DEFAULT 0,
            lines_removed INTEGER DEFAULT 0,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            UNIQUE(task_id, file_path, operation)
          )
        `);
        console.log("Created task_files table");
        // 4. Create task_similarity cache table
        db.exec(`
          CREATE TABLE task_similarity (
            task_a TEXT NOT NULL,
            task_b TEXT NOT NULL,
            similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
            calculation_method TEXT,
            calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            PRIMARY KEY (task_a, task_b),
            CHECK (task_a < task_b)
          )
        `);
        console.log("Created task_similarity table");
        // 5. Create indexes for performance (<1.5s query target)
        // Primary indexes for tasks table
        db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)");
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type)",
        );
        db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase)");
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_outcome ON tasks(outcome)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_identifier ON tasks(identifier)",
        );
        // Composite indexes for common queries
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_status_phase ON tasks(status, phase)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_tasks_type_outcome ON tasks(task_type, outcome)",
        );
        // File tracking indexes
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_task_files_path ON task_files(file_path)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_task_files_timestamp ON task_files(timestamp DESC)",
        );
        // Similarity search indexes
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_similarity_task_a ON task_similarity(task_a)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_similarity_task_b ON task_similarity(task_b)",
        );
        db.exec(
          "CREATE INDEX IF NOT EXISTS idx_similarity_score ON task_similarity(similarity_score DESC)",
        );
        console.log("Created all indexes for performance optimization");
      } else {
        console.log("Tasks table already exists, skipping creation");
      }
    })();
  },
  down: (db) => {
    db.transaction(() => {
      // Drop indexes first
      db.exec("DROP INDEX IF EXISTS idx_tasks_status");
      db.exec("DROP INDEX IF EXISTS idx_tasks_type");
      db.exec("DROP INDEX IF EXISTS idx_tasks_phase");
      db.exec("DROP INDEX IF EXISTS idx_tasks_created");
      db.exec("DROP INDEX IF EXISTS idx_tasks_outcome");
      db.exec("DROP INDEX IF EXISTS idx_tasks_identifier");
      db.exec("DROP INDEX IF EXISTS idx_tasks_status_phase");
      db.exec("DROP INDEX IF EXISTS idx_tasks_type_outcome");
      db.exec("DROP INDEX IF EXISTS idx_task_files_task");
      db.exec("DROP INDEX IF EXISTS idx_task_files_path");
      db.exec("DROP INDEX IF EXISTS idx_task_files_timestamp");
      db.exec("DROP INDEX IF EXISTS idx_similarity_task_a");
      db.exec("DROP INDEX IF EXISTS idx_similarity_task_b");
      db.exec("DROP INDEX IF EXISTS idx_similarity_score");
      // Drop tables
      db.exec("DROP TABLE IF EXISTS task_similarity");
      db.exec("DROP TABLE IF EXISTS task_files");
      db.exec("DROP TABLE IF EXISTS tasks");
      console.log("Rolled back task system schema");
    })();
  },
  // [PAT:MIGRATION:VALIDATION] ★★★★☆ - Validate migration success
  validate: (db) => {
    try {
      // Check all tables exist
      const requiredTables = ["tasks", "task_files", "task_similarity"];
      for (const tableName of requiredTables) {
        const table = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(tableName);
        if (!table) {
          console.error(`Validation failed: ${tableName} table not found`);
          return false;
        }
      }
      // Check critical indexes exist
      const criticalIndexes = [
        "idx_tasks_status",
        "idx_tasks_phase",
        "idx_task_files_task",
        "idx_similarity_score",
      ];
      for (const indexName of criticalIndexes) {
        const index = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
          )
          .get(indexName);
        if (!index) {
          console.error(`Validation failed: ${indexName} index not found`);
          return false;
        }
      }
      // Test insert and query performance
      const testStart = Date.now();
      // Insert test task
      db.prepare(
        `INSERT INTO tasks (id, title, task_type, status, phase) 
         VALUES ('TEST_001', 'Test Task', 'test', 'active', 'ARCHITECT')`,
      ).run();
      // Query test
      const result = db
        .prepare("SELECT * FROM tasks WHERE id = ?")
        .get("TEST_001");
      // Clean up test data
      db.prepare("DELETE FROM tasks WHERE id = ?").run("TEST_001");
      const duration = Date.now() - testStart;
      if (duration > 1500) {
        console.error(
          `Validation warning: Query performance ${duration}ms exceeds 1500ms target`,
        );
      }
      console.log(
        `Migration 006 validation passed (performance: ${duration}ms)`,
      );
      return true;
    } catch (error) {
      console.error("Migration 006 validation error:", error);
      return false;
    }
  },
};
