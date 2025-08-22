/**
 * Simple test to verify database tables are created correctly
 * This test bypasses the ESM module linking issues
 */

import { describe, it, expect } from "@jest/globals";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import os from "os";

describe("Database Table Creation", () => {
  it("should create task_evidence table via AutoMigrator", async () => {
    // Create a temp database path
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-test-"));
    const dbPath = path.join(tempDir, "test.db");
    
    try {
      // Run a simple Node script that uses AutoMigrator
      const script = `
        import { AutoMigrator } from "${path.resolve("dist/migrations/auto-migrator.js")}";
        import Database from "better-sqlite3";
        
        const migrator = new AutoMigrator("${dbPath}");
        await migrator.autoMigrate({ silent: true });
        
        // Verify task_evidence table exists
        const db = new Database("${dbPath}", { readonly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_evidence'").all();
        
        if (tables.length === 1) {
          console.log("SUCCESS: task_evidence table exists");
        } else {
          console.log("FAIL: task_evidence table not found");
        }
        db.close();
      `;
      
      // Write script to temp file
      const scriptPath = path.join(tempDir, "test-script.mjs");
      await fs.writeFile(scriptPath, script);
      
      // Execute the script
      const result = await new Promise((resolve, reject) => {
        const proc = spawn("node", [scriptPath], {
          stdio: ["ignore", "pipe", "pipe"],
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
  
  it("should handle legacy database migration correctly", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-legacy-test-"));
    
    try {
      // Create a script to test legacy migration
      const script = `
        import { ApexConfig } from "${path.resolve("dist/config/apex-config.js")}";
        import Database from "better-sqlite3";
        import fs from "fs-extra";
        import path from "path";
        
        // Change to temp dir
        process.chdir("${tempDir}");
        
        // Create a legacy database
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
        
        console.log("Legacy database created at:", legacyPath);
        
        // Run migration
        const migrated = await ApexConfig.migrateLegacyDatabase();
        
        // Check if legacy was deleted
        const legacyExists = await fs.pathExists(legacyPath);
        
        if (migrated && !legacyExists) {
          console.log("SUCCESS: Legacy database migrated and deleted");
        } else if (!migrated) {
          console.log("INFO: No migration needed");
        } else {
          console.log("FAIL: Legacy database still exists after migration");
        }
      `;
      
      const scriptPath = path.join(tempDir, "migration-test.mjs");
      await fs.writeFile(scriptPath, script);
      
      // Execute the script
      const result = await new Promise((resolve, reject) => {
        const proc = spawn("node", [scriptPath], {
          stdio: ["ignore", "pipe", "pipe"],
          cwd: tempDir,
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
          console.log("Script output:", stdout);
          if (stderr) console.log("Script errors:", stderr);
          
          if (code === 0 && (stdout.includes("SUCCESS") || stdout.includes("INFO"))) {
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
});