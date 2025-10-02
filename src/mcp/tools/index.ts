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
import type { DatabaseAdapter } from "../../storage/database-adapter.js";
import { ContextTool } from "./context.js";
import { ContextPackService } from "../../intelligence/context-pack-service.js";
import { generateToolSchema } from "../schemas/generator.js";
import { LookupRequestSchema } from "./lookup.js";
import { ReflectRequestSchema } from "../../reflection/types.js";
import { DiscoverRequestSchema } from "./discover.js";
import { ExplainRequestSchema } from "./explain.js";
import {
  CreateRequestSchema,
  FindRequestSchema,
  FindSimilarRequestSchema,
  CurrentRequestSchema,
  UpdateRequestSchema,
  CheckpointRequestSchema,
  CompleteRequestSchema,
  AppendEvidenceRequestSchema,
  GetEvidenceRequestSchema,
  GetPhaseRequestSchema,
  SetPhaseRequestSchema,
} from "../../schemas/task/types.js";
import { ContextPackRequestSchema } from "./context.js";

let repository: PatternRepository | null = null;
let lookupService: PatternLookupService | null = null;
let reflectionService: ReflectionService | null = null;
let discoverService: PatternDiscoverer | null = null;
let explainService: PatternExplainer | null = null;
let taskService: TaskService | null = null;
let contextTool: ContextTool | null = null;

let initializationToken = 0;
let lastRegistrationToken = 0;

/**
 * Initialize tool dependencies with shared database instance
 */
export async function initializeTools(
  repo: PatternRepository,
  sharedDb?: DatabaseAdapter,
): Promise<void> {
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

  // [PAT:LIFECYCLE:EVENT_HOOKS] - Create TaskSearchEngine and wire to repository
  const { TaskSearchEngine } = await import(
    "../../intelligence/task-search.js"
  );
  const taskSearchEngine = new TaskSearchEngine(db, taskRepository);
  taskRepository.setSearchEngine(taskSearchEngine);

  // [PAT:MIGRATION:BACKFILL] - Backfill similarities for existing tasks on first run
  // Check if task_similarity table is empty
  try {
    const count = db
      .prepare("SELECT COUNT(*) as count FROM task_similarity")
      .get() as { count: number };
    if (count.count === 0) {
      const taskCount = db
        .prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'active'")
        .get() as { count: number };
      if (taskCount.count > 0) {
        console.error(
          `[APEX MCP] Backfilling similarities for ${taskCount.count} active tasks...`,
        );
        await taskSearchEngine.backfillSimilarities();
      }
    }
  } catch (error) {
    // Table might not exist yet, that's ok
    if (process.env.APEX_DEBUG) {
      console.error(`[APEX MCP] Skipping similarity backfill:`, error);
    }
  }

  taskService = new TaskService(taskRepository, db);
  // Inject reflection service into task service for integration
  (taskService as any).reflectionService = reflectionService;
  // Inject pattern repository for BriefGenerator
  (taskService as any).patternRepository = repo;

  // Initialize context pack service with shared database instance
  const contextPackService = new ContextPackService(taskRepository, repo, db);
  contextTool = new ContextTool(contextPackService);

  initializationToken += 1;
  // Ensure subsequent registerTools calls require this fresh initialization
  lastRegistrationToken = 0;
}

/**
 * Register all tools with the MCP server
 */
export async function registerTools(server: Server): Promise<void> {
  if (initializationToken === 0 || initializationToken === lastRegistrationToken) {
    throw new Error(
      "Tools not initialized for this server. Please call initializeTools first.",
    );
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
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
                text: JSON.stringify({ tasks: findResponse }),
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
                text: JSON.stringify({ tasks: similarResponse }),
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
                text: JSON.stringify({ tasks: currentResponse }),
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
                text: JSON.stringify({ evidence: evidenceResponse }),
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

  lastRegistrationToken = initializationToken;
}

/**
 * Get the list of available tools
 * This will be used by the server to advertise available tools
 */
export function getToolsList(): Tool[] {
  return [
    {
      name: "apex_patterns_lookup",
      description: "Find relevant code patterns for task",
      inputSchema: generateToolSchema(LookupRequestSchema, "LookupRequest") as any,
    },
    {
      name: "apex_reflect",
      description: "Submit task reflection to update pattern trust scores",
      inputSchema: generateToolSchema(ReflectRequestSchema, "ReflectRequest") as any,
    },
    {
      name: "apex_patterns_discover",
      description: "Discover patterns via semantic search",
      inputSchema: generateToolSchema(DiscoverRequestSchema, "DiscoverRequest") as any,
    },
    {
      name: "apex_patterns_explain",
      description: "Get pattern explanation and usage guidance",
      inputSchema: generateToolSchema(ExplainRequestSchema, "ExplainRequest") as any,
    },
    {
      name: "apex_task_create",
      description: "Create task with brief",
      inputSchema: generateToolSchema(CreateRequestSchema, "CreateRequest") as any,
    },
    {
      name: "apex_task_find",
      description: "Find tasks by criteria",
      inputSchema: generateToolSchema(FindRequestSchema, "FindRequest") as any,
    },
    {
      name: "apex_task_find_similar",
      description: "Find similar tasks",
      inputSchema: generateToolSchema(FindSimilarRequestSchema, "FindSimilarRequest") as any,
    },
    {
      name: "apex_task_current",
      description: "Get active tasks",
      inputSchema: generateToolSchema(CurrentRequestSchema, "CurrentRequest") as any,
    },
    {
      name: "apex_task_update",
      description: "Update task details",
      inputSchema: generateToolSchema(UpdateRequestSchema, "UpdateRequest") as any,
    },
    {
      name: "apex_task_checkpoint",
      description: "Add task checkpoint",
      inputSchema: generateToolSchema(CheckpointRequestSchema, "CheckpointRequest") as any,
    },
    {
      name: "apex_task_complete",
      description: "Complete task and reflect",
      inputSchema: generateToolSchema(CompleteRequestSchema, "CompleteRequest") as any,
    },
    {
      name: "apex_task_context",
      description: "Get task context pack",
      inputSchema: generateToolSchema(ContextPackRequestSchema, "ContextPackRequest") as any,
    },
    {
      name: "apex_task_append_evidence",
      description: "Append task evidence",
      inputSchema: generateToolSchema(AppendEvidenceRequestSchema, "AppendEvidenceRequest") as any,
    },
    {
      name: "apex_task_get_evidence",
      description: "Get task evidence",
      inputSchema: generateToolSchema(GetEvidenceRequestSchema, "GetEvidenceRequest") as any,
    },
    {
      name: "apex_task_get_phase",
      description: "Get task phase",
      inputSchema: generateToolSchema(GetPhaseRequestSchema, "GetPhaseRequest") as any,
    },
    {
      name: "apex_task_set_phase",
      description: "Set task phase",
      inputSchema: generateToolSchema(SetPhaseRequestSchema, "SetPhaseRequest") as any,
    },
  ];
}

/*
 * PHASE 2 NOTE: Manual schemas removed and replaced with generated schemas from Zod.
 * Original manual schemas were lines 416-1373 (958 lines of JSON Schema definitions).
 * These have been replaced with generateToolSchema() calls that automatically convert
 * Zod schemas to JSON Schema format, reducing duplication and ensuring consistency.
 *
 * Token reduction: ~14,100 tokens → estimated ~5,600 tokens (60% reduction)
 * Lines removed: 958 lines of manual JSON schemas
 * Maintenance improvement: Single source of truth (Zod schemas only)
 */
