/**
 * Deduper - Handles deduplication across pattern sections
 * Uses Set-based operations for O(1) performance
 */
export class Deduper {
  private patternIds: Set<string> = new Set();
  private snippetHashes: Set<string> = new Set();
  private policyRefs: Set<string> = new Set();
  private antiRefs: Set<string> = new Set();
  private testRefs: Set<string> = new Set();

  /**
   * Check if pattern ID has been seen
   */
  hasPatternId(id: string): boolean {
    return this.patternIds.has(id);
  }

  /**
   * Mark pattern ID as seen
   */
  addPatternId(id: string): void {
    this.patternIds.add(id);
  }

  /**
   * Check if snippet hash has been seen
   */
  hasSnippetHash(hash: string): boolean {
    return this.snippetHashes.has(hash);
  }

  /**
   * Mark snippet hash as seen
   */
  addSnippetHash(hash: string): void {
    this.snippetHashes.add(hash);
  }

  /**
   * Track references from candidates
   */
  trackReferences(
    policyRefs?: string[],
    antiRefs?: string[],
    testRefs?: string[],
  ): void {
    policyRefs?.forEach((ref) => this.policyRefs.add(ref));
    antiRefs?.forEach((ref) => this.antiRefs.add(ref));
    testRefs?.forEach((ref) => this.testRefs.add(ref));
  }

  /**
   * Check if a policy should be included in top-level list
   */
  shouldIncludePolicy(id: string): boolean {
    return !this.policyRefs.has(id);
  }

  /**
   * Check if an anti-pattern should be included in top-level list
   */
  shouldIncludeAnti(id: string): boolean {
    return !this.antiRefs.has(id);
  }

  /**
   * Check if a test pattern should be included in top-level list
   */
  shouldIncludeTest(id: string): boolean {
    return !this.testRefs.has(id);
  }

  /**
   * Get deduplication stats
   */
  getStats(): {
    uniquePatterns: number;
    uniqueSnippets: number;
    referencedPolicies: number;
    referencedAntis: number;
    referencedTests: number;
  } {
    return {
      uniquePatterns: this.patternIds.size,
      uniqueSnippets: this.snippetHashes.size,
      referencedPolicies: this.policyRefs.size,
      referencedAntis: this.antiRefs.size,
      referencedTests: this.testRefs.size,
    };
  }

  /**
   * Reset deduper state
   */
  reset(): void {
    this.patternIds.clear();
    this.snippetHashes.clear();
    this.policyRefs.clear();
    this.antiRefs.clear();
    this.testRefs.clear();
  }
}
