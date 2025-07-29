import { Signals, IndexStructures, PatternMeta } from './types.js';
import { PathTrie } from './utils/trie.js';
import { PathBloomFilter } from './utils/bloom.js';
import { scoreScope } from './scorers/scope.js';
import { minimatch } from 'minimatch';

export class CandidateGenerator {
  private indices: IndexStructures;
  private pathTrie: PathTrie;
  private bloomFilters: Map<number, PathBloomFilter>;
  
  constructor(patterns: PatternMeta[]) {
    this.indices = this.buildIndices(patterns);
    this.pathTrie = this.buildPathTrie();
    this.bloomFilters = this.buildBloomFilters();
  }
  
  generate(signals: Signals, maxCandidates: number = 1500): number[] {
    let candidates = this.facetPrefilter(signals);
    
    // For path filtering, we should be more lenient - include patterns
    // that either match paths OR have no path restrictions
    if (signals.paths.length > 0) {
      const pathFiltered = this.pathPrefilter(signals, candidates);
      candidates = pathFiltered;
    }
    
    // Cap candidates if too many
    if (candidates.size > maxCandidates) {
      candidates = this.coarseRank(signals, candidates, maxCandidates);
    }
    
    return Array.from(candidates);
  }
  
  private buildIndices(patterns: PatternMeta[]): IndexStructures {
    const indices: IndexStructures = {
      byType: new Map(),
      byLang: new Map(),
      byFramework: new Map(),
      byTag: new Map(),
      byTaskType: new Map(),
      byRepo: new Map(),
      byOrg: new Map(),
      patterns,
      idToIndex: new Map(),
    };
    
    patterns.forEach((pattern, index) => {
      indices.idToIndex.set(pattern.id, index);
      
      // Index by type
      const type = pattern.type || 'unknown';
      if (!indices.byType.has(type)) {
        indices.byType.set(type, new Set());
      }
      indices.byType.get(type)!.add(index);
      
      // Index by languages
      if (pattern.scope?.languages) {
        for (const lang of pattern.scope.languages) {
          const key = lang.toLowerCase();
          if (!indices.byLang.has(key)) {
            indices.byLang.set(key, new Set());
          }
          indices.byLang.get(key)!.add(index);
        }
      }
      
      // Index by frameworks
      if (pattern.scope?.frameworks) {
        for (const fw of pattern.scope.frameworks) {
          const key = fw.name.toLowerCase();
          if (!indices.byFramework.has(key)) {
            indices.byFramework.set(key, new Set());
          }
          indices.byFramework.get(key)!.add(index);
        }
      }
      
      // Index by repo/org
      if (pattern.metadata?.repo) {
        if (!indices.byRepo.has(pattern.metadata.repo)) {
          indices.byRepo.set(pattern.metadata.repo, new Set());
        }
        indices.byRepo.get(pattern.metadata.repo)!.add(index);
      }
      
      if (pattern.metadata?.org) {
        if (!indices.byOrg.has(pattern.metadata.org)) {
          indices.byOrg.set(pattern.metadata.org, new Set());
        }
        indices.byOrg.get(pattern.metadata.org)!.add(index);
      }
    });
    
    return indices;
  }
  
  private buildPathTrie(): PathTrie {
    const trie = new PathTrie();
    
    this.indices.patterns.forEach((pattern, index) => {
      if (pattern.scope?.paths) {
        for (const path of pattern.scope.paths) {
          trie.insert(path, index);
        }
      }
    });
    
    return trie;
  }
  
  private buildBloomFilters(): Map<number, PathBloomFilter> {
    const filters = new Map<number, PathBloomFilter>();
    
    this.indices.patterns.forEach((pattern, index) => {
      if (pattern.scope?.paths && pattern.scope.paths.length > 0) {
        filters.set(index, new PathBloomFilter(pattern.scope.paths));
      }
    });
    
    return filters;
  }
  
