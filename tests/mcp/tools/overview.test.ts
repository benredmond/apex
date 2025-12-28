/**
 * Tests for pattern overview tool
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PatternOverviewService } from "../../../src/mcp/tools/overview.js";
import { PatternRepository } from "../../../src/storage/repository.js";
import { InvalidParamsError } from "../../../src/mcp/errors.js";
import type { Pattern } from "../../../src/storage/types.js";

describe("PatternOverviewService", () => {
  let service: PatternOverviewService;
  let repository: PatternRepository;

  beforeEach(async () => {
    repository = await PatternRepository.create({ dbPath: ":memory:" });
    await repository.initialize();
    
    // Disable FTS triggers for test environment (node:sqlite doesn't support them)
    const db: any = (repository as any).db;
    const adapter = db?.database;
    if (adapter?.supportsFTSTriggers?.() === false) {
      (repository as any).ftsManager?.disableTriggers?.("patterns");
    }
    
    service = new PatternOverviewService(repository);

    // Seed database with test patterns
    await seedTestPatterns(repository);
  });

  afterEach(async () => {
    await repository.shutdown();
  });

  describe("Validation", () => {
    it("should accept request with no parameters (all optional)", async () => {
      const response = await service.overview({});
      expect(response).toBeDefined();
      expect(response.patterns).toBeDefined();
    });

    it("should validate page_size constraints", async () => {
      await expect(
        service.overview({ page_size: 0 }),
      ).rejects.toThrow(InvalidParamsError);

      await expect(
        service.overview({ page_size: 101 }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it("should validate page constraints", async () => {
      await expect(
        service.overview({ page: 0 }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it("should validate min_trust constraints", async () => {
      await expect(
        service.overview({ min_trust: -0.1 }),
      ).rejects.toThrow(InvalidParamsError);

      await expect(
        service.overview({ min_trust: 1.1 }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it("should validate order_by enum values", async () => {
      await expect(
        service.overview({ order_by: "invalid" as any }),
      ).rejects.toThrow(InvalidParamsError);
    });

    it("should validate status enum values", async () => {
      await expect(
        service.overview({ status: "invalid" as any }),
      ).rejects.toThrow(InvalidParamsError);
    });
  });

  describe("Filtering", () => {
    it("should filter by type", async () => {
      const response = await service.overview({
        type: ["LANG"],
      });

      expect(response.patterns.length).toBeGreaterThan(0);
      expect(response.patterns.every((p) => p.type === "LANG")).toBe(true);
    });

    it("should filter by multiple types", async () => {
      const response = await service.overview({
        type: ["LANG", "TEST"],
      });

      expect(response.patterns.length).toBeGreaterThan(0);
      expect(
        response.patterns.every((p) => p.type === "LANG" || p.type === "TEST"),
      ).toBe(true);
    });

    it("should filter by min_trust", async () => {
      const response = await service.overview({
        min_trust: 0.7,
      });

      expect(response.patterns.every((p) => p.trust_score >= 0.7)).toBe(true);
    });

    it("should filter by tags", async () => {
      const response = await service.overview({
        tags: ["auth"],
      });

      expect(response.patterns.length).toBeGreaterThan(0);
      expect(
        response.patterns.every((p) => p.tags.includes("auth")),
      ).toBe(true);
    });

    it("should filter by status", async () => {
      const response = await service.overview({
        status: "active",
      });

      // All patterns should be active (default)
      expect(response.patterns.length).toBeGreaterThan(0);
    });

    it("should support 'all' type filter", async () => {
      const response = await service.overview({
        type: "all",
      });

      // Should return patterns of all types
      expect(response.patterns.length).toBeGreaterThan(0);
      const types = new Set(response.patterns.map((p) => p.type));
      expect(types.size).toBeGreaterThan(1);
    });

    it("should filter by max_age_days", async () => {
      // Create an old pattern (30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await repository.create(
        buildTestPattern("old-pattern", {
          type: "LANG",
          title: "Old Pattern",
          summary: "This pattern is 30 days old",
          trust_score: 0.8,
          usage_count: 5,
          success_count: 4,
          created_at: thirtyDaysAgo.toISOString(),
        })
      );

      // Create a recent pattern (today)
      await repository.create(
        buildTestPattern("recent-pattern", {
          type: "LANG",
          title: "Recent Pattern",
          summary: "This pattern was just created",
          trust_score: 0.8,
          usage_count: 5,
          success_count: 4,
          created_at: new Date().toISOString(),
        })
      );

      // Query for patterns less than 7 days old
      const response = await service.overview({
        max_age_days: 7,
      });

      // Should have at least the recent pattern
      expect(response.patterns.length).toBeGreaterThan(0);

      // Old pattern should be filtered out
      const oldPattern = response.patterns.find((p) => p.id === "old-pattern");
      expect(oldPattern).toBeUndefined();

      // Recent pattern should be included
      const recentPattern = response.patterns.find((p) => p.id === "recent-pattern");
      expect(recentPattern).toBeDefined();

      // All returned patterns should be within max_age_days
      response.patterns.forEach((p) => {
        const createdAt = new Date(p.created_at);
        const daysDiff = Math.floor(
          (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        expect(daysDiff).toBeLessThanOrEqual(7);
      });
    });
  });

  describe("Sorting", () => {
    it("should sort by trust_score DESC by default", async () => {
      const response = await service.overview({});

      expect(response.patterns.length).toBeGreaterThan(1);
      for (let i = 1; i < response.patterns.length; i++) {
        expect(response.patterns[i - 1].trust_score).toBeGreaterThanOrEqual(
          response.patterns[i].trust_score,
        );
      }
    });

    it("should sort by trust_score ASC", async () => {
      const response = await service.overview({
        order_by: "trust_score",
        order: "asc",
      });

      expect(response.patterns.length).toBeGreaterThan(1);
      for (let i = 1; i < response.patterns.length; i++) {
        expect(response.patterns[i - 1].trust_score).toBeLessThanOrEqual(
          response.patterns[i].trust_score,
        );
      }
    });

    it("should sort by usage_count DESC", async () => {
      const response = await service.overview({
        order_by: "usage_count",
        order: "desc",
      });

      expect(response.patterns.length).toBeGreaterThan(1);
      for (let i = 1; i < response.patterns.length; i++) {
        expect(response.patterns[i - 1].usage_count).toBeGreaterThanOrEqual(
          response.patterns[i].usage_count,
        );
      }
    });

    it("should sort by title ASC", async () => {
      const response = await service.overview({
        order_by: "title",
        order: "asc",
      });

      expect(response.patterns.length).toBeGreaterThan(1);
      // Verify the patterns are sorted by title using localeCompare (matches service implementation)
      const titles = response.patterns.map((p) => p.title);
      const sortedTitles = [...titles].sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(sortedTitles);
    });

    it("should sort by created_at DESC", async () => {
      const response = await service.overview({
        order_by: "created_at",
        order: "desc",
      });

      expect(response.patterns.length).toBeGreaterThan(1);
      for (let i = 1; i < response.patterns.length; i++) {
        expect(
          new Date(response.patterns[i - 1].created_at).getTime(),
        ).toBeGreaterThanOrEqual(
          new Date(response.patterns[i].created_at).getTime(),
        );
      }
    });

    it("should sort by updated_at DESC", async () => {
      const response = await service.overview({
        order_by: "updated_at",
        order: "desc",
      });

      expect(response.patterns.length).toBeGreaterThan(1);
      for (let i = 1; i < response.patterns.length; i++) {
        expect(
          new Date(response.patterns[i - 1].updated_at).getTime(),
        ).toBeGreaterThanOrEqual(
          new Date(response.patterns[i].updated_at).getTime(),
        );
      }
    });
  });

  describe("Pagination", () => {
    it("should paginate results with default page_size", async () => {
      const response = await service.overview({
        page: 1,
      });

      expect(response.pagination).toBeDefined();
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.page_size).toBe(50);
      expect(response.pagination.total_items).toBeGreaterThan(0);
    });

    it("should support custom page_size", async () => {
      const response = await service.overview({
        page: 1,
        page_size: 5,
      });

      expect(response.patterns.length).toBeLessThanOrEqual(5);
      expect(response.pagination.page_size).toBe(5);
    });

    it("should support page navigation", async () => {
      // Get first page
      const page1 = await service.overview({
        page: 1,
        page_size: 3,
      });

      // Get second page
      const page2 = await service.overview({
        page: 2,
        page_size: 3,
      });

      expect(page1.patterns.length).toBeLessThanOrEqual(3);
      expect(page2.patterns.length).toBeGreaterThan(0);

      // Pages should not contain the same patterns
      const page1Ids = page1.patterns.map((p) => p.id);
      const page2Ids = page2.patterns.map((p) => p.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection.length).toBe(0);
    });

    it("should set has_next correctly", async () => {
      const response = await service.overview({
        page: 1,
        page_size: 3,
      });

      if (response.pagination.total_items > 3) {
        expect(response.pagination.has_next).toBe(true);
      } else {
        expect(response.pagination.has_next).toBe(false);
      }
    });

    it("should set has_prev correctly", async () => {
      const page1 = await service.overview({
        page: 1,
        page_size: 3,
      });

      const page2 = await service.overview({
        page: 2,
        page_size: 3,
      });

      expect(page1.pagination.has_prev).toBe(false);
      if (page1.pagination.total_items > 3) {
        expect(page2.pagination.has_prev).toBe(true);
      }
    });

    it("should calculate total_pages correctly", async () => {
      const response = await service.overview({
        page: 1,
        page_size: 3,
      });

      const expectedPages = Math.ceil(
        response.pagination.total_items / response.pagination.page_size,
      );
      expect(response.pagination.total_pages).toBe(expectedPages);
    });
  });

  describe("Statistics", () => {
    it("should not include stats by default", async () => {
      const response = await service.overview({});
      expect(response.stats).toBeUndefined();
    });

    it("should include stats when requested", async () => {
      const response = await service.overview({
        include_stats: true,
      });

      expect(response.stats).toBeDefined();
      expect(response.stats!.total_patterns).toBeGreaterThan(0);
      expect(response.stats!.by_type).toBeDefined();
      expect(response.stats!.avg_trust_score).toBeGreaterThanOrEqual(0);
      expect(response.stats!.avg_trust_score).toBeLessThanOrEqual(1);
    });

    it("should calculate by_type distribution", async () => {
      const response = await service.overview({
        include_stats: true,
      });

      expect(response.stats!.by_type).toBeDefined();
      const totalFromTypes = Object.values(response.stats!.by_type).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(totalFromTypes).toBe(response.stats!.total_patterns);
    });

    it("should calculate high_trust_patterns", async () => {
      const response = await service.overview({
        include_stats: true,
      });

      expect(response.stats!.high_trust_patterns).toBeGreaterThanOrEqual(0);
      expect(response.stats!.high_trust_patterns).toBeLessThanOrEqual(
        response.stats!.total_patterns,
      );
    });

    it("should calculate recently_added and recently_updated", async () => {
      const response = await service.overview({
        include_stats: true,
      });

      expect(response.stats!.recently_added).toBeGreaterThanOrEqual(0);
      expect(response.stats!.recently_updated).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Response Format", () => {
    it("should include standard metadata fields", async () => {
      const response = await service.overview({});

      expect(response.request_id).toBeDefined();
      expect(typeof response.request_id).toBe("string");
      expect(response.request_id.length).toBeGreaterThan(0);

      expect(response.latency_ms).toBeDefined();
      expect(typeof response.latency_ms).toBe("number");
      expect(response.latency_ms).toBeGreaterThanOrEqual(0);

      expect(response.cache_hit).toBeDefined();
      expect(typeof response.cache_hit).toBe("boolean");
    });

    it("should return compressed pattern format", async () => {
      const response = await service.overview({});

      expect(response.patterns.length).toBeGreaterThan(0);
      const pattern = response.patterns[0];

      expect(pattern.id).toBeDefined();
      expect(pattern.type).toBeDefined();
      expect(pattern.title).toBeDefined();
      expect(pattern.summary).toBeDefined();
      expect(pattern.trust_score).toBeDefined();
      expect(pattern.usage_count).toBeDefined();
      expect(pattern.tags).toBeDefined();
      expect(Array.isArray(pattern.tags)).toBe(true);
      expect(pattern.created_at).toBeDefined();
      expect(pattern.updated_at).toBeDefined();
    });

    it("should truncate summaries to 200 chars", async () => {
      // Create a pattern with a very long summary
      const longSummary = "A".repeat(300);
      await repository.create(
        buildTestPattern("test-long-summary", {
          type: "LANG",
          title: "Test Long Summary",
          summary: longSummary,
          trust_score: 0.5,
          usage_count: 1,
          success_count: 1,
        })
      );

      const response = await service.overview({});
      const pattern = response.patterns.find((p) => p.id === "test-long-summary");

      if (pattern) {
        expect(pattern.summary.length).toBeLessThanOrEqual(200);
        expect(pattern.summary.endsWith("...")).toBe(true);
      }
    });

    it("should not include metadata by default", async () => {
      const response = await service.overview({});

      expect(response.patterns.length).toBeGreaterThan(0);
      const pattern = response.patterns[0];

      expect(pattern.key_insight).toBeUndefined();
      expect(pattern.when_to_use).toBeUndefined();
    });

    it("should include metadata when requested", async () => {
      // Create a pattern with metadata fields
      await repository.create(
        buildTestPattern("test-metadata", {
          type: "LANG",
          title: "Test Metadata",
          summary: "Test pattern with metadata",
          trust_score: 0.8,
          alpha: 5.0,
          beta: 2.0,
          usage_count: 5,
          success_count: 4,
          tags: ["test"],
          key_insight: "This is a key insight",
          when_to_use: "Use when testing",
        })
      );

      const response = await service.overview({
        include_metadata: true,
      });

      const pattern = response.patterns.find((p) => p.id === "test-metadata");
      if (pattern) {
        expect(pattern.key_insight).toBe("This is a key insight");
        expect(pattern.when_to_use).toBe("Use when testing");
      }
    });

    it("should calculate success_rate when applicable", async () => {
      const response = await service.overview({});

      expect(response.patterns.length).toBeGreaterThan(0);
      const patternWithUsage = response.patterns.find(
        (p) => p.usage_count > 0,
      );

      if (patternWithUsage) {
        expect(patternWithUsage.success_rate).toBeDefined();
        expect(patternWithUsage.success_rate).toBeGreaterThanOrEqual(0);
        expect(patternWithUsage.success_rate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Combined Filters", () => {
    it("should support multiple filters together", async () => {
      const response = await service.overview({
        type: ["LANG"],
        min_trust: 0.6,
        tags: ["auth"],
        order_by: "usage_count",
        order: "desc",
        page: 1,
        page_size: 10,
      });

      // All patterns should match all filters
      response.patterns.forEach((p) => {
        expect(p.type).toBe("LANG");
        expect(p.trust_score).toBeGreaterThanOrEqual(0.6);
        expect(p.tags.includes("auth")).toBe(true);
      });

      // Should be sorted by usage_count DESC
      for (let i = 1; i < response.patterns.length; i++) {
        expect(response.patterns[i - 1].usage_count).toBeGreaterThanOrEqual(
          response.patterns[i].usage_count,
        );
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON gracefully", async () => {
      await expect(
        service.overview(null as any),
      ).rejects.toThrow();
    });

    it("should provide clear error messages", async () => {
      try {
        await service.overview({ page_size: 200 });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).toContain("Invalid overview request");
      }
    });
  });
});

/**
 * Helper to build test patterns with all required fields
 */
