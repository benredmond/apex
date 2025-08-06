/**
 * Task Context MCP Tool - Exposes task-specific context to AI assistants
 * [PAT:MCP:SERVICE] ★★★★☆ - Service wrapper for MCP tool
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { z } from "zod";
import {
  ContextPackService,
  type ContextPackOptions,
} from "../../intelligence/context-pack-service.js";
import { InvalidParamsError } from "../errors.js";

// Input schema for the MCP tool
export const ContextPackRequestSchema = z.object({
  task_id: z
    .string()
    .optional()
    .describe("Specific task ID to get context for"),
  packs: z
    .array(z.enum(["tasks", "patterns", "statistics"]))
    .optional()
    .describe("Which context packs to include (default: all)"),
  max_active_tasks: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of active tasks to include (default: 50)"),
  max_similar_per_task: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum similar tasks per active task (default: 20)"),
  max_size_bytes: z
    .number()
    .min(1024)
    .max(100000)
    .optional()
    .describe("Maximum context pack size in bytes (default: 28672)"),
});

export type ContextPackRequest = z.infer<typeof ContextPackRequestSchema>;

export class ContextTool {
  constructor(private contextService: ContextPackService) {}

  /**
   * Get task context for AI assistant
   */
  async getTaskContext(params: unknown): Promise<any> {
    // Validate input
    const parseResult = ContextPackRequestSchema.safeParse(params);
    if (!parseResult.success) {
      throw new InvalidParamsError(
        `Invalid task context request: ${parseResult.error.issues
          .map((i) => i.message)
          .join(", ")}`,
      );
    }

    const request = parseResult.data;

    // Map request to service options
    const options: ContextPackOptions = {
      taskId: request.task_id,
      packs: request.packs,
      maxActiveTasks: request.max_active_tasks,
      maxSimilarPerTask: request.max_similar_per_task,
      maxSizeBytes: request.max_size_bytes,
    };

    // Get context pack from service
    const contextPack = await this.contextService.getContextPack(options);

    return {
      success: true,
      context_pack: contextPack,
    };
  }
}

// Tool definition for MCP registration
export const contextToolDefinition = {
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
        description: "Maximum number of active tasks to include (default: 50)",
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
};
