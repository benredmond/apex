// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { LRUCache } from 'lru-cache';
export class PatternCache {
  byId;
  facetKey;
  snippetMeta;
  ttl = 5 * 60 * 1000; // 5 minutes
  constructor(maxSize = 1000) {
    const options = {
      max: maxSize,
      ttl: this.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    };
    this.byId = new LRUCache(options);
    this.facetKey = new LRUCache(options);
    this.snippetMeta = new LRUCache(options);
  }
  // Pattern cache operations
  getPattern(id) {
    return this.byId.get(id);
  }
  setPattern(id, pattern) {
    this.byId.set(id, pattern);
  }
  deletePattern(id) {
    this.byId.delete(id);
    // Also invalidate related facet entries
    this.invalidateFacetsForPattern(id);
  }
  // Facet cache operations
  getFacetResults(key) {
    return this.facetKey.get(key);
  }
  setFacetResults(key, patternIds) {
    this.facetKey.set(key, patternIds);
  }
  // Snippet metadata cache
  getSnippetMeta(snippetId) {
    return this.snippetMeta.get(snippetId);
  }
  setSnippetMeta(snippetId, meta) {
    this.snippetMeta.set(snippetId, meta);
  }
  // Invalidation
  invalidateFacetsForPattern(patternId) {
    // Iterate through facet cache and remove entries containing this pattern
    for (const [key, ids] of this.facetKey.entries()) {
      if (ids.includes(patternId)) {
        this.facetKey.delete(key);
      }
    }
  }
  invalidateAll() {
    this.byId.clear();
    this.facetKey.clear();
    this.snippetMeta.clear();
  }
  // Cache statistics
  getStats() {
    return {
      byId: {
        size: this.byId.size,
        calculatedSize: this.byId.calculatedSize,
      },
      facetKey: {
        size: this.facetKey.size,
        calculatedSize: this.facetKey.calculatedSize,
      },
      snippetMeta: {
        size: this.snippetMeta.size,
        calculatedSize: this.snippetMeta.calculatedSize,
      },
    };
  }
  // Generate cache key for facet queries
  static generateFacetKey(facets) {
    const sorted = Object.keys(facets)
      .sort()
      .map(k => `${k}:${JSON.stringify(facets[k])}`)
      .join('|');
    return `facet:${sorted}`;
  }
}
