// [PAT:TEST:SEARCH] ★★★★☆ (78 uses, 90% success) - Search functionality testing patterns
// [PAT:AUTO:nYDVmugt] ★★★★★ - Subprocess isolation for module linking issues
import { describe, test, expect } from "@jest/globals";
import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { runScript, getImportPath } from "../helpers/subprocess-runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Enhanced Pattern Discovery", () => {
  describe("Natural Language Query Tests", () => {
    const testCases = [
      { 
        query: "how to handle async errors in jest",
        expectedMinCount: 1,
        expectedPattern: "PAT:TEST:ASYNC_JEST"
      },
      { 
        query: "authentication jwt implementation",
        expectedMinCount: 1,
        expectedPattern: "PAT:AUTH:JWT_VALIDATION"
      },
      { 
        query: "fix typescript module errors",
        expectedMinCount: 1,
        expectedPattern: "FIX:TYPESCRIPT:MODULE_IMPORT"
      },
    ];

    test.each(testCases)(
      "should find patterns for: $query",
      async ({ query, expectedMinCount, expectedPattern }) => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-discover-test-"));
        const dbPath = path.join(tempDir, "test.db");
        
        try {
          const script = `
            import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
            import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
            import { PatternDiscoverer } from "${getImportPath("dist/mcp/tools/discover.js")}";
            import { MigrationRunner } from "${getImportPath("dist/migrations/MigrationRunner.js")}";
            import { MigrationLoader } from "${getImportPath("dist/migrations/MigrationLoader.js")}";
            import path from 'path';
            
            // Initialize repository and database
            const repository = new PatternRepository({ dbPath: ':memory:' });
            
            // Get the internal database from the repository
            const db = repository.getDatabase ? repository.getDatabase() : (repository.db?.database || repository.db);
            
            // FIRST: Create base patterns table (BEFORE migrations)
            db.exec(\`
              CREATE TABLE IF NOT EXISTS patterns (
                id                TEXT PRIMARY KEY,
                schema_version    TEXT NOT NULL DEFAULT '1.0',
                pattern_version   TEXT NOT NULL DEFAULT '1.0',
                type              TEXT NOT NULL,
                title             TEXT,
                summary           TEXT,
                trust_score       REAL DEFAULT 0.5,
                created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at        TEXT DEFAULT CURRENT_TIMESTAMP,
                pattern_digest    TEXT,
                json_canonical    TEXT,
                alpha             REAL DEFAULT 1.0,
                beta              REAL DEFAULT 1.0,
                usage_count       INTEGER DEFAULT 0,
                success_count     INTEGER DEFAULT 0,
                key_insight       TEXT,
                when_to_use       TEXT,
                common_pitfalls   TEXT,
                tags              TEXT,
                keywords          TEXT,
                search_index      TEXT,
                status            TEXT DEFAULT 'active'
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
            
            // Run migrations silently
            await migrationRunner.runMigrations(migrationsToRun);
            
            // Initialize repository after migrations
            await repository.initialize();
            const discoverer = new PatternDiscoverer(repository);

            // Insert test patterns
            const testPatterns = [
              {
                id: 'PAT:AUTH:JWT_VALIDATION',
                schema_version: '1.0',
                pattern_version: '1.0',
                type: 'CODEBASE',
                title: 'JWT Token Validation Pattern',
                summary: 'Secure JWT authentication and validation',
                tags: ['authentication', 'security', 'jwt'],
                keywords: ['jwt', 'token', 'auth', 'validation'],
                trust_score: 0.95,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                pattern_digest: 'test-digest-1',
                json_canonical: JSON.stringify({}),
                search_index: 'jwt token validation pattern secure authentication auth PAT AUTH JWT VALIDATION',
              },
              {
                id: 'PAT:TEST:ASYNC_JEST',
                schema_version: '1.0',
                pattern_version: '1.0',
                type: 'TEST',
                title: 'Async Jest Testing Pattern',
                summary: 'Handle asynchronous operations in Jest tests',
                tags: ['testing', 'jest', 'async'],
                keywords: ['test', 'jest', 'async', 'promise'],
                trust_score: 0.88,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                pattern_digest: 'test-digest-2',
                json_canonical: JSON.stringify({}),
                search_index: 'async jest testing pattern handle asynchronous operations tests errors PAT TEST ASYNC JEST',
              },
              {
                id: 'FIX:TYPESCRIPT:MODULE_IMPORT',
                schema_version: '1.0',
                pattern_version: '1.0',
                type: 'FAILURE',
                title: 'TypeScript Module Import Error Fix',
                summary: 'Fix TypeScript module resolution errors',
                tags: ['typescript', 'import', 'module'],
                keywords: ['typescript', 'import', 'error', 'module'],
                trust_score: 0.92,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                pattern_digest: 'test-digest-3',
                json_canonical: JSON.stringify({}),
                search_index: 'typescript module import error fix resolution errors FIX TYPESCRIPT MODULE IMPORT',
              },
            ];

            for (const pattern of testPatterns) {
              await repository.create(pattern);
            }
            
            // Wait for any async operations
            await new Promise(resolve => setTimeout(resolve, 200));

            // Test the discovery
            const response = await discoverer.discover({
              query: "${query}",
              max_results: 10,
              min_score: 0.3
            });

            if (response.patterns.length < ${expectedMinCount}) {
              console.log(\`FAIL: Expected at least ${expectedMinCount} patterns, got \${response.patterns.length}\`);
              process.exit(1);
            }
            
            const patternIds = response.patterns.map(p => p.pattern.id);
            if (!patternIds.includes("${expectedPattern}")) {
              console.log(\`FAIL: Expected pattern ${expectedPattern} not found in results: \${patternIds.join(', ')}\`);
              process.exit(1);
            }

            console.log("SUCCESS");
            await repository.shutdown();
          `;
          
          const scriptPath = path.join(tempDir, "test-discovery.mjs");
          await fs.writeFile(scriptPath, script);
          
          const result = await runScript(scriptPath);
          expect(result).toBe(true);
        } finally {
          await fs.remove(tempDir);
        }
      },
      15000
    );
  });

  describe("Synonym Expansion Tests", () => {
    test("should expand \"auth\" to include authentication synonyms", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-synonym-test-"));
      
      try {
        const script = `
          import { SynonymExpander } from "${getImportPath("dist/search/synonym-expander.js")}";
          
          const expander = new SynonymExpander();
          const expansion = expander.expandQuery('auth jwt');
          
          if (!expansion.expanded.includes('auth')) {
            console.log("FAIL: Should include 'auth' in expansion");
            process.exit(1);
          }
          if (!expansion.expanded.includes('authentication')) {
            console.log("FAIL: Should include 'authentication' in expansion");
            process.exit(1);
          }
          if (!expansion.expanded.includes('authorization')) {
            console.log("FAIL: Should include 'authorization' in expansion");
            process.exit(1);
          }
          if (!expansion.expanded.includes('jwt')) {
            console.log("FAIL: Should include 'jwt' in expansion");
            process.exit(1);
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-synonym-auth.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    test("should expand \"db\" to database synonyms", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-synonym-test-"));
      
      try {
        const script = `
          import { SynonymExpander } from "${getImportPath("dist/search/synonym-expander.js")}";
          
          const expander = new SynonymExpander();
          const expansion = expander.expandQuery('db migration');
          
          if (!expansion.expanded.includes('database')) {
            console.log("FAIL: Should include 'database' in expansion");
            process.exit(1);
          }
          if (!expansion.expanded.includes('storage')) {
            console.log("FAIL: Should include 'storage' in expansion");
            process.exit(1);
          }
          if (!expansion.expanded.includes('migration')) {
            console.log("FAIL: Should include 'migration' in expansion");
            process.exit(1);
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-synonym-db.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Fuzzy Matching Tests", () => {
    test("should handle typos with fuzzy matching", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-fuzzy-test-"));
      
      try {
        const script = `
          import { FuzzyMatcher } from "${getImportPath("dist/search/fuzzy-matcher.js")}";
          
          const matcher = new FuzzyMatcher();
          const result = matcher.fuzzyMatch('autentication', 'authentication', 0.8);
          
          if (!result.matched) {
            console.log("FAIL: Should match with fuzzy tolerance");
            process.exit(1);
          }
          if (result.score <= 0.8) {
            console.log(\`FAIL: Score should be > 0.8, got \${result.score}\`);
            process.exit(1);
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-fuzzy-typo.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    test("should suggest corrections for typos", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-fuzzy-test-"));
      
      try {
        const script = `
          import { FuzzyMatcher } from "${getImportPath("dist/search/fuzzy-matcher.js")}";
          
          const matcher = new FuzzyMatcher();
          const dictionary = ['authentication', 'authorization', 'jwt', 'token'];
          const suggestions = matcher.suggestCorrections('authen', dictionary);
          
          if (!suggestions.includes('authentication')) {
            console.log(\`FAIL: Should suggest 'authentication', got: \${suggestions.join(', ')}\`);
            process.exit(1);
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-fuzzy-suggest.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Performance Tests", () => {
    test("search should complete under 100ms", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-perf-test-"));
      const dbPath = path.join(tempDir, "test.db");
      
      try {
        const script = `
          import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
          import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
          import { PatternDiscoverer } from "${getImportPath("dist/mcp/tools/discover.js")}";
          import { MigrationRunner } from "${getImportPath("dist/migrations/MigrationRunner.js")}";
          import { MigrationLoader } from "${getImportPath("dist/migrations/MigrationLoader.js")}";
          import path from 'path';
          
          // Initialize repository
          const repository = new PatternRepository({ dbPath: ':memory:' });
          const db = repository.getDatabase ? repository.getDatabase() : (repository.db?.database || repository.db);
          
          // Setup database
          db.exec(\`
            CREATE TABLE IF NOT EXISTS patterns (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              title TEXT,
              summary TEXT,
              trust_score REAL DEFAULT 0.5,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              pattern_digest TEXT,
              json_canonical TEXT,
              tags TEXT,
              keywords TEXT,
              search_index TEXT,
              status TEXT DEFAULT 'active'
            );
          \`);
          
          await repository.initialize();
          const discoverer = new PatternDiscoverer(repository);
          
          // Insert a test pattern
          await repository.create({
            id: 'PAT:AUTH:TEST',
            type: 'CODEBASE',
            title: 'Test Pattern',
            summary: 'Authentication pattern for testing',
            trust_score: 0.9,
            tags: ['auth'],
            keywords: ['authentication'],
            search_index: 'test pattern authentication'
          });
          
          const start = Date.now();
          await discoverer.discover({
            query: 'authentication patterns',
            max_results: 10,
            min_score: 0.3
          });
          const duration = Date.now() - start;
          
          if (duration >= 100) {
            console.log(\`FAIL: Search took \${duration}ms, expected < 100ms\`);
            process.exit(1);
          }
          
          console.log("SUCCESS");
          await repository.shutdown();
        `;
        
        const scriptPath = path.join(tempDir, "test-performance.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    }, 15000);

    test("should use cache for repeated queries", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-cache-test-"));
      
      try {
        const script = `
          import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
          import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
          import { PatternDiscoverer } from "${getImportPath("dist/mcp/tools/discover.js")}";
          
          const repository = new PatternRepository({ dbPath: ':memory:' });
          const db = repository.getDatabase ? repository.getDatabase() : (repository.db?.database || repository.db);
          
          // Minimal schema
          db.exec(\`
            CREATE TABLE IF NOT EXISTS patterns (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              title TEXT,
              summary TEXT,
              trust_score REAL DEFAULT 0.5,
              search_index TEXT
            );
          \`);
          
          await repository.initialize();
          const discoverer = new PatternDiscoverer(repository);
          
          // First query
          const response1 = await discoverer.discover({
            query: 'test caching',
            max_results: 5,
          });
          
          if (response1.cache_hit !== false) {
            console.log("FAIL: First query should not be a cache hit");
            process.exit(1);
          }
          
          // Second identical query
          const response2 = await discoverer.discover({
            query: 'test caching',
            max_results: 5,
          });
          
          if (response2.cache_hit !== true) {
            console.log("FAIL: Second query should be a cache hit");
            process.exit(1);
          }
          
          // Latency should be lower for cached query
          if (response2.latency_ms >= response1.latency_ms) {
            console.log(\`FAIL: Cached query should be faster. First: \${response1.latency_ms}ms, Second: \${response2.latency_ms}ms\`);
            process.exit(1);
          }
          
          console.log("SUCCESS");
          await repository.shutdown();
        `;
        
        const scriptPath = path.join(tempDir, "test-cache.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Query Processing Tests", () => {
    test("should safely parse and sanitize FTS queries", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-query-test-"));
      
      try {
        const script = `
          import { QueryProcessor } from "${getImportPath("dist/search/query-processor.js")}";
          
          const processor = new QueryProcessor();
          
          const testQueries = [
            { input: 'auth AND jwt', expected: '"auth" "jwt"' },
            { input: '"exact phrase"', expected: '"exact phrase"' },
            { input: 'NOT error', expected: 'NOT "error"' },
          ];
          
          for (const { input, expected } of testQueries) {
            const processed = processor.processQuery(input, { enableSynonyms: false });
            if (processed.ftsQuery !== expected) {
              console.log(\`FAIL: Query '\${input}' expected '\${expected}', got '\${processed.ftsQuery}'\`);
              process.exit(1);
            }
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-query-parse.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });

    test("should reject dangerous query inputs", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-query-test-"));
      
      try {
        const script = `
          import { QueryProcessor } from "${getImportPath("dist/search/query-processor.js")}";
          
          const processor = new QueryProcessor();
          
          const dangerousQueries = [
            "'; DROP TABLE patterns; --",
            'query /* comment */ injection',
            'query\\\\x00null',
          ];
          
          for (const dangerous of dangerousQueries) {
            try {
              processor.processQuery(dangerous);
              console.log(\`FAIL: Should have rejected dangerous query: \${dangerous}\`);
              process.exit(1);
            } catch (error) {
              // Expected to throw
            }
          }
          
          console.log("SUCCESS");
        `;
        
        const scriptPath = path.join(tempDir, "test-query-danger.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe("Zero-Result Query Handling", () => {
    test("should provide meaningful results even for vague queries", async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apex-zero-test-"));
      
      try {
        const script = `
          import Database from "${getImportPath("node_modules/better-sqlite3/lib/index.js")}";
          import { PatternRepository } from "${getImportPath("dist/storage/repository.js")}";
          import { PatternDiscoverer } from "${getImportPath("dist/mcp/tools/discover.js")}";
          
          const repository = new PatternRepository({ dbPath: ':memory:' });
          const db = repository.getDatabase ? repository.getDatabase() : (repository.db?.database || repository.db);
          
          // Setup with a fix pattern
          db.exec(\`
            CREATE TABLE IF NOT EXISTS patterns (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              title TEXT,
              summary TEXT,
              trust_score REAL DEFAULT 0.5,
              tags TEXT,
              keywords TEXT,
              search_index TEXT
            );
          \`);
          
          await repository.initialize();
          await repository.create({
            id: 'FIX:ERROR:GENERIC',
            type: 'FAILURE',
            title: 'Generic Error Fix',
            summary: 'Fixes various errors',
            trust_score: 0.7,
            tags: ['fix', 'error'],
            keywords: ['fix', 'error', 'generic'],
            search_index: 'fix error generic various'
          });
          
          const discoverer = new PatternDiscoverer(repository);
          
          const response = await discoverer.discover({
            query: 'fix errors',
            max_results: 10,
          });
          
          if (response.patterns.length === 0) {
            console.log("FAIL: Should find at least one pattern for 'fix errors'");
            process.exit(1);
          }
          
          if (!response.query_interpretation || !response.query_interpretation.keywords.includes('fix')) {
            console.log("FAIL: Should interpret 'fix' keyword");
            process.exit(1);
          }
          
          console.log("SUCCESS");
          await repository.shutdown();
        `;
        
        const scriptPath = path.join(tempDir, "test-zero-result.mjs");
        await fs.writeFile(scriptPath, script);
        
        const result = await runScript(scriptPath);
        expect(result).toBe(true);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });
});