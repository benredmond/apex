// [PAT:SEARCH:SYNONYM] ★★★★☆ (45 uses, 85% success) - Query expansion with synonyms
import synonymConfig from "../config/synonyms.json" with { type: "json" };

export interface SynonymExpansion {
  original: string;
  expanded: string[];
  synonymsUsed: Map<string, string[]>;
}

export class SynonymExpander {
  private synonymMap: Map<string, Set<string>>;
  private reverseMap: Map<string, Set<string>>;

  constructor(customSynonyms?: Record<string, string[]>) {
    const synonyms = customSynonyms || synonymConfig;
    this.synonymMap = new Map();
    this.reverseMap = new Map();

    this.buildMaps(synonyms);
  }

  private buildMaps(synonyms: Record<string, string[]>): void {
    // Build forward map
    for (const [key, values] of Object.entries(synonyms)) {
      const keyLower = key.toLowerCase();
      const synonymSet = new Set<string>([
        keyLower,
        ...values.map((v) => v.toLowerCase()),
      ]);

      // Each term maps to all its synonyms
      for (const term of synonymSet) {
        if (!this.synonymMap.has(term)) {
          this.synonymMap.set(term, new Set());
        }
        // Add all other terms as synonyms
        for (const synonym of synonymSet) {
          if (synonym !== term) {
            this.synonymMap.get(term)!.add(synonym);
          }
        }
      }

      // Build reverse map for efficient lookup
      if (!this.reverseMap.has(keyLower)) {
        this.reverseMap.set(keyLower, new Set());
      }
      for (const value of values) {
        this.reverseMap.get(keyLower)!.add(value.toLowerCase());
      }
    }
  }

  /**
   * Expand a query with synonyms
   * Returns both the expanded query and metadata about expansions
   */
  expandQuery(query: string): SynonymExpansion {
    const tokens = this.tokenize(query);
    const expandedTokens = new Set<string>();
    const synonymsUsed = new Map<string, string[]>();

    for (const token of tokens) {
      const tokenLower = token.toLowerCase();
      expandedTokens.add(tokenLower);

      // Find synonyms for this token
      if (this.synonymMap.has(tokenLower)) {
        const synonyms = Array.from(this.synonymMap.get(tokenLower)!);

        // Add synonyms to expanded set
        for (const synonym of synonyms) {
          expandedTokens.add(synonym);
        }

        // Track what synonyms were used
        if (synonyms.length > 0) {
          synonymsUsed.set(token, synonyms);
        }
      }
    }

    return {
      original: query,
      expanded: Array.from(expandedTokens),
      synonymsUsed,
    };
  }

  /**
   * Expand query for specific FTS5 fields
   */
  expandForFts(query: string, maxExpansion: number = 20): string[] {
    const expansion = this.expandQuery(query);

    // Limit expansion to prevent query explosion
    const limited = expansion.expanded.slice(0, maxExpansion);

    // Return as array of terms for FTS5 query building
    return limited;
  }

  /**
   * Check if two terms are synonyms
   */
  areSynonyms(term1: string, term2: string): boolean {
    const t1Lower = term1.toLowerCase();
    const t2Lower = term2.toLowerCase();

    if (t1Lower === t2Lower) return true;

    const synonyms = this.synonymMap.get(t1Lower);
    return synonyms ? synonyms.has(t2Lower) : false;
  }

  /**
   * Get all synonyms for a term
   */
  getSynonyms(term: string): string[] {
    const termLower = term.toLowerCase();
    const synonyms = this.synonymMap.get(termLower);
    return synonyms ? Array.from(synonyms) : [];
  }

  /**
   * Tokenize query into words
   * Preserves quoted phrases
   */
  private tokenize(query: string): string[] {
    const tokens: string[] = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
      // If quoted phrase, use the phrase
      // Otherwise use the word
      tokens.push(match[1] || match[2]);
    }

    return tokens;
  }

  /**
   * Build pattern-aware expansion for APEX patterns
   * E.g., "PAT:AUTH" expands to all auth-related pattern IDs
   */
  expandPatternQuery(query: string): string[] {
    const expanded = new Set<string>();

    // Check if query contains pattern format
    const patternRegex = /\b([A-Z]+:[A-Z]+)\b/g;
    let match;

    while ((match = patternRegex.exec(query)) !== null) {
      const patternPrefix = match[1];
      expanded.add(patternPrefix);

      // Check if second part is a category we can expand
      const [type, category] = patternPrefix.split(":");
      const categorySynonyms = this.getSynonyms(category.toLowerCase());

      // Add expanded pattern variations
      for (const synonym of categorySynonyms) {
        expanded.add(`${type}:${synonym.toUpperCase()}`);
      }
    }

    // Also handle non-pattern terms
    const nonPatternQuery = query.replace(patternRegex, "").trim();
    if (nonPatternQuery) {
      const regularExpansion = this.expandQuery(nonPatternQuery);
      regularExpansion.expanded.forEach((term) => expanded.add(term));
    }

    return Array.from(expanded);
  }
}

// Singleton instance for convenience
export const defaultExpander = new SynonymExpander();
