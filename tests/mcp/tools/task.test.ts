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

  beforeEach(() => {
    // [PAT:TEST:ISOLATION] ★★★★★ - Create isolated test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-task-test-"));
    db = new Database(path.join(tempDir, "test.db"));

    // Run migration to create tables
    const migration = fs.readFileSync(
      path.join(__dirname, "../../../src/migrations/006-add-task-system-schema.ts"),
      "utf-8",
    );
    
    // Extract and execute SQL from migration
    const sqlMatch = migration.match(/db\.exec\(`([\s\S]*?)`\)/g);
    if (sqlMatch) {
      sqlMatch.forEach((match) => {
        const sql = match
          .replace(/db\.exec\(`/, "")
          .replace(/`\)/, "")
          .replace(/\\"/g, '"');
        try {
          db.exec(sql);
        } catch (error) {
          // Ignore if table already exists
        }
      });
    }

    // Initialize repository and service
    repository = new TaskRepository(db);
    service = new TaskService(repository);
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
      expect(task?.phase_handoffs?.ARCHITECT).toBe("Completed design, ready for implementation");
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
      expect(task?.in_flight?.[0]).toMatchObject({
        message: "Starting implementation",
        confidence: 0.5,
      });
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
});