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

    // Run migrations to create required tables
    const db = (repository as any).db.database;
    const migration006 = await import("../../../src/migrations/migrations/006-add-task-system-schema.js");
    const migration007 = await import("../../../src/migrations/migrations/007-add-evidence-log-table.js");
    
    try {
      migration006.migration.up(db);
      migration007.migration.up(db);
    } catch (error) {
      // Ignore if tables already exist
    }

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
