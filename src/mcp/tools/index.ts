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
import { PatternDiscoverer } from "./discover.js";
import { PatternExplainer } from "./explain.js";
import { TaskService } from "./task.js";
import { TaskRepository } from "../../storage/repositories/task-repository.js";
import { PatternDatabase } from "../../storage/database.js";
import type Database from "better-sqlite3";
import { ContextTool } from "./context.js";
import { ContextPackService } from "../../intelligence/context-pack-service.js";

let repository: PatternRepository | null = null;
let lookupService: PatternLookupService | null = null;
let reflectionService: ReflectionService | null = null;
let discoverService: PatternDiscoverer | null = null;
let explainService: PatternExplainer | null = null;
let taskService: TaskService | null = null;
let contextTool: ContextTool | null = null;

/**
 * Initialize tool dependencies with shared database instance
 */
export function initializeTools(
  repo: PatternRepository,
  sharedDb?: Database.Database,
): void {
  repository = repo;
  lookupService = new PatternLookupService(repo);

  // Get shared database instance - either provided or extract from repository
  const db = sharedDb || repo.getDatabase();

  reflectionService = new ReflectionService(repo, db, {
    gitRepoPath: process.cwd(),
    enableMining: true,
  });
  discoverService = new PatternDiscoverer(repo);
  explainService = new PatternExplainer(repo);

  // Initialize task service with shared database instance
  const taskRepository = new TaskRepository(db);
  taskService = new TaskService(taskRepository, db);
  // Inject reflection service into task service for integration
  (taskService as any).reflectionService = reflectionService;

  // Initialize context pack service with shared database instance
  const contextPackService = new ContextPackService(taskRepository, repo, db);
  contextTool = new ContextTool(contextPackService);
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

        case "apex_patterns_discover":
          if (!discoverService) {
            throw new Error("Pattern discover service not initialized");
          }

          const discoverResponse = await discoverService.discover(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(discoverResponse),
              },
            ],
          };

        case "apex_patterns_explain":
          if (!explainService) {
            throw new Error("Pattern explain service not initialized");
          }

          const explainResponse = await explainService.explain(args);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(explainResponse),
              },
            ],
          };

        // Task management tools
        case "apex_task_create":
          if (!taskService) {
            throw new Error(
              "Task service not initialized. Please ensure APEX MCP server is properly started.",
            );
          }
          const createResponse = await taskService.create(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(createResponse),
              },
            ],
          };

        case "apex_task_find":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const findResponse = await taskService.find(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(findResponse),
              },
            ],
          };

        case "apex_task_find_similar":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const similarResponse = await taskService.findSimilar(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(similarResponse),
              },
            ],
          };

        case "apex_task_current":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const currentResponse = await taskService.getCurrent();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(currentResponse),
              },
            ],
          };

        case "apex_task_update":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          await taskService.update(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true }),
              },
            ],
          };

        case "apex_task_checkpoint":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          await taskService.checkpoint(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true }),
              },
            ],
          };

        case "apex_task_complete":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const completeResponse = await taskService.complete(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(completeResponse),
              },
            ],
          };

        case "apex_task_context":
          if (!contextTool) {
            throw new Error("Context tool not initialized");
          }
          const contextResponse = await contextTool.getTaskContext(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(contextResponse),
              },
            ],
          };

        case "apex_task_append_evidence":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          await taskService.appendEvidence(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true }),
              },
            ],
          };

        case "apex_task_get_evidence":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const evidenceResponse = await taskService.getEvidence(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(evidenceResponse),
              },
            ],
          };

        case "apex_task_get_phase":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          const phaseResponse = await taskService.getPhase(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(phaseResponse),
              },
            ],
          };

        case "apex_task_set_phase":
          if (!taskService) {
            throw new Error("Task service not initialized");
          }
          await taskService.setPhase(args);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ success: true }),
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
      description:
        "Find and retrieve code patterns, fixes, and commands relevant to your current task. Returns patterns ranked by relevance with code snippets.",
      inputSchema: {
        type: "object",
        properties: {
          // Core fields
          task: {
            type: "string",
            description:
              "Describe what you're trying to do. Examples: 'fix sqlite sync error', 'implement user authentication', 'add pytest backend tests', 'create FastAPI endpoint'",
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
            description:
              "Active file path (optional, prefer code_context.current_file)",
          },
          language: {
            type: "string",
            description:
              "Programming language (optional, prefer project_signals.language)",
          },
          framework: {
            type: "string",
            description:
              "Framework name (optional, prefer project_signals.framework)",
          },
          recent_errors: {
            type: "array",
            items: { type: "string" },
            description:
              "Recent error messages (optional, prefer error_context)",
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
                enum: [
                  "bug_fix",
                  "feature",
                  "refactor",
                  "test",
                  "perf",
                  "docs",
                ],
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
            description:
              "Track patterns used in current session for better recommendations. Include pattern IDs you've recently used.",
            properties: {
              recent_patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: {
                      type: "string",
                      description:
                        "Pattern ID like 'FIX:SQLITE:SYNC' or 'CODE:API:FASTAPI_ENDPOINT'",
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
            enum: [
              "architect",
              "builder",
              "validator",
              "reviewer",
              "documenter",
            ],
            description: "Current APEX workflow phase",
          },
        },
        required: ["task"],
      },
    },
    {
      name: "apex_reflect",
      description:
        "Submit task reflection with evidence to update pattern trust scores and discover new patterns",
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
                    evidence: {
                      type: "array",
                      description:
                        "Evidence array - use 'git_lines' for code references, not 'code_lines'",
                      items: {
                        type: "object",
                        properties: {
                          kind: {
                            type: "string",
                            enum: ["git_lines", "commit", "pr", "ci_run"],
                            description:
                              "Type of evidence - use 'git_lines' for code references",
                          },
                          file: {
                            type: "string",
                            description: "File path (for git_lines)",
                          },
                          sha: {
                            type: "string",
                            description: "Git SHA or 'HEAD' for uncommitted",
                          },
                          start: {
                            type: "number",
                            description: "Start line number (for git_lines)",
                          },
                          end: {
                            type: "number",
                            description: "End line number (for git_lines)",
                          },
                        },
                        required: ["kind"],
                      },
                      examples: [
                        {
                          kind: "git_lines",
                          file: "src/api.ts",
                          sha: "HEAD",
                          start: 10,
                          end: 20,
                        },
                      ],
                    },
                    snippet_id: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["pattern_id", "evidence"],
                },
              },
              new_patterns: {
                type: "array",
                description: "New patterns discovered during task execution",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Pattern title" },
                    summary: {
                      type: "string",
                      description: "Brief description",
                    },
                    snippets: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          snippet_id: { type: "string" },
                          source_ref: {
                            type: "object",
                            description:
                              "Source reference object (not string!)",
                            properties: {
                              kind: { type: "string", enum: ["git_lines"] },
                              file: { type: "string" },
                              sha: { type: "string" },
                              start: { type: "number" },
                              end: { type: "number" },
                            },
                          },
                          language: { type: "string" },
                          code: { type: "string" },
                        },
                      },
                    },
                    evidence: { type: "array" },
                  },
                },
              },
              anti_patterns: {
                type: "array",
                description: "Patterns that caused problems",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: { type: "string" },
                    reason: { type: "string" },
                    evidence: { type: "array" },
                  },
                },
              },
              learnings: {
                type: "array",
                description: "Key learnings from task execution",
                items: {
                  type: "object",
                  properties: {
                    assertion: {
                      type: "string",
                      description: "Learning statement",
                    },
                    evidence: {
                      type: "array",
                      description: "Evidence objects (not strings!)",
                      items: {
                        type: "object",
                        properties: {
                          kind: { type: "string", enum: ["git_lines"] },
                          file: { type: "string" },
                          sha: { type: "string" },
                          start: { type: "number" },
                          end: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
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
                    outcome: {
                      type: "string",
                      enum: [
                        "worked-perfectly",
                        "worked-with-tweaks",
                        "partial-success",
                        "failed-minor-issues",
                        "failed-completely",
                      ],
                      description:
                        "Natural language outcome: worked-perfectly (no changes), worked-with-tweaks (adapted), partial-success (somewhat helpful), failed-minor-issues (mostly failed), failed-completely (didn't work)",
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
    {
      name: "apex_patterns_discover",
      description:
        "Discover patterns using natural language queries with semantic search. Supports error context, technology detection, and intelligent ranking.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Natural language query describing what you're looking for. Examples: 'how to handle async errors in jest', 'patterns for API authentication', 'fix typescript module import errors'",
            minLength: 3,
            maxLength: 500,
          },
          filters: {
            type: "object",
            description: "Optional filters to narrow results",
            properties: {
              types: {
                type: "array",
                items: { type: "string" },
                description:
                  "Pattern types to include (e.g., 'fix', 'code', 'pattern')",
              },
              categories: {
                type: "array",
                items: { type: "string" },
                description:
                  "Pattern categories to include (e.g., 'auth', 'test', 'api')",
              },
              min_trust: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Minimum trust score (0-1)",
              },
              max_age_days: {
                type: "number",
                minimum: 1,
                description: "Maximum age in days since last use",
              },
            },
          },
          context: {
            type: "object",
            description: "Additional context for better matching",
            properties: {
              current_errors: {
                type: "array",
                items: { type: "string" },
                maxItems: 5,
                description: "Current error messages to help find fixes",
              },
              current_file: {
                type: "string",
                description: "Current file path for technology detection",
              },
              recent_patterns: {
                type: "array",
                items: { type: "string" },
                maxItems: 10,
                description:
                  "Recently used pattern IDs to improve recommendations",
              },
            },
          },
          max_results: {
            type: "number",
            minimum: 1,
            maximum: 50,
            default: 10,
            description: "Maximum number of patterns to return",
          },
          min_score: {
            type: "number",
            minimum: 0,
            maximum: 1,
            default: 0.3,
            description: "Minimum relevance score (0-1)",
          },
          include_explanation: {
            type: "boolean",
            default: true,
            description: "Include explanation of why each pattern matched",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "apex_patterns_explain",
      description:
        "Get detailed contextual explanation of a pattern with usage guidance, trust information, and examples. Supports session-aware recommendations.",
      inputSchema: {
        type: "object",
        properties: {
          pattern_id: {
            type: "string",
            description:
              "The pattern ID to explain (e.g., 'PAT:API:ERROR_HANDLING', 'FIX:SQLITE:SYNC')",
            minLength: 1,
          },
          context: {
            type: "object",
            description: "Optional context for tailored guidance",
            properties: {
              task_type: {
                type: "string",
                description:
                  "What you're trying to do (e.g., 'implement API', 'fix test')",
              },
              current_errors: {
                type: "array",
                items: { type: "string" },
                maxItems: 10,
                description: "Current errors to provide targeted advice",
              },
              session_patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pattern_id: { type: "string" },
                    success: { type: "boolean" },
                  },
                  required: ["pattern_id", "success"],
                },
                maxItems: 20,
                description:
                  "Recently used patterns for workflow recommendations",
              },
            },
          },
          verbosity: {
            type: "string",
            enum: ["concise", "detailed", "examples"],
            default: "concise",
            description:
              "Level of detail: concise (summary), detailed (full guidance), examples (with code)",
          },
        },
        required: ["pattern_id"],
      },
    },
    // Task management tools
    {
      name: "apex_task_create",
      description: "Create a new task with auto-generated brief from intent",
      inputSchema: {
        type: "object",
        properties: {
          identifier: {
            type: "string",
            description:
              "Optional external identifier (e.g., JIRA-1234, APE-50)",
          },
          intent: {
            type: "string",
            description: "Description of what needs to be done",
            minLength: 1,
            maxLength: 1000,
          },
          type: {
            type: "string",
            enum: ["bug", "feature", "refactor", "test", "docs", "perf"],
            description: "Type of task",
          },
        },
        required: ["intent"],
      },
    },
    {
      name: "apex_task_find",
      description: "Find tasks by various criteria",
      inputSchema: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to filter by",
          },
          themes: {
            type: "array",
            items: { type: "string" },
            description: "Themes to filter by",
          },
          components: {
            type: "array",
            items: { type: "string" },
            description: "Components to filter by",
          },
          status: {
            type: "string",
            enum: ["active", "completed", "failed", "blocked"],
            description: "Task status to filter by",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Maximum number of tasks to return",
          },
        },
      },
    },
    {
      name: "apex_task_find_similar",
      description:
        "Find tasks similar to a given task or the current active task",
      inputSchema: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description:
              "Task ID to find similar tasks for (defaults to most recent active)",
          },
        },
      },
    },
    {
      name: "apex_task_current",
      description: "Get all currently active tasks",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "apex_task_update",
      description: "Update task with execution details",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Task ID to update",
          },
          phase: {
            type: "string",
            enum: [
              "ARCHITECT",
              "BUILDER",
              "VALIDATOR",
              "REVIEWER",
              "DOCUMENTER",
            ],
            description: "Current execution phase",
          },
          decisions: {
            type: "array",
            items: { type: "string" },
            description: "Key decisions made",
          },
          files: {
            type: "array",
            items: { type: "string" },
            description: "Files modified",
          },
          errors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                error: { type: "string" },
                fix: { type: "string" },
              },
              required: ["error"],
            },
            description: "Errors encountered and their fixes",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence level (0-1)",
          },
          handoff: {
            type: "string",
            description: "Phase handoff information",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "apex_task_checkpoint",
      description: "Add a checkpoint message to task tracking",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Task ID",
          },
          message: {
            type: "string",
            description: "Checkpoint message",
            minLength: 1,
            maxLength: 1000,
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Optional confidence level",
          },
        },
        required: ["id", "message"],
      },
    },
    {
      name: "apex_task_complete",
      description: "Complete a task and generate reflection draft",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Task ID to complete",
          },
          outcome: {
            type: "string",
            enum: ["success", "partial", "failure"],
            description: "Task outcome",
          },
          key_learning: {
            type: "string",
            description: "Key learning from the task",
            minLength: 1,
            maxLength: 500,
          },
          patterns_used: {
            type: "array",
            items: { type: "string" },
            description: "Pattern IDs used during task",
          },
        },
        required: ["id", "outcome", "key_learning"],
      },
    },
    {
      name: "apex_task_context",
      description:
        "Get task-specific context for AI assistant sessions, including active tasks, similar tasks, statistics, and patterns",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Specific task ID to get context for",
          },
          packs: {
            type: "array",
            items: {
              type: "string",
              enum: ["tasks", "patterns", "statistics"],
            },
            description: "Which context packs to include (default: all)",
          },
          max_active_tasks: {
            type: "number",
            minimum: 1,
            maximum: 100,
            description:
              "Maximum number of active tasks to include (default: 50)",
          },
          max_similar_per_task: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "Maximum similar tasks per active task (default: 20)",
          },
          max_size_bytes: {
            type: "number",
            minimum: 1024,
            maximum: 100000,
            description: "Maximum context pack size in bytes (default: 28672)",
          },
        },
      },
    },
    {
      name: "apex_task_append_evidence",
      description:
        "Append evidence to task execution log for reflection and learning",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to append evidence to",
          },
          type: {
            type: "string",
            enum: ["file", "pattern", "error", "decision", "learning"],
            description: "Type of evidence being recorded",
          },
          content: {
            type: "string",
            description: "Evidence content description",
          },
          metadata: {
            type: "object",
            description: "Optional metadata for the evidence",
            properties: {
              file: {
                type: "string",
                description: "File path if evidence relates to a file",
              },
              line_start: {
                type: "number",
                description: "Starting line number in file",
              },
              line_end: {
                type: "number",
                description: "Ending line number in file",
              },
              pattern_id: {
                type: "string",
                description: "Pattern ID if evidence relates to a pattern",
              },
            },
          },
        },
        required: ["task_id", "type", "content"],
      },
    },
    {
      name: "apex_task_get_evidence",
      description:
        "Retrieve evidence entries for a task, optionally filtered by type",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to get evidence for",
          },
          type: {
            type: "string",
            enum: ["file", "pattern", "error", "decision", "learning"],
            description: "Optional type filter",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "apex_task_get_phase",
      description:
        "Get current phase and handoff for a task. Simple Unix-style tool that just reads from database.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to get phase for",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "apex_task_set_phase",
      description:
        "Set phase and optional handoff for a task. Simple Unix-style tool that just writes to database. No validation or state machine logic.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to set phase for",
          },
          phase: {
            type: "string",
            enum: [
              "ARCHITECT",
              "BUILDER",
              "VALIDATOR",
              "REVIEWER",
              "DOCUMENTER",
            ],
            description: "Phase to set",
          },
          handoff: {
            type: "string",
            description: "Optional handoff message to store with the phase",
          },
        },
        required: ["task_id", "phase"],
      },
    },
  ];
}
