// [FIX:MOCK:ESM_IMPORTS] ★★★★★ (12 uses, 100% success) - From cache
// [PAT:TEST:MOCK] ★★★★★ (156 uses, 95% success) - From cache
import { jest, expect } from "@jest/globals";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";

export interface GitMockOptions {
  command: string;           // Git subcommand: "status", "log", "show", etc.
  args?: string[];          // Additional arguments passed to git
  stdout?: string;          // Stdout response (default: "")
  stderr?: string;          // Stderr response (default: "")
  exitCode?: number;        // Process exit code (default: 0)
  delay?: number;           // Async delay in ms (default: 0)
}

// Command presets for common git operations
export const GIT_COMMAND_PRESETS = {
  status: { command: "status", args: ["--porcelain"], stdout: "" },
  log: { command: "log", args: ["--oneline"], stdout: "abc1234 Initial commit" },
  show: { command: "show", args: ["HEAD"], stdout: "commit abc1234..." },
  diff: { command: "diff", args: ["--name-only"], stdout: "file1.js\nfile2.ts" },
  revParse: { command: "rev-parse", args: ["--short", "HEAD"], stdout: "abc1234" },
  catFile: { command: "cat-file", args: ["-e"], stdout: "", exitCode: 0 },
  showFile: { command: "show", args: [], stdout: "" }
};

let mockSpawn: jest.Mock | null = null;
let childProcessModule: any = null;

// Main factory function - enhanced from validator.test.ts:266-279
export function createMockGitProcess(options: GitMockOptions): EventEmitter {
  const { stdout = "", stderr = "", exitCode = 0, delay = 0 } = options;
  
  // [FIX:MOCK:GIT_COMMANDS_ESM] - Enhanced implementation
  const proc = new EventEmitter();
  (proc as any).stdout = new EventEmitter();
  (proc as any).stderr = new EventEmitter();
  (proc as any).stdin = new EventEmitter();
  (proc as any).pid = Math.floor(Math.random() * 10000);
  (proc as any).kill = jest.fn();

  // [ASYNC_TIMING prevention] - Use process.nextTick pattern
  const emitData = () => {
    if (stdout) {
      (proc as any).stdout.emit("data", Buffer.from(stdout));
    }
    if (stderr) {
      (proc as any).stderr.emit("data", Buffer.from(stderr));
    }
    (proc as any).stdout.emit("end");
    (proc as any).stderr.emit("end");
    proc.emit("close", exitCode);
    proc.emit("exit", exitCode);
  };

  if (delay > 0) {
    setTimeout(emitData, delay);
  } else {
    process.nextTick(emitData);
  }

  return proc;
}

// Setup function for git mocks
export async function setupGitMocks(): Promise<void> {
  // [MOCK_ISOLATION prevention] - Clear any existing mocks
  jest.clearAllMocks();
  
  // [FIX:MOCK:ESM_IMPORTS] - Mock child_process before import
  jest.unstable_mockModule("child_process", () => ({
    spawn: jest.fn(),
  }));
  
  childProcessModule = await import("child_process");
  mockSpawn = childProcessModule.spawn as jest.Mock;
}

// Teardown function to prevent mock pollution
export function teardownGitMocks(): void {
  // [MOCK_STATE_POLLUTION prevention] - Reset all mock state
  if (mockSpawn) {
    mockSpawn.mockReset();
  }
  jest.clearAllMocks();
  mockSpawn = null;
  childProcessModule = null;
}

// Clear all git mocks without teardown
export function clearAllGitMocks(): void {
  if (mockSpawn) {
    mockSpawn.mockClear();
  }
}

// Helper to configure spawn mock with specific git command responses
export function mockGitCommand(
  commandMatch: string | RegExp,
  response: Partial<GitMockOptions>
): void {
  if (!mockSpawn) {
    throw new Error("Git mocks not initialized. Call setupGitMocks() first.");
  }

  mockSpawn.mockImplementation((cmd: string, args: string[], options?: any) => {
    if (cmd === "git") {
      const gitCommand = args[0];
      const matches = typeof commandMatch === "string" 
        ? gitCommand === commandMatch
        : commandMatch.test(gitCommand);
        
      if (matches) {
        return createMockGitProcess({
          command: gitCommand,
          args: args.slice(1),
          ...response
        }) as any;
      }
    }
    
    // Default fallback
    return createMockGitProcess({
      command: cmd,
      args,
      exitCode: 1,
      stderr: `Command not mocked: ${cmd} ${args.join(" ")}`
    }) as any;
  });
}

// Helper to mock multiple git commands at once
export function mockGitCommands(commands: Record<string, Partial<GitMockOptions>>): void {
  if (!mockSpawn) {
    throw new Error("Git mocks not initialized. Call setupGitMocks() first.");
  }

  mockSpawn.mockImplementation((cmd: string, args: string[], options?: any) => {
    if (cmd === "git") {
      const gitCommand = args[0];
      
      if (gitCommand in commands) {
        return createMockGitProcess({
          command: gitCommand,
          args: args.slice(1),
          ...commands[gitCommand]
        }) as any;
      }
    }
    
    // Default fallback
    return createMockGitProcess({
      command: cmd,
      args,
      exitCode: 1,
      stderr: `Command not mocked: ${cmd} ${args.join(" ")}`
    }) as any;
  });
}

// Get the mock spawn function for direct manipulation
export function getMockSpawn(): jest.Mock | null {
  return mockSpawn;
}

// Helper to assert git command was called
export function expectGitCommand(command: string, args?: string[]): void {
  if (!mockSpawn) {
    throw new Error("Git mocks not initialized. Call setupGitMocks() first.");
  }

  const calls = mockSpawn.mock.calls.filter(
    ([cmd, cmdArgs]) => cmd === "git" && cmdArgs?.[0] === command
  );

  expect(calls.length).toBeGreaterThan(0);

  if (args) {
    const found = calls.some(([, cmdArgs]) => {
      const actualArgs = cmdArgs.slice(1);
      return args.every((arg, i) => actualArgs[i] === arg);
    });
    expect(found).toBe(true);
  }
}

// Helper to get all git command calls
export function getGitCommandCalls(): Array<{ command: string; args: string[] }> {
  if (!mockSpawn) {
    return [];
  }

  return mockSpawn.mock.calls
    .filter(([cmd]) => cmd === "git")
    .map(([, args]) => ({
      command: args[0],
      args: args.slice(1)
    }));
}