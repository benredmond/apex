/**
 * Tests for APEX task management CLI commands
 * [PAT:TEST:UNIT] ★★★★☆ - Unit testing pattern
 */

import { jest } from "@jest/globals";
import { createTaskCommand } from "../../../src/cli/commands/task.js";

describe("Task Command", () => {
  let mockRepository;
  let mockDatabase;
  let consoleLogSpy;
  let consoleErrorSpy;
  let consoleWarnSpy;
  let processExitSpy;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock database
    mockDatabase = {
      db: {},
    };
    PatternDatabase.mockImplementation(() => mockDatabase);

    // Mock repository
    mockRepository = {
      findActive: jest.fn(),
      findByStatus: jest.fn(),
      findRecent: jest.fn(),
      findById: jest.fn(),
      getStatistics: jest.fn(),
    };
    TaskRepository.mockImplementation(() => mockRepository);

    // Mock performance timer
    PerformanceTimer.mockImplementation(() => ({
      elapsed: jest.fn().mockReturnValue(50),
      meetsRequirement: jest.fn().mockReturnValue(true),
    }));

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    // Mock process.exit
    processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

      mockRepository.findActive.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test", "--status", "active"]);

      expect(mockRepository.findActive).toHaveBeenCalled();
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

      mockRepository.findRecent.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test", "--phase", "BUILDER"]);

      expect(mockRepository.findRecent).toHaveBeenCalledWith(20);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should warn when performance target not met", async () => {
      const mockTimer = {
        elapsed: jest.fn().mockReturnValue(150),
        meetsRequirement: jest.fn().mockReturnValue(false),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      mockRepository.findRecent.mockResolvedValue([]);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test"]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: List operation took 150ms"),
      );
    });

    test("should handle errors gracefully", async () => {
      mockRepository.findRecent.mockRejectedValue(
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

      mockRepository.findById.mockResolvedValue(mockTask);

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1"]);

      expect(mockRepository.findById).toHaveBeenCalledWith("task-1");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should include evidence when requested", async () => {
      const mockTask = {
        id: "task-1",
        intent: "Test task",
        evidence: ["evidence-1", "evidence-2"],
      };

      mockRepository.findById.mockResolvedValue(mockTask);

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1", "--evidence"]);

      expect(mockRepository.findById).toHaveBeenCalledWith("task-1");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should error on invalid task ID", async () => {
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
      mockRepository.findById.mockResolvedValue(null);

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
        elapsed: jest.fn().mockReturnValue(45),
        meetsRequirement: jest.fn().mockReturnValue(true),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      mockRepository.findById.mockResolvedValue({ id: "task-1" });

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

      mockRepository.getStatistics.mockResolvedValue(mockStats);

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test"]);

      expect(mockRepository.getStatistics).toHaveBeenCalledWith("week");
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should accept different time periods", async () => {
      mockRepository.getStatistics.mockResolvedValue({});

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test", "--period", "month"]);

      expect(mockRepository.getStatistics).toHaveBeenCalledWith("month");
    });

    test("should meet performance target < 200ms", async () => {
      const mockTimer = {
        elapsed: jest.fn().mockReturnValue(150),
        meetsRequirement: jest.fn().mockReturnValue(true),
      };
      PerformanceTimer.mockImplementation(() => mockTimer);

      mockRepository.getStatistics.mockResolvedValue({});

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

      mockRepository.findByStatus.mockResolvedValue(mockTasks);

      const command = createTaskCommand();
      const recentCmd = command.commands.find(
        (cmd) => cmd.name() === "recent",
      );

      await recentCmd.parseAsync(["node", "test"]);

      expect(mockRepository.findByStatus).toHaveBeenCalledWith("completed", 10);
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    test("should respect limit option", async () => {
      mockRepository.findByStatus.mockResolvedValue([]);

      const command = createTaskCommand();
      const recentCmd = command.commands.find(
        (cmd) => cmd.name() === "recent",
      );

      await recentCmd.parseAsync(["node", "test", "--limit", "5"]);

      expect(mockRepository.findByStatus).toHaveBeenCalledWith("completed", 5);
    });

    test("should support different output formats", async () => {
      mockRepository.findByStatus.mockResolvedValue([
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
      mockRepository.findRecent.mockResolvedValue([]);

      const command = createTaskCommand();
      const listCmd = command.commands.find((cmd) => cmd.name() === "list");

      await listCmd.parseAsync(["node", "test"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    test("show operation should complete within 50ms", async () => {
      const startTime = Date.now();
      mockRepository.findById.mockResolvedValue({ id: "task-1" });

      const command = createTaskCommand();
      const showCmd = command.commands.find((cmd) => cmd.name() === "show");

      await showCmd.parseAsync(["node", "test", "task-1"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);
    });

    test("stats operation should complete within 200ms", async () => {
      const startTime = Date.now();
      mockRepository.getStatistics.mockResolvedValue({});

      const command = createTaskCommand();
      const statsCmd = command.commands.find((cmd) => cmd.name() === "stats");

      await statsCmd.parseAsync(["node", "test"]);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200);
    });
  });
});