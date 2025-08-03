/**
 * Tests for GitResolver
 * [PAT:TEST:MOCK] ★★★★★ (156 uses, 95% success) - From cache
 * [FIX:MOCK:ESM_IMPORTS] ★★★★★ (12 uses, 100% success) - From cache
 */

import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { createMockGitProcess } from "../helpers/git-mock.js";

// Mock child_process before ANY other imports
jest.unstable_mockModule("child_process", () => ({
  spawn: jest.fn(),
}));

// Import child_process first to get the mocked version
const child_process = await import("child_process");

// Now import GitResolver which uses child_process
const { GitResolver } = await import("../../src/reflection/git-resolver.js");

describe("GitResolver", () => {
  let resolver: GitResolver;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    resolver = new GitResolver({
      cacheEnabled: true,
      cacheTTL: 5000, // 5 seconds for tests
      gitRepoPath: "/test/repo",
    });
  });

  describe("resolveRef", () => {
    it("should return full SHA as-is", async () => {
      const fullSha = "a1b2c3d4e5f6789012345678901234567890abcd";
      const result = await resolver.resolveRef(fullSha);
      expect(result).toBe(fullSha);
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it("should resolve HEAD to full SHA", async () => {
      const expectedSha = "f5e4d3c2b1a0987654321098765432109876543";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "HEAD") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const result = await resolver.resolveRef("HEAD");
      expect(result).toBe(expectedSha);
      expect(child_process.spawn).toHaveBeenCalledWith("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: "/test/repo",
      });
    });

    it("should resolve branch names", async () => {
      const expectedSha = "b2c3d4e5f6789012345678901234567890abcde";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "main") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const result = await resolver.resolveRef("main");
      expect(result).toBe(expectedSha);
    });

    it("should resolve short SHAs", async () => {
      const shortSha = "a1b2c3d";
      const fullSha = "a1b2c3d4e5f6789012345678901234567890abcd";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === shortSha) {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: fullSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const result = await resolver.resolveRef(shortSha);
      expect(result).toBe(fullSha);
    });

    it("should resolve tags", async () => {
      const expectedSha = "c3d4e5f6789012345678901234567890abcdef0";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "v1.2.3") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const result = await resolver.resolveRef("v1.2.3");
      expect(result).toBe(expectedSha);
    });

    it("should cache resolved refs", async () => {
      const expectedSha = "d4e5f6789012345678901234567890abcdef012";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "develop") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      // First call
      const result1 = await resolver.resolveRef("develop");
      expect(result1).toBe(expectedSha);
      expect(child_process.spawn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      jest.clearAllMocks();
      const result2 = await resolver.resolveRef("develop");
      expect(result2).toBe(expectedSha);
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it("should reject invalid ref formats", async () => {
      await expect(resolver.resolveRef("../etc/passwd")).rejects.toThrow(
        "Invalid git reference format"
      );
      await expect(resolver.resolveRef("../../.git/config")).rejects.toThrow(
        "Invalid git reference format"
      );
      await expect(resolver.resolveRef("a".repeat(256))).rejects.toThrow(
        "Invalid git reference format"
      );
    });

    it("should handle ambiguous refs", async () => {
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "abc") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stderr: "error: short SHA1 abc is ambiguous",
            exitCode: 1 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      await expect(resolver.resolveRef("abc")).rejects.toThrow(
        "Ambiguous git reference 'abc'. Please use a longer SHA or more specific ref."
      );
    });

    it("should handle non-existent refs", async () => {
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "nonexistent") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stderr: "fatal: ambiguous argument 'nonexistent': unknown revision",
            exitCode: 1 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      await expect(resolver.resolveRef("nonexistent")).rejects.toThrow(
        "Failed to resolve git reference 'nonexistent'"
      );
    });
  });

  describe("resolveRefs", () => {
    it("should batch resolve multiple refs", async () => {
      const refs = ["HEAD", "main", "a1b2c3d"];
      const shas = [
        "e5f6789012345678901234567890abcdef012345",
        "f6789012345678901234567890abcdef01234567",
        "a1b2c3d4e5f6789012345678901234567890abcd",
      ];

      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          if (ref === "HEAD") {
            return createMockGitProcess({ command: "rev-parse", stdout: shas[0] }) as any;
          } else if (ref === "main") {
            return createMockGitProcess({ command: "rev-parse", stdout: shas[1] }) as any;
          } else if (ref === "a1b2c3d") {
            return createMockGitProcess({ command: "rev-parse", stdout: shas[2] }) as any;
          }
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const results = await resolver.resolveRefs(refs);
      expect(results.get("HEAD")).toBe(shas[0]);
      expect(results.get("main")).toBe(shas[1]);
      expect(results.get("a1b2c3d")).toBe(shas[2]);
    });

    it("should handle errors in batch resolution", async () => {
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          if (ref === "valid") {
            return createMockGitProcess({ 
              command: "rev-parse", 
              stdout: "789012345678901234567890abcdef0123456789" 
            }) as any;
          } else if (ref === "invalid") {
            return createMockGitProcess({ 
              command: "rev-parse", 
              stderr: "fatal: unknown revision",
              exitCode: 1 
            }) as any;
          }
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      const results = await resolver.resolveRefs(["valid", "invalid"]);
      expect(results.get("valid")).toBe("789012345678901234567890abcdef0123456789");
      expect(results.get("invalid")).toMatch(/^ERROR:/);
    });
  });

  describe("validation helpers", () => {
    it("should validate ref formats correctly", () => {
      // Valid refs
      expect(resolver.isValidRef("HEAD")).toBe(true);
      expect(resolver.isValidRef("main")).toBe(true);
      expect(resolver.isValidRef("feature/my-branch")).toBe(true);
      expect(resolver.isValidRef("v1.2.3")).toBe(true);
      expect(resolver.isValidRef("a1b2c3d")).toBe(true);
      expect(resolver.isValidRef("refs/heads/main")).toBe(true);
      expect(resolver.isValidRef("@{-1}")).toBe(true);

      // Invalid refs
      expect(resolver.isValidRef("../etc/passwd")).toBe(false);
      expect(resolver.isValidRef("/.git/config")).toBe(false);
      expect(resolver.isValidRef("a".repeat(256))).toBe(false);
      expect(resolver.isValidRef("ref with spaces")).toBe(false);
      expect(resolver.isValidRef("ref|with|pipes")).toBe(false);
    });

    it("should identify full SHAs correctly", () => {
      expect(resolver.isFullSha("a1b2c3d4e5f6789012345678901234567890abcd")).toBe(true);
      expect(resolver.isFullSha("0123456789abcdef0123456789abcdef01234567")).toBe(true);
      
      expect(resolver.isFullSha("a1b2c3d")).toBe(false);
      expect(resolver.isFullSha("HEAD")).toBe(false);
      expect(resolver.isFullSha("a1b2c3d4e5f6789012345678901234567890abcZ")).toBe(false);
      expect(resolver.isFullSha("a1b2c3d4e5f6789012345678901234567890abc")).toBe(false);
    });
  });

  describe("cache management", () => {
    it("should clear cache on demand", async () => {
      const expectedSha = "890abcdef0123456789012345678901234567890";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "cached-ref") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      // First call
      await resolver.resolveRef("cached-ref");
      expect(child_process.spawn).toHaveBeenCalledTimes(1);

      // Clear cache
      resolver.clearCache();
      jest.clearAllMocks();

      // Should call git again
      await resolver.resolveRef("cached-ref");
      expect(child_process.spawn).toHaveBeenCalledTimes(1);
    });

    it("should respect cache TTL", async () => {
      const resolver = new GitResolver({
        cacheEnabled: true,
        cacheTTL: 100, // 100ms for testing
        gitRepoPath: "/test/repo",
      });

      const expectedSha = "bcdef0123456789012345678901234567890abcd";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "ttl-test") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      // First call
      await resolver.resolveRef("ttl-test");
      expect(child_process.spawn).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      jest.clearAllMocks();

      // Should call git again
      await resolver.resolveRef("ttl-test");
      expect(child_process.spawn).toHaveBeenCalledTimes(1);
    });

    it("should work with cache disabled", async () => {
      const resolver = new GitResolver({
        cacheEnabled: false,
        gitRepoPath: "/test/repo",
      });

      const expectedSha = "cdef0123456789012345678901234567890abcde";
      (child_process.spawn as jest.Mock).mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify" && args[2] === "no-cache") {
          return createMockGitProcess({ 
            command: "rev-parse", 
            stdout: expectedSha 
          }) as any;
        }
        return createMockGitProcess({ command: cmd, exitCode: 1, stderr: "Command not mocked" }) as any;
      });

      // Multiple calls should all hit git
      await resolver.resolveRef("no-cache");
      await resolver.resolveRef("no-cache");
      expect(child_process.spawn).toHaveBeenCalledTimes(2);
    });
  });
});