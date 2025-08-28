// [PAT:SEARCH:FUZZY] ★★★★☆ (67 uses, 88% success) - Fuzzy string matching with Levenshtein distance

export interface FuzzyMatchResult {
  matched: boolean;
  score: number;
  distance: number;
}

export class FuzzyMatcher {
  private cache: Map<string, number> = new Map();

  /**
   * Calculate Levenshtein distance between two strings
   * Uses dynamic programming with memoization
   */
  levenshteinDistance(str1: string, str2: string): number {
    // Check cache first
    const cacheKey = `${str1}:${str2}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    const len1 = s1.length;
    const len2 = s2.length;

    // Edge cases
    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    // Create DP matrix
    const matrix: number[][] = [];

    // Initialize first column
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    // Initialize first row
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    const distance = matrix[len1][len2];

    // Cache result
    this.cache.set(cacheKey, distance);

    // Limit cache size to prevent memory issues
    if (this.cache.size > 10000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return distance;
  }

  /**
   * Calculate similarity score between two strings
   * Returns a value between 0 and 1 (1 = identical)
   */
  similarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);

    if (maxLen === 0) return 1;

    return 1 - distance / maxLen;
  }

  /**
   * Perform fuzzy matching with configurable threshold
   */
  fuzzyMatch(
    query: string,
    target: string,
    threshold: number = 0.8,
  ): FuzzyMatchResult {
    const distance = this.levenshteinDistance(query, target);
    const maxLen = Math.max(query.length, target.length);
    const similarity = maxLen === 0 ? 1 : 1 - distance / maxLen;

    return {
      matched: similarity >= threshold,
      score: similarity,
      distance,
    };
  }

  /**
   * Find best fuzzy matches from a list of candidates
   */
  findBestMatches(
    query: string,
    candidates: string[],
    options: {
      threshold?: number;
      maxResults?: number;
      minScore?: number;
    } = {},
  ): Array<{ value: string; score: number; distance: number }> {
    const { threshold = 0.6, maxResults = 10, minScore = 0.3 } = options;

    const results = candidates
      .map((candidate) => {
        const match = this.fuzzyMatch(query, candidate, threshold);
        return {
          value: candidate,
          score: match.score,
          distance: match.distance,
        };
      })
      .filter((result) => result.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return results;
  }

  /**
   * Fuzzy match against multiple fields
   * Useful for matching patterns by title, summary, or tags
   */
  fuzzyMatchMultiField(
    query: string,
    target: Record<string, string>,
    fieldWeights: Record<string, number> = {},
  ): number {
    let totalScore = 0;
    let totalWeight = 0;

    for (const [field, value] of Object.entries(target)) {
      if (!value) continue;

      const weight = fieldWeights[field] || 1;
      const similarity = this.similarity(query, value);

      totalScore += similarity * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Check if query contains typos compared to target
   * More lenient than fuzzyMatch for detecting potential typos
   */
  hasTypo(query: string, target: string, maxDistance: number = 2): boolean {
    // For short words, be more strict
    if (query.length <= 3) {
      maxDistance = 1;
    }

    const distance = this.levenshteinDistance(query, target);
    return distance <= maxDistance && distance > 0;
  }

  /**
   * Suggest corrections for potential typos
   */
  suggestCorrections(
    query: string,
    dictionary: string[],
    maxSuggestions: number = 5,
  ): string[] {
    // [FIX:FUZZY:THRESHOLD] ★★★★☆ (34 uses, 85% success) - Adaptive threshold for word length
    // Check for prefix matches first (exact prefix should be prioritized)
    const prefixMatches = dictionary.filter(word => 
      word.toLowerCase().startsWith(query.toLowerCase())
    );

    // If we have prefix matches, prioritize them
    if (prefixMatches.length > 0) {
      return prefixMatches.slice(0, maxSuggestions);
    }

    // Fallback to Levenshtein distance for fuzzy matching
    // Use more permissive threshold to catch partial matches
    const threshold = Math.max(3, Math.ceil(query.length * 0.6));

    const suggestions = dictionary
      .map((word) => ({
        word,
        distance: this.levenshteinDistance(query, word),
      }))
      .filter((item) => item.distance > 0 && item.distance <= threshold)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map((item) => item.word);

    return suggestions;
  }

  /**
   * Clear the distance calculation cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance for convenience
export const defaultMatcher = new FuzzyMatcher();
