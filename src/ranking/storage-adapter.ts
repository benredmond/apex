import { PatternMeta } from './types.js';

/**
 * Adapts patterns from storage format to ranking format
 * Note: This is a simplified adapter since the actual storage format
 * is different from what was expected. In a real implementation,
 * this would query the related tables to get scope information.
 */
export function adaptStoragePattern(pattern: any): PatternMeta {
  // If json_canonical exists, parse it to get the full pattern data
  let fullPattern = pattern;
  if (pattern.json_canonical) {
    try {
      fullPattern = JSON.parse(pattern.json_canonical);
    } catch (e) {
      console.error('Failed to parse json_canonical:', e);
    }
  }
  
  const meta: PatternMeta = {
    id: pattern.id,
    type: pattern.type,
    scope: {
      // Extract from fullPattern.scope if available, otherwise use defaults
      paths: fullPattern.scope?.paths || pattern.paths || [],
      languages: fullPattern.scope?.languages || pattern.languages || [],
      frameworks: adaptFrameworks(fullPattern.scope?.frameworks || pattern.frameworks || []),
    },
    metadata: {
      lastReviewed: fullPattern.metadata?.lastReviewed || pattern.updated_at,
      halfLifeDays: fullPattern.metadata?.halfLifeDays || 90,
      repo: fullPattern.metadata?.repo || pattern.source_repo,
      // Extract org from metadata or pattern ID prefix
      org: fullPattern.metadata?.org || pattern.id.split('.')[0] || pattern.id.split(':')[0],
    },
  };
  
  // Adapt trust information from metadata
  if (fullPattern.metadata?.trust?.score !== undefined) {
    meta.trust = {
      score: fullPattern.metadata.trust.score,
      // Alpha/beta will be derived from score if not present
    };
  } else if (pattern.trust_score !== undefined) {
    meta.trust = {
      score: pattern.trust_score,
    };
  }
  
  return meta;
}

/**
 * Adapt frameworks to the expected format
 */
function adaptFrameworks(frameworks: any[]): Array<{ name: string; range?: string }> {
  if (!frameworks || !Array.isArray(frameworks)) {
    return [];
  }
  
  return frameworks.map(fw => {
    if (typeof fw === 'string') {
      // Parse strings like "express@^4.0.0"
      const match = fw.match(/^([^@]+)(@(.+))?$/);
      if (match) {
        return { name: match[1], range: match[3] };
      }
      return { name: fw };
    } else if (fw && typeof fw === 'object' && fw.name) {
      return { name: fw.name, range: fw.range };
    }
    return null;
  }).filter(Boolean) as Array<{ name: string; range?: string }>;
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
  // Import ranking module dynamically to avoid circular dependencies
  const { rankPatterns } = await import('./index.js');
  
  return {
    rankPatterns: async (signals, k) => {
      // Query all patterns from repository
      // Using a large k value to get all patterns for ranking
      const result = await repository.lookup({ k: 1000 });
      const patterns: PatternMeta[] = result.patterns.map((p: any) => adaptStoragePattern(p));
      
      return rankPatterns(patterns, signals, k, config);
    },
  };
}