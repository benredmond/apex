// [PAT:AUTO:nYDVmugt] ★★★★★ - Subprocess isolation for module linking issues
import { describe, it, expect } from "@jest/globals";
import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { runScript, getImportPath } from "../../helpers/subprocess-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Pattern Lookup with Enhanced Metadata (APE-65)", () => {
  it("should return enhanced metadata fields in pattern pack", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-lookup-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import path from "path";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        import { MigrationRunner } from "${getImportPath("dist/migrations/MigrationRunner.js")}";
        import { MigrationLoader } from "${getImportPath("dist/migrations/MigrationLoader.js")}";
        
        // Create in-memory database
        const db = new Database(":memory:");
        
        // FIRST: Create base patterns table (BEFORE migrations)
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            schema_version    TEXT NOT NULL DEFAULT '1.0',
            pattern_version   TEXT NOT NULL DEFAULT '1.0',
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            trust_score       REAL NOT NULL DEFAULT 0.5,
            created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            pattern_digest    TEXT NOT NULL DEFAULT 'test',
            json_canonical    TEXT NOT NULL DEFAULT '{}',
            source_repo       TEXT,
            alias             TEXT,
            alpha             REAL DEFAULT 1.0,
            beta              REAL DEFAULT 1.0,
            usage_count       INTEGER DEFAULT 0,
            success_count     INTEGER DEFAULT 0,
            status            TEXT DEFAULT 'active',
            tags              TEXT,
            keywords          TEXT,
            search_index      TEXT,
            provenance        TEXT DEFAULT 'manual',
            key_insight       TEXT,
            when_to_use       TEXT,
            common_pitfalls   TEXT
          );
        \`);
        
        // THEN: Run migrations (with problematic ones skipped)
        const migrationRunner = new MigrationRunner(db);
        const loader = new MigrationLoader(path.resolve('${getImportPath("dist/migrations")}'));
        const migrations = await loader.loadMigrations();
        
        // Skip problematic migrations that expect existing data
        const migrationsToRun = migrations.filter(m => 
          !['011-migrate-pattern-tags-to-json', '012-rename-tags-csv-column', '014-populate-pattern-tags'].includes(m.id)
        );
        
        await migrationRunner.runMigrations(migrationsToRun);
        
        // Create additional schema if needed
        db.exec(\`
          CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            brief_id TEXT,
            outcome TEXT CHECK(outcome IN ('success','partial','failure')) NOT NULL,
            json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS snippets (
            snippet_id TEXT PRIMARY KEY,
            pattern_id TEXT NOT NULL,
            content TEXT NOT NULL,
            language TEXT,
            label TEXT,
            file_ref TEXT,
            line_count INTEGER,
            bytes INTEGER,
            FOREIGN KEY (pattern_id) REFERENCES patterns(id)
          );
          
          CREATE VIRTUAL TABLE patterns_fts USING fts5(
            id UNINDEXED,
            title,
            summary,
            tags,
            keywords,
            search_index,
            tokenize='porter'
          );
        \`);
        
        // Initialize repository with in-memory database
        const repository = new PatternRepository({
          dbPath: ":memory:",
        });
        
        // Replace repository's database with our test database
        const dbField = Object.getOwnPropertyDescriptor(repository, "db");
        if (dbField && dbField.value) {
          dbField.value.database = db;
        }
        
        // Initialize lookup service
        const lookupService = new PatternLookupService(repository);
        
        // Insert test pattern with enhanced metadata
        const pitfalls = JSON.stringify(["Don't mock too deep", "Reset mocks between tests"]);
        
        db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary, trust_score,
            alpha, beta, usage_count, success_count,
            key_insight, when_to_use, common_pitfalls
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`).run(
          "PAT:TEST:MOCK",
          "CODEBASE",
          "Jest API Mocking Patterns",
          "Mock API calls in Jest tests with proper isolation",
          0.88,
          88,
          12,
          234,
          206,
          "Mock at axios level, not function level",
          "Integration tests with external deps",
          pitfalls
        );
        
        // Add to FTS index
        db.prepare(\`
          INSERT INTO patterns_fts (id, title, summary)
          VALUES (?, ?, ?)
        \`).run(
          "PAT:TEST:MOCK",
          "Jest API Mocking Patterns",
          "Mock API calls in Jest tests with proper isolation"
        );
        
        // Add snippet
        db.prepare(\`
          INSERT INTO snippets (snippet_id, pattern_id, content, language)
          VALUES (?, ?, ?, ?)
        \`).run(
          "snip123",
          "PAT:TEST:MOCK",
          "jest.mock('axios');\\nconst mockAxios = axios as jest.Mocked<typeof axios>;",
          "typescript"
        );
        
        // Perform lookup
        const request = {
          task: "testing with mocks",
          max_size: 8192,
        };
        
        const response = await lookupService.lookup(request);
        
        if (!response || !response.pattern_pack) {
          console.log("FAIL: Response or pattern_pack undefined");
          process.exit(1);
        }
        
        if (!response.pattern_pack.candidates || response.pattern_pack.candidates.length !== 1) {
          console.log(\`FAIL: Expected 1 candidate, got \${response.pattern_pack.candidates?.length || 0}\`);
          process.exit(1);
        }
        
        const candidate = response.pattern_pack.candidates[0];
        
        // Check enhanced metadata fields
        if (candidate.id !== "PAT:TEST:MOCK") {
          console.log(\`FAIL: Wrong ID: \${candidate.id}\`);
          process.exit(1);
        }
        
        if (Math.abs(candidate.trust_score - 0.88) > 0.01) {
          console.log(\`FAIL: Trust score should be 0.88, got \${candidate.trust_score}\`);
          process.exit(1);
        }
        
        if (candidate.usage_count !== 234) {
          console.log(\`FAIL: Usage count should be 234, got \${candidate.usage_count}\`);
          process.exit(1);
        }
        
        if (Math.abs(candidate.success_rate - 0.88) > 0.02) {
          console.log(\`FAIL: Success rate should be ~0.88, got \${candidate.success_rate}\`);
          process.exit(1);
        }
        
        if (candidate.key_insight !== "Mock at axios level, not function level") {
          console.log(\`FAIL: Wrong key_insight: \${candidate.key_insight}\`);
          process.exit(1);
        }
        
        if (candidate.when_to_use !== "Integration tests with external deps") {
          console.log(\`FAIL: Wrong when_to_use: \${candidate.when_to_use}\`);
          process.exit(1);
        }
        
        const expectedPitfalls = ["Don't mock too deep", "Reset mocks between tests"];
        if (!candidate.common_pitfalls || 
            candidate.common_pitfalls.length !== 2 ||
            candidate.common_pitfalls[0] !== expectedPitfalls[0] ||
            candidate.common_pitfalls[1] !== expectedPitfalls[1]) {
          console.log(\`FAIL: Wrong common_pitfalls: \${JSON.stringify(candidate.common_pitfalls)}\`);
          process.exit(1);
        }
        
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-metadata.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  }, 15000);

  it("should calculate Wilson score from alpha/beta parameters", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-wilson-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import path from "path";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        
        // Create in-memory database
        const db = new Database(":memory:");
        
        // Minimal schema
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            alpha             REAL DEFAULT 1.0,
            beta              REAL DEFAULT 1.0,
            usage_count       INTEGER DEFAULT 0,
            success_count     INTEGER DEFAULT 0
          );
          
          CREATE VIRTUAL TABLE patterns_fts USING fts5(
            id UNINDEXED,
            title,
            summary,
            tokenize='porter'
          );
        \`);
        
        // Initialize repository
        const repository = new PatternRepository({ dbPath: ":memory:" });
        const dbField = Object.getOwnPropertyDescriptor(repository, "db");
        if (dbField && dbField.value) {
          dbField.value.database = db;
        }
        
        const lookupService = new PatternLookupService(repository);
        
        // Insert pattern with alpha/beta but no trust_score
        db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary,
            alpha, beta, usage_count, success_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        \`).run(
          "PAT:WILSON:TEST",
          "CODEBASE",
          "Wilson Score Test",
          "Testing Wilson score calculation",
          40,
          10,
          50,
          40
        );
        
        // Add to FTS index
        db.prepare(\`
          INSERT INTO patterns_fts (id, title, summary)
          VALUES (?, ?, ?)
        \`).run(
          "PAT:WILSON:TEST",
          "Wilson Score Test",
          "Testing Wilson score calculation"
        );
        
        const request = {
          task: "wilson score",
          max_size: 8192,
        };
        
        const response = await lookupService.lookup(request);
        const candidate = response.pattern_pack.candidates[0];
        
        // Wilson score for alpha=40, beta=10 should be around 0.67
        if (!candidate.trust_score) {
          console.log("FAIL: trust_score should be defined");
          process.exit(1);
        }
        
        if (candidate.trust_score <= 0.6 || candidate.trust_score >= 0.75) {
          console.log(\`FAIL: Trust score should be between 0.6 and 0.75, got \${candidate.trust_score}\`);
          process.exit(1);
        }
        
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-wilson.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });

  it("should handle patterns without enhanced metadata gracefully", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-basic-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        
        const db = new Database(":memory:");
        
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            trust_score       REAL NOT NULL DEFAULT 0.5
          );
          
          CREATE VIRTUAL TABLE patterns_fts USING fts5(
            id UNINDEXED,
            title,
            summary,
            tokenize='porter'
          );
        \`);
        
        const repository = new PatternRepository({ dbPath: ":memory:" });
        const dbField = Object.getOwnPropertyDescriptor(repository, "db");
        if (dbField && dbField.value) {
          dbField.value.database = db;
        }
        
        const lookupService = new PatternLookupService(repository);
        
        // Insert pattern without enhanced metadata
        db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary, trust_score
          ) VALUES (?, ?, ?, ?, ?)
        \`).run(
          "PAT:BASIC:TEST",
          "CODEBASE",
          "Basic Pattern",
          "A pattern without enhanced metadata",
          0.5
        );
        
        // Add to FTS index
        db.prepare(\`
          INSERT INTO patterns_fts (id, title, summary)
          VALUES (?, ?, ?)
        \`).run(
          "PAT:BASIC:TEST",
          "Basic Pattern",
          "A pattern without enhanced metadata"
        );
        
        const request = {
          task: "basic pattern",
          max_size: 8192,
        };
        
        const response = await lookupService.lookup(request);
        const candidate = response.pattern_pack.candidates[0];
        
        // Should have basic fields but optional enhanced fields may be undefined
        if (candidate.id !== "PAT:BASIC:TEST") {
          console.log(\`FAIL: Wrong ID: \${candidate.id}\`);
          process.exit(1);
        }
        
        if (candidate.trust_score !== 0.5) {
          console.log(\`FAIL: Trust score should be 0.5, got \${candidate.trust_score}\`);
          process.exit(1);
        }
        
        // These fields should be undefined for patterns without metadata
        if (candidate.usage_count !== undefined) {
          console.log(\`FAIL: usage_count should be undefined, got \${candidate.usage_count}\`);
          process.exit(1);
        }
        
        if (candidate.success_rate !== undefined) {
          console.log(\`FAIL: success_rate should be undefined, got \${candidate.success_rate}\`);
          process.exit(1);
        }
        
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-basic.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });

  it("should parse common_pitfalls as JSON array", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-pitfalls-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        
        const db = new Database(":memory:");
        
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            trust_score       REAL NOT NULL DEFAULT 0.5,
            common_pitfalls   TEXT
          );
          
          CREATE VIRTUAL TABLE patterns_fts USING fts5(
            id UNINDEXED,
            title,
            summary,
            tokenize='porter'
          );
        \`);
        
        const repository = new PatternRepository({ dbPath: ":memory:" });
        const dbField = Object.getOwnPropertyDescriptor(repository, "db");
        if (dbField && dbField.value) {
          dbField.value.database = db;
        }
        
        const lookupService = new PatternLookupService(repository);
        
        // Test with valid JSON array
        db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary, trust_score,
            common_pitfalls
          ) VALUES (?, ?, ?, ?, ?, ?)
        \`).run(
          "PAT:JSON:ARRAY",
          "CODEBASE",
          "JSON Array Test",
          "Testing JSON array parsing",
          0.7,
          '["First pitfall", "Second pitfall", "Third pitfall"]'
        );
        
        // Test with plain string (should convert to single-item array)
        db.prepare(\`
          INSERT INTO patterns (
            id, type, title, summary, trust_score,
            common_pitfalls
          ) VALUES (?, ?, ?, ?, ?, ?)
        \`).run(
          "PAT:PLAIN:STRING",
          "CODEBASE",
          "Plain String Test",
          "Testing plain string conversion",
          0.6,
          "This is a single pitfall"
        );
        
        // Add to FTS index
        db.prepare(\`
          INSERT INTO patterns_fts (id, title, summary)
          VALUES (?, ?, ?), (?, ?, ?)
        \`).run(
          "PAT:JSON:ARRAY", "JSON Array Test", "Testing JSON array parsing",
          "PAT:PLAIN:STRING", "Plain String Test", "Testing plain string conversion"
        );
        
        const request = {
          task: "test parsing",
          max_size: 16384,
        };
        
        const response = await lookupService.lookup(request);
        const candidates = response.pattern_pack.candidates;
        
        const jsonPattern = candidates.find((c) => c.id === "PAT:JSON:ARRAY");
        if (!jsonPattern?.common_pitfalls || 
            jsonPattern.common_pitfalls.length !== 3 ||
            jsonPattern.common_pitfalls[0] !== "First pitfall" ||
            jsonPattern.common_pitfalls[1] !== "Second pitfall" ||
            jsonPattern.common_pitfalls[2] !== "Third pitfall") {
          console.log(\`FAIL: JSON array pattern wrong: \${JSON.stringify(jsonPattern?.common_pitfalls)}\`);
          process.exit(1);
        }
        
        const stringPattern = candidates.find((c) => c.id === "PAT:PLAIN:STRING");
        if (!stringPattern?.common_pitfalls || 
            stringPattern.common_pitfalls.length !== 1 ||
            stringPattern.common_pitfalls[0] !== "This is a single pitfall") {
          console.log(\`FAIL: String pattern wrong: \${JSON.stringify(stringPattern?.common_pitfalls)}\`);
          process.exit(1);
        }
        
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-pitfalls.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });

  it("should calculate success_rate from success_count and usage_count", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-success-test-"));
    
    try {
      const script = `
        import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
        import { PatternLookupService } from "${getImportPath("dist/mcp/tools/lookup.js")}";
        import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
        
        const db = new Database(":memory:");
        
        db.exec(\`
          CREATE TABLE IF NOT EXISTS patterns (
            id                TEXT PRIMARY KEY,
            type              TEXT NOT NULL,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            trust_score       REAL NOT NULL DEFAULT 0.5,
            success_count     INTEGER DEFAULT 0,
            usage_count       INTEGER DEFAULT 0
          );
          
          CREATE VIRTUAL TABLE patterns_fts USING fts5(
            id UNINDEXED,
            title,
            summary,
            tokenize='porter'
          );
        \`);
        
        const repository = new PatternRepository({ dbPath: ":memory:" });
        const dbField = Object.getOwnPropertyDescriptor(repository, "db");
        if (dbField && dbField.value) {
          dbField.value.database = db;
        }
        
        const lookupService = new PatternLookupService(repository);
        
        // Test with various success/usage combinations
        const patterns = [
          { id: "PAT:PERFECT", success: 100, usage: 100, expected: 1.0 },
          { id: "PAT:GOOD", success: 75, usage: 100, expected: 0.75 },
          { id: "PAT:POOR", success: 10, usage: 100, expected: 0.1 },
          { id: "PAT:UNUSED", success: 0, usage: 0, expected: 0 },
        ];
        
        for (const pattern of patterns) {
          db.prepare(\`
            INSERT INTO patterns (
              id, type, title, summary, trust_score,
              success_count, usage_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          \`).run(
            pattern.id,
            "CODEBASE",
            \`\${pattern.id} Pattern\`,
            \`Testing success rate \${pattern.expected}\`,
            0.5,
            pattern.success,
            pattern.usage
          );
          
          db.prepare(\`
            INSERT INTO patterns_fts (id, title, summary)
            VALUES (?, ?, ?)
          \`).run(
            pattern.id,
            \`\${pattern.id} Pattern\`,
            \`Testing success rate \${pattern.expected}\`
          );
        }
        
        const request = {
          task: "success rate testing",
          max_size: 32768,
        };
        
        const response = await lookupService.lookup(request);
        
        for (const pattern of patterns) {
          const candidate = response.pattern_pack.candidates.find((c) => c.id === pattern.id);
          if (!candidate) {
            console.log(\`FAIL: Pattern \${pattern.id} not found\`);
            process.exit(1);
          }
          
          if (Math.abs(candidate.success_rate - pattern.expected) > 0.02) {
            console.log(\`FAIL: Pattern \${pattern.id} success_rate should be \${pattern.expected}, got \${candidate.success_rate}\`);
            process.exit(1);
          }
        }
        
        console.log("SUCCESS");
      `;
      
      const scriptPath = path.join(tempDir, "test-success.mjs");
      await fs.writeFile(scriptPath, script);
      
      const result = await runScript(scriptPath);
      expect(result).toBe(true);
    } finally {
      await fs.remove(tempDir);
    }
  });
});