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
import { PatternRanker } from "../../ranking/index.js";
import { PackBuilder } from "../../ranking/pack-builder.js";
import { toMCPError } from "../errors.js";
import { Signals } from "../../ranking/types.js";

let repository: PatternRepository | null = null;
let packBuilder: PackBuilder | null = null;

/**
 * Initialize tool dependencies
 */
export function initializeTools(repo: PatternRepository): void {
  repository = repo;
  packBuilder = new PackBuilder(repo);
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
          if (!repository || !packBuilder) {
            throw new Error("Pattern tools not initialized");
          }

          const query = String(args?.query || "");
          const signals = (args?.signals || {}) as Signals;
          const options = args?.options || {};

          // Search for patterns using text search for now
          // TODO: Update to use lookup with facets when signals are properly structured
          const patterns = await repository.search(query, 100);
          
          // Convert patterns to PatternMeta format for ranker
          const patternMetas = patterns.map(p => ({
            id: p.id,
            type: p.type,
            scope: {
              paths: [],
              languages: [],
              frameworks: [],
            },
            trust: {
              score: 0.8, // Default trust score
            },
            metadata: {},
          }));
          
          // Create ranker with patterns
          const ranker = new PatternRanker(patternMetas);
          
          // Rank patterns
          const ranked = await ranker.rank(signals);
          
          // Build PatternPack
          const result = await packBuilder.buildPatternPack(
            query,
            ranked.slice(0, Number((options as any)?.limit) || 100),
            options
          );

          return {
            content: [
              {
                type: "text",
                text: result.json,
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
      description: "Search and rank patterns, returning a size-optimized PatternPack",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Task description or search query",
          },
          signals: {
            type: "object",
            description: "Search signals (paths, languages, frameworks, etc.)",
            properties: {
              paths: {
                type: "array",
                items: { type: "string" },
                description: "File paths to match patterns against",
              },
              languages: {
                type: "array",
                items: { type: "string" },
                description: "Programming languages to filter by",
              },
              frameworks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    version: { type: "string" },
                  },
                },
                description: "Frameworks and versions to filter by",
              },
            },
          },
          options: {
            type: "object",
            description: "PackBuilder options",
            properties: {
              limit: {
                type: "number",
                description: "Maximum patterns to consider (default: 100)",
              },
              budgetBytes: {
                type: "number",
                description: "Size budget in bytes (default: 8192)",
              },
              debug: {
                type: "boolean",
                description: "Include debug information (default: false)",
              },
            },
          },
        },
        required: ["query"],
      },
    },
  ];
}
