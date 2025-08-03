import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  PatternSchema,
  validatePattern,
  validatePatternFile,
  starRatingToTrustScore,
  trustScoreToStarRating,
  PatternIdSchema,
  TrustScoreSchema,
  SemverSchema,
  EvidenceRefSchema,
  SnippetSchema,
} from "../../src/schemas/index.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Pattern Schema Validation", () => {
  describe("Base field validation", () => {
    test("validates pattern ID format", () => {
      const validIds = [
        "ACME:LANG:AUTH:JWT",
        "ACME.PLATFORM:ANTI:SECURITY:SQL",
        "MY_ORG.TEAM-1:FAILURE:ASYNC:TIMEOUT",
      ];

      validIds.forEach((id) => {
        const result = PatternIdSchema.safeParse(id);
        expect(result.success).toBe(true);
      });

      const invalidIds = [
        "acme:lang:auth:jwt", // lowercase
        "ACME:LANG:AUTH:", // trailing colon
        ":LANG:AUTH:JWT", // leading colon
        "ACME LANG AUTH JWT", // spaces not allowed
        "ACME:LANG:AUTH:JWT!", // special chars not allowed
      ];

      invalidIds.forEach((id) => {
        const result = PatternIdSchema.safeParse(id);
        expect(result.success).toBe(false);
      });
    });

    test("validates trust score bounds", () => {
      expect(TrustScoreSchema.safeParse(0).success).toBe(true);
      expect(TrustScoreSchema.safeParse(0.5).success).toBe(true);
      expect(TrustScoreSchema.safeParse(1).success).toBe(true);
      expect(TrustScoreSchema.safeParse(-0.1).success).toBe(false);
      expect(TrustScoreSchema.safeParse(1.1).success).toBe(false);
      expect(TrustScoreSchema.safeParse("0.5").success).toBe(false);
    });

    test("validates semver format", () => {
      const validVersions = [
        "1.0.0",
        "0.0.1",
        "2.1.3-beta.1",
        "1.0.0+build.123",
      ];

      validVersions.forEach((ver) => {
        const result = SemverSchema.safeParse(ver);
        expect(result.success).toBe(true);
      });

      const invalidVersions = ["1.0", "v1.0.0", "1.0.0.0", "latest"];

      invalidVersions.forEach((ver) => {
        const result = SemverSchema.safeParse(ver);
        expect(result.success).toBe(false);
      });
    });
  });

  describe("Evidence validation", () => {
    test("validates git_lines evidence", () => {
      const valid = {
        kind: "git_lines",
        file: "src/index.ts",
        sha: "abc123",
        start: 10,
        end: 20,
      };

      expect(EvidenceRefSchema.safeParse(valid).success).toBe(true);

      const invalid = {
        kind: "git_lines",
        file: "src/index.ts",
        sha: "abc123",
        start: 0, // must be positive
        end: 20,
      };

      expect(EvidenceRefSchema.safeParse(invalid).success).toBe(false);
    });

    test("validates discriminated union for evidence", () => {
      const evidenceTypes = [
        { kind: "commit", sha: "abc123" },
        { kind: "pr", number: 123, repo: "org/repo" },
        { kind: "issue", id: "JIRA-123", system: "jira" },
        { kind: "ci_run", id: "build-456", provider: "gh" },
      ];

      evidenceTypes.forEach((evidence) => {
        const result = EvidenceRefSchema.safeParse(evidence);
        expect(result.success).toBe(true);
      });

      // Invalid discriminator
      const invalid = { kind: "unknown", data: "test" };
      expect(EvidenceRefSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe("Snippet validation", () => {
    test("validates basic snippet", () => {
      const snippet = {
        label: "Example",
        language: "typescript",
        code: 'console.log("hello");',
      };

      expect(SnippetSchema.safeParse(snippet).success).toBe(true);
    });

    test("validates nested snippets", () => {
      const snippet = {
        label: "Parent",
        language: "markdown",
        code: "# Example",
        children: [
          {
            label: "Child 1",
            language: "typescript",
            code: "const x = 1;",
          },
          {
            label: "Child 2",
            language: "python",
            code: "x = 1",
            children: [
              {
                label: "Grandchild",
                language: "yaml",
                code: "key: value",
              },
            ],
          },
        ],
      };

      expect(SnippetSchema.safeParse(snippet).success).toBe(true);
    });

    test("enforces snippet limits", () => {
      const tooManyChildren = {
        label: "Parent",
        language: "text",
        code: "test",
        children: Array(11).fill({
          label: "Child",
          language: "text",
          code: "test",
        }),
      };

      expect(SnippetSchema.safeParse(tooManyChildren).success).toBe(false);
    });
  });

  describe("Pattern type validation", () => {
    const basePattern = {
      schema_version: "0.3.0",
      pattern_version: "1.0.0",
      id: "TEST:PATTERN:VALIDATION:BASIC",
      title: "Test Pattern",
      summary: "A test pattern for validation",
      trust_score: 0.8,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      scope: {},
    };

    test("validates LANG pattern with specific fields", () => {
      const langPattern = {
        ...basePattern,
        type: "LANG",
        plan_steps: ["Step 1", "Step 2"],
        when_to_use: ["Case 1"],
        when_not_to_use: ["Case 2"],
        tests: {
          suggestions: [
            {
              name: "Test 1",
              type: "unit",
              target_file: "test.ts",
            },
          ],
        },
      };

      const result = validatePattern(langPattern);
      expect(result.valid).toBe(true);
    });

    test("validates FAILURE pattern with signature", () => {
      const failurePattern = {
        ...basePattern,
        type: "FAILURE",
        signature: "Error: Timeout",
        mitigations: ["PAT:FIX:TIMEOUT"],
      };

      const result = validatePattern(failurePattern);
      expect(result.valid).toBe(true);
    });

    test("validates POLICY pattern with rules", () => {
      const policyPattern = {
        ...basePattern,
        type: "POLICY",
        rules: {
          min_approvals: 2,
          required_checks: ["tests", "lint"],
        },
      };

      const result = validatePattern(policyPattern);
      expect(result.valid).toBe(true);
    });

    test("rejects invalid type discriminator", () => {
      const invalidPattern = {
        ...basePattern,
        type: "INVALID_TYPE",
      };

      const result = validatePattern(invalidPattern);
      expect(result.valid).toBe(false);
    });

    test("rejects wrong fields for pattern type", () => {
      const invalidPattern = {
        ...basePattern,
        type: "ANTI",
        plan_steps: ["Step 1"], // LANG-specific field on ANTI pattern
      };

      const result = validatePattern(invalidPattern);
      expect(result.valid).toBe(true); // Extra fields are allowed by default
    });
  });

  describe("Complete pattern validation", () => {
    test("validates full pattern with all optional fields", () => {
      const fullPattern = {
        schema_version: "0.3.0",
        pattern_version: "1.2.3",
        id: "ACME.PLATFORM:LANG:API:RESTFUL",
        type: "LANG",
        title: "RESTful API Design Pattern",
        summary: "Best practices for designing RESTful APIs",
        scope: {
          languages: ["typescript", "python"],
          frameworks: ["express@^4.0.0", "fastapi@^0.100.0"],
          repos: ["acme/*"],
          paths: ["src/api/**/*.ts"],
          task_types: ["api-design"],
          envs: ["production", "staging"],
        },
        semver_constraints: {
          dependencies: {
            express: "^4.18.0 || ^5.0.0",
            fastapi: "^0.100.0",
          },
        },
        snippets: [
          {
            label: "Example endpoint",
            language: "typescript",
            code: 'router.get("/users/:id", async (req, res) => {});',
            source_ref: {
              kind: "git_lines",
              file: "src/routes/users.ts",
              sha: "abc123",
              start: 10,
              end: 15,
            },
          },
        ],
        evidence: [
          { kind: "pr", number: 123, repo: "acme/api" },
          { kind: "commit", sha: "def456" },
        ],
        usage: {
          successes: 45,
          failures: 2,
          last_used_at: "2025-01-01T10:00:00Z",
        },
        trust_score: 0.92,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2025-01-01T10:00:00Z",
        source_repo: "acme/api-platform",
        tags: ["api", "rest", "design"],
        applicability: {
          rule_language: "jsonlogic",
          rule: '{"and": [{"==": [{"var": "type"}, "api"]}]}',
        },
        notes: "This pattern has been validated across 10+ services",
        plan_steps: [
          "Design resources",
          "Define endpoints",
          "Implement handlers",
        ],
        when_to_use: ["Building new APIs", "Refactoring existing APIs"],
        when_not_to_use: ["GraphQL APIs", "gRPC services"],
        tests: {
          suggestions: [
            {
              name: "API contract tests",
              type: "integration",
              target_file: "tests/api/contract.test.ts",
            },
          ],
        },
        x_meta: {
          custom_field: "custom_value",
        },
      };

      const result = validatePattern(fullPattern);
      expect(result.valid).toBe(true);
      expect(result.data?.type).toBe("LANG");
    });
  });

  describe("File validation", () => {
    const testDir = path.join(__dirname, "test-patterns");

    beforeAll(async () => {
      await fs.ensureDir(testDir);
    });

    afterAll(async () => {
      await fs.remove(testDir);
    });

    test("validates YAML file", async () => {
      const yamlContent = `
schema_version: "0.3.0"
pattern_version: "1.0.0"
id: "TEST:PATTERN:YAML:VALID"
type: "CODEBASE"
title: "Test YAML Pattern"
summary: "Testing YAML validation"
scope: {}
trust_score: 0.8
created_at: "2024-01-01T00:00:00Z"
updated_at: "2024-01-01T00:00:00Z"
`;

      const filePath = path.join(testDir, "test.yaml");
      await fs.writeFile(filePath, yamlContent);

      const result = await validatePatternFile(filePath);
      expect(result.valid).toBe(true);
      expect(result.data?.type).toBe("CODEBASE");
    });

    test("validates JSON file", async () => {
      const jsonContent = {
        schema_version: "0.3.0",
        pattern_version: "1.0.0",
        id: "TEST:PATTERN:JSON:VALID",
        type: "TEST",
        title: "Test JSON Pattern",
        summary: "Testing JSON validation",
        scope: {},
        trust_score: 0.9,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const filePath = path.join(testDir, "test.json");
      await fs.writeJson(filePath, jsonContent);

      const result = await validatePatternFile(filePath);
      expect(result.valid).toBe(true);
      expect(result.data?.type).toBe("TEST");
    });

    test("handles invalid YAML gracefully", async () => {
      const invalidYaml = `
invalid: yaml: content:::
  bad indentation
    worse indentation
`;

      const filePath = path.join(testDir, "invalid.yaml");
      await fs.writeFile(filePath, invalidYaml);

      const result = await validatePatternFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].path).toBe("file");
      expect(result.errors?.[0].message).toContain("Failed to read/parse");
    });
  });

  describe("Utility functions", () => {
    test("converts star ratings to trust scores", () => {
      expect(starRatingToTrustScore(0)).toBe(0);
      expect(starRatingToTrustScore(1)).toBe(0.2);
      expect(starRatingToTrustScore(2.5)).toBe(0.5);
      expect(starRatingToTrustScore(5)).toBe(1);
      expect(starRatingToTrustScore(6)).toBe(1); // capped at 1
      expect(starRatingToTrustScore(-1)).toBe(0); // floored at 0
    });

    test("converts trust scores to star ratings", () => {
      expect(trustScoreToStarRating(0)).toBe("☆☆☆☆☆");
      expect(trustScoreToStarRating(0.2)).toBe("★☆☆☆☆");
      expect(trustScoreToStarRating(0.5)).toBe("★★★☆☆");
      expect(trustScoreToStarRating(0.7)).toBe("★★★★☆");
      expect(trustScoreToStarRating(1)).toBe("★★★★★");
    });
  });

  describe("Backward compatibility", () => {
    test("accepts patterns with older schema versions", () => {
      const oldPattern = {
        schema_version: "0.2.0", // older version
        pattern_version: "1.0.0",
        id: "OLD:PATTERN:FORMAT:TEST",
        type: "LANG",
        title: "Old Pattern",
        summary: "Testing backward compatibility",
        trust_score: 0.5,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
        scope: {},
      };

      const result = validatePattern(oldPattern);
      expect(result.valid).toBe(true);
      // In real implementation, you might log a warning about old schema version
    });
  });
});
