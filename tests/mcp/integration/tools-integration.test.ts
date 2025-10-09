/**
 * Integration tests for MCP tools
 * [PAT:TEST:MCP_INTEGRATION] - E2E tests for all MCP tools through the protocol
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initializeTools,
  registerTools,
  getToolsList,
} from "../../../src/mcp/tools/index.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { initTestDatabase } from "../../helpers/vitest-db.js";
import type Database from "better-sqlite3";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

describe("MCP Tools Integration", () => {
  let db: Database.Database;
  let cleanup: () => Promise<void>;
  let repository: PatternRepository;
  let server: Server;

  beforeEach(async () => {
    // Initialize test database with migrations
    const result = await initTestDatabase();
    db = result.db;
    cleanup = result.cleanup;

    // Create repository using the factory method with the db path
    repository = await PatternRepository.create({ dbPath: result.dbPath });

    // Get the database adapter from the repository
    const dbAdapter = repository.getDatabase();

    // Initialize tools with repository
    await initializeTools(repository, dbAdapter);

    // Create MCP server
    server = new Server(
      {
        name: "apex-test-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Register tools with server
    await registerTools(server);

    // Insert test patterns and tasks
    await insertTestData(repository, db);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("Tool Registration", () => {
    it("should advertise all 12 tools", () => {
      const tools = getToolsList();

      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(12);

      // Verify tool names
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("apex_patterns_lookup");
      expect(toolNames).toContain("apex_reflect");
      expect(toolNames).toContain("apex_patterns_discover");
      expect(toolNames).toContain("apex_patterns_explain");
      expect(toolNames).toContain("apex_task_create");
      expect(toolNames).toContain("apex_task_find");
      expect(toolNames).toContain("apex_task_find_similar");
      expect(toolNames).toContain("apex_task_update");
      expect(toolNames).toContain("apex_task_checkpoint");
      expect(toolNames).toContain("apex_task_complete");
      expect(toolNames).toContain("apex_task_context");
      expect(toolNames).toContain("apex_task_append_evidence");
    });

    it("should have valid schemas for all tools", () => {
      const tools = getToolsList();

      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it("should have required fields defined in schemas", () => {
      const tools = getToolsList();

      // Check specific tools have required fields
      const lookupTool = tools.find((t) => t.name === "apex_patterns_lookup");
      expect(lookupTool?.inputSchema.required).toContain("task");

      const reflectTool = tools.find((t) => t.name === "apex_reflect");
      expect(reflectTool?.inputSchema.required).toContain("task");
      expect(reflectTool?.inputSchema.required).toContain("outcome");

      const createTool = tools.find((t) => t.name === "apex_task_create");
      expect(createTool?.inputSchema.required).toContain("intent");
    });
  });

  describe("Pattern Tools", () => {
    it("should successfully invoke apex_patterns_lookup", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_patterns_lookup",
          arguments: {
            task: "implement authentication",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      expect(handler).toBeDefined();

      const response = await handler!(request);

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");

      const result = JSON.parse(response.content[0].text);
      expect(result.pattern_pack).toBeDefined();
      expect(result.request_id).toBeDefined();
      expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    });

    it("should successfully invoke apex_patterns_discover", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_patterns_discover",
          arguments: {
            query: "authentication patterns",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.patterns).toBeDefined();
      expect(Array.isArray(result.patterns)).toBe(true);
    });

    it("should successfully invoke apex_patterns_explain", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_patterns_explain",
          arguments: {
            pattern_id: "PAT:AUTH:JWT",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.pattern).toBeDefined();
    });

    it("should successfully invoke apex_reflect", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_reflect",
          arguments: {
            task: {
              id: "test-task-1",
              title: "Test task",
            },
            outcome: "success",
            claims: {
              patterns_used: [
                {
                  pattern_id: "PAT:AUTH:JWT",
                  evidence: [
                    {
                      kind: "git_lines",
                      file: "test.ts",
                      sha: "HEAD",
                      start: 1,
                      end: 10,
                    },
                  ],
                },
              ],
              trust_updates: [
                {
                  pattern_id: "PAT:AUTH:JWT",
                  outcome: "worked-perfectly",
                },
              ],
            },
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.request_id).toBeDefined();
      expect(result.trust_updates_processed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Task Tools", () => {
    it("should successfully invoke apex_task_create", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Implement user authentication system",
            type: "feature",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.task_id).toBeDefined();
      expect(result.brief).toBeDefined();
    });

    it("should successfully invoke apex_task_find", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_find",
          arguments: {
            status: "active",
            limit: 10,
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
    });

    it("should successfully invoke apex_task_update", async () => {
      // First create a task
      const createRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Test task for update",
            type: "feature",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const createResponse = await handler!(createRequest);
      const createResult = JSON.parse(createResponse.content[0].text);

      // Now update it
      const updateRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_update",
          arguments: {
            id: createResult.task_id,
            phase: "BUILDER",
            confidence: 0.8,
          },
        },
      };

      const updateResponse = await handler!(updateRequest);
      expect(updateResponse.content).toBeDefined();
      const result = JSON.parse(updateResponse.content[0].text);
      expect(result.success).toBe(true);
    });

    it("should successfully invoke apex_task_checkpoint", async () => {
      // Create a task first
      const createRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Test task for checkpoint",
            type: "feature",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const createResponse = await handler!(createRequest);
      const createResult = JSON.parse(createResponse.content[0].text);

      // Add checkpoint
      const checkpointRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_checkpoint",
          arguments: {
            id: createResult.task_id,
            message: "Completed initial setup",
          },
        },
      };

      const checkpointResponse = await handler!(checkpointRequest);
      expect(checkpointResponse.content).toBeDefined();
      const result = JSON.parse(checkpointResponse.content[0].text);
      expect(result.success).toBe(true);
    });

    it("should successfully invoke apex_task_complete", async () => {
      // Create a task first
      const createRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Test task for completion",
            type: "feature",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const createResponse = await handler!(createRequest);
      const createResult = JSON.parse(createResponse.content[0].text);

      // Complete the task
      const completeRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_complete",
          arguments: {
            id: createResult.task_id,
            outcome: "success",
            key_learning: "Test learning",
          },
        },
      };

      const completeResponse = await handler!(completeRequest);
      expect(completeResponse.content).toBeDefined();
      const result = JSON.parse(completeResponse.content[0].text);
      expect(result).toBeDefined();
      expect(result.task).toBeDefined();
      expect(result.task.id).toBeDefined();
      expect(result.outcome).toBe("success");
    });

    it("should successfully invoke apex_task_context", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_context",
          arguments: {},
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const response = await handler!(request);

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.context_pack).toBeDefined();
    });

    it("should include task_data and evidence when task_id is provided", async () => {
      const handler = server["_requestHandlers"].get("tools/call");
      expect(handler).toBeDefined();

      // Create a dedicated task for this test
      const createRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Task context evidence verification",
            type: "feature",
          },
        },
      };

      const createResponse = await handler!(createRequest);
      const createResult = JSON.parse(createResponse.content![0].text);
      const taskId = createResult.task_id;
      expect(taskId).toBeDefined();

      // Append evidence so the context tool has data to return
      const appendRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_append_evidence",
          arguments: {
            task_id: taskId,
            type: "decision",
            content: "Recorded via integration test",
            metadata: {
              file: "integration-test.md",
            },
          },
        },
      };
      const appendResponse = await handler!(appendRequest);
      const appendResult = JSON.parse(appendResponse.content![0].text);
      expect(appendResult.success).toBe(true);

      // Fetch context with the specific taskId
      const contextRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_context",
          arguments: {
            task_id: taskId,
          },
        },
      };

      const contextResponse = await handler!(contextRequest);
      const contextResult = JSON.parse(contextResponse.content![0].text);

      expect(contextResult.success).toBe(true);
      expect(contextResult.context_pack).toBeDefined();
      expect(contextResult.task_data).toEqual(
        expect.objectContaining({
          id: taskId,
          phase: "ARCHITECT",
        }),
      );

      expect(Array.isArray(contextResult.evidence)).toBe(true);
      expect(contextResult.evidence.length).toBeGreaterThanOrEqual(1);
      const evidenceEntry = contextResult.evidence.find(
        (entry: any) => entry.content === "Recorded via integration test",
      );
      expect(evidenceEntry).toBeDefined();
      expect(evidenceEntry.type).toBe("decision");
      expect(evidenceEntry.metadata).toEqual(
        expect.objectContaining({
          file: "integration-test.md",
        }),
      );
    });

    it("should successfully invoke apex_task_append_evidence", async () => {
      // Create a task first
      const createRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_create",
          arguments: {
            intent: "Test task for evidence",
            type: "feature",
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");
      const createResponse = await handler!(createRequest);
      const createResult = JSON.parse(createResponse.content[0].text);

      // Append evidence
      const evidenceRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_task_append_evidence",
          arguments: {
            task_id: createResult.task_id,
            type: "file",
            content: "Modified src/auth.ts",
          },
        },
      };

      const evidenceResponse = await handler!(evidenceRequest);
      expect(evidenceResponse.content).toBeDefined();
      const result = JSON.parse(evidenceResponse.content[0].text);
      expect(result.success).toBe(true);
    });

  });

  describe("Error Handling", () => {
    it("should return error for unknown tool", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "unknown_tool",
          arguments: {},
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");

      await expect(handler!(request)).rejects.toThrow("Unknown tool");
    });

    it("should return error for invalid params", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "apex_patterns_lookup",
          arguments: {
            // Missing required 'task' field
          },
        },
      };

      const handler = server["_requestHandlers"].get("tools/call");

      await expect(handler!(request)).rejects.toThrow();
    });

    it("should return error when tool service not initialized", async () => {
      // Create a new server without initializing tools
      const uninitializedServer = new Server(
        {
          name: "apex-uninitialized-server",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );

      // Register tools (but don't re-run initializeTools for this server)
      await expect(registerTools(uninitializedServer)).rejects.toThrow(
        "Tools not initialized",
      );
    });
  });
});

/**
 * Helper to insert test data into the repository
 */
async function insertTestData(
  repository: PatternRepository,
  db: Database.Database,
): Promise<void> {
  // Insert test patterns
  const now = new Date().toISOString();
  const testPatterns = [
    {
      id: "PAT:AUTH:JWT",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "JWT Authentication",
      summary: "JWT-based authentication pattern",
      trust_score: 0.8,
      usage_count: 5,
      success_count: 4,
      created_at: now,
      updated_at: now,
      tags: ["auth", "jwt"],
      pattern_digest: "test-digest-jwt",
      json_canonical: JSON.stringify({ title: "JWT Auth" }),
    },
    {
      id: "PAT:API:ERROR_HANDLING",
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      type: "CODEBASE" as const,
      title: "API Error Handling",
      summary: "Structured error handling for APIs",
      trust_score: 0.85,
      usage_count: 10,
      success_count: 9,
      created_at: now,
      updated_at: now,
      tags: ["api", "error"],
      pattern_digest: "test-digest-error",
      json_canonical: JSON.stringify({ title: "Error Handling" }),
    },
  ];

  for (const pattern of testPatterns) {
    await repository.create(pattern);
  }
}