  private facetPrefilter(signals: Signals): Set<number> {
    // Start with pattern types we care about
    const typeSet = new Set<number>();
    const types = ['LANG', 'CODEBASE', 'MIGRATION', 'TEST', 'POLICY', 'ANTI', 'FAILURE'];
    
    for (const type of types) {
      const patterns = this.indices.byType.get(type);
      if (patterns) {
        for (const id of patterns) {
          typeSet.add(id);
        }
      }
    }
    
    let result = typeSet;
    
    // Filter by languages if specified
    if (signals.languages.length > 0) {
      const langSet = new Set<number>();
      for (const lang of signals.languages) {
        const patterns = this.indices.byLang.get(lang.toLowerCase());
        if (patterns) {
          for (const id of patterns) {
            langSet.add(id);
          }
        }
      }
      
      if (langSet.size > 0) {
        result = this.intersection(result, langSet);
      }
    }
    
    // Filter by frameworks if specified
    // Note: We should NOT filter out patterns that don't specify frameworks
    // Only include patterns that either:
    // 1. Have no framework requirements (apply to all)
    // 2. Have framework requirements that match the signals
    if (signals.frameworks.length > 0) {
      const fwMatchingSet = new Set<number>();
      const noFwSet = new Set<number>();
      
      // Find patterns with matching frameworks
      for (const fw of signals.frameworks) {
        const patterns = this.indices.byFramework.get(fw.name.toLowerCase());
        if (patterns) {
          for (const id of patterns) {
            fwMatchingSet.add(id);
          }
        }
      }
      
      // Find patterns with no framework requirements
      for (const id of result) {
        const pattern = this.indices.patterns[id];
        if (!pattern.scope?.frameworks || pattern.scope.frameworks.length === 0) {
          noFwSet.add(id);
        }
      }
      
      // Union of patterns with matching frameworks OR no framework requirements
      const fwResult = new Set<number>();
      for (const id of fwMatchingSet) {
        if (result.has(id)) fwResult.add(id);
      }
      for (const id of noFwSet) {
        if (result.has(id)) fwResult.add(id);
      }
      
      result = fwResult;
    }
    
    return result;
  }
  
  private pathPrefilter(signals: Signals, candidates: Set<number>): Set<number> {
    const filtered = new Set<number>();
    
    // For each candidate, check if any of its paths match any signal path
    for (const index of candidates) {
      const pattern = this.indices.patterns[index];
      
      // If pattern has no path restrictions, it matches
      if (!pattern.scope?.paths || pattern.scope.paths.length === 0) {
        filtered.add(index);
        continue;
      }
      
      // Check if any pattern path matches any signal path
      let matches = false;
      for (const patternPath of pattern.scope.paths) {
        for (const signalPath of signals.paths) {
          // Use minimatch for glob matching
          if (minimatch(signalPath, patternPath, { nocase: true })) {
            matches = true;
            break;
          }
        }
        if (matches) break;
      }
      
      if (matches) {
        filtered.add(index);
      }
    }
    
    return filtered;
  }
  
  private coarseRank(signals: Signals, candidates: Set<number>, maxCount: number): Set<number> {
    // Quick scoring based on path match and language/framework presence
    const scored: Array<{ id: number; score: number }> = [];
    
    for (const id of candidates) {
      const pattern = this.indices.patterns[id];
      const scopeResult = scoreScope(pattern, signals);
      
      scored.push({
        id,
        score: scopeResult.raw, // Use raw score for coarse ranking
      });
    }
    
    // Sort by score descending and take top N
    scored.sort((a, b) => b.score - a.score);
    
    const result = new Set<number>();
    for (let i = 0; i < Math.min(maxCount, scored.length); i++) {
      result.add(scored[i].id);
    }
    
    return result;
  }
  
  private intersection(a: Set<number>, b: Set<number>): Set<number> {
    const result = new Set<number>();
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;
    
    for (const item of smaller) {
      if (larger.has(item)) {
        result.add(item);
      }
    }
    
    return result;
  }
}