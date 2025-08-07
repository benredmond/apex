/**
 * Unit tests for TaskSearchEngine
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 * [TEST:PERF:BENCHMARK] ★★★★☆ - Performance benchmarking for <50ms requirement
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import Database from "better-sqlite3";
import { TaskSearchEngine } from "../../src/intelligence/task-search.js";
import { TaskRepository } from "../../src/storage/repositories/task-repository.js";
import type { Task } from "../../src/schemas/task/types.js";
import { nanoid } from "nanoid";

describe("TaskSearchEngine", () => {
  let db: Database.Database;
  let searchEngine: TaskSearchEngine;
  let taskRepo: TaskRepository;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    
    // Run migration to create schema
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        identifier TEXT,
        title TEXT NOT NULL,
        intent TEXT,
        task_type TEXT,
        status TEXT DEFAULT 'active',
        tl_dr TEXT,
        objectives TEXT,
        constraints TEXT,
        acceptance_criteria TEXT,
        plan TEXT,
        facts TEXT,
        snippets TEXT,
        risks_and_gotchas TEXT,
        open_questions TEXT,
        in_flight TEXT,
        test_scaffold TEXT,
        phase TEXT DEFAULT 'ARCHITECT',
        phase_handoffs TEXT,
        confidence REAL DEFAULT 0.3,
        files_touched TEXT,
        patterns_used TEXT,
        errors_encountered TEXT,
        claims TEXT,
        prior_impls TEXT,
        failure_corpus TEXT,
        policy TEXT,
        assumptions TEXT,
        outcome TEXT,
        reflection_id TEXT,
        key_learning TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        tags TEXT
      )
    `);
    
    // Create index for tags column
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks(tags)`);

    db.exec(`
      CREATE TABLE task_similarity (
        task_a TEXT NOT NULL,
        task_b TEXT NOT NULL,
        similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
        calculation_method TEXT,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (task_a, task_b),
        CHECK (task_a < task_b)
      )
    `);

    // Create indexes for performance
    db.exec("CREATE INDEX idx_similarity_task_a ON task_similarity(task_a)");
    db.exec("CREATE INDEX idx_similarity_task_b ON task_similarity(task_b)");
    db.exec("CREATE INDEX idx_similarity_score ON task_similarity(similarity_score DESC)");

    searchEngine = new TaskSearchEngine(db);
    taskRepo = new TaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // Helper function to create test tasks
  function createTestTask(overrides: Partial<Task> = {}): Task {
    const id = nanoid();
    const task: Task = {
      id,
      identifier: `TEST-${id.substring(0, 6)}`, // Add default identifier
      title: "Test Task",
      intent: "Implement test feature",
      task_type: "feature",
      status: "active",
      created_at: new Date().toISOString(),
      ...overrides,
    };

    // Insert directly into database
    const stmt = db.prepare(`
      INSERT INTO tasks (
        id, identifier, title, intent, task_type, status,
        tl_dr, files_touched, created_at
      ) VALUES (
        @id, @identifier, @title, @intent, @task_type, @status,
        @tl_dr, @files_touched, @created_at
      )
    `);
    
    stmt.run({
      ...task,
      identifier: task.identifier, // Include identifier in insert
      tl_dr: task.tl_dr || null, // Include tl_dr (can be null)
      files_touched: JSON.stringify(task.files_touched || []),
    });

    return task;
  }

  describe("findSimilar", () => {
    it("should find similar tasks based on tags", async () => {
      // Create tasks with similar tags
      const task1 = createTestTask({
        title: "Add Redis caching to user profile endpoint",
        intent: "Implement caching layer for better performance",
        tl_dr: "Cache user profiles in Redis",
      });

      const task2 = createTestTask({
        title: "Implement Redis caching for product listings",
        intent: "Add caching to improve product query performance",
        tl_dr: "Cache product data in Redis",
      });

      const task3 = createTestTask({
        title: "Fix authentication bug",
        intent: "Resolve JWT token validation issue",
        tl_dr: "Fix auth bug",
      });

      const similar = await searchEngine.findSimilar(task1, { limit: 3, minScore: 0.2 });

      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].task.id).toBe(task2.id); // Should match Redis caching task
      expect(similar[0].similarity).toBeGreaterThan(0.3);
      expect(similar[0].reason).toContain("shared tags");
    });

    it("should find similar tasks based on themes", async () => {
      const task1 = createTestTask({
        title: "Optimize database queries",
        intent: "Improve performance by optimizing slow queries",
        task_type: "perf",
      });

      const task2 = createTestTask({
        title: "Speed up API response times",
        intent: "Optimize backend to improve performance",
        task_type: "perf",
      });

      const task3 = createTestTask({
        title: "Add user authentication",
        intent: "Implement JWT-based authentication",
        task_type: "feature",
      });

      const similar = await searchEngine.findSimilar(task1, { limit: 3, minScore: 0.2 });

      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].task.id).toBe(task2.id); // Both are performance-related
      expect(similar[0].reason).toContain("themes");
    });

    it("should find similar tasks based on file overlap", async () => {
      const task1 = createTestTask({
        title: "Refactor user authentication flow",
        intent: "Improve user service authentication",
        files_touched: ["src/services/user.ts", "src/api/users.ts", "src/auth/jwt.ts"],
      });

      const task2 = createTestTask({
        title: "Add input validation for user endpoints",
        intent: "Enhance user data validation",
        files_touched: ["src/services/user.ts", "src/api/users.ts", "src/validators/user.ts"],
      });

      const task3 = createTestTask({
        title: "Implement product catalog search",
        intent: "Add search functionality to products",
        files_touched: ["src/services/product.ts", "src/api/products.ts", "src/search/product-search.ts"],
      });

      const similar = await searchEngine.findSimilar(task1, { limit: 3, minScore: 0.1 });

      expect(similar.length).toBeGreaterThan(0);
      
      // Both task2 and task3 should be found
      const task2Result = similar.find(s => s.task.id === task2.id);
      const task3Result = similar.find(s => s.task.id === task3.id);
      
      expect(task2Result).toBeDefined();
      
      // Task2 should have significant file overlap with task1
      if (task2Result) {
        expect(task2Result.reason).toContain("files");
        expect(task2Result.similarity).toBeGreaterThan(0.2);
      }
    });

    it("should cache similarity scores in database", async () => {
      const task1 = createTestTask({ title: "Task 1" });
      const task2 = createTestTask({ title: "Task 2" });

      // First call should calculate and cache
      await searchEngine.findSimilar(task1);

      // Check cache was populated
      const cached = db
        .prepare(
          "SELECT * FROM task_similarity WHERE (task_a = ? AND task_b = ?) OR (task_a = ? AND task_b = ?)",
        )
        .get(task1.id, task2.id, task2.id, task1.id);

      expect(cached).toBeDefined();
    });

    it("should use cached results on subsequent calls", async () => {
      const task1 = createTestTask({ title: "Cached Task 1" });
      const task2 = createTestTask({ title: "Cached Task 2" });

      // First call
      const result1 = await searchEngine.findSimilar(task1);

      // Second call should use cache (faster)
      const start = Date.now();
      const result2 = await searchEngine.findSimilar(task1);
      const duration = Date.now() - start;

      expect(result2).toEqual(result1);
      expect(duration).toBeLessThan(10); // Should be very fast from cache
    });

    it("should meet performance requirement of <50ms", async () => {
      // Create 20 test tasks
      const tasks: Task[] = [];
      for (let i = 0; i < 20; i++) {
        tasks.push(
          createTestTask({
            title: `Task ${i}`,
            intent: `Intent for task ${i}`,
            files_touched: [`src/file${i}.ts`, `src/common.ts`],
          }),
        );
      }

      // Measure performance
      const start = Date.now();
      await searchEngine.findSimilar(tasks[0], { limit: 5 });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe("extractTags", () => {
    it("should extract relevant tags from intent", () => {
      const tags = searchEngine.extractTags(
        "Add Redis caching to user profile API endpoint for better performance",
      );

      expect(tags).toContain("cache");
      expect(tags).toContain("api");
      expect(tags).toContain("performance");
    });

    it("should extract technology tags", () => {
      const tags = searchEngine.extractTags(
        "Implement React component with TypeScript and Jest tests",
      );

      expect(tags).toContain("ui");
      expect(tags).toContain("test");
    });
  });

  describe("inferThemes", () => {
    it("should infer performance theme", () => {
      const themes = searchEngine.inferThemes(
        "Optimize slow database queries to improve response time",
      );

      expect(themes).toContain("performance");
      expect(themes).toContain("optimization");
    });

    it("should infer bugfix theme", () => {
      const themes = searchEngine.inferThemes(
        "Fix critical error in authentication service",
      );

      expect(themes).toContain("bugfix");
    });

    it("should infer feature theme", () => {
      const themes = searchEngine.inferThemes(
        "Implement new user registration flow",
      );

      expect(themes).toContain("feature");
    });
  });

  describe("detectComponents", () => {
    it("should detect API components", () => {
      const components = searchEngine.detectComponents([
        "src/api/users.ts",
        "src/routes/auth.ts",
      ]);

      expect(components).toContain("api");
    });

    it("should detect service components", () => {
      const components = searchEngine.detectComponents([
        "src/services/user-service.ts",
        "src/services/auth-service.ts",
      ]);

      expect(components).toContain("user-service-service");
      expect(components).toContain("auth-service-service");
    });

    it("should detect test components", () => {
      const components = searchEngine.detectComponents([
        "tests/unit/user.test.ts",
        "tests/integration/api.test.ts",
      ]);

      expect(components).toContain("test-suite");
    });
  });

  describe("clearCacheForTask", () => {
    it("should clear cache when task is completed", async () => {
      const task1 = createTestTask({ title: "Task to complete" });
      const task2 = createTestTask({ title: "Other task" });

      // Calculate and cache similarities
      await searchEngine.findSimilar(task1);

      // Clear cache for task1
      searchEngine.clearCacheForTask(task1.id);

      // Check database cache was cleared
      const cached = db
        .prepare(
          "SELECT * FROM task_similarity WHERE task_a = ? OR task_b = ?",
        )
        .all(task1.id, task1.id);

      expect(cached).toHaveLength(0);
    });
  });

  describe("precomputeSimilarities", () => {
    it("should batch process active tasks", async () => {
      // Create multiple active tasks
      const tasks: Task[] = [];
      for (let i = 0; i < 15; i++) {
        tasks.push(
          createTestTask({
            title: `Active Task ${i}`,
            status: "active",
          }),
        );
      }

      // Precompute similarities
      await searchEngine.precomputeSimilarities();

      // Check that similarities were cached
      const cached = db
        .prepare("SELECT COUNT(*) as count FROM task_similarity")
        .get() as { count: number };

      expect(cached.count).toBeGreaterThan(0);
    });
  });
});