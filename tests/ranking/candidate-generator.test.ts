import { describe, test, expect } from "vitest";
import { CandidateGenerator } from "../../src/ranking/candidate-generator.js";
import type { PatternMeta, Signals } from "../../src/ranking/types.js";

describe("CandidateGenerator language scoping", () => {
  test("keeps global patterns when language signals are present", () => {
    const patterns: PatternMeta[] = [
      {
        id: "TEST:GLOBAL",
        type: "LANG",
        scope: {},
      },
      {
        id: "TEST:TYPESCRIPT",
        type: "LANG",
        scope: { languages: ["typescript"] },
      },
      {
        id: "TEST:JAVASCRIPT",
        type: "LANG",
        scope: { languages: ["javascript"] },
      },
    ];

    const generator = new CandidateGenerator(patterns);
    const signals: Signals = {
      paths: [],
      languages: ["typescript"],
      frameworks: [],
    };

    const ids = generator
      .generate(signals, 50)
      .map((index) => patterns[index].id);

    expect(ids).toContain("TEST:GLOBAL");
    expect(ids).toContain("TEST:TYPESCRIPT");
    expect(ids).not.toContain("TEST:JAVASCRIPT");
  });
});
