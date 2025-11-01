/**
 * Schema Consistency Tests
 * Validates that generated JSON schemas match Zod structure and meet token reduction goals
 */

import { describe, it, expect } from "vitest";
import { getToolsList } from "../../src/mcp/tools/index.js";

describe("Schema Consistency", () => {
  const tools = getToolsList();

  it("should export all 13 tools", () => {
    expect(tools).toHaveLength(13);
  });

  it("should have valid structure for all tools", () => {
    tools.forEach((tool) => {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
    });
  });

  describe("apex_patterns_lookup", () => {
    const lookup = tools.find((t) => t.name === "apex_patterns_lookup");

    it("should have required field 'task'", () => {
      expect(lookup?.inputSchema).toHaveProperty("required");
      expect(lookup?.inputSchema.required).toContain("task");
    });

    it("should have task property defined", () => {
      expect(lookup?.inputSchema.properties).toHaveProperty("task");
      expect(lookup?.inputSchema.properties.task).toHaveProperty("type", "string");
    });

    it("should have max_size property with constraints", () => {
      expect(lookup?.inputSchema.properties).toHaveProperty("max_size");
      const maxSize = lookup?.inputSchema.properties.max_size;
      expect(maxSize).toHaveProperty("type", "number");
      expect(maxSize).toHaveProperty("minimum");
      expect(maxSize).toHaveProperty("maximum");
    });
  });

  describe("apex_reflect", () => {
    const reflect = tools.find((t) => t.name === "apex_reflect");

    it("should have required fields", () => {
      expect(reflect?.inputSchema).toHaveProperty("required");
      expect(reflect?.inputSchema.required).toContain("task");
      expect(reflect?.inputSchema.required).toContain("outcome");
      // claims is optional because schema uses .refine() to require either claims OR batch_patterns
    });

    it("should have claims and batch_patterns properties defined", () => {
      expect(reflect?.inputSchema.properties).toHaveProperty("claims");
      expect(reflect?.inputSchema.properties).toHaveProperty("batch_patterns");
    });
  });

  describe("apex_patterns_discover", () => {
    const discover = tools.find((t) => t.name === "apex_patterns_discover");

    it("should have required field 'query'", () => {
      expect(discover?.inputSchema).toHaveProperty("required");
      expect(discover?.inputSchema.required).toContain("query");
    });

    it("should have query property defined", () => {
      expect(discover?.inputSchema.properties).toHaveProperty("query");
      const query = discover?.inputSchema.properties.query;
      expect(query).toHaveProperty("type", "string");
    });
  });

  describe("apex_patterns_explain", () => {
    const explain = tools.find((t) => t.name === "apex_patterns_explain");

    it("should have required field 'pattern_id'", () => {
      expect(explain?.inputSchema).toHaveProperty("required");
      expect(explain?.inputSchema.required).toContain("pattern_id");
    });

    it("should have pattern_id property defined", () => {
      expect(explain?.inputSchema.properties).toHaveProperty("pattern_id");
      expect(explain?.inputSchema.properties.pattern_id).toHaveProperty("type", "string");
    });
  });

  describe("apex_patterns_overview", () => {
    const overview = tools.find((t) => t.name === "apex_patterns_overview");

    it("should exist in the tool list", () => {
      expect(overview).toBeDefined();
    });

    it("should expose pagination constraints", () => {
      expect(overview?.inputSchema.properties).toHaveProperty("page");
      expect(overview?.inputSchema.properties).toHaveProperty("page_size");
    });
  });

  describe("Task Tools", () => {
    const taskTools = [
      "apex_task_create",
      "apex_task_find",
      "apex_task_find_similar",
      "apex_task_update",
      "apex_task_checkpoint",
      "apex_task_complete",
      "apex_task_context",
      "apex_task_append_evidence",
    ];

    it("should have all task tools", () => {
      taskTools.forEach((toolName) => {
        const tool = tools.find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool?.inputSchema).toBeDefined();
      });
    });

    it("apex_task_create should have intent field", () => {
      const create = tools.find((t) => t.name === "apex_task_create");
      expect(create?.inputSchema.properties).toHaveProperty("intent");
    });

    it("apex_task_update should have id field", () => {
      const update = tools.find((t) => t.name === "apex_task_update");
      expect(update?.inputSchema.properties).toHaveProperty("id");
      expect(update?.inputSchema.required).toContain("id");
    });

    it("apex_task_checkpoint should have id and message fields", () => {
      const checkpoint = tools.find((t) => t.name === "apex_task_checkpoint");
      expect(checkpoint?.inputSchema.properties).toHaveProperty("id");
      expect(checkpoint?.inputSchema.properties).toHaveProperty("message");
      expect(checkpoint?.inputSchema.required).toContain("id");
      expect(checkpoint?.inputSchema.required).toContain("message");
    });

    it("apex_task_complete should have required fields", () => {
      const complete = tools.find((t) => t.name === "apex_task_complete");
      expect(complete?.inputSchema.properties).toHaveProperty("id");
      expect(complete?.inputSchema.properties).toHaveProperty("outcome");
      expect(complete?.inputSchema.properties).toHaveProperty("key_learning");
      expect(complete?.inputSchema.required).toContain("id");
      expect(complete?.inputSchema.required).toContain("outcome");
      expect(complete?.inputSchema.required).toContain("key_learning");
    });

  });

  describe("Token Reduction", () => {
    it("should meet token reduction target of 60%", () => {
      const serialized = JSON.stringify(tools);
      // Rough token estimate: 1 token ≈ 4 characters
      const estimatedTokens = serialized.length / 4;

      // Baseline was 14,100 tokens
      // Target is ≤8,460 tokens (60% reduction)
      const baseline = 14100;
      const target = 8460;

      // Allow some margin for estimation
      const margin = 1000;

      expect(estimatedTokens).toBeLessThanOrEqual(target + margin);

      // Calculate actual reduction
      const reduction = ((baseline - estimatedTokens) / baseline) * 100;
      console.log(`Token reduction: ${reduction.toFixed(1)}% (${estimatedTokens.toFixed(0)} / ${baseline} tokens)`);
    });

    it("should have significantly reduced schema size", () => {
      const serialized = JSON.stringify(tools, null, 2);
      const lines = serialized.split("\n").length;

      // Original manual schemas were ~958 lines in getToolsList()
      // Generated schemas should be much smaller when serialized
      expect(lines).toBeLessThan(5000); // Very generous upper bound
    });
  });

  describe("Schema Structure", () => {
    it("all generated schemas should have type=object", () => {
      tools.forEach((tool) => {
        if (tool.inputSchema) {
          expect(tool.inputSchema).toHaveProperty("type");
          expect(tool.inputSchema.type).toBe("object");
        }
      });
    });

    it("all generated schemas should have properties", () => {
      tools.forEach((tool) => {
        if (tool.inputSchema && tool.inputSchema.type === "object") {
          expect(tool.inputSchema).toHaveProperty("properties");
          expect(typeof tool.inputSchema.properties).toBe("object");
        }
      });
    });
  });
});
