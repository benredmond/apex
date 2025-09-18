/**
 * Tests for APEX task management CLI commands
 * [PAT:TEST:UNIT] ★★★★☆ - Unit testing pattern
 */

import { vi } from "vitest";
import chalk from "chalk";

// [FIX:NODE:ESMODULE_IMPORTS] ★★★★☆ - Mock ES modules BEFORE imports
// Mock dependencies before imports

// Create single instances to be reused
let mockDatabase;
let repo;

vi.unstable_mockModule("../../../dist/storage/database.js", () => {
  const PatternDatabaseMock = vi.fn().mockImplementation(() => {
    if (!mockDatabase) {
      mockDatabase = {
        database: {
          pragma: vi.fn(),
          exec: vi.fn(),
          prepare: vi.fn().mockReturnValue({
            run: vi.fn(),
            get: vi.fn(),
            all: vi.fn().mockReturnValue([]),
          }),
        },
        close: vi.fn(),
      };
    }
    return mockDatabase;
  });

  PatternDatabaseMock.create = vi.fn(async () => PatternDatabaseMock());

  return {
    PatternDatabase: PatternDatabaseMock,
  };
});

vi.mock("../../../dist/cli/commands/shared/progress.js", () => ({
  PerformanceTimer: vi.fn().mockImplementation(() => ({
    elapsed: vi.fn().mockReturnValue(50),
    meetsRequirement: vi.fn().mockReturnValue(true),
  })),
}));

vi.unstable_mockModule("../../../dist/cli/commands/shared/formatters.js", () => ({
  FormatterFactory: {
    create: vi.fn().mockReturnValue({
      format: vi.fn().mockReturnValue("formatted output"),
    }),
  },
}));

vi.unstable_mockModule("../../../dist/cli/commands/shared/validators.js", () => ({
  validateOptions: vi.fn().mockImplementation((options) => ({ 
    valid: true,
    validated: options,
    errors: []
  })),
  displayValidationErrors: vi.fn(),
  validateTaskId: vi.fn().mockImplementation((id) => {
    // Return true for valid IDs, false for invalid ones
    return !id.includes("@");
  }),
}));

// Now import after mocks are set up
const {
  createTaskCommand,
  __setTaskRepositoryFactoryForTest,
  __resetTaskRepositoryFactory,
} = await import("../../../src/cli/commands/task.js");
const { PatternDatabase } = await import("../../../dist/storage/database.js");
const { PerformanceTimer } = await import("../../../dist/cli/commands/shared/progress.js");

