/**
 * Tests for snippet matching functionality
 * [PAT:TEST:JEST_ESM_CONFIG] ★★★★☆ (8 uses, 87% success) - Jest ES module configuration
 */

import { jest } from "@jest/globals";
import { SnippetMatcher } from "../../src/reflection/snippet-matcher.js";

describe("SnippetMatcher", () => {
  let matcher: SnippetMatcher;

  beforeEach(() => {
    matcher = new SnippetMatcher({
      cacheEnabled: false, // Disable cache for tests
    });
  });

  describe("normalizeContent", () => {
    it("should normalize whitespace in content", () => {
      const input = "  function test() {  \n\n    return true;  \n  }  ";
      const expected = "function test() {\nreturn true;\n}";
      
      expect(matcher.normalizeContent(input)).toBe(expected);
    });

    it("should handle empty content", () => {
      expect(matcher.normalizeContent("")).toBe("");
      expect(matcher.normalizeContent("  \n  \n  ")).toBe("");
    });

    it("should preserve meaningful content", () => {
      const input = "const x = 1;\nconst y = 2;";
      const expected = "const x = 1;\nconst y = 2;";
      
      expect(matcher.normalizeContent(input)).toBe(expected);
    });
  });

  describe("generateSnippetHash", () => {
    it("should generate consistent hash for same content", () => {
      const content = "function test() { return true; }";
      const hash1 = matcher.generateSnippetHash(content);
      const hash2 = matcher.generateSnippetHash(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate same hash for whitespace variations", () => {
      const content1 = "function test() {\n  return true;\n}";
      const content2 = "  function test() {  \n    return true;  \n  }  ";
      
      const hash1 = matcher.generateSnippetHash(content1);
      const hash2 = matcher.generateSnippetHash(content2);
      
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different content", () => {
      const content1 = "function test() { return true; }";
      const content2 = "function test() { return false; }";
      
      const hash1 = matcher.generateSnippetHash(content1);
      const hash2 = matcher.generateSnippetHash(content2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("extractContent", () => {
    const fileContent = "line1\nline2\nline3\nline4\nline5";

    it("should extract content by line range", () => {
      expect(matcher.extractContent(fileContent, 2, 4)).toBe("line2\nline3\nline4");
      expect(matcher.extractContent(fileContent, 1, 1)).toBe("line1");
      expect(matcher.extractContent(fileContent, 5, 5)).toBe("line5");
    });

    it("should return null for invalid ranges", () => {
      expect(matcher.extractContent(fileContent, 0, 2)).toBeNull();
      expect(matcher.extractContent(fileContent, 6, 7)).toBeNull();
      expect(matcher.extractContent(fileContent, 3, 2)).toBeNull();
    });
  });

  describe("findSnippetByHash", () => {
    const fileContent = `function one() {
  return 1;
}

function two() {
  return 2;
}

function three() {
  return 3;
}`;

    it("should find snippet at original location", () => {
      const snippet = matcher.extractContent(fileContent, 1, 3)!;
      const hash = matcher.generateSnippetHash(snippet);
      
      const result = matcher.findSnippetByHash(fileContent, hash, 1, 3);
      
      expect(result.found).toBe(true);
      expect(result.start).toBe(1);
      expect(result.end).toBe(3);
      expect(result.confidence).toBe(1.0);
    });

    it("should find snippet at different location", () => {
      const snippet = matcher.extractContent(fileContent, 5, 7)!;
      const hash = matcher.generateSnippetHash(snippet);
      
      // Pretend lines were originally 1-3 but code moved
      const result = matcher.findSnippetByHash(fileContent, hash, 1, 3);
      
      expect(result.found).toBe(true);
      expect(result.start).toBe(5);
      expect(result.end).toBe(7);
      expect(result.confidence).toBe(1.0);
    });

    it("should handle multiple matches", () => {
      const duplicateContent = `function test() {
  return true;
}

function test() {
  return true;
}`;

      const snippet = matcher.extractContent(duplicateContent, 1, 3)!;
      const hash = matcher.generateSnippetHash(snippet);
      
      const result = matcher.findSnippetByHash(duplicateContent, hash, 1, 3);
      
      expect(result.found).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(result.multipleMatches).toHaveLength(2);
      expect(result.multipleMatches).toEqual([
        { start: 1, end: 3 },
        { start: 5, end: 7 }
      ]);
    });

    it("should return not found for non-existent snippet", () => {
      const hash = matcher.generateSnippetHash("non-existent code");
      
      const result = matcher.findSnippetByHash(fileContent, hash, 1, 3);
      
      expect(result.found).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("should respect file size limits", () => {
      const largeFileMatcher = new SnippetMatcher({
        maxFileSize: 10,
        cacheEnabled: false,
      });

      const result = largeFileMatcher.findSnippetByHash(
        "a".repeat(20),
        "somehash",
        1,
        1
      );

      expect(result.found).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe("caching", () => {
    it("should cache hash generation", () => {
      const cachingMatcher = new SnippetMatcher({
        cacheEnabled: true,
        cacheTTL: 1000,
      });

      const content = "function test() { return true; }";
      const hash1 = cachingMatcher.generateSnippetHash(content);
      const hash2 = cachingMatcher.generateSnippetHash(content);

      expect(hash1).toBe(hash2);
    });

    it("should clear cache", () => {
      const cachingMatcher = new SnippetMatcher({
        cacheEnabled: true,
      });

      const content = "test content";
      cachingMatcher.generateSnippetHash(content);
      
      cachingMatcher.clearCache();
      // Cache is cleared but result should still be consistent
      const hash = cachingMatcher.generateSnippetHash(content);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});