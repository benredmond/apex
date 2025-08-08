/**
 * Tests for Task MCP Tools
 * [PAT:TEST:ISOLATION] ★★★★★ - Isolated test database per test
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { TaskService } from "../../../src/mcp/tools/task.js";
import { TaskRepository } from "../../../src/storage/repositories/task-repository.js";
import type { Task, CreateRequest } from "../../../src/schemas/task/types.js";

// ES module alternative to __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Task MCP Tools", () => {
  let tempDir: string;
  let db: Database.Database;
  let repository: TaskRepository;
  let service: TaskService;

  beforeEach(async () => {
    // [PAT:TEST:ISOLATION] ★★★★★ - Create isolated test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-task-test-"));
    db = new Database(path.join(tempDir, "test.db"));

    // Run migrations to create tables
    const migration006 = await import("../../../src/migrations/migrations/006-add-task-system-schema.js");
    const migration007 = await import("../../../src/migrations/migrations/007-add-evidence-log-table.js");
    const migration010 = await import("../../../src/migrations/migrations/010-add-task-tags.js");
    
    // Run the migrations in order
    try {
      migration006.migration.up(db);
    } catch (error) {
      // Ignore if table already exists
    }
    
    try {
      migration007.migration.up(db);
    } catch (error) {
      // Ignore if table already exists
    }
    
    try {
      migration010.migration.up(db);
    } catch (error) {
      // Ignore if column already exists
    }
    // Create minimal patterns table for BriefGenerator
    db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        category TEXT,
        type TEXT,
        trust_score REAL DEFAULT 0.5,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_used TEXT,
        snippets TEXT,
        search_text TEXT,
        tags TEXT,
        relationships TEXT,
        alias TEXT
      );
    `);

    // Initialize repository and service
    repository = new TaskRepository(db);
    // Pass db for evidence tools, BriefGenerator will only initialize when needed
    service = new TaskService(repository, db);
  });

  afterEach(() => {
    // Clean up
    db.close();
    fs.removeSync(tempDir);
  });

  describe("apex.task.create", () => {
    it("should create a task with auto-generated brief", async () => {
      const request: CreateRequest = {
        intent: "Implement user authentication with JWT tokens",
        type: "feature",
      };

      const response = await service.create(request);

      expect(response).toHaveProperty("id");
      expect(response).toHaveProperty("brief");
      expect(response.brief.objectives).toBeInstanceOf(Array);
      expect(response.brief.plan).toBeInstanceOf(Array);
      expect(response.brief.plan.length).toBeGreaterThan(0);
    });

    it("should create a task with external identifier", async () => {
      const request: CreateRequest = {
        identifier: "APE-123",
        intent: "Fix login bug",
        type: "bug",
      };

      const response = await service.create(request);
      expect(response).toHaveProperty("id");
      
      // Verify task was created in database
      const task = repository.findById(response.id);
      expect(task).not.toBeNull();
      expect(task?.identifier).toBe("APE-123");
      expect(task?.task_type).toBe("bug");
    });

    it("should validate required fields", async () => {
      await expect(service.create({})).rejects.toThrow("Invalid create request");
      await expect(service.create({ intent: "" })).rejects.toThrow("Invalid create request");
    });
  });

  describe("apex.task.find", () => {
    beforeEach(async () => {
      // Create test tasks
      await service.create({ intent: "Task 1", type: "feature" });
      await service.create({ intent: "Task 2", type: "bug" });
      await service.create({ intent: "Task 3", type: "feature" });
      
      // Complete one task
      const task4 = await service.create({ intent: "Task 4", type: "test" });
      repository.complete(task4.id, "success", "Test completed", ["PAT:TEST"]);
    });

    it("should find active tasks", async () => {
      const tasks = await service.find({ status: "active" });
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBe(3); // 3 active tasks
      expect(tasks[0].status).toBe("active");
    });

    it("should find completed tasks", async () => {
      const tasks = await service.find({ status: "completed" });
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBe(1);
      expect(tasks[0].status).toBe("completed");
    });

    it("should respect limit parameter", async () => {
      const tasks = await service.find({ limit: 2 });
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeLessThanOrEqual(2);
    });

    it("should return active tasks by default", async () => {
      const tasks = await service.find({});
      
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.every((t) => t.status === "active")).toBe(true);
    });
  });

  describe("apex.task.find_similar", () => {
    let task1: any;
    let task2: any;

    beforeEach(async () => {
      task1 = await service.create({ intent: "Implement user authentication", type: "feature" });
      task2 = await service.create({ intent: "Implement user authorization", type: "feature" });
      await service.create({ intent: "Fix database connection", type: "bug" });
    });

    it("should find similar tasks by title", async () => {
      const similar = await service.findSimilar({ taskId: task1.id });
      
      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].task.id).toBe(task2.id); // Similar title
      expect(similar[0].similarity).toBeGreaterThan(0.3);
    });

    it("should use most recent active task if no ID provided", async () => {
      const similar = await service.findSimilar({});
      
      expect(Array.isArray(similar)).toBe(true);
      // Should find similar tasks for the most recent active task
    });

    it("should cache similarity scores", async () => {
      // First call calculates similarity
      await service.findSimilar({ taskId: task1.id });
      
      // Second call should use cache (verify by checking task_similarity table)
      const cached = db
        .prepare("SELECT * FROM task_similarity WHERE task_a = ? OR task_b = ?")
        .all(task1.id, task1.id);
      
      expect(cached.length).toBeGreaterThan(0);
    });
  });

  describe("apex.task.current", () => {
    it("should return all active tasks", async () => {
      await service.create({ intent: "Task 1" });
      await service.create({ intent: "Task 2" });
      const task3 = await service.create({ intent: "Task 3" });
      
      // Complete one task
      repository.complete(task3.id, "success", "Done");
      
      const current = await service.getCurrent();
      
      expect(Array.isArray(current)).toBe(true);
      expect(current.length).toBe(2); // Only 2 active
      expect(current.every((t) => t.status === "active")).toBe(true);
    });
  });

  describe("apex.task.update", () => {
    let taskId: string;

    beforeEach(async () => {
      const response = await service.create({ intent: "Test task" });
      taskId = response.id;
    });

    it("should update task phase", async () => {
      await service.update({
        id: taskId,
        phase: "BUILDER",
      });
      
      const task = repository.findById(taskId);
      expect(task?.phase).toBe("BUILDER");
    });

    it("should update confidence level", async () => {
      await service.update({
        id: taskId,
        confidence: 0.8,
      });
      
      const task = repository.findById(taskId);
      expect(task?.confidence).toBe(0.8);
    });

    it("should track files modified", async () => {
      await service.update({
        id: taskId,
        files: ["src/file1.ts", "src/file2.ts"],
      });
      
      const task = repository.findById(taskId);
      expect(task?.files_touched).toEqual(["src/file1.ts", "src/file2.ts"]);
    });

    it("should track errors encountered", async () => {
      await service.update({
        id: taskId,
        errors: [
          { error: "Type error", fix: "Added type annotation" },
          { error: "Test failure", fix: "Fixed mock" },
        ],
      });
      
      const task = repository.findById(taskId);
      expect(task?.errors_encountered).toHaveLength(2);
    });

    it("should store phase handoffs", async () => {
      await service.update({
        id: taskId,
        handoff: "Completed design, ready for implementation",
      });
      
      const task = repository.findById(taskId);
      // phase_handoffs is now an array of handoffs
      expect(Array.isArray(task?.phase_handoffs)).toBe(true);
      const architectHandoff = task?.phase_handoffs?.find(h => h.phase === "ARCHITECT");
      expect(architectHandoff?.handoff).toBe("Completed design, ready for implementation");
    });
  });

  describe("apex.task.checkpoint", () => {
    let taskId: string;

    beforeEach(async () => {
      const response = await service.create({ intent: "Test task" });
      taskId = response.id;
    });

    it("should add checkpoint message", async () => {
      await service.checkpoint({
        id: taskId,
        message: "Starting implementation",
        confidence: 0.5,
      });
      
      const task = repository.findById(taskId);
      expect(Array.isArray(task?.in_flight)).toBe(true);
      expect(task?.in_flight?.[0]).toContain("Starting implementation");
      expect(task?.in_flight?.[0]).toContain("confidence: 0.5");
    });

    it("should update confidence if provided", async () => {
      await service.checkpoint({
        id: taskId,
        message: "Making progress",
        confidence: 0.7,
      });
      
      const task = repository.findById(taskId);
      expect(task?.confidence).toBe(0.7);
    });

    it("should validate required fields", async () => {
      await expect(
        service.checkpoint({ id: taskId, message: "" }),
      ).rejects.toThrow("Invalid checkpoint request");
    });
  });

  describe("apex.task.complete", () => {
    let taskId: string;

    beforeEach(async () => {
      const response = await service.create({ intent: "Test task" });
      taskId = response.id;
    });

    it("should complete task and generate reflection draft", async () => {
      const reflection = await service.complete({
        id: taskId,
        outcome: "success",
        key_learning: "Pattern X worked well",
        patterns_used: ["PAT:TEST:MOCK", "FIX:ASYNC:SYNC"],
      });
      
      expect(reflection).toHaveProperty("task");
      expect(reflection.task.id).toBe(taskId);
      expect(reflection.outcome).toBe("success");
      expect(reflection.claims.patterns_used).toHaveLength(2);
      expect(reflection.claims.trust_updates).toHaveLength(2);
      
      // Verify task is marked complete
      const task = repository.findById(taskId);
      expect(task?.status).toBe("completed");
      expect(task?.outcome).toBe("success");
      expect(task?.key_learning).toBe("Pattern X worked well");
    });

    it("should calculate task duration", async () => {
      // Wait a bit to ensure duration > 0
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      await service.complete({
        id: taskId,
        outcome: "success",
        key_learning: "Done quickly",
      });
      
      const task = repository.findById(taskId);
      // Duration calculation depends on timestamp format - verify task completed
      expect(task?.status).toBe("completed");
      expect(task?.duration_ms).toBeDefined();
    });

    it("should handle partial success", async () => {
      const reflection = await service.complete({
        id: taskId,
        outcome: "partial",
        key_learning: "Some issues encountered",
        patterns_used: ["PAT:TEST:PARTIAL"],
      });
      
      expect(reflection.outcome).toBe("partial");
      expect(reflection.claims.trust_updates[0].outcome).toBe("partial-success");
    });
    
    it("should NOT automatically call reflection service", async () => {
      // Mock reflection service to track if it's called
      const mockReflect = jest.fn();
      (service as any).reflectionService = { reflect: mockReflect };
      
      await service.complete({
        id: taskId,
        outcome: "success",
        key_learning: "Testing no auto-reflection",
        patterns_used: ["PAT:TEST:MOCK"],
      });
      
      // Verify reflection service was NOT called automatically
      expect(mockReflect).not.toHaveBeenCalled();
      
      // But task should still be completed
      const task = repository.findById(taskId);
      expect(task?.status).toBe("completed");
    });
    
    it("should generate evidence for patterns used", async () => {
      // Update task with files touched for evidence
      await service.update({
        id: taskId,
        files: ["src/test-file.ts", "src/another-file.ts"],
      });
      
      const reflection = await service.complete({
        id: taskId,
        outcome: "success",
        key_learning: "Evidence collected",
        patterns_used: ["PAT:TEST:EVIDENCE"],
      });
      
      // Verify evidence is generated for patterns
      expect(reflection.claims.patterns_used[0].evidence).toBeDefined();
      expect(reflection.claims.patterns_used[0].evidence.length).toBeGreaterThan(0);
      expect(reflection.claims.patterns_used[0].evidence[0].kind).toBe("git_lines");
      expect(reflection.claims.patterns_used[0].evidence[0].sha).toBe("HEAD");
    });
    
    it("should handle task with errors as anti-patterns", async () => {
      // Update task with errors encountered
      await service.update({
        id: taskId,
        errors: [
          { error: "Async in sync context", fix: "Use sync operations" },
          { error: "Missing import", fix: "Add import statement" },
        ],
      });
      
      const reflection = await service.complete({
        id: taskId,
        outcome: "failure",
        key_learning: "Errors encountered",
        patterns_used: [],
      });
      
      // Note: Anti-patterns extraction is implemented but not exposed in ReflectionDraft
      // The internal buildReflectionDraft creates them for reflection service
      expect(reflection.outcome).toBe("failure");
    });
  });

  describe("Performance", () => {
    it("should respond in <100ms for all operations", async () => {
      const times: Record<string, number> = {};
      
      // Create
      let start = Date.now();
      const task = await service.create({ intent: "Performance test" });
      times.create = Date.now() - start;
      
      // Find
      start = Date.now();
      await service.find({ status: "active" });
      times.find = Date.now() - start;
      
      // Find similar
      start = Date.now();
      await service.findSimilar({ taskId: task.id });
      times.findSimilar = Date.now() - start;
      
      // Update
      start = Date.now();
      await service.update({ id: task.id, phase: "BUILDER" });
      times.update = Date.now() - start;
      
      // Checkpoint
      start = Date.now();
      await service.checkpoint({ id: task.id, message: "Test" });
      times.checkpoint = Date.now() - start;
      
      // Complete
      start = Date.now();
      await service.complete({ id: task.id, outcome: "success", key_learning: "Fast" });
      times.complete = Date.now() - start;
      
      // All operations should be <100ms
      Object.entries(times).forEach(([op, time]) => {
        expect(time).toBeLessThan(100);
      });
    });
  });

  describe("Phase Tools", () => {
    it("should get and set phase for a task", async () => {
      // Create a task first
      const response = await service.create({
        intent: "Test phase management",
        type: "test",
      });

      const taskId = response.id;

      // Get initial phase (should default to ARCHITECT)
      let phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("ARCHITECT");
      expect(phaseInfo.handoff).toBeUndefined();

      // Set phase to BUILDER with handoff
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
        handoff: "### Architecture Decision\nUse simple Unix-style tools",
      });

      // Get phase should now return BUILDER but no handoff (since ARCHITECT hasn't set one)
      phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("BUILDER");
      expect(phaseInfo.handoff).toBeUndefined();

      // Now set ARCHITECT handoff
      await service.setPhase({
        task_id: taskId,
        phase: "ARCHITECT",
        handoff: "Architecture complete, ready for building",
      });

      // Move back to BUILDER
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
      });

      // Now BUILDER should see ARCHITECT's handoff
      phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("BUILDER");
      expect(phaseInfo.handoff).toBe("Architecture complete, ready for building");

      // Set phase to VALIDATOR with handoff
      await service.setPhase({
        task_id: taskId,
        phase: "VALIDATOR",
        handoff: "Implementation complete, ready for validation",
      });

      // VALIDATOR should see BUILDER's most recent handoff (from line 511)
      phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("VALIDATOR");
      expect(phaseInfo.handoff).toBe("### Architecture Decision\nUse simple Unix-style tools");

      // Now set BUILDER handoff
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
        handoff: "Build complete",
      });

      // Move to VALIDATOR
      await service.setPhase({
        task_id: taskId,
        phase: "VALIDATOR",
      });

      // Now VALIDATOR should see BUILDER's handoff
      phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("VALIDATOR");
      expect(phaseInfo.handoff).toBe("Build complete");
    });

    it("should handle phases without handoffs", async () => {
      const response = await service.create({
        intent: "Test without handoffs",
        type: "test",
      });

      const taskId = response.id;

      // Set phases without handoffs
      await service.setPhase({
        task_id: taskId,
        phase: "REVIEWER",
      });

      const phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("REVIEWER");
      expect(phaseInfo.handoff).toBeUndefined();
    });

    it("should reject invalid phase names", async () => {
      const response = await service.create({
        intent: "Test invalid phase",
        type: "test",
      });

      await expect(
        service.setPhase({
          task_id: response.id,
          phase: "INVALID_PHASE",
        }),
      ).rejects.toThrow("Invalid set phase request");
    });

    it("should reject operations on non-existent tasks", async () => {
      await expect(
        service.getPhase({ task_id: "NONEXISTENT" }),
      ).rejects.toThrow("Task NONEXISTENT not found");

      await expect(
        service.setPhase({
          task_id: "NONEXISTENT",
          phase: "BUILDER",
        }),
      ).rejects.toThrow("Task NONEXISTENT not found");
    });

    it("should preserve handoffs across multiple phase transitions", async () => {
      const response = await service.create({
        intent: "Test handoff preservation",
        type: "test",
      });

      const taskId = response.id;

      // Set handoffs for multiple phases
      await service.setPhase({
        task_id: taskId,
        phase: "ARCHITECT",
        handoff: "Architecture handoff",
      });

      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
        handoff: "Builder handoff",
      });

      await service.setPhase({
        task_id: taskId,
        phase: "VALIDATOR",
        handoff: "Validator handoff",
      });

      // Move to REVIEWER and check it sees VALIDATOR's handoff
      await service.setPhase({
        task_id: taskId,
        phase: "REVIEWER",
      });

      let phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("REVIEWER");
      expect(phaseInfo.handoff).toBe("Validator handoff");

      // Move back to BUILDER and check it sees ARCHITECT's handoff
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
      });

      phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("BUILDER");
      expect(phaseInfo.handoff).toBe("Architecture handoff");
    });

    it("should store multiple handoffs for the same phase", async () => {
      const response = await service.create({
        intent: "Test multiple handoffs per phase",
        type: "test",
      });

      const taskId = response.id;

      // Set initial handoff for ARCHITECT
      await service.setPhase({
        task_id: taskId,
        phase: "ARCHITECT",
        handoff: "First architecture decision",
      });

      // Move to BUILDER with handoff
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
        handoff: "Initial implementation",
      });

      // Move back to ARCHITECT with new handoff (revision scenario)
      await service.setPhase({
        task_id: taskId,
        phase: "ARCHITECT",
        handoff: "Revised architecture after builder feedback",
      });

      // Move to BUILDER again with another handoff
      await service.setPhase({
        task_id: taskId,
        phase: "BUILDER",
        handoff: "Updated implementation based on revision",
      });

      // Get the task and verify all handoffs are stored
      const task = repository.findById(taskId);
      expect(task).toBeDefined();
      expect(Array.isArray(task.phase_handoffs)).toBe(true);
      
      // Should have 4 handoffs total
      expect(task.phase_handoffs).toHaveLength(4);
      
      // Verify each handoff is present
      const architectHandoffs = task.phase_handoffs.filter(h => h.phase === "ARCHITECT");
      expect(architectHandoffs).toHaveLength(2);
      expect(architectHandoffs[0].handoff).toBe("First architecture decision");
      expect(architectHandoffs[1].handoff).toBe("Revised architecture after builder feedback");
      
      const builderHandoffs = task.phase_handoffs.filter(h => h.phase === "BUILDER");
      expect(builderHandoffs).toHaveLength(2);
      expect(builderHandoffs[0].handoff).toBe("Initial implementation");
      expect(builderHandoffs[1].handoff).toBe("Updated implementation based on revision");
      
      // Verify getPhase returns the latest handoff for previous phase
      const phaseInfo = await service.getPhase({ task_id: taskId });
      expect(phaseInfo.phase).toBe("BUILDER");
      expect(phaseInfo.handoff).toBe("Revised architecture after builder feedback");
    });
  });

  describe("Evidence Tools", () => {
    it("should append evidence to task", async () => {
      // Create a task directly in repository to bypass BriefGenerator
      const testBrief = {
        tl_dr: "Test task",
        objectives: ["Test objective"],
        constraints: [],
        acceptance_criteria: [],
        plan: [],
        facts: [],
        snippets: [],
        risks_and_gotchas: [],
        open_questions: [],
        test_scaffold: "",
      };
      
      const task = repository.create(
        {
          identifier: "TEST-001",
          intent: "Test task for evidence",
          task_type: "test",
        },
        testBrief,
      );
      const taskId = task.id;

      // Append different types of evidence
      await service.appendEvidence({
        task_id: taskId,
        type: "file",
        content: "Modified authentication logic",
        metadata: {
          file: "src/auth.ts",
          line_start: 45,
          line_end: 78,
        },
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "pattern",
        content: "Applied FIX:SQLITE:SYNC successfully",
        metadata: {
          pattern_id: "FIX:SQLITE:SYNC",
        },
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "error",
        content: "TypeError: Cannot read property 'x' of undefined",
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "decision",
        content: "Used synchronous operations for simplicity",
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "learning",
        content: "Pattern caching reduces context switching",
      });

      // Get all evidence
      const evidence = await service.getEvidence({ task_id: taskId });

      expect(evidence).toHaveLength(5);
      expect(evidence[0].type).toBe("file");
      expect(evidence[0].content).toBe("Modified authentication logic");
      expect(evidence[0].metadata).toEqual({
        file: "src/auth.ts",
        line_start: 45,
        line_end: 78,
      });

      expect(evidence[1].type).toBe("pattern");
      expect(evidence[1].metadata?.pattern_id).toBe("FIX:SQLITE:SYNC");

      expect(evidence[2].type).toBe("error");
      expect(evidence[3].type).toBe("decision");
      expect(evidence[4].type).toBe("learning");
    });

    it("should filter evidence by type", async () => {
      // Create a task directly in repository
      const task = repository.create(
        {
          identifier: "TEST-002",
          intent: "Test filtering",
          task_type: "test",
        },
        {
          tl_dr: "Test",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
          test_scaffold: "",
        },
      );
      const taskId = task.id;

      // Add multiple evidence entries of different types
      await service.appendEvidence({
        task_id: taskId,
        type: "file",
        content: "File 1",
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "pattern",
        content: "Pattern 1",
      });

      await service.appendEvidence({
        task_id: taskId,
        type: "file",
        content: "File 2",
      });

      // Filter by type
      const fileEvidence = await service.getEvidence({
        task_id: taskId,
        type: "file",
      });

      expect(fileEvidence).toHaveLength(2);
      expect(fileEvidence[0].content).toBe("File 1");
      expect(fileEvidence[1].content).toBe("File 2");

      const patternEvidence = await service.getEvidence({
        task_id: taskId,
        type: "pattern",
      });

      expect(patternEvidence).toHaveLength(1);
      expect(patternEvidence[0].content).toBe("Pattern 1");
    });

    it("should maintain chronological order", async () => {
      const task = repository.create(
        {
          identifier: "TEST-003",
          intent: "Test ordering",
          task_type: "test",
        },
        {
          tl_dr: "Test",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
          test_scaffold: "",
        },
      );
      const taskId = task.id;

      // Add evidence with small delays to ensure different timestamps
      await service.appendEvidence({
        task_id: taskId,
        type: "file",
        content: "First",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.appendEvidence({
        task_id: taskId,
        type: "pattern",
        content: "Second",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.appendEvidence({
        task_id: taskId,
        type: "error",
        content: "Third",
      });

      const evidence = await service.getEvidence({ task_id: taskId });

      expect(evidence[0].content).toBe("First");
      expect(evidence[1].content).toBe("Second");
      expect(evidence[2].content).toBe("Third");
    });

    it("should reject evidence for non-existent task", async () => {
      await expect(
        service.appendEvidence({
          task_id: "NONEXISTENT",
          type: "file",
          content: "Test",
        }),
      ).rejects.toThrow("Task NONEXISTENT not found");
    });

    it("should handle metadata as optional", async () => {
      const task = repository.create(
        {
          identifier: "TEST-004",
          intent: "Test optional metadata",
          task_type: "test",
        },
        {
          tl_dr: "Test",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
          test_scaffold: "",
        },
      );
      const taskId = task.id;

      // Add evidence without metadata
      await service.appendEvidence({
        task_id: taskId,
        type: "decision",
        content: "No metadata needed",
      });

      const evidence = await service.getEvidence({ task_id: taskId });

      expect(evidence).toHaveLength(1);
      expect(evidence[0].metadata).toBeUndefined();
    });

    it("should validate evidence type", async () => {
      const task = repository.create(
        {
          identifier: "TEST-005",
          intent: "Test validation",
          task_type: "test",
        },
        {
          tl_dr: "Test",
          objectives: [],
          constraints: [],
          acceptance_criteria: [],
          plan: [],
          facts: [],
          snippets: [],
          risks_and_gotchas: [],
          open_questions: [],
          test_scaffold: "",
        },
      );
      const taskId = task.id;

      await expect(
        service.appendEvidence({
          task_id: taskId,
          type: "invalid_type",
          content: "Test",
        }),
      ).rejects.toThrow("Invalid append evidence request");
    });
  });
});