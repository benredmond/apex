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
import { ReflectionService } from "./reflect.js";

let repository: PatternRepository | null = null;
let lookupService: PatternLookupService | null = null;
let reflectionService: ReflectionService | null = null;

/**
 * Initialize tool dependencies
 */
export function initializeTools(repo: PatternRepository): void {
  repository = repo;
  lookupService = new PatternLookupService(repo);
  reflectionService = new ReflectionService(repo, 'patterns.db', {
    gitRepoPath: process.cwd(),
    enableMining: true,
  });
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

        case "apex_patterns_lookup":
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

        case "apex_reflect":
          if (!reflectionService) {
            throw new Error("Reflection service not initialized");
          }

          const reflectResponse = await reflectionService.reflect(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(reflectResponse),
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
      name: "apex_patterns_lookup",
      description: "Find and retrieve code patterns, fixes, and commands relevant to your current task. Returns patterns ranked by relevance with code snippets.",
      inputSchema: {
        type: "object",
        properties: {
          // Core fields
          task: {
            type: "string",
            description: "Describe what you're trying to do. Examples: 'fix sqlite sync error', 'implement user authentication', 'add pytest backend tests', 'create FastAPI endpoint'",
            minLength: 1,
            maxLength: 1000,
          },
          max_size: {
            type: "number",
            description: "Max response size in bytes (default: 8192)",
            minimum: 1024,
            maximum: 65536,
            default: 8192,
          },
          
          // Legacy fields (backwards compatibility)
          current_file: {
            type: "string",
            description: "Active file path (optional, prefer code_context.current_file)",
          },
          language: {
            type: "string",
            description: "Programming language (optional, prefer project_signals.language)",
          },
          framework: {
            type: "string",
            description: "Framework name (optional, prefer project_signals.framework)",
          },
          recent_errors: {
            type: "array",
            items: { type: "string" },
            description: "Recent error messages (optional, prefer error_context)",
            maxItems: 10,
          },
          repo_path: {
            type: "string",
            description: "Repository root path (optional)",
          },
          
          // Enhanced context fields
          task_intent: {
            type: "object",
            description: "Classified task intent from AI analysis",
            properties: {
              type: {
                type: "string",
                enum: ["bug_fix", "feature", "refactor", "test", "perf", "docs"],
                description: "Primary task type",
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence score (0-1)",
              },
              sub_type: {
                type: "string",
                description: "More specific task classification",
              },
            },
            required: ["type", "confidence"],
          },
          
          code_context: {
            type: "object",
            description: "Code relationship graph",
            properties: {
              current_file: {
                type: "string",
                description: "Currently active file",
              },
              imports: {
                type: "array",
                items: { type: "string" },
                description: "Modules/packages imported",
              },
              exports: {
                type: "array",
                items: { type: "string" },
                description: "Symbols exported",
              },
              related_files: {
                type: "array",
                items: { type: "string" },
                description: "Files that may be affected",
              },
              test_files: {
                type: "array",
                items: { type: "string" },
                description: "Associated test files",
              },
            },
          },
          
          error_context: {
            type: "array",
            description: "Structured error information",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  description: "Error type (e.g., TypeError)",
                },
                message: {
                  type: "string",
                  description: "Error message",
                },
                file: {
                  type: "string",
                  description: "File where error occurred",
                },
                line: {
                  type: "number",
                  description: "Line number",
                },
                stack_depth: {
                  type: "number",
                  description: "Stack trace depth",
                },
                frequency: {
                  type: "number",
                  description: "How often this error occurred",
                  default: 1,
                },
              },
              required: ["type", "message"],
            },
          },
          
          session_context: {
            type: "object",
            description: "Track patterns used in current session for better recommendations. Include pattern IDs you've recently used.",
            properties: {
              recent_patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: {
                      type: "string",
                      description: "Pattern ID like 'FIX:SQLITE:SYNC' or 'CODE:API:FASTAPI_ENDPOINT'",
                    },
                    success: {
                      type: "boolean",
                      description: "Whether pattern was successful",
                    },
                    timestamp: {
                      type: "string",
                      description: "ISO timestamp",
                    },
                  },
                  required: ["pattern_id", "success", "timestamp"],
                },
                description: "Recently used patterns",
              },
              failed_patterns: {
                type: "array",
                items: { type: "string" },
                description: "Patterns that failed (to avoid)",
              },
            },
            required: ["recent_patterns", "failed_patterns"],
          },
          
          project_signals: {
            type: "object",
            description: "Project-level context",
            properties: {
              language: {
                type: "string",
                description: "Primary language",
              },
              framework: {
                type: "string",
                description: "Primary framework",
              },
              test_framework: {
                type: "string",
                description: "Testing framework (jest, pytest, etc.)",
              },
              build_tool: {
                type: "string",
                description: "Build tool (webpack, vite, etc.)",
              },
              ci_platform: {
                type: "string",
                description: "CI platform (github-actions, jenkins, etc.)",
              },
              dependencies: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Key dependencies with versions",
              },
            },
          },
          
          workflow_phase: {
            type: "string",
            enum: ["architect", "builder", "validator", "reviewer", "documenter"],
            description: "Current APEX workflow phase",
          },
        },
        required: ["task"],
      },
    },
    {
      name: "apex_reflect",
      description: "Submit task reflection with evidence to update pattern trust scores and discover new patterns",
      inputSchema: {
        type: "object",
        properties: {
          task: {
            type: "object",
            properties: {
              id: { type: "string", description: "Task identifier" },
              title: { type: "string", description: "Task title" },
            },
            required: ["id", "title"],
          },
          brief_id: {
            type: "string",
            description: "Brief identifier (optional)",
          },
          outcome: {
            type: "string",
            enum: ["success", "partial", "failure"],
            description: "Task outcome",
          },
          artifacts: {
            type: "object",
            properties: {
              pr: {
                type: "object",
                properties: {
                  number: { type: "number", description: "PR number" },
                  repo: { type: "string", description: "Repository URL" },
                },
              },
              commits: {
                type: "array",
                items: { type: "string", pattern: "^[a-f0-9]{40}$" },
                description: "Git commit SHAs",
              },
              ci_runs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    provider: { type: "string" },
                  },
                },
              },
            },
          },
          claims: {
            type: "object",
            properties: {
              patterns_used: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: { type: "string" },
                    evidence: { type: "array" },
                    snippet_id: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["pattern_id", "evidence"],
                },
              },
              new_patterns: { type: "array" },
              anti_patterns: { type: "array" },
              learnings: { type: "array" },
              trust_updates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: { type: "string" },
                    delta: {
                      type: "object",
                      properties: {
                        alpha: { type: "number", minimum: 0 },
                        beta: { type: "number", minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
            required: ["patterns_used", "trust_updates"],
          },
          options: {
            type: "object",
            properties: {
              dry_run: { type: "boolean", default: false },
              auto_mine: { type: "boolean", default: false },
              return_explain: { type: "boolean", default: true },
            },
          },
        },
        required: ["task", "outcome", "claims"],
      },
    },
  ];
}
