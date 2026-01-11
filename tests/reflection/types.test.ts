import { describe, test, expect } from "vitest";
import { ReflectRequestSchema } from "../../src/reflection/types.js";

describe("ReflectRequestSchema", () => {
  test("preserves tags on new patterns", () => {
    const evidenceRef = { kind: "commit", sha: "abcdef1" } as const;

    const request = {
      task: {
        id: "task-123",
        title: "Test task",
      },
      outcome: "success",
      claims: {
        patterns_used: [
          {
            pattern_id: "TEST:PATTERN:USED",
            evidence: [evidenceRef],
          },
        ],
        new_patterns: [
          {
            title: "Tagged pattern",
            summary: "Pattern includes tags",
            tags: ["auth", "security"],
            snippets: [
              {
                snippet_id: "snippet-1",
                source_ref: evidenceRef,
              },
            ],
            evidence: [evidenceRef],
          },
        ],
        trust_updates: [
          {
            pattern_id: "TEST:PATTERN:USED",
            delta: { alpha: 1, beta: 0 },
          },
        ],
      },
    };

    const parsed = ReflectRequestSchema.parse(request);
    const tags = parsed.claims?.new_patterns?.[0]?.tags;
    expect(tags).toEqual(["auth", "security"]);
  });
});
