// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
import { LRUCache } from 'lru-cache';
import type { Pattern, CacheEntry } from './types.js';

export class PatternCache {
  private byId: LRUCache<string, Pattern>;
  private facetKey: LRUCache<string, string[]>;
  private snippetMeta: LRUCache<string, any>;
  private ttl: number = 5 * 60 * 1000; // 5 minutes

  constructor(maxSize: number = 1000) {
    const options = {
      max: maxSize,
      ttl: this.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    };

    this.byId = new LRUCache<string, Pattern>(options);
    this.facetKey = new LRUCache<string, string[]>(options);
    this.snippetMeta = new LRUCache<string, any>(options);
  }

  // Pattern cache operations
  public getPattern(id: string): Pattern | undefined {
    return this.byId.get(id);
  }

  public setPattern(id: string, pattern: Pattern): void {
    this.byId.set(id, pattern);
  }

  public deletePattern(id: string): void {
    this.byId.delete(id);
    // Also invalidate related facet entries
    this.invalidateFacetsForPattern(id);
  }

  // Facet cache operations
  public getFacetResults(key: string): string[] | undefined {
    return this.facetKey.get(key);
  }

  public setFacetResults(key: string, patternIds: string[]): void {
    this.facetKey.set(key, patternIds);
  }

  // Snippet metadata cache
  public getSnippetMeta(snippetId: string): any | undefined {
    return this.snippetMeta.get(snippetId);
  }

  public setSnippetMeta(snippetId: string, meta: any): void {
    this.snippetMeta.set(snippetId, meta);
  }

  // Invalidation
  public invalidateFacetsForPattern(patternId: string): void {
    // Iterate through facet cache and remove entries containing this pattern
    for (const [key, ids] of this.facetKey.entries()) {
      if (ids.includes(patternId)) {
        this.facetKey.delete(key);
      }
    }
  }

  public invalidateAll(): void {
    this.byId.clear();
    this.facetKey.clear();
    this.snippetMeta.clear();
  }

  // Cache statistics
  public getStats() {
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
  public static generateFacetKey(facets: Record<string, any>): string {
    const sorted = Object.keys(facets)
      .sort()
      .map(k => `${k}:${JSON.stringify(facets[k])}`)
      .join('|');
    return `facet:${sorted}`;
  }
}