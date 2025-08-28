// [PAT:AUTO:nYDVmugt] ★★★★★ - Subprocess isolation for module linking issues
import { describe, it, expect } from "@jest/globals";
import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { runScript, getImportPath, generateDatabaseInit } from "../../helpers/subprocess-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("APE-65: Pattern Metadata Performance", () => {
  it("should extract pattern metadata within 500ms for 100 patterns", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-perf-test-"));
    const dbPath = path.join(tempDir, 'test.db');
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import path from "path";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        
        // Initialize database with migrations using AutoMigrator
        const dbPath = '${dbPath}';
        ${generateDatabaseInit(dbPath)}
        
        // Initialize repository with test database
        const repository = new PatternRepository({ dbPath: '${dbPath}' });
        
        // Get database for direct inserts
        const db = new Database('${dbPath}');
        
        const lookupService = new PatternLookupService(repository);
        
        // Insert 100 test patterns with full metadata
        const insertStmt = db.prepare(\`
          INSERT INTO patterns (
            id, schema_version, pattern_version, type, title, summary, trust_score,
            created_at, updated_at, pattern_digest, json_canonical,
            alpha, beta, usage_count, success_count,
            key_insight, when_to_use, common_pitfalls, tags, search_index,
            invalid, invalid_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`);
        
        const insertFts = db.prepare(\`
          INSERT INTO patterns_fts (id, title, summary, tags, search_index)
          VALUES (?, ?, ?, ?, ?)
        \`);
        
        // Batch insert patterns
        const insertBatch = db.transaction(() => {
          for (let i = 1; i <= 100; i++) {
            const id = \`PAT:TEST:\${i.toString().padStart(3, '0')}\`;
            const title = \`Test Pattern \${i}\`;
            const summary = \`Summary for pattern \${i} with various keywords\`;
            const tags = \`test,pattern,batch,perf\${i % 10}\`;
            const searchIndex = \`\${title} \${summary} \${tags}\`;
            const pitfalls = JSON.stringify([
              \`Pitfall 1 for pattern \${i}\`,
              \`Pitfall 2 for pattern \${i}\`
            ]);
            
            insertStmt.run(
              id, "1.0", "1.0", "CODEBASE", title, summary, 0.5 + (i / 200),
              new Date().toISOString(),
              new Date().toISOString(),
              \`test-digest-\${i}\`,
              JSON.stringify({}),
              10 + i, 5, 100 + i, 80 + i,
              \`Key insight for pattern \${i}\`,
              \`Use when scenario \${i}\`,
              pitfalls,
              tags,
              searchIndex,
              0,
              null
            );
            
            insertFts.run(id, title, summary, tags, searchIndex);
          }
        });
        
        insertBatch();
        
        // Insert some reflection data for last_used_task lookup
        const reflectionStmt = db.prepare(\`
          INSERT INTO reflections (task_id, outcome, json)
          VALUES (?, ?, ?)
        \`);
        
        for (let i = 1; i <= 20; i++) {
          const patternId = \`PAT:TEST:\${i.toString().padStart(3, '0')}\`;
          const reflection = {
            claims: {
              patterns_used: [{ pattern_id: patternId }]
            }
          };
          reflectionStmt.run(\`TASK-\${i}\`, 'success', JSON.stringify(reflection));
        }
        
        // Measure pattern extraction performance
        const startTime = Date.now();
        
        // Perform a lookup that will trigger metadata extraction
        const response = await lookupService.lookup({
          task: "test pattern batch performance",
          max_size: 32768, // Large size to include many patterns
        });
        
        const duration = Date.now() - startTime;
        
        // Verify performance requirement
        if (duration >= 500) {
          console.log(\`FAIL: Pattern extraction took \${duration}ms, expected < 500ms\`);
          process.exit(1);
        }
        
        // Verify we got patterns with metadata
        if (!response.pattern_pack) {
          console.log("FAIL: pattern_pack is undefined");
          process.exit(1);
        }
        
        if (!response.pattern_pack.candidates || response.pattern_pack.candidates.length === 0) {
          console.log("FAIL: No candidates found");
          process.exit(1);
        }
        
        // Check that metadata fields are populated
        const firstCandidate = response.pattern_pack.candidates[0];
        if (firstCandidate) {
          if (!firstCandidate.trust_score) {
            console.log("FAIL: trust_score not defined");
            process.exit(1);
          }
          if (!firstCandidate.usage_count) {
            console.log("FAIL: usage_count not defined");
            process.exit(1);
          }
          if (!firstCandidate.key_insight) {
            console.log("FAIL: key_insight not defined");
            process.exit(1);
          }
          if (!firstCandidate.when_to_use) {
            console.log("FAIL: when_to_use not defined");
            process.exit(1);
          }
          if (!firstCandidate.common_pitfalls) {
            console.log("FAIL: common_pitfalls not defined");
            process.exit(1);
          }
        }
        
        console.log(\`Pattern extraction for \${response.pattern_pack.candidates.length} patterns took \${duration}ms\`);
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-extract-perf.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath, { timeout: 20000 });
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  }, 25000);

  it("should efficiently update pattern usage statistics", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-update-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        
        // Create in-memory database
        const db = new Database(":memory:");
        
        // Create patterns table
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            usage_count       INTEGER DEFAULT 0,
            success_count     INTEGER DEFAULT 0,
            updated_at        TEXT DEFAULT CURRENT_TIMESTAMP
          );
        \`);
        
        // Insert test patterns
        const insertStmt = db.prepare(\`
          INSERT INTO patterns (id, type, title, summary, usage_count, success_count)
          VALUES (?, ?, ?, ?, ?, ?)
        \`);
        
        for (let i = 1; i <= 50; i++) {
          insertStmt.run(
            \`PAT:USAGE:\${i}\`,
            "CODEBASE",
            \`Usage Pattern \${i}\`,
            \`Testing usage statistics \${i}\`,
            0,
            0
          );
        }
        
        // Measure batch update performance
        const startTime = Date.now();
        
        // Simulate 50 pattern usage updates
        const updateStmt = db.prepare(\`
          UPDATE patterns 
          SET 
            usage_count = COALESCE(usage_count, 0) + 1,
            success_count = COALESCE(success_count, 0) + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        \`);
        
        const batchUpdate = db.transaction(() => {
          for (let i = 1; i <= 50; i++) {
            const wasSuccessful = Math.random() > 0.2; // 80% success rate
            updateStmt.run(wasSuccessful ? 1 : 0, \`PAT:USAGE:\${i}\`);
          }
        });
        
        batchUpdate();
        
        const duration = Date.now() - startTime;
        
        // Should complete batch updates very quickly
        if (duration >= 50) {
          console.log(\`FAIL: Batch update took \${duration}ms, expected < 50ms\`);
          process.exit(1);
        }
        
        // Verify updates were applied
        const pattern = db.prepare("SELECT * FROM patterns WHERE id = ?").get("PAT:USAGE:1");
        if (!pattern || pattern.usage_count !== 1) {
          console.log(\`FAIL: Pattern usage_count should be 1, got \${pattern?.usage_count}\`);
          process.exit(1);
        }
        
        console.log(\`Batch update of 50 pattern usage stats took \${duration}ms\`);
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-update-perf.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });

  it("should efficiently query patterns with metadata filters", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-query-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        
        // Create in-memory database
        const db = new Database(":memory:");
        
        // Create patterns table
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            trust_score       REAL DEFAULT 0.5,
            usage_count       INTEGER DEFAULT 0,
            success_count     INTEGER DEFAULT 0,
            key_insight       TEXT
          );
        \`);
        
        // Insert patterns with varying metadata
        const insertStmt = db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary, trust_score,
            usage_count, success_count, key_insight
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        \`);
        
        for (let i = 1; i <= 200; i++) {
          insertStmt.run(
            \`PAT:QUERY:\${i}\`,
            i % 3 === 0 ? "ANTI" : "CODEBASE",
            \`Query Pattern \${i}\`,
            \`Pattern for query testing \${i}\`,
            0.3 + (i / 300),
            i * 2,
            Math.floor(i * 1.8),
            i % 5 === 0 ? \`Important insight \${i}\` : null
          );
        }
        
        // Test complex query performance
        const startTime = Date.now();
        
        // Query patterns with multiple conditions
        const results = db.prepare(\`
          SELECT 
            id, title, trust_score, usage_count, success_count,
            CAST(success_count AS REAL) / NULLIF(usage_count, 0) as success_rate,
            key_insight
          FROM patterns
          WHERE 
            type = 'CODEBASE'
            AND trust_score > 0.5
            AND usage_count > 100
            AND key_insight IS NOT NULL
          ORDER BY trust_score DESC
          LIMIT 20
        \`).all();
        
        const duration = Date.now() - startTime;
        
        // Complex queries should still be fast
        if (duration >= 50) {
          console.log(\`FAIL: Query took \${duration}ms, expected < 50ms\`);
          process.exit(1);
        }
        
        if (results.length === 0) {
          console.log("FAIL: No results found");
          process.exit(1);
        }
        
        console.log(\`Complex metadata query returned \${results.length} results in \${duration}ms\`);
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-query-perf.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });
});