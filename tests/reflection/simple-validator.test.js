/**
 * Simple tests for evidence validator
 */

import { jest } from "@jest/globals";
import { EvidenceValidator } from "../../src/reflection/validator.js";
import { ValidationErrorCode } from "../../src/reflection/types.js";

describe("EvidenceValidator - Simple Tests", () => {
  let validator;
  const mockRepository = {
    get: jest.fn(),
    getByIdOrAlias: jest.fn(), // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆ - Add missing method
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.get.mockResolvedValue({
      id: "TEST:PATTERN",
      trust_score: 0.8,
    });
    // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆ - Configure getByIdOrAlias to match get behavior
    mockRepository.getByIdOrAlias.mockResolvedValue({
      id: "TEST:PATTERN",
      trust_score: 0.8,
    });

    validator = new EvidenceValidator(mockRepository, {
      allowedRepoUrls: ["https://github.com/test-org/"],
      gitRepoPath: "/test/repo",
      cacheEnabled: false,
    });
  });

  describe("validateRequest", () => {
    it("should detect missing patterns", async () => {
      mockRepository.get.mockResolvedValueOnce(null);
      mockRepository.getByIdOrAlias.mockResolvedValueOnce(null); // [FIX:TEST:ES_MODULE_MOCK_ORDER] ★★★☆☆

      const request = {
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

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(ValidationErrorCode.PATTERN_NOT_FOUND);
    });

    it("should detect duplicate trust updates", async () => {
      const request = {
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
  });
});
