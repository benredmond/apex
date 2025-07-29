import { PatternMeta } from './types.js';

/**
 * Adapts patterns from storage format to ranking format
 * Note: This is a simplified adapter since the actual storage format
 * is different from what was expected. In a real implementation,
 * this would query the related tables to get scope information.
 */
export function adaptStoragePattern(pattern: any): PatternMeta {
  const meta: PatternMeta = {
    id: pattern.id,
    type: pattern.type,
    scope: {
      // In real implementation, these would come from joining with
      // PatternLanguage, PatternFramework, PatternPath tables
      paths: pattern.paths || [],
      languages: pattern.languages || [],
      frameworks: pattern.frameworks || [],
    },
    metadata: {
      lastReviewed: pattern.updated_at,
      halfLifeDays: 90,
      repo: pattern.source_repo,
      // Org could be extracted from pattern ID prefix
      org: pattern.id.split('.')[0],
    },
  };
  
  // Adapt trust information
  if (pattern.trust_score !== undefined) {
    meta.trust = {
      score: pattern.trust_score,
      // Alpha/beta will be derived from score if not present
    };
  }
  
  return meta;
}

/**
 * Creates a pattern ranker from a storage repository
 * Note: This is a simplified version. A full implementation would
 * properly query all the related tables to build complete patterns.
 */
export async function createRankerFromRepository(
  repository: any,
  config?: any
): Promise<{ rankPatterns: (signals: any, k?: number) => Promise<any[]> }> {
  // In a real implementation, this would query patterns with all their relations
  // For now, we'll just use a mock implementation
  const patterns: PatternMeta[] = [];
  
  // Import ranking module dynamically to avoid circular dependencies
  const { rankPatterns } = await import('./index.js');
  
  return {
    rankPatterns: (signals, k) => rankPatterns(patterns, signals, k, config),
  };
}