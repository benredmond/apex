// Query processor that combines FTS parsing, synonym expansion, and fuzzy matching
import { FTSQueryParser, sanitizeFtsQuery } from "./fts-parser.js";
import { SynonymExpander } from "./synonym-expander.js";
import { FuzzyMatcher } from "./fuzzy-matcher.js";
import type { Pattern } from "../storage/types.js";

export interface ProcessedQuery {
  original: string;
  ftsQuery: string;
  expandedTerms: string[];
  synonymsUsed: Map<string, string[]>;
  suggestedCorrections: string[];
}

export interface QueryProcessorOptions {
  enableSynonyms?: boolean;
  enableFuzzy?: boolean;
  maxSynonymExpansion?: number;
  fuzzyThreshold?: number;
  performanceMode?: boolean; // Skip expensive operations for speed
}

export class QueryProcessor {
  private parser: FTSQueryParser;
  private expander: SynonymExpander;
  private matcher: FuzzyMatcher;

  constructor() {
    this.parser = new FTSQueryParser();
    this.expander = new SynonymExpander();
    this.matcher = new FuzzyMatcher();
  }

  /**
   * Process a natural language query into search components
   */
  processQuery(
    query: string,
    options: QueryProcessorOptions = {},
  ): ProcessedQuery {
    const {
      enableSynonyms = true,
      enableFuzzy = true,
      maxSynonymExpansion = 20,
      performanceMode = false,
    } = options;

    // Step 1: Parse and sanitize for FTS5
    const parseResult = this.parser.parse(query);
    let ftsQuery = parseResult.ftsQuery;

    // Step 2: Synonym expansion (if enabled and not in performance mode)
    let expandedTerms: string[] = [];
    let synonymsUsed = new Map<string, string[]>();

    if (enableSynonyms && !performanceMode) {
      const expansion = this.expander.expandQuery(query);
      expandedTerms = expansion.expanded.slice(0, maxSynonymExpansion);
      synonymsUsed = expansion.synonymsUsed;

      // Build expanded FTS query
      if (expandedTerms.length > 0) {
        // Create FTS5 OR query with expanded terms
        const expandedFtsTerms = expandedTerms.map((term) => {
          const sanitized = term.replace(/"/g, '""');
          return `"${sanitized}"`;
        });

        // Combine original and expanded queries
        ftsQuery = `(${ftsQuery} OR ${expandedFtsTerms.join(" OR ")})`;
      }
    }

    // Step 3: Prepare for fuzzy matching (corrections)
    let suggestedCorrections: string[] = [];

    if (enableFuzzy && !performanceMode) {
      // This will be populated during result processing
      // We'll suggest corrections based on actual pattern data
      suggestedCorrections = [];
    }

    return {
      original: query,
      ftsQuery,
      expandedTerms,
      synonymsUsed,
      suggestedCorrections,
    };
  }

  /**
   * Build FTS5 query with column-specific searches
   */
  buildFTSQuery(processed: ProcessedQuery, columns?: string[]): string {
    if (!columns || columns.length === 0) {
      return processed.ftsQuery;
    }

    // Build column-specific queries
    const columnQueries = columns.map((col) => `${col}:${processed.ftsQuery}`);
    return `(${columnQueries.join(" OR ")})`;
  }

  /**
   * Apply fuzzy matching to filter and re-rank results
   */
  applyFuzzyMatching(
    results: Pattern[],
    query: string,
    options: {
      threshold?: number;
      maxResults?: number;
      fields?: ("title" | "summary" | "tags")[];
    } = {},
  ): Pattern[] {
    const {
      threshold = 0.7,
      maxResults = 50,
      fields = ["title", "summary"],
    } = options;

    // Score each pattern based on fuzzy matching
    const scored = results.map((pattern) => {
      let maxScore = 0;

      // Check each specified field
      for (const field of fields) {
        let fieldValue = "";

        if (field === "title") {
          fieldValue = pattern.title;
        } else if (field === "summary") {
          fieldValue = pattern.summary;
        } else if (field === "tags" && pattern.tags) {
          fieldValue = pattern.tags.join(" ");
        }

        if (fieldValue) {
          const similarity = this.matcher.similarity(query, fieldValue);
          maxScore = Math.max(maxScore, similarity);
        }
      }

      return { pattern, score: maxScore };
    });

    // Filter by threshold and sort by score
    return scored
      .filter((item) => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((item) => item.pattern);
  }

  /**
   * Detect potential typos and suggest corrections
   */
  detectTypos(query: string, patternTitles: string[]): string[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const corrections: Set<string> = new Set();

    for (const word of queryWords) {
      // Skip very short words
      if (word.length < 3) continue;

      // Find potential corrections from pattern titles
      const titleWords = new Set<string>();
      for (const title of patternTitles) {
        title
          .toLowerCase()
          .split(/\s+/)
          .forEach((w) => titleWords.add(w));
      }

      const suggestions = this.matcher.suggestCorrections(
        word,
        Array.from(titleWords),
        3,
      );

      suggestions.forEach((s) => corrections.add(s));
    }

    return Array.from(corrections);
  }

  /**
   * Process pattern-specific queries (e.g., "PAT:AUTH:*")
   */
  processPatternQuery(query: string): ProcessedQuery {
    // Handle APEX pattern format specially
    const patternExpanded = this.expander.expandPatternQuery(query);

    // Build FTS query from expanded pattern terms
    const ftsTerms = patternExpanded.map((term) => {
      const sanitized = term.replace(/"/g, '""');
      return `"${sanitized}"`;
    });

    const ftsQuery = ftsTerms.join(" OR ");

    return {
      original: query,
      ftsQuery,
      expandedTerms: patternExpanded,
      synonymsUsed: new Map(),
      suggestedCorrections: [],
    };
  }

  /**
   * Optimize query for performance-critical scenarios
   */
  optimizeForPerformance(query: string): string {
    // Simple sanitization without expansion
    return sanitizeFtsQuery(query);
  }
}

// Singleton instance
export const defaultProcessor = new QueryProcessor();
