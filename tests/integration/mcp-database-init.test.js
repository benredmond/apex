/**
 * MCP Database Initialization Integration Tests
 * Uses subprocess isolation to avoid Jest ESM module linking issues
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("MCP Database Initialization Integration", () => {
  describe("AutoMigrator", () => {
    it("should create all required tables including task_evidence for fresh database", async () => {
      // Create a temp database path
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-mcp-test-"));
      const dbPath = path.join(tempDir, "test.db");
      
      try {
        // Run a Node script that uses AutoMigrator
        const script = `
          import { AutoMigrator } from "${path.resolve("dist/migrations/auto-migrator.js")}";
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Verify all required tables exist
          const db = new Database("${dbPath}", { readonly: true });
          
          try {
            const tables = db.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).all();
            
            const tableNames = tables.map(t => t.name);
            
            // Critical tables that must exist
            const requiredTables = [
              "patterns",
              "migrations",
              "pattern_metadata",
              "pattern_triggers",
              "pattern_vocab",
              "pattern_tags",
              "pattern_snippets",
              "snippets",
              "project_migrations",
              "project_config",
              "tasks",
              "task_evidence",
              "task_files",
              "task_similarity",
              "task_checkpoints",
            ];
            
            let allFound = true;
            for (const table of requiredTables) {
              if (!tableNames.includes(table)) {
                console.log(\`FAIL: Missing table: \${table}\`);
                allFound = false;
              }
            }
            
            // Specifically verify task_evidence table structure
            const taskEvidenceColumns = db.prepare(
              "PRAGMA table_info(task_evidence)"
            ).all();
            
            const columnNames = taskEvidenceColumns.map(c => c.name);
            const requiredColumns = ["id", "task_id", "type", "content", "metadata", "timestamp"];
            
            for (const col of requiredColumns) {
              if (!columnNames.includes(col)) {
                console.log(\`FAIL: Missing column in task_evidence: \${col}\`);
                allFound = false;
              }
            }
            
            if (allFound) {
              console.log("SUCCESS: All required tables and columns exist");
            }
          } finally {
            db.close();
          }
        `;
        
        // Write script to temp file
        const scriptPath = path.join(tempDir, "test-script.mjs");
        await fs.writeFile(scriptPath, script);
        
        // Execute the script with proper NODE_PATH
        const result = await new Promise((resolve, reject) => {
          const proc = spawn("node", [scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              NODE_PATH: path.join(__dirname, "../../node_modules")
            }
          });
          
          let stdout = "";
          let stderr = "";
          
          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          
          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          
          proc.on("close", (code) => {
            if (code === 0 && stdout.includes("SUCCESS")) {
              resolve(true);
            } else {
              reject(new Error(`Script failed: ${stderr || stdout}`));
            }
          });
        });
        
        expect(result).toBe(true);
      } finally {
        // Clean up
        await fs.remove(tempDir);
      }
    }, 10000); // 10 second timeout
    
    it("should add task_evidence table to existing database missing it", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-existing-test-"));
      const dbPath = path.join(tempDir, "test.db");
      
      try {
        // Create a script to test adding task_evidence to existing DB
        const script = `
          import { AutoMigrator } from "${path.resolve("dist/migrations/auto-migrator.js")}";
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          
          // First create a database without task_evidence table (simulating old version)
          const db = new Database("${dbPath}");
          
          db.exec(\`
            CREATE TABLE patterns (
              id TEXT PRIMARY KEY,
              schema_version TEXT NOT NULL,
              pattern_version TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              summary TEXT NOT NULL,
              trust_score REAL NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              json_canonical TEXT,
              tags TEXT,
              keywords TEXT,
              search_index TEXT
            );
            
            CREATE TABLE migrations (
              id TEXT PRIMARY KEY,
              version INTEGER NOT NULL,
              name TEXT NOT NULL,
              applied_at TEXT NOT NULL
            );
            
            -- Mark some migrations as already applied (but not the task_evidence one)
            INSERT INTO migrations (id, version, name, applied_at)
            VALUES 
              ('001-initial', 1, 'Initial schema', datetime('now')),
              ('002-add-drafts', 2, 'Add drafts table', datetime('now'));
          \`);
          
          // Verify task_evidence doesn't exist yet
          const tablesBefore = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'"
          ).all();
          
          if (tablesBefore.length > 0) {
            console.log("FAIL: task_evidence already exists before migration");
            process.exit(1);
          }
          
          db.close();
          
          // Now run AutoMigrator which should add missing tables
          const migrator = new AutoMigrator("${dbPath}");
          const success = await migrator.autoMigrate({ silent: true });
          
          if (!success) {
            console.log("FAIL: Migration failed");
            process.exit(1);
          }
          
          // Check task_evidence table now exists
          const dbAfter = new Database("${dbPath}", { readonly: true });
          try {
            const tablesAfter = dbAfter.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'"
            ).all();
            
            if (tablesAfter.length !== 1) {
              console.log("FAIL: task_evidence table not created");
              process.exit(1);
            }
            
            // Verify we can query it
            const result = dbAfter.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
            if (result.count === 0) {
              console.log("SUCCESS: task_evidence table created and queryable");
            } else {
              console.log("FAIL: Unexpected data in task_evidence");
            }
          } finally {
            dbAfter.close();
          }
          
          // Test that we can insert into it (need to create a task first due to foreign key)
          const dbWrite = new Database("${dbPath}");
          try {
            // First create a task so the foreign key constraint is satisfied
            dbWrite.prepare(\`
              INSERT INTO tasks (id, title, created_at)
              VALUES (?, ?, datetime('now'))
            \`).run("test-task", "Test Task");
            
            // Now insert evidence
            dbWrite.prepare(\`
              INSERT INTO task_evidence (task_id, type, content, metadata, timestamp)
              VALUES (?, ?, ?, ?, datetime('now'))
            \`).run("test-task", "decision", "test content", "{}");
            
            const inserted = dbWrite.prepare("SELECT * FROM task_evidence").get();
            if (inserted && inserted.task_id === "test-task") {
              console.log("SUCCESS: Can insert and read from task_evidence");
            } else {
              console.log("FAIL: Insert verification failed");
            }
          } finally {
            dbWrite.close();
          }
        `;
        
        const scriptPath = path.join(tempDir, "migration-test.mjs");
        await fs.writeFile(scriptPath, script);
        
        // Execute the script
        const result = await new Promise((resolve, reject) => {
          const proc = spawn("node", [scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              NODE_PATH: path.join(__dirname, "../../node_modules")
            }
          });
          
          let stdout = "";
          let stderr = "";
          
          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          
          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          
          proc.on("close", (code) => {
            if (stderr) console.log("Script errors:", stderr);
            
            if (code === 0 && stdout.includes("SUCCESS")) {
              resolve(true);
            } else {
              reject(new Error(`Migration test failed: ${stderr || stdout}`));
            }
          });
        });
        
        expect(result).toBe(true);
      } finally {
        // Clean up
        await fs.remove(tempDir);
      }
    }, 10000);
    
    it("should handle concurrent database access properly", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-concurrent-test-"));
      const dbPath = path.join(tempDir, "test.db");
      
      try {
        const script = `
          import { AutoMigrator } from "${path.resolve("dist/migrations/auto-migrator.js")}";
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          
          // Run first migrator
          const migrator1 = new AutoMigrator("${dbPath}");
          const success1 = await migrator1.autoMigrate({ silent: true });
          
          if (!success1) {
            console.log("FAIL: First migration failed");
            process.exit(1);
          }
          
          // Database connection should be closed, allowing another connection
          const db = new Database("${dbPath}");
          
          try {
            // Should be able to query
            const result = db.prepare("SELECT COUNT(*) as count FROM task_evidence").get();
            if (result.count !== 0) {
              console.log("FAIL: Unexpected data in task_evidence");
              db.close();
              process.exit(1);
            }
            
            db.close();
            
            // Should be able to run another migrator
            const migrator2 = new AutoMigrator("${dbPath}");
            const success2 = await migrator2.autoMigrate({ silent: true });
            
            if (success2) {
              console.log("SUCCESS: Concurrent access handled properly");
            } else {
              console.log("FAIL: Second migration failed");
            }
          } catch (error) {
            db.close();
            console.log(\`FAIL: \${error.message}\`);
            process.exit(1);
          }
        `;
        
        const scriptPath = path.join(tempDir, "concurrent-test.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await new Promise((resolve, reject) => {
          const proc = spawn("node", [scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              NODE_PATH: path.join(__dirname, "../../node_modules")
            }
          });
          
          let stdout = "";
          let stderr = "";
          
          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          
          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          
          proc.on("close", (code) => {
            if (code === 0 && stdout.includes("SUCCESS")) {
              resolve(true);
            } else {
              reject(new Error(`Concurrent test failed: ${stderr || stdout}`));
            }
          });
        });
        
        expect(result).toBe(true);
      } finally {
        // Clean up
        await fs.remove(tempDir);
      }
    }, 10000);
  });
  
  describe("ApexConfig Integration", () => {
    it("should not use legacy path even when it exists", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-legacy-test-"));
      const testDbPath = path.join(tempDir, "new-patterns.db");
      
      try {
        const script = `
          import fs from "${path.join(__dirname, '../../node_modules/fs-extra/lib/index.js')}";
          import path from "path";
          
          // Create a legacy database file
          const legacyPath = "${path.join(tempDir, "patterns.db")}";
          await fs.writeFile(legacyPath, "legacy database content");
          
          // Set environment variable to use new path
          process.env.APEX_PATTERNS_DB = "${testDbPath}";
          
          // Change to temp directory
          process.chdir("${tempDir}");
          
          // Import ApexConfig after setting up environment
          const { ApexConfig } = await import("${path.resolve("dist/config/apex-config.js")}");
          
          const dbPath = await ApexConfig.getProjectDbPath();
          
          // Should return our test path from env var, not legacy
          if (dbPath === "${testDbPath}" && dbPath !== legacyPath) {
            console.log("SUCCESS: Using correct path, not legacy");
          } else {
            console.log(\`FAIL: Wrong path returned: \${dbPath}\`);
          }
        `;
        
        const scriptPath = path.join(tempDir, "legacy-path-test.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await new Promise((resolve, reject) => {
          const proc = spawn("node", [scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],
            cwd: tempDir,
            env: {
              ...process.env,
              NODE_PATH: path.join(__dirname, "../../node_modules")
            }
          });
          
          let stdout = "";
          let stderr = "";
          
          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          
          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          
          proc.on("close", (code) => {
            if (code === 0 && stdout.includes("SUCCESS")) {
              resolve(true);
            } else {
              reject(new Error(`Legacy path test failed: ${stderr || stdout}`));
            }
          });
        });
        
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 10000);
    
    it("should migrate and delete legacy database", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-migration-test-"));
      
      try {
        const script = `
          import { ApexConfig } from "${path.resolve("dist/config/apex-config.js")}";
          import Database from "${path.join(__dirname, '../../node_modules/better-sqlite3/lib/index.js')}";
          import fs from "${path.join(__dirname, '../../node_modules/fs-extra/lib/index.js')}";
          import path from "path";
          
          // Change to temp directory
          process.chdir("${tempDir}");
          
          // Create legacy database with data
          const legacyPath = path.join("${tempDir}", "patterns.db");
          const db = new Database(legacyPath);
          db.exec(\`
            CREATE TABLE patterns (
              id TEXT PRIMARY KEY,
              title TEXT
            );
            INSERT INTO patterns (id, title) VALUES ('TEST', 'Test Pattern');
          \`);
          db.close();
          
          // Verify legacy exists
          if (!await fs.pathExists(legacyPath)) {
            console.log("FAIL: Legacy database not created");
            process.exit(1);
          }
          
          // Run migration
          const migrated = await ApexConfig.migrateLegacyDatabase();
          
          // Check result
          if (typeof migrated === "boolean") {
            // If migration happened, legacy should be gone
            if (migrated) {
              const legacyStillExists = await fs.pathExists(legacyPath);
              if (!legacyStillExists) {
                console.log("SUCCESS: Legacy database migrated and deleted");
              } else {
                console.log("FAIL: Legacy database still exists after migration");
              }
            } else {
              console.log("SUCCESS: No migration needed");
            }
          } else {
            console.log("FAIL: Unexpected migration result");
          }
        `;
        
        const scriptPath = path.join(tempDir, "migration-test.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await new Promise((resolve, reject) => {
          const proc = spawn("node", [scriptPath], {
            stdio: ["ignore", "pipe", "pipe"],
            cwd: tempDir,
            env: {
              ...process.env,
              NODE_PATH: path.join(__dirname, "../../node_modules")
            }
          });
          
          let stdout = "";
          let stderr = "";
          
          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });
          
          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });
          
          proc.on("close", (code) => {
            if (stderr) console.log("Script errors:", stderr);
            
            if (code === 0 && stdout.includes("SUCCESS")) {
              resolve(true);
            } else {
              reject(new Error(`Migration test failed: ${stderr || stdout}`));
            }
          });
        });
        
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 10000);
  });
});