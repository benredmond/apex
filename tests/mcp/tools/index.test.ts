/**
 * Tests for MCP tools orchestration
 * [PAT:TEST:BEHAVIOR_OVER_INTERNALS] ★★★★☆ (3 uses) - Test behavior not internals
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import {
  initializeTools,
  registerTools,
  getToolsList,
} from "../../../src/mcp/tools/index.js";
import { toMCPError } from "../../../src/mcp/errors.js";
import os from "os";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";

// ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("MCP Tools Orchestration", () => {
  let tempDir: string;
  let repository: PatternRepository;
  let server: Server;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = path.join(os.tmpdir(), `apex-tools-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Initialize repository with test data
    repository = new PatternRepository({
      dbPath: path.join(tempDir, "test.db"),
      patternsDir: path.join(tempDir, "patterns"),
    });

    // Get the internal database
    const db = (repository as any).db.database;
    
    // FIRST: Create base patterns table (BEFORE migrations)
    db.exec(`
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
        search_index      TEXT,
        status            TEXT DEFAULT 'active'
      );
    `);

    // THEN: Run migrations (with problematic ones skipped)
    const { MigrationRunner } = await import("../../../src/migrations/MigrationRunner.js");
    const { MigrationLoader } = await import("../../../src/migrations/MigrationLoader.js");
    
    const migrationRunner = new MigrationRunner(db);
    const loader = new MigrationLoader(path.resolve(__dirname, "../../../src/migrations"));
    const migrations = await loader.loadMigrations();
    
    // Skip migrations that expect existing data
    const migrationsToRun = migrations.filter(m => 
      !['011-migrate-pattern-tags-to-json', '012-rename-tags-csv-column', '014-populate-pattern-tags'].includes(m.id)
    );
    await migrationRunner.runMigrations(migrationsToRun);

    await repository.initialize();

    // Create test pattern
    await repository.create({
      id: "PAT:TEST:SAMPLE",
      type: "CODEBASE",
      title: "Sample Pattern",
      summary: "Test pattern for orchestration",
      trust_score: 0.9,
      tags: ["test"],
      schema_version: "1.0.0",
      pattern_version: "1.0.0",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pattern_digest: "test-digest",
      json_canonical: "{}",
    });

    // Initialize tools
    initializeTools(repository);

    // Create mock server
    server = {
      setRequestHandler: jest.fn(),
    } as unknown as Server;
  });

  afterEach(async () => {
    await repository.shutdown();
    await fs.remove(tempDir);
  });

  describe("Tool Registration", () => {
    it("should register all tools with the server", async () => {
      await registerTools(server);

      expect(server.setRequestHandler).toHaveBeenCalledWith(
        CallToolRequestSchema,
        expect.any(Function),
      );
    });

    it("should return list of available tools", () => {
      const tools = getToolsList();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // Check for specific tools
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("echo");
      expect(toolNames).toContain("apex_patterns_lookup");
      expect(toolNames).toContain("apex_reflect");

      // Validate tool structure
      tools.forEach((tool) => {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(tool.inputSchema).toHaveProperty("type", "object");
        expect(tool.inputSchema).toHaveProperty("properties");
      });
    });
  });

  describe("Tool Execution", () => {
    let handler: Function;

    beforeEach(async () => {
      await registerTools(server);
      // Extract the handler function
      handler = (server.setRequestHandler as jest.Mock).mock.calls[0][1];
    });

    it("should handle echo tool", async () => {
      const request = {
        params: {
          name: "echo",
          arguments: { message: "Hello, World!" },
        },
      };

      const response = await handler(request);

      expect(response).toEqual({
        content: [
          {
            type: "text",
            text: "Echo: Hello, World!",
          },
        ],
      });
    });

    it("should handle apex_patterns_lookup tool", async () => {
      const request = {
        params: {
          name: "apex_patterns_lookup",
          arguments: {
            task: "Implement test feature",
            language: "typescript",
          },
        },
      };

      const response = await handler(request);

      expect(response).toHaveProperty("content");
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty("type", "text");

      // Parse the response
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty("pattern_pack");
      expect(result).toHaveProperty("request_id");
      expect(result).toHaveProperty("latency_ms");
      expect(result).toHaveProperty("cache_hit");
    });

    it("should handle unknown tool error", async () => {
      const request = {
        params: {
          name: "unknown_tool",
          arguments: {},
        },
      };

      await expect(handler(request)).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });

    it("should handle uninitialized service error", async () => {
      // Reset tools to simulate uninitialized state
      initializeTools(null as any);

      const request = {
        params: {
          name: "apex_patterns_lookup",
          arguments: { task: "test" },
        },
      };

      await expect(handler(request)).rejects.toThrow(
        "Failed to query patterns",
      );
    });
  });

  describe("Enhanced Context Tool", () => {
    let handler: Function;

    beforeEach(async () => {
      // Re-initialize with valid repository
      initializeTools(repository);
      await registerTools(server);
      handler = (server.setRequestHandler as jest.Mock).mock.calls[0][1];
    });

    it("should process enhanced context in apex_patterns_lookup", async () => {
      const request = {
        params: {
          name: "apex_patterns_lookup",
          arguments: {
            task: "Fix authentication bug",
            task_intent: {
              type: "bug_fix",
              confidence: 0.95,
              sub_type: "security_fix",
            },
            code_context: {
              current_file: "/src/auth/login.ts",
              imports: ["jsonwebtoken", "bcrypt"],
              exports: ["login", "logout"],
              related_files: ["/src/auth/session.ts"],
              test_files: ["/tests/auth/login.test.ts"],
            },
            session_context: {
              recent_patterns: [
                {
                  pattern_id: "PAT:AUTH:JWT",
                  success: true,
                  timestamp: new Date().toISOString(),
                },
              ],
              failed_patterns: [],
            },
            project_signals: {
              language: "typescript",
              framework: "express",
              test_framework: "jest",
              dependencies: {
                express: "^4.18.0",
                jsonwebtoken: "^9.0.0",
              },
            },
            workflow_phase: "builder",
          },
        },
      };

      const response = await handler(request);
      const result = JSON.parse(response.content[0].text);

      expect(result.pattern_pack).toBeDefined();
      expect(result.request_id).toBeDefined();
      expect(result.cache_hit).toBe(false);
    });

    it("should handle legacy format for backwards compatibility", async () => {
      const request = {
        params: {
          name: "apex_patterns_lookup",
          arguments: {
            task: "Add new feature",
            current_file: "/src/feature.js",
            language: "javascript",
            framework: "react",
            recent_errors: ["Error: Something went wrong"],
            repo_path: "/path/to/repo",
          },
        },
      };

      const response = await handler(request);
      const result = JSON.parse(response.content[0].text);

      expect(result.pattern_pack).toBeDefined();
      expect(result.request_id).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    let handler: Function;

    beforeEach(async () => {
      await registerTools(server);
      handler = (server.setRequestHandler as jest.Mock).mock.calls[0][1];
    });

    it("should convert errors to MCP format", async () => {
      // Mock the lookup service to throw an error
      const request = {
        params: {
          name: "apex_patterns_lookup",
          arguments: {}, // Missing required 'task' field
        },
      };

      try {
        await handler(request);
        fail("Should have thrown an error");
      } catch (error) {
        // Should be converted to MCP error format
        expect(error).toBeDefined();
        expect(error.message).toContain("Invalid request parameters");
      }
    });
  });
});