function buildTestPattern(
  id: string,
  overrides: Partial<Pattern> = {},
): Pattern {
  const timestamp = new Date().toISOString();
  const title = overrides.title ?? `Pattern ${id}`;
  const summary = overrides.summary ?? `Summary for ${id}`;
  const tags = overrides.tags ?? [];
  
  return {
    id,
    schema_version: "1.0.0",
    pattern_version: "1.0.0",
    type: overrides.type ?? "TEST",
    title,
    summary,
    trust_score: overrides.trust_score ?? 0.6,
    alpha: overrides.alpha ?? 2.0,
    beta: overrides.beta ?? 2.0,
    created_at: overrides.created_at ?? timestamp,
    updated_at: overrides.updated_at ?? timestamp,
    pattern_digest: `digest-${id}`,
    json_canonical: JSON.stringify({ id, title, summary }),
    tags,
    keywords: tags.length > 0 ? tags.join(",") : title,
    search_index: `${title} ${summary}`,
    usage_count: overrides.usage_count ?? 0,
    success_count: overrides.success_count ?? 0,
    ...overrides,
  };
}

/**
 * Seed repository with test patterns
 */
async function seedTestPatterns(repository: PatternRepository): Promise<void> {
  const patterns: Pattern[] = [
    buildTestPattern("auth-jwt", {
      type: "LANG",
      title: "JWT Authentication",
      summary: "Implement JWT-based authentication with secure token handling",
      trust_score: 0.85,
      alpha: 6.0,
      beta: 2.0,
      usage_count: 10,
      success_count: 8,
      tags: ["auth", "security", "jwt"],
    }),
    buildTestPattern("test-vitest", {
      type: "TEST",
      title: "Vitest Setup",
      summary: "Configure Vitest for modern TypeScript testing",
      trust_score: 0.75,
      alpha: 4.0,
      beta: 2.0,
      usage_count: 5,
      success_count: 4,
      tags: ["testing", "vitest"],
    }),
    buildTestPattern("error-handling", {
      type: "CODEBASE",
      title: "Error Handling Pattern",
      summary: "Consistent error handling across application",
      trust_score: 0.9,
      alpha: 10.0,
      beta: 2.0,
      usage_count: 15,
      success_count: 14,
      tags: ["error", "reliability"],
    }),
    buildTestPattern("anti-callback-hell", {
      type: "ANTI",
      title: "Avoid Callback Hell",
      summary: "Use async/await instead of nested callbacks",
      trust_score: 0.95,
      alpha: 20.0,
      beta: 2.0,
      usage_count: 25,
      success_count: 24,
      tags: ["anti-pattern", "async"],
    }),
    buildTestPattern("db-migration", {
      type: "MIGRATION",
      title: "Database Migration Pattern",
      summary: "Safe database schema migrations with rollback support",
      trust_score: 0.8,
      alpha: 5.0,
      beta: 2.0,
      usage_count: 8,
      success_count: 7,
      tags: ["database", "migration"],
    }),
    buildTestPattern("api-rest", {
      type: "LANG",
      title: "REST API Design",
      summary: "Design RESTful APIs following best practices",
      trust_score: 0.7,
      alpha: 4.0,
      beta: 2.0,
      usage_count: 6,
      success_count: 4,
      tags: ["api", "rest"],
    }),
    buildTestPattern("auth-oauth", {
      type: "LANG",
      title: "OAuth2 Implementation",
      summary: "Implement OAuth2 authentication flow for third-party integrations",
      trust_score: 0.65,
      alpha: 3.0,
      beta: 2.0,
      usage_count: 3,
      success_count: 2,
      tags: ["auth", "oauth"],
    }),
  ];

  for (const pattern of patterns) {
    await repository.create(pattern);
  }
}
