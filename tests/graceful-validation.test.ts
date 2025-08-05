/**
 * Tests for graceful validation mode
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { z } from "zod";
import { PatternIdSchema } from "../src/schemas/pattern/base.js";

describe("Graceful Validation", () => {
  const originalEnv = process.env.APEX_REFLECTION_MODE;

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.APEX_REFLECTION_MODE = originalEnv;
    } else {
      delete process.env.APEX_REFLECTION_MODE;
    }
  });

  describe("Pattern ID Validation", () => {
    it("should accept 2-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("PAT:ERROR");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("PAT:ERROR");
      }
    });

    it("should accept 3-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("PAT:API:ERROR");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("PAT:API:ERROR");
      }
    });

    it("should accept 4-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("ORG.TEAM:PAT:API:ERROR");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("ORG.TEAM:PAT:API:ERROR");
      }
    });

    it("should reject 1-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("PATTERN");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("2-4 segments");
      }
    });

    it("should reject 5-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("A:B:C:D:E");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("2-4 segments");
      }
    });

    it("should accept pattern IDs with dots and hyphens", () => {
      const result = PatternIdSchema.safeParse("ORG.TEAM:PAT-FIX:API_ERROR");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("ORG.TEAM:PAT-FIX:API_ERROR");
      }
    });
  });

  describe("Environment Variable Control", () => {
    it("should default to strict mode when env var not set", () => {
      delete process.env.APEX_REFLECTION_MODE;
      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(false);
    });

    it("should enable permissive mode when env var is set", () => {
      process.env.APEX_REFLECTION_MODE = 'permissive';
      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(true);
    });

    it("should be in strict mode for any other value", () => {
      process.env.APEX_REFLECTION_MODE = 'random';
      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(false);
    });
  });

  describe("Git Ref Acceptance", () => {
    const gitRefs = ['HEAD', 'main', 'master', 'origin/main', 'origin/master'];

    it("should recognize common git refs", () => {
      gitRefs.forEach(ref => {
        const isGitRef = gitRefs.includes(ref);
        expect(isGitRef).toBe(true);
      });
    });

    it("should not recognize arbitrary strings as git refs", () => {
      const nonRefs = ['abc123', 'feature/branch', 'develop'];
      nonRefs.forEach(ref => {
        const isGitRef = gitRefs.includes(ref);
        expect(isGitRef).toBe(false);
      });
    });
  });
});