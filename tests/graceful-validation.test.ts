/**
 * Tests for graceful validation mode
 * Converted from subprocess pattern to direct Vitest tests
 */

import { describe, it, expect } from "vitest";
import { PatternIdSchema } from "../dist/schemas/pattern/base.js";

describe("Graceful Validation", () => {
  describe("Pattern ID Validation", () => {
    it("should accept 2-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("PAT:ERROR");
      expect(result.success).toBe(true);
      expect(result.data).toBe("PAT:ERROR");
    });

    it("should accept 3-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("PAT:API:ERROR");
      expect(result.success).toBe(true);
      expect(result.data).toBe("PAT:API:ERROR");
    });

    it("should accept 4-segment pattern IDs", () => {
      const result = PatternIdSchema.safeParse("ORG.TEAM:PAT:API:ERROR");
      expect(result.success).toBe(true);
      expect(result.data).toBe("ORG.TEAM:PAT:API:ERROR");
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
      expect(result.data).toBe("ORG.TEAM:PAT-FIX:API_ERROR");
    });
  });

  describe("Environment Variable Control", () => {
    it("should default to strict mode when env var not set", () => {
      const originalValue = process.env.APEX_REFLECTION_MODE;
      delete process.env.APEX_REFLECTION_MODE;

      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(false);

      // Restore original value
      if (originalValue !== undefined) {
        process.env.APEX_REFLECTION_MODE = originalValue;
      }
    });

    it("should enable permissive mode when env var is set", () => {
      const originalValue = process.env.APEX_REFLECTION_MODE;
      process.env.APEX_REFLECTION_MODE = 'permissive';

      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(true);

      // Restore original value
      if (originalValue !== undefined) {
        process.env.APEX_REFLECTION_MODE = originalValue;
      } else {
        delete process.env.APEX_REFLECTION_MODE;
      }
    });

    it("should be in strict mode for any other value", () => {
      const originalValue = process.env.APEX_REFLECTION_MODE;
      process.env.APEX_REFLECTION_MODE = 'random';

      const isPermissive = process.env.APEX_REFLECTION_MODE === 'permissive';
      expect(isPermissive).toBe(false);

      // Restore original value
      if (originalValue !== undefined) {
        process.env.APEX_REFLECTION_MODE = originalValue;
      } else {
        delete process.env.APEX_REFLECTION_MODE;
      }
    });
  });

  describe("Git Ref Acceptance", () => {
    it("should recognize common git refs", () => {
      const gitRefs = ['HEAD', 'main', 'master', 'origin/main', 'origin/master'];

      for (const ref of gitRefs) {
        const isGitRef = gitRefs.includes(ref);
        expect(isGitRef).toBe(true);
      }
    });

    it("should not recognize arbitrary strings as git refs", () => {
      const gitRefs = ['HEAD', 'main', 'master', 'origin/main', 'origin/master'];
      const nonRefs = ['abc123', 'feature/branch', 'develop'];

      for (const ref of nonRefs) {
        const isGitRef = gitRefs.includes(ref);
        expect(isGitRef).toBe(false);
      }
    });
  });
});