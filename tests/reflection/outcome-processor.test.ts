/**
 * Tests for outcome-based trust updates
 * [PAT:TEST:ISOLATION] ★★★★★ (89 uses, 98% success)
 */

import { describe, test, expect } from "@jest/globals";
import { OutcomeProcessor } from "../../src/reflection/outcome-processor.js";
import { TrustUpdate, PatternOutcome } from "../../src/reflection/types.js";

describe("OutcomeProcessor", () => {
  describe("processTrustUpdate", () => {
    test("should process delta format (backward compatibility)", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:TEST:MOCK",
        delta: { alpha: 1, beta: 0 }
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:TEST:MOCK",
        delta: { alpha: 1, beta: 0 }
      });
    });

    test("should process outcome format - worked-perfectly", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:TEST:MOCK",
        outcome: "worked-perfectly"
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:TEST:MOCK",
        delta: { alpha: 1.0, beta: 0.0 }
      });
    });

    test("should process outcome format - worked-with-tweaks", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:API:AUTH",
        outcome: "worked-with-tweaks"
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:API:AUTH",
        delta: { alpha: 0.7, beta: 0.3 }
      });
    });

    test("should process outcome format - partial-success", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:DB:QUERY",
        outcome: "partial-success"
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:DB:QUERY",
        delta: { alpha: 0.5, beta: 0.5 }
      });
    });

    test("should process outcome format - failed-minor-issues", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:UI:TOOLTIP",
        outcome: "failed-minor-issues"
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:UI:TOOLTIP",
        delta: { alpha: 0.3, beta: 0.7 }
      });
    });

    test("should process outcome format - failed-completely", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:ERROR:HANDLING",
        outcome: "failed-completely"
      };

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:ERROR:HANDLING",
        delta: { alpha: 0.0, beta: 1.0 }
      });
    });

    test("should throw error if neither delta nor outcome provided", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:TEST:MOCK"
      } as TrustUpdate;

      expect(() => OutcomeProcessor.processTrustUpdate(update)).toThrow(
        "No delta or outcome provided"
      );
    });

    test("should prefer delta over outcome if both provided", () => {
      const update: TrustUpdate = {
        pattern_id: "PAT:TEST:MOCK",
        delta: { alpha: 2, beta: 1 },
        outcome: "worked-perfectly"
      } as TrustUpdate;

      const result = OutcomeProcessor.processTrustUpdate(update);
      
      expect(result).toEqual({
        pattern_id: "PAT:TEST:MOCK",
        delta: { alpha: 2, beta: 1 }
      });
    });
  });

  describe("getOutcomeDescriptions", () => {
    test("should return all outcome descriptions", () => {
      const descriptions = OutcomeProcessor.getOutcomeDescriptions();
      
      expect(descriptions).toEqual({
        "worked-perfectly": "Pattern worked without modification",
        "worked-with-tweaks": "Pattern worked but needed adaptation",
        "partial-success": "Pattern partially helped",
        "failed-minor-issues": "Pattern had minor problems",
        "failed-completely": "Pattern didn't work at all"
      });
    });
  });

  describe("suggestOutcome", () => {
    test("should suggest exact matches", () => {
      expect(OutcomeProcessor.suggestOutcome("worked-perfectly")).toBe("worked-perfectly");
      expect(OutcomeProcessor.suggestOutcome("partial-success")).toBe("partial-success");
    });

    test("should suggest based on partial matches", () => {
      expect(OutcomeProcessor.suggestOutcome("perfect")).toBe("worked-perfectly");
      expect(OutcomeProcessor.suggestOutcome("tweak")).toBe("worked-with-tweaks");
      expect(OutcomeProcessor.suggestOutcome("partial")).toBe("partial-success");
      expect(OutcomeProcessor.suggestOutcome("minor")).toBe("failed-minor-issues");
    });

    test("should suggest based on normalized input", () => {
      expect(OutcomeProcessor.suggestOutcome("worked perfectly")).toBe("worked-perfectly");
      expect(OutcomeProcessor.suggestOutcome("worked_perfectly")).toBe("worked-perfectly");
      expect(OutcomeProcessor.suggestOutcome("WORKED PERFECTLY")).toBe("worked-perfectly");
    });

    test("should suggest based on keywords", () => {
      expect(OutcomeProcessor.suggestOutcome("complete fail")).toBe("failed-completely");
      expect(OutcomeProcessor.suggestOutcome("completely failed")).toBe("failed-completely");
    });

    test("should return null for no match", () => {
      expect(OutcomeProcessor.suggestOutcome("unknown")).toBe(null);
      expect(OutcomeProcessor.suggestOutcome("xyz")).toBe(null);
    });
  });

  describe("getOutcomeDelta", () => {
    test("should return correct delta for each outcome", () => {
      expect(OutcomeProcessor.getOutcomeDelta("worked-perfectly")).toEqual({ alpha: 1.0, beta: 0.0 });
      expect(OutcomeProcessor.getOutcomeDelta("worked-with-tweaks")).toEqual({ alpha: 0.7, beta: 0.3 });
      expect(OutcomeProcessor.getOutcomeDelta("partial-success")).toEqual({ alpha: 0.5, beta: 0.5 });
      expect(OutcomeProcessor.getOutcomeDelta("failed-minor-issues")).toEqual({ alpha: 0.3, beta: 0.7 });
      expect(OutcomeProcessor.getOutcomeDelta("failed-completely")).toEqual({ alpha: 0.0, beta: 1.0 });
    });
  });

  describe("getValidOutcomes", () => {
    test("should return all valid outcomes", () => {
      const outcomes = OutcomeProcessor.getValidOutcomes();
      
      expect(outcomes).toEqual([
        "worked-perfectly",
        "worked-with-tweaks",
        "partial-success",
        "failed-minor-issues",
        "failed-completely"
      ]);
    });
  });
});