describe("Task Command", () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let processExitSpy;
  
  // Repository mock instance (populated by TaskRepository stub)
  let repo;

  beforeEach(() => {
    // Reset module-level mocks between test runs without losing implementations
    mockDatabase = undefined;
    PatternDatabase.create?.mockClear?.();
    repo = {
      findActive: vi.fn().mockResolvedValue([]),
      findByStatus: vi.fn().mockResolvedValue([]),
      findRecent: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      getStatistics: vi.fn().mockResolvedValue({
        total: 0,
        byPhase: {},
        byStatus: {},
        successRate: 0,
      }),
    };
    __setTaskRepositoryFactoryForTest(() => repo);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

    // Mock process.exit
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
  });

  afterEach(() => {
    __resetTaskRepositoryFactory();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("list command", () => {
    test("should list active tasks with correct formatting", async () => {
      
      const mockTasks = [
        {
          id: "task-1",
          intent: "Test task 1",
          task_type: "bug",
          status: "active",
          current_phase: "BUILDER",
          updated_at: new Date().toISOString(),
        },
        {
          id: "task-2",
          intent: "Test task 2",
          task_type: "feature",
          status: "active",
          current_phase: "ARCHITECT",
          updated_at: new Date().toISOString(),
        },
      ];

      repo.findActive.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test", "--status", "active"]);

      expect(repo.findActive).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    test("should filter tasks by phase", async () => {
      const mockTasks = [
        {
          id: "task-1",
          intent: "Test task 1",
          current_phase: "BUILDER",
          status: "active",
        },
        {
          id: "task-2",
          intent: "Test task 2",
          current_phase: "ARCHITECT",
          status: "active",
        },
      ];

      repo.findRecent.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test", "--phase", "BUILDER"]);

      expect(repo.findRecent).toHaveBeenCalledWith(20);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should warn when performance target not met", async () => {
      const mockTimer = {
        elapsed: vi.fn().mockReturnValue(150),
        meetsRequirement: vi.fn().mockReturnValue(false),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      repo.findRecent.mockResolvedValue([]);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test"]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: List operation took 150ms"),
      );
    });

    test("should handle errors gracefully", async () => {
      repo.findRecent.mockRejectedValue(
        new Error("Database error"),
      );

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await expect(
        listCmd.parseAsync(["node", "test"]),
      ).rejects.toThrow("process.exit");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red("Error:"),
        "Database error",
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("show command", () => {
    test("should display task details", async () => {
      const mockTask = {
        id: "task-1",
        intent: "Test task",
        task_type: "feature",
        status: "active",
        current_phase: "BUILDER",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      repo.findById.mockResolvedValue(mockTask);

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1"]);

      expect(repo.findById).toHaveBeenCalledWith("task-1");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should include evidence when requested", async () => {
      const mockTask = {
        id: "task-1",
        intent: "Test task",
        evidence: ["evidence-1", "evidence-2"],
      };

      repo.findById.mockResolvedValue(mockTask);

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1", "--evidence"]);

      expect(repo.findById).toHaveBeenCalledWith("task-1");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should error on invalid task ID", async () => {
      // The mock already returns false for IDs containing "@"
      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await expect(
        showCmd.parseAsync(["node", "test", "invalid@id"]),
      ).rejects.toThrow("process.exit");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red("Error: Invalid task ID format"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    test("should error when task not found", async () => {
      repo.findById.mockResolvedValue(null);

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await expect(
        showCmd.parseAsync(["node", "test", "non-existent"]),
      ).rejects.toThrow("process.exit");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red("Error: Task 'non-existent' not found"),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    test("should meet performance target < 50ms", async () => {
      const mockTimer = {
        elapsed: vi.fn().mockReturnValue(45),
        meetsRequirement: vi.fn().mockReturnValue(true),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      repo.findById.mockResolvedValue({ id: "task-1" });

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1"]);

      expect(mockTimer.meetsRequirement).toHaveBeenCalledWith(50);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("stats command", () => {
    test("should display task statistics", async () => {
      const mockStats = {
        total_tasks: 100,
        active_tasks: 10,
        completed_tasks: 85,
        failed_tasks: 5,
        completion_rate: 0.85,
        avg_duration: "2h 30m",
        tasks_this_week: 15,
        last_updated: new Date().toISOString(),
      };

      repo.getStatistics.mockResolvedValue(mockStats);

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test"]);

      expect(repo.getStatistics).toHaveBeenCalledWith("week");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should accept different time periods", async () => {
      repo.getStatistics.mockResolvedValue({});

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test", "--period", "month"]);

      expect(repo.getStatistics).toHaveBeenCalledWith("month");
    });

    test("should meet performance target < 200ms", async () => {
      const mockTimer = {
        elapsed: vi.fn().mockReturnValue(150),
        meetsRequirement: vi.fn().mockReturnValue(true),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      repo.getStatistics.mockResolvedValue({});

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test"]);

      expect(mockTimer.meetsRequirement).toHaveBeenCalledWith(200);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("recent command", () => {
    test("should show recently completed tasks", async () => {
      const mockTasks = [
        {
          id: "task-1",
          intent: "Completed task 1",
          status: "completed",
          updated_at: new Date().toISOString(),
        },
        {
          id: "task-2",
          intent: "Completed task 2",
          status: "completed",
          updated_at: new Date().toISOString(),
        },
      ];

      repo.findByStatus.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const recentCmd = command.commands.find(
        (cmd) => cmd.name() === "recent",
      );

      await recentCmd.parseAsync(["node", "test"]);

      expect(repo.findByStatus).toHaveBeenCalledWith("completed", 10);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should respect limit option", async () => {
      repo.findByStatus.mockResolvedValue([]);

      const command = createTaskCommand();
      const recentCmd = command.commands.find(
        (cmd) => cmd.name() === "recent",
      );

      await recentCmd.parseAsync(["node", "test", "--limit", "5"]);

      expect(repo.findByStatus).toHaveBeenCalledWith("completed", 5);
    });

    test("should support different output formats", async () => {
      repo.findByStatus.mockResolvedValue([
        { id: "task-1", status: "completed" },
      ]);

      const command = createTaskCommand();
      const recentCmd = command.commands.find(
        (cmd) => cmd.name() === "recent",
      );

      await recentCmd.parseAsync(["node", "test", "--format", "json"]);

      expect(consoleLogSpy).toHaveBeenCalled();
      // The FormatterFactory will handle JSON formatting
    });
  });

  describe("performance requirements", () => {
    test("list operation should complete within 100ms", async () => {
      const startTime = Date.now();
      repo.findRecent.mockResolvedValue([]);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    test("show operation should complete within 50ms", async () => {
      const startTime = Date.now();
      repo.findById.mockResolvedValue({ id: "task-1" });

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);
    });

    test("stats operation should complete within 200ms", async () => {
      const startTime = Date.now();
      repo.getStatistics.mockResolvedValue({});

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });
  });
});
