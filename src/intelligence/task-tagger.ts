/**
 * Auto-tagging system for tasks
 * Extracts tags, themes, and components from task content
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import type { Task, TaskTags } from "../schemas/task/types.js";
import { extractEnhancedSignals } from "./signal-extractor.js";

export class TaskTagger {
  // Keyword patterns for tag extraction
  private keywordPatterns: Map<string, RegExp> = new Map([
    ["cache", /\b(cache|caching|cached|redis|memcache|lru)\b/gi],
    ["api", /\b(api|endpoint|rest|graphql|http|request|response)\b/gi],
    [
      "auth",
      /\b(auth|authentication|authorization|jwt|token|login|session)\b/gi,
    ],
    ["database", /\b(database|db|sql|sqlite|postgres|mysql|mongodb|query)\b/gi],
    [
      "test",
      /\b(test|testing|tests|jest|pytest|unit|integration|coverage)\b/gi,
    ],
    ["ui", /\b(ui|frontend|react|vue|angular|component|button|form|modal)\b/gi],
    [
      "performance",
      /\b(performance|optimization|speed|slow|fast|optimize|perf)\b/gi,
    ],
    ["error", /\b(error|exception|bug|crash|failure|fix|issue)\b/gi],
    ["search", /\b(search|searching|find|lookup|query|match|similarity)\b/gi],
    ["migration", /\b(migration|migrate|migrating|upgrade|schema|version)\b/gi],
  ]);

  // Theme detectors
  private themeDetectors: Map<string, (text: string) => boolean> = new Map([
    [
      "performance",
      (text) => /\b(slow|optimize|performance|speed|cache|async)\b/i.test(text),
    ],
    [
      "security",
      (text) =>
        /\b(security|secure|auth|permission|access|token|jwt)\b/i.test(text),
    ],
    [
      "refactor",
      (text) =>
        /\b(refactor|restructure|reorganize|clean|improve)\b/i.test(text),
    ],
    [
      "bugfix",
      (text) => /\b(fix|bug|error|issue|crash|failure|broken)\b/i.test(text),
    ],
    [
      "feature",
      (text) => /\b(implement|add|create|new|feature|build)\b/i.test(text),
    ],
    [
      "testing",
      (text) => /\b(test|coverage|jest|pytest|unit|integration)\b/i.test(text),
    ],
    [
      "documentation",
      (text) => /\b(document|docs|readme|comment|explain)\b/i.test(text),
    ],
    [
      "optimization",
      (text) => /\b(optimize|improve|enhance|speed|performance)\b/i.test(text),
    ],
  ]);

  /**
   * Auto-tag a task based on its content
   */
  autoTag(task: Task): TaskTags {
    // Combine relevant text fields for analysis
    const text =
      `${task.intent || ""} ${task.title || ""} ${task.tl_dr || ""}`.toLowerCase();

    return {
      tags: this.extractKeywords(text),
      themes: this.detectThemes(text),
      components: this.detectComponents(task.files_touched || []),
    };
  }

  /**
   * Extract keywords/tags from text
   */
  extractKeywords(text: string): string[] {
    const tags = new Set<string>();

    // Use keyword patterns to extract tags
    for (const [tag, pattern] of this.keywordPatterns) {
      if (pattern.test(text)) {
        tags.add(tag);
      }
    }

    // Also use signal extractor for additional keywords
    const signals = extractEnhancedSignals(text);

    // Add task nouns as tags
    for (const noun of signals.taskNouns) {
      if (noun.length > 2) {
        tags.add(noun);
      }
    }

    // Add technology indicators
    for (const lang of signals.languages) {
      tags.add(lang);
    }
    for (const framework of signals.frameworks) {
      tags.add(framework);
    }

    return Array.from(tags).slice(0, 20); // Limit to 20 tags
  }

  /**
   * Detect high-level themes from text
   */
  detectThemes(text: string): string[] {
    const themes = new Set<string>();

    for (const [theme, detector] of this.themeDetectors) {
      if (detector(text)) {
        themes.add(theme);
      }
    }

    // Also check for specific task verbs from signal extractor
    const signals = extractEnhancedSignals(text);

    if (signals.taskVerbs.includes("fix")) {
      themes.add("bugfix");
    }
    if (
      signals.taskVerbs.includes("implement") ||
      signals.taskVerbs.includes("create")
    ) {
      themes.add("feature");
    }
    if (signals.taskVerbs.includes("test")) {
      themes.add("testing");
    }
    if (signals.taskVerbs.includes("refactor")) {
      themes.add("refactor");
    }
    if (signals.taskVerbs.includes("optimize")) {
      themes.add("optimization");
    }

    return Array.from(themes);
  }

  /**
   * Detect components from file paths
   */
  detectComponents(files: string[]): string[] {
    const components = new Set<string>();

    for (const file of files) {
      // Extract component names from file paths
      const parts = file.split("/");

      // Look for common component indicators
      if (file.includes("src/api/") || file.includes("routes/")) {
        components.add("api");
      }
      if (file.includes("src/ui/") || file.includes("components/")) {
        components.add("ui");
      }
      if (file.includes("src/auth/") || file.includes("authentication/")) {
        components.add("auth-service");
      }
      if (file.includes("src/database/") || file.includes("models/")) {
        components.add("database");
      }
      if (file.includes("src/cache/") || file.includes("redis/")) {
        components.add("cache-layer");
      }
      if (file.includes("tests/") || file.includes("test/")) {
        components.add("test-suite");
      }
      if (file.includes("src/storage/") || file.includes("repositories/")) {
        components.add("storage");
      }
      if (file.includes("src/intelligence/")) {
        components.add("intelligence");
      }
      if (file.includes("src/search/")) {
        components.add("search");
      }

      // Extract service names (without file extension)
      const serviceMatch = file.match(/src\/services\/([^/]+)/);
      if (serviceMatch) {
        // Remove file extension if present
        const serviceName = serviceMatch[1].replace(/\.(ts|js|tsx|jsx)$/, "");
        components.add(`${serviceName}-service`);
      }
    }

    return Array.from(components);
  }

  /**
   * Calculate tag overlap between two tag sets
   */
  calculateTagOverlap(tags1: string[], tags2: string[]): number {
    if (tags1.length === 0 || tags2.length === 0) return 0;

    const set1 = new Set(tags1);
    const set2 = new Set(tags2);

    let overlap = 0;
    for (const tag of set1) {
      if (set2.has(tag)) {
        overlap++;
      }
    }

    // Normalize by the smaller set size to avoid penalizing tasks with fewer tags
    const minSize = Math.min(set1.size, set2.size);
    return minSize > 0 ? overlap / minSize : 0;
  }
}
