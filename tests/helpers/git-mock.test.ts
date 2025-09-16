// [PAT:TEST:MOCK] ★★★★★ (156 uses, 95% success) - From cache
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setupGitMocks,
  teardownGitMocks,
  createMockGitProcess,
  mockGitCommand,
  mockGitCommands,
  expectGitCommand,
  getGitCommandCalls,
  clearAllGitMocks,
  getMockSpawn,
  GIT_COMMAND_PRESETS,
  type GitMockOptions
} from "./git-mock.js";

describe("git-mock utilities", () => {
  beforeEach(async () => {
    await setupGitMocks();
  });

  afterEach(() => {
    teardownGitMocks();
  });

  describe("createMockGitProcess", () => {
    it("should create a mock process with default values", (done) => {
      const proc = createMockGitProcess({ command: "status" });
      
      let stdoutData = "";
      let stderrData = "";
      let exitCode: number | null = null;
      
      (proc as any).stdout.on("data", (data: Buffer) => {
        stdoutData += data.toString();
      });
      
      (proc as any).stderr.on("data", (data: Buffer) => {
        stderrData += data.toString();
      });
      
      proc.on("close", (code: number) => {
        exitCode = code;
        expect(stdoutData).toBe("");
        expect(stderrData).toBe("");
        expect(exitCode).toBe(0);
        done();
      });
    });

    it("should emit stdout data", (done) => {
      const proc = createMockGitProcess({ 
        command: "log",
        stdout: "commit message" 
      });
      
      let stdoutData = "";
      
      (proc as any).stdout.on("data", (data: Buffer) => {
        stdoutData += data.toString();
      });
      
      proc.on("close", () => {
        expect(stdoutData).toBe("commit message");
        done();
      });
    });

    it("should emit stderr data", (done) => {
      const proc = createMockGitProcess({ 
        command: "status",
        stderr: "error message",
        exitCode: 1
      });
      
      let stderrData = "";
      let exitCode: number | null = null;
      
      (proc as any).stderr.on("data", (data: Buffer) => {
        stderrData += data.toString();
      });
      
      proc.on("close", (code: number) => {
        exitCode = code;
        expect(stderrData).toBe("error message");
        expect(exitCode).toBe(1);
        done();
      });
    });

    it("should support async delay", (done) => {
      const startTime = Date.now();
      const proc = createMockGitProcess({ 
        command: "status",
        stdout: "delayed",
        delay: 50
      });
      
      proc.on("close", () => {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(50);
        done();
      });
    });

    it("should have required process properties", () => {
      const proc = createMockGitProcess({ command: "status" }) as any;
      
      expect(proc.stdout).toBeDefined();
      expect(proc.stderr).toBeDefined();
      expect(proc.stdin).toBeDefined();
      expect(proc.pid).toBeGreaterThan(0);
      expect(proc.kill).toBeDefined();
      expect(typeof proc.kill).toBe("function");
    });
  });

  describe("mockGitCommand", () => {
    it("should mock a specific git command", async () => {
      mockGitCommand("status", { stdout: "M file.txt" });
      
      const child_process = await import("child_process");
      const result = child_process.spawn("git", ["status", "--porcelain"]);
      
      let stdout = "";
      (result as any).stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      
      await new Promise(resolve => result.on("close", resolve));
      expect(stdout).toBe("M file.txt");
    });

    it("should support regex matching", async () => {
      mockGitCommand(/^log/, { stdout: "commit logs" });
      
      const child_process = await import("child_process");
      const result = child_process.spawn("git", ["log", "--oneline"]);
      
      let stdout = "";
      (result as any).stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      
      await new Promise(resolve => result.on("close", resolve));
      expect(stdout).toBe("commit logs");
    });

    it("should provide error for unmocked commands", async () => {
      mockGitCommand("status", { stdout: "status output" });
      
      const child_process = await import("child_process");
      const result = child_process.spawn("git", ["diff"]);
      
      let stderr = "";
      (result as any).stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      
      await new Promise(resolve => result.on("close", resolve));
      expect(stderr).toContain("Command not mocked: git diff");
    });
  });

  describe("mockGitCommands", () => {
    it("should mock multiple git commands", async () => {
      mockGitCommands({
        status: { stdout: "M file1.txt" },
        log: { stdout: "abc123 Commit message" },
        diff: { stdout: "file1.txt\nfile2.txt", exitCode: 0 }
      });
      
      const child_process = await import("child_process");
      
      // Test status
      const status = child_process.spawn("git", ["status"]);
      let statusOut = "";
      (status as any).stdout.on("data", (data: Buffer) => {
        statusOut += data.toString();
      });
      await new Promise(resolve => status.on("close", resolve));
      expect(statusOut).toBe("M file1.txt");
      
      // Test log
      const log = child_process.spawn("git", ["log"]);
      let logOut = "";
      (log as any).stdout.on("data", (data: Buffer) => {
        logOut += data.toString();
      });
      await new Promise(resolve => log.on("close", resolve));
      expect(logOut).toBe("abc123 Commit message");
    });
  });

  describe("expectGitCommand", () => {
    it("should assert git command was called", async () => {
      mockGitCommand("status", { stdout: "" });
      
      const child_process = await import("child_process");
      child_process.spawn("git", ["status", "--porcelain"]);
      
      expectGitCommand("status", ["--porcelain"]);
    });

    it("should assert command without specific args", async () => {
      mockGitCommand("log", { stdout: "" });
      
      const child_process = await import("child_process");
      child_process.spawn("git", ["log", "--oneline", "-n", "10"]);
      
      expectGitCommand("log");
    });
  });

  describe("getGitCommandCalls", () => {
    it("should return all git command calls", async () => {
      mockGitCommands({
        status: { stdout: "" },
        log: { stdout: "" },
        diff: { stdout: "" }
      });
      
      const child_process = await import("child_process");
      child_process.spawn("git", ["status", "--porcelain"]);
      child_process.spawn("git", ["log", "--oneline"]);
      child_process.spawn("other-command", ["arg"]);
      
      const calls = getGitCommandCalls();
      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ command: "status", args: ["--porcelain"] });
      expect(calls[1]).toEqual({ command: "log", args: ["--oneline"] });
    });
  });

  describe("clearAllGitMocks", () => {
    it("should clear mock calls without teardown", async () => {
      mockGitCommand("status", { stdout: "" });
      
      const child_process = await import("child_process");
      child_process.spawn("git", ["status"]);
      
      expect(getMockSpawn()?.mock.calls).toHaveLength(1);
      
      clearAllGitMocks();
      expect(getMockSpawn()?.mock.calls).toHaveLength(0);
      
      // Should still be able to use mocks
      child_process.spawn("git", ["status"]);
      expect(getMockSpawn()?.mock.calls).toHaveLength(1);
    });
  });

  describe("GIT_COMMAND_PRESETS", () => {
    it("should provide common git command presets", () => {
      expect(GIT_COMMAND_PRESETS.status).toEqual({
        command: "status",
        args: ["--porcelain"],
        stdout: ""
      });
      
      expect(GIT_COMMAND_PRESETS.log).toEqual({
        command: "log",
        args: ["--oneline"],
        stdout: "abc1234 Initial commit"
      });
    });

    it("should work with createMockGitProcess", (done) => {
      const proc = createMockGitProcess({
        ...GIT_COMMAND_PRESETS.revParse,
        stdout: "custom-sha"
      });
      
      let stdout = "";
      (proc as any).stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      
      proc.on("close", () => {
        expect(stdout).toBe("custom-sha");
        done();
      });
    });
  });

  describe("error handling", () => {
    it("should throw error if mocks not initialized", () => {
      teardownGitMocks();
      
      expect(() => mockGitCommand("status", {})).toThrow(
        "Git mocks not initialized. Call setupGitMocks() first."
      );
      
      expect(() => mockGitCommands({})).toThrow(
        "Git mocks not initialized. Call setupGitMocks() first."
      );
      
      expect(() => expectGitCommand("status")).toThrow(
        "Git mocks not initialized. Call setupGitMocks() first."
      );
    });
  });

  describe("mock isolation", () => {
    it("should not leak state between tests", async () => {
      // First mock setup
      mockGitCommand("status", { stdout: "first test" });
      
      // Clear and setup new mock
      teardownGitMocks();
      await setupGitMocks();
      mockGitCommand("status", { stdout: "second test" });
      
      const child_process = await import("child_process");
      const result = child_process.spawn("git", ["status"]);
      
      let stdout = "";
      (result as any).stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      
      await new Promise(resolve => result.on("close", resolve));
      expect(stdout).toBe("second test");
    });
  });
});