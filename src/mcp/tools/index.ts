/**
 * Tool definitions for APEX MCP Server
 * Tools will be added here as they are implemented
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { PatternRepository } from "../../storage/repository.js";
import { toMCPError } from "../errors.js";
import { PatternLookupService } from "./lookup.js";

let repository: PatternRepository | null = null;
let lookupService: PatternLookupService | null = null;

/**
 * Initialize tool dependencies
 */
export function initializeTools(repo: PatternRepository): void {
  repository = repo;
  lookupService = new PatternLookupService(repo);
}

/**
 * Register all tools with the MCP server
 */
export async function registerTools(server: Server): Promise<void> {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "echo":
          return {
            content: [
              {
                type: "text",
                text: `Echo: ${args?.message || "No message provided"}`,
              },
            ],
          };

        case "apex.patterns.lookup":
          if (!lookupService) {
            throw new Error("Pattern lookup service not initialized");
          }

          // Use the new lookup service with enhanced functionality
          const response = await lookupService.lookup(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(response),
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      throw toMCPError(error);
    }
  });
}

/**
 * Get the list of available tools
 * This will be used by the server to advertise available tools
 */
export function getToolsList(): Tool[] {
  return [
    {
      name: "echo",
      description: "Echo a message back (placeholder tool)",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to echo",
          },
        },
        required: ["message"],
      },
    },
    {
      name: "apex.patterns.lookup",
      description: "Lookup relevant patterns for a given task with intelligent signal extraction",
      inputSchema: {
        type: "object",
        properties: {
          task: {
            type: "string",
            description: "User's task description",
            minLength: 1,
            maxLength: 1000,
          },
          current_file: {
            type: "string",
            description: "Active file path (optional)",
          },
          language: {
            type: "string",
            description: "Programming language (optional)",
          },
          framework: {
            type: "string",
            description: "Framework name (e.g., React, Django) (optional)",
          },
          recent_errors: {
            type: "array",
            items: { type: "string" },
            description: "Recent error messages for context (optional)",
            maxItems: 10,
          },
          repo_path: {
            type: "string",
            description: "Repository root path (optional)",
          },
          max_size: {
            type: "number",
            description: "Max response size in bytes (default: 8192)",
            minimum: 1024,
            maximum: 65536,
            default: 8192,
          },
        },
        required: ["task"],
      },
    },
  ];
}
