// [PAT:TEST:STRUCTURE] - Standard test structure with setup/teardown
import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import path from "path";
import fs from "fs-extra";
import os from "os";
import { RepoIdentifier } from "../../src/utils/repo-identifier.js";

// Create manual mock for spawn
const mockSpawn = jest.fn();
jest.doMock("child_process", () => ({
  spawn: mockSpawn,
}));

describe("RepoIdentifier", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `repo-identifier-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
    process.chdir(tempDir);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Restore original cwd
    process.chdir(originalCwd);
    
    // Clean up
    await fs.remove(tempDir);
  });

  describe("getIdentifier", () => {
    it("should handle git SSH URLs correctly", async () => {
      // [PAT:TEST:MOCK] - Mock git command response
      const mockProcess = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === "data") {
              callback(Buffer.from("git@github.com:benredmond/apex.git\n"));
            }
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const identifier = await RepoIdentifier.getIdentifier();
      expect(identifier).toBe("github-benredmond-apex");
      expect(mockSpawn).toHaveBeenCalledWith(
        "git",
        ["config", "--get", "remote.origin.url"],
        expect.objectContaining({ cwd: expect.any(String) })
      );
    });

    it("should handle git HTTPS URLs correctly", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === "data") {
              callback(Buffer.from("https://github.com/user/project.git\n"));
            }
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const identifier = await RepoIdentifier.getIdentifier();
      expect(identifier).toBe("github-user-project");
    });

    it("should handle local git repos without remotes", async () => {
      // Create a .git directory
      await fs.ensureDir(path.join(tempDir, ".git"));

      // Mock git command to fail (no remote)
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(1); // Non-zero exit code
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const identifier = await RepoIdentifier.getIdentifier();
      expect(identifier).toMatch(/^local-[a-f0-9]{8}$/);
    });

    it("should handle non-git projects", async () => {
      // No .git directory, git command fails
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(1);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const identifier = await RepoIdentifier.getIdentifier();
      expect(identifier).toMatch(/^path-[a-f0-9]{8}$/);
    });

    it("should handle git spawn errors gracefully", async () => {
      // Simulate git not being installed
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "error") {
            callback(new Error("spawn git ENOENT"));
          }
          if (event === "close") {
            // Don't call close if error was called
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const identifier = await RepoIdentifier.getIdentifier();
      expect(identifier).toMatch(/^path-[a-f0-9]{8}$/);
    });
  });

  describe("sanitizeGitUrl", () => {
    // Test various URL formats - using private method via the class
    it("should sanitize various git URL formats", async () => {
      const testCases = [
        ["git@github.com:benredmond/apex.git", "github-benredmond-apex"],
        ["https://github.com/benredmond/apex.git", "github-benredmond-apex"],
        ["git@gitlab.com:user/project.git", "gitlab-user-project"],
        ["https://bitbucket.org/team/repo.git", "bitbucket-team-repo"],
        ["git@custom.host.com:org/team/project.git", "custom-host-org-team-project"],
      ];

      for (const [input, expected] of testCases) {
        // Mock the git command to return the test URL
        const mockProcess = {
          stdout: {
            on: jest.fn((event, callback) => {
              if (event === "data") {
                callback(Buffer.from(input));
              }
            }),
          },
          stderr: { on: jest.fn() },
          on: jest.fn((event, callback) => {
            if (event === "close") {
              callback(0);
            }
          }),
        };
        mockSpawn.mockReturnValue(mockProcess as any);

        const identifier = await RepoIdentifier.getIdentifier();
        expect(identifier).toBe(expected);
      }
    });

    it("should prevent command injection attempts", async () => {
      // Test malicious input attempts - should be safely handled
      const maliciousInputs = [
        "git@github.com:user/repo.git; rm -rf /",
        "https://github.com/user/repo.git && echo hacked",
        "git@github.com:user/repo.git`cat /etc/passwd`",
        "git@github.com:user/repo.git$(whoami)",
      ];

      for (const input of maliciousInputs) {
        const mockProcess = {
          stdout: {
            on: jest.fn((event, callback) => {
              if (event === "data") {
                callback(Buffer.from(input));
              }
            }),
          },
          stderr: { on: jest.fn() },
          on: jest.fn((event, callback) => {
            if (event === "close") {
              callback(0);
            }
          }),
        };
        mockSpawn.mockReturnValue(mockProcess as any);

        const identifier = await RepoIdentifier.getIdentifier();
        // Should sanitize to safe format, not execute commands
        expect(identifier).toMatch(/^github-user-repo/);
        expect(identifier).not.toContain(";");
        expect(identifier).not.toContain("&");
        expect(identifier).not.toContain("`");
        expect(identifier).not.toContain("$");
      }
    });
  });

  describe("getDatabasePaths", () => {
    it("should return correct database paths", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === "data") {
              callback(Buffer.from("git@github.com:test/project.git"));
            }
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const paths = await RepoIdentifier.getDatabasePaths();
      
      expect(paths.primary).toMatch(/\.apex\/github-test-project\/patterns\.db$/);
      expect(paths.fallback).toMatch(/\.apex\/global\/patterns\.db$/);
      expect(paths.legacy).toBeUndefined(); // No legacy in temp dir
    });

    it("should detect legacy database locations", async () => {
      // Create a legacy database file
      const legacyPath = path.join(tempDir, ".apex", "patterns.db");
      await fs.ensureDir(path.join(tempDir, ".apex"));
      await fs.writeFile(legacyPath, "test");

      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(1);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const paths = await RepoIdentifier.getDatabasePaths();
      expect(paths.legacy).toBe(legacyPath);
    });
  });

  describe("hashPath consistency", () => {
    it("should generate consistent hashes for the same path", async () => {
      // No git, so it will use path hashing
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === "close") {
            callback(1);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const id1 = await RepoIdentifier.getIdentifier();
      const id2 = await RepoIdentifier.getIdentifier();
      
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^path-[a-f0-9]{8}$/);
    });
  });
});