/**
 * Tests for evidence validator
 * [PAT:TEST:BEHAVIOR_OVER_INTERNALS] ★★★☆☆ (3 uses) - Test API behavior
 */

import { vi } from "vitest";
import { createMockGitProcess } from "../helpers/git-mock.js";

// Mock child_process before ANY other imports
vi.unstable_mockModule("child_process", () => ({
  spawn: vi.fn(),
}));

// Import child_process first to get the mocked version
const child_process = await import("child_process");

// [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆ - Use dynamic imports after mock setup
// Now import modules that use child_process - MUST be dynamic imports
const { EvidenceValidator } = await import("../../src/reflection/validator.js");
const { PatternRepository } = await import("../../src/storage/repository.js");
const { ReflectRequest, ValidationErrorCode } = await import(
  "../../src/reflection/types.js"
);
const { GitResolver } = await import("../../src/reflection/git-resolver.js");

describe("EvidenceValidator", () => {
  let validator: EvidenceValidator;
  let mockRepository: PatternRepository;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

     // Ensure GitResolver uses the mocked spawn implementation for these tests
     GitResolver.setSpawnImplementation(
       child_process.spawn as unknown as typeof import("child_process").spawn,
     );

    // Create mock repository
    mockRepository = {
      get: vi
        .fn()
        .mockResolvedValue({ id: "TEST:PATTERN", trust_score: 0.8 }),
      getByIdOrAlias: vi
        .fn()
        .mockResolvedValue({ id: "TEST:PATTERN", trust_score: 0.8 }), // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆
    } as any;

    validator = new EvidenceValidator(mockRepository, {
      allowedRepoUrls: ["https://github.com/test-org/"],
      gitRepoPath: "/test/repo",
      cacheEnabled: false, // Disable cache for tests
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    GitResolver.resetSpawnImplementation();
  });

  describe("validateRequest", () => {
    it("should validate a valid request", async () => {
      // Mock git command for commit validation
      // git cat-file -e returns empty stdout, but validator checks for truthy value
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "cat-file") {
            return createMockGitProcess({
              command: "cat-file",
              exitCode: 0,
              stdout: "exists",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "TEST:PATTERN",
              evidence: [
                {
                  kind: "commit",
                  sha: "a".repeat(40),
                },
              ],
            },
          ],
          trust_updates: [
            {
              pattern_id: "TEST:PATTERN",
              delta: { alpha: 1, beta: 0 },
            },
          ],
        },
        options: {},
      };

      const result = await validator.validateRequest(request);

      if (!result.valid) {
        console.log("Validation failed:", result);
        console.log(
          "Spawn calls:",
          (child_process.spawn as vi.Mock).mock.calls,
        );
      }
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing patterns", async () => {
      (mockRepository.get as vi.Mock).mockResolvedValue(null);
      (mockRepository.getByIdOrAlias as vi.Mock).mockResolvedValue(null); // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆

      const originalMode = process.env.APEX_REFLECTION_MODE;
      process.env.APEX_REFLECTION_MODE = "strict";

      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [
            {
              pattern_id: "MISSING:PATTERN",
              evidence: [],
            },
          ],
          trust_updates: [],
        },
        options: {},
      };

      const result = await validator.validateRequest(request);

      process.env.APEX_REFLECTION_MODE = originalMode;

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.PATTERN_NOT_FOUND);
    });

    it("should detect duplicate trust updates", async () => {
      const request: ReflectRequest = {
        task: { id: "TASK-123", title: "Test task" },
        outcome: "success",
        claims: {
          patterns_used: [],
          trust_updates: [
            { pattern_id: "TEST:PATTERN", delta: { alpha: 1, beta: 0 } },
            { pattern_id: "TEST:PATTERN", delta: { alpha: 1, beta: 0 } },
          ],
        },
        options: {},
      };

      const result = await validator.validateRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(
        ValidationErrorCode.DUPLICATE_TRUST_UPDATE,
      );
    });
  });

  describe("validateEvidence", () => {
    it("should validate commit evidence", async () => {
      // git cat-file -e returns empty stdout, but validator checks for truthy value
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "cat-file") {
            return createMockGitProcess({
              command: "cat-file",
              exitCode: 0,
              stdout: "exists",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "commit",
        sha: "a".repeat(40),
      });

      expect(result.valid).toBe(true);
      expect(child_process.spawn).toHaveBeenCalledWith(
        "git",
        ["cat-file", "-e", "a".repeat(40)],
        expect.any(Object),
      );
    });

    it("should reject invalid SHA format", async () => {
      const result = await validator.validateEvidence({
        kind: "commit",
        sha: "invalid-sha",
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.MALFORMED_EVIDENCE);
    });

    it("should validate PR evidence", async () => {
      const result = await validator.validateEvidence({
        kind: "pr",
        number: 123,
        repo: "https://github.com/test-org/test-repo",
      });

      expect(result.valid).toBe(true);
    });

    it("should reject PR from disallowed repo", async () => {
      const result = await validator.validateEvidence({
        kind: "pr",
        number: 123,
        repo: "https://github.com/other-org/repo",
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.PR_NOT_FOUND);
    });

    it("should validate git_lines evidence", async () => {
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: "line1\nline2\nline3\n",
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 1,
        end: 3,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject git_lines with invalid line range", async () => {
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: "line1\nline2\n",
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 1,
        end: 5, // Beyond file length
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.LINE_RANGE_NOT_FOUND);
    });

    it("should validate git_lines with snippet hash - Stage 1 success", async () => {
      const fileContent = "function test() {\n  return true;\n}\n";

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: fileContent,
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      // Generate correct hash for the snippet
      const { SnippetMatcher } = await import(
        "../../src/reflection/snippet-matcher.js"
      );
      const matcher = new SnippetMatcher();
      const snippet = "function test() {\n  return true;\n}";
      const snippetHash = matcher.generateSnippetHash(snippet);

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 1,
        end: 3,
        snippet_hash: snippetHash,
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    it("should fallback to Stage 2 validation when lines are invalid", async () => {
      const fileContent =
        "line1\nline2\nfunction test() {\n  return true;\n}\nline6\n";

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: fileContent,
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      // Import SnippetMatcher to generate correct hash
      const { SnippetMatcher } = await import(
        "../../src/reflection/snippet-matcher.js"
      );
      const matcher = new SnippetMatcher();
      const snippet = "function test() {\n  return true;\n}";
      const snippetHash = matcher.generateSnippetHash(snippet);

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 1, // Wrong line numbers
        end: 3,
        snippet_hash: snippetHash,
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.message).toContain("Found snippet at lines 3-5");
    });

    it("should handle multiple snippet matches", async () => {
      const fileContent =
        "function test() {\n  return true;\n}\n\nfunction test() {\n  return true;\n}\n";

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: fileContent,
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const { SnippetMatcher } = await import(
        "../../src/reflection/snippet-matcher.js"
      );
      const matcher = new SnippetMatcher();
      const snippet = "function test() {\n  return true;\n}";
      const snippetHash = matcher.generateSnippetHash(snippet);

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 10, // Invalid line numbers
        end: 12,
        snippet_hash: snippetHash,
      });

      expect(result.valid).toBe(true);
      expect(result.confidence).toBe(0.5); // Lower confidence for multiple matches
      expect(result.message).toContain("Found snippet at 2 locations");
    });

    it("should fail when snippet not found", async () => {
      const fileContent = "function other() {\n  return false;\n}\n";

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: fileContent,
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "a".repeat(40),
        start: 1,
        end: 3,
        snippet_hash:
          "nonexistenthash123456789012345678901234567890123456789012345678",
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe(ValidationErrorCode.LINE_RANGE_NOT_FOUND);
      expect(result.message).toContain("Snippet not found in file");
    });
  });

  describe("caching", () => {
    it("should cache successful validations", async () => {
      const validatorWithCache = new EvidenceValidator(mockRepository, {
        cacheEnabled: true,
        cacheTTL: 1000,
      });

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "cat-file") {
            return createMockGitProcess({
              command: "cat-file",
              exitCode: 0,
              stdout: "exists",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const evidence = {
        kind: "commit" as const,
        sha: "a".repeat(40),
      };

      // First call
      await validatorWithCache.validateEvidence(evidence);
      expect(child_process.spawn).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await validatorWithCache.validateEvidence(evidence);
      expect(child_process.spawn).toHaveBeenCalledTimes(1);
    });

    it("should clear cache on demand", async () => {
      const validatorWithCache = new EvidenceValidator(mockRepository, {
        cacheEnabled: true,
      });

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "cat-file") {
            return createMockGitProcess({
              command: "cat-file",
              exitCode: 0,
              stdout: "exists",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const evidence = {
        kind: "commit" as const,
        sha: "a".repeat(40),
      };

      await validatorWithCache.validateEvidence(evidence);
      validatorWithCache.clearCache();
      await validatorWithCache.validateEvidence(evidence);

      expect(child_process.spawn).toHaveBeenCalledTimes(2);
    });
  });

  describe("flexible git refs", () => {
    it("should validate various git ref formats", async () => {
      // Mock git rev-parse for ref resolution
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (
            cmd === "git" &&
            args[0] === "rev-parse" &&
            args[1] === "--verify"
          ) {
            const ref = args[2];
            // Mock different ref types
            if (ref === "HEAD") {
              return createMockGitProcess({
                command: "rev-parse",
                stdout: "f".repeat(40),
              }) as any;
            } else if (ref === "main") {
              return createMockGitProcess({
                command: "rev-parse",
                stdout: "e".repeat(40),
              }) as any;
            } else if (ref === "v1.2.3") {
              return createMockGitProcess({
                command: "rev-parse",
                stdout: "d".repeat(40),
              }) as any;
            } else if (ref === "abc1234") {
              return createMockGitProcess({
                command: "rev-parse",
                stdout: "abc1234" + "0".repeat(33),
              }) as any;
            }
          } else if (cmd === "git" && args[0] === "cat-file") {
            return createMockGitProcess({
              command: "cat-file",
              exitCode: 0,
              stdout: "exists",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      // Test HEAD
      let result = await validator.validateEvidence({
        kind: "commit",
        sha: "HEAD",
      });
      expect(result.valid).toBe(true);

      // Test branch name
      result = await validator.validateEvidence({
        kind: "commit",
        sha: "main",
      });
      expect(result.valid).toBe(true);

      // Test tag
      result = await validator.validateEvidence({
        kind: "commit",
        sha: "v1.2.3",
      });
      expect(result.valid).toBe(true);

      // Test short SHA
      result = await validator.validateEvidence({
        kind: "commit",
        sha: "abc1234",
      });
      expect(result.valid).toBe(true);
    });

    it("should validate git_lines with flexible refs", async () => {
      const fileContent = "line1\nline2\nline3\n";

      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git") {
            if (
              args[0] === "rev-parse" &&
              args[1] === "--verify" &&
              args[2] === "main"
            ) {
              return createMockGitProcess({
                command: "rev-parse",
                stdout: "b".repeat(40),
              }) as any;
            } else if (args[0] === "cat-file") {
              return createMockGitProcess({
                command: "cat-file",
                exitCode: 0,
                stdout: "exists",
              }) as any;
            } else if (args[0] === "show") {
              return createMockGitProcess({
                command: "show",
                stdout: fileContent,
              }) as any;
            }
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "git_lines",
        file: "test.ts",
        sha: "main", // Using branch name instead of SHA
        start: 1,
        end: 3,
      });

      expect(result.valid).toBe(true);
      expect(child_process.spawn).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "--verify", "main"],
        expect.any(Object),
      );
    });

    it("should handle ambiguous refs", async () => {
      (child_process.spawn as vi.Mock).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "rev-parse") {
            return createMockGitProcess({
              command: "rev-parse",
              exitCode: 1,
              stderr: "error: short SHA1 abc is ambiguous",
            }) as any;
          }
          return createMockGitProcess({
            command: cmd,
            exitCode: 1,
            stderr: "Command not mocked",
          }) as any;
        },
      );

      const result = await validator.validateEvidence({
        kind: "commit",
        sha: "abc",
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("Ambiguous git reference");
    });

    it("should reject security-sensitive refs", async () => {
      // GitResolver should reject these before calling git
      const dangerousRefs = [
        "../etc/passwd",
        "../../.git/config",
        "ref/../../../etc",
      ];

      for (const ref of dangerousRefs) {
        const result = await validator.validateEvidence({
          kind: "commit",
          sha: ref,
        });
        expect(result.valid).toBe(false);
        expect(result.message).toContain("Invalid git reference format");
      }

      // Git should never be called for these
      expect(child_process.spawn).not.toHaveBeenCalled();
    });
  });
});
