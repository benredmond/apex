/**
 * Unit tests for tag relationship mappings
 * [APE-63] Multi-Dimensional Pattern Tagging System
 * [BUILD:MODULE:ESM] ★★★☆☆ - ES module with .js extensions
 */

import { describe, it, expect } from '@jest/globals';
import { 
  TAG_RELATIONSHIPS, 
  getRelatedTags, 
  areTagsRelated 
} from '../../src/intelligence/tag-relationships.js';

describe('TAG_RELATIONSHIPS', () => {
  it('should have valid structure', () => {
    expect(TAG_RELATIONSHIPS).toBeDefined();
    expect(typeof TAG_RELATIONSHIPS).toBe('object');
    
    // Each value should be an array of strings
    for (const [tag, related] of Object.entries(TAG_RELATIONSHIPS)) {
      expect(Array.isArray(related)).toBe(true);
      expect(related.every(t => typeof t === 'string')).toBe(true);
    }
  });

  it('should have bidirectional relationships', () => {
    // For each relationship A -> B, there should be B -> A
    const issues: string[] = [];
    
    for (const [tag, relatedTags] of Object.entries(TAG_RELATIONSHIPS)) {
      for (const relatedTag of relatedTags) {
        // Check if the related tag exists in the map
        if (TAG_RELATIONSHIPS[relatedTag]) {
          // Check if it includes the original tag
          if (!TAG_RELATIONSHIPS[relatedTag].includes(tag)) {
            issues.push(`Missing reverse: ${relatedTag} -> ${tag}`);
          }
        } else {
          // Related tag doesn't exist as a key at all
          issues.push(`Missing key: ${relatedTag} (referenced by ${tag})`);
        }
      }
    }
    
    // Report all issues if any
    if (issues.length > 0) {
      console.log('Bidirectional relationship issues:', issues);
    }
    expect(issues).toEqual([]);
  });

  it('should not have self-references', () => {
    for (const [tag, relatedTags] of Object.entries(TAG_RELATIONSHIPS)) {
      expect(relatedTags).not.toContain(tag);
    }
  });

  it('should have lowercase tags only', () => {
    for (const [tag, relatedTags] of Object.entries(TAG_RELATIONSHIPS)) {
      expect(tag).toBe(tag.toLowerCase());
      for (const relatedTag of relatedTags) {
        expect(relatedTag).toBe(relatedTag.toLowerCase());
      }
    }
  });

  it('should have unique related tags (no duplicates)', () => {
    for (const [tag, relatedTags] of Object.entries(TAG_RELATIONSHIPS)) {
      const unique = new Set(relatedTags);
      expect(unique.size).toBe(relatedTags.length);
    }
  });

  describe('authentication domain relationships', () => {
    it('should link auth-related tags correctly', () => {
      expect(TAG_RELATIONSHIPS.auth).toContain('authentication');
      expect(TAG_RELATIONSHIPS.auth).toContain('security');
      expect(TAG_RELATIONSHIPS.auth).toContain('jwt');
      expect(TAG_RELATIONSHIPS.auth).toContain('oauth');
      
      expect(TAG_RELATIONSHIPS.jwt).toContain('auth');
      expect(TAG_RELATIONSHIPS.jwt).toContain('token');
      expect(TAG_RELATIONSHIPS.jwt).toContain('session');
      
      expect(TAG_RELATIONSHIPS.oauth).toContain('auth');
      expect(TAG_RELATIONSHIPS.oauth).toContain('sso');
    });
  });

  describe('testing domain relationships', () => {
    it('should link test-related tags correctly', () => {
      expect(TAG_RELATIONSHIPS.test).toContain('testing');
      expect(TAG_RELATIONSHIPS.test).toContain('jest');
      expect(TAG_RELATIONSHIPS.test).toContain('pytest');
      expect(TAG_RELATIONSHIPS.test).toContain('coverage');
      
      expect(TAG_RELATIONSHIPS.jest).toContain('test');
      expect(TAG_RELATIONSHIPS.jest).toContain('javascript');
      
      expect(TAG_RELATIONSHIPS.mock).toContain('test');
      expect(TAG_RELATIONSHIPS.mock).toContain('stub');
    });
  });

  describe('database domain relationships', () => {
    it('should link database-related tags correctly', () => {
      expect(TAG_RELATIONSHIPS.database).toContain('db');
      expect(TAG_RELATIONSHIPS.database).toContain('sql');
      expect(TAG_RELATIONSHIPS.database).toContain('storage');
      
      expect(TAG_RELATIONSHIPS.sqlite).toContain('database');
      expect(TAG_RELATIONSHIPS.sqlite).toContain('sql');
      expect(TAG_RELATIONSHIPS.sqlite).toContain('embedded');
      
      expect(TAG_RELATIONSHIPS.redis).toContain('cache');
      expect(TAG_RELATIONSHIPS.redis).toContain('database');
    });
  });

  describe('performance domain relationships', () => {
    it('should link performance-related tags correctly', () => {
      expect(TAG_RELATIONSHIPS.performance).toContain('optimization');
      expect(TAG_RELATIONSHIPS.performance).toContain('speed');
      expect(TAG_RELATIONSHIPS.performance).toContain('cache');
      
      expect(TAG_RELATIONSHIPS.cache).toContain('caching');
      expect(TAG_RELATIONSHIPS.cache).toContain('performance');
      expect(TAG_RELATIONSHIPS.cache).toContain('redis');
    });
  });
});

describe('getRelatedTags()', () => {
  it('should return tag itself plus related tags', () => {
    const related = getRelatedTags('auth');
    
    expect(related).toContain('auth'); // Should include itself
    expect(related).toContain('authentication');
    expect(related).toContain('security');
    expect(related).toContain('jwt');
  });

  it('should handle unknown tags', () => {
    const related = getRelatedTags('unknown-tag-xyz');
    
    expect(related).toEqual(['unknown-tag-xyz']); // Only returns itself
  });

  it('should handle case insensitively', () => {
    const related1 = getRelatedTags('AUTH');
    const related2 = getRelatedTags('auth');
    
    expect(related1).toEqual(related2);
  });

  it('should return unique tags', () => {
    const related = getRelatedTags('api');
    const unique = new Set(related);
    
    expect(unique.size).toBe(related.length);
  });

  it('should handle empty string', () => {
    const related = getRelatedTags('');
    expect(related).toEqual(['']);
  });

  it('should include all defined relationships', () => {
    const related = getRelatedTags('cache');
    
    // Should include all tags from TAG_RELATIONSHIPS.cache plus 'cache' itself
    expect(related).toContain('cache');
    for (const tag of TAG_RELATIONSHIPS.cache || []) {
      expect(related).toContain(tag);
    }
  });
});

describe('areTagsRelated()', () => {
  it('should return true for same tag', () => {
    expect(areTagsRelated('auth', 'auth')).toBe(true);
    expect(areTagsRelated('API', 'api')).toBe(true); // Case insensitive
  });

  it('should return true for directly related tags', () => {
    expect(areTagsRelated('auth', 'authentication')).toBe(true);
    expect(areTagsRelated('authentication', 'auth')).toBe(true); // Symmetric
    
    expect(areTagsRelated('cache', 'redis')).toBe(true);
    expect(areTagsRelated('redis', 'cache')).toBe(true);
  });

  it('should return false for unrelated tags', () => {
    // These tags are not directly related (may be indirectly through expansion)
    expect(areTagsRelated('api', 'database')).toBe(false);
    expect(areTagsRelated('ui', 'python')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(areTagsRelated('AUTH', 'AUTHENTICATION')).toBe(true);
    expect(areTagsRelated('Cache', 'Redis')).toBe(true);
  });

  it('should handle unknown tags', () => {
    expect(areTagsRelated('unknown1', 'unknown2')).toBe(false);
    expect(areTagsRelated('auth', 'unknown')).toBe(false);
    expect(areTagsRelated('unknown', 'auth')).toBe(false);
  });

  it('should be symmetric', () => {
    const tags = Object.keys(TAG_RELATIONSHIPS);
    
    // Test a sample of relationships for symmetry
    for (let i = 0; i < Math.min(10, tags.length); i++) {
      const tag1 = tags[i];
      const relatedTags = TAG_RELATIONSHIPS[tag1] || [];
      
      for (const tag2 of relatedTags.slice(0, 3)) {
        const result1 = areTagsRelated(tag1, tag2);
        const result2 = areTagsRelated(tag2, tag1);
        expect(result1).toBe(result2);
      }
    }
  });
});

describe('relationship coverage', () => {
  it('should cover major domains', () => {
    const domains = [
      'authentication', 'testing', 'database', 'api', 
      'frontend', 'performance', 'error', 'pattern'
    ];
    
    for (const domain of domains) {
      expect(TAG_RELATIONSHIPS).toHaveProperty(domain);
      expect(TAG_RELATIONSHIPS[domain].length).toBeGreaterThan(0);
    }
  });

  it('should have reasonable relationship counts', () => {
    for (const [tag, related] of Object.entries(TAG_RELATIONSHIPS)) {
      // Each tag should have at least 2 related tags
      expect(related.length).toBeGreaterThanOrEqual(2);
      
      // But not too many (prevent over-connection)
      expect(related.length).toBeLessThanOrEqual(15);
    }
  });

  it('should not have orphaned tags', () => {
    const allTags = new Set<string>();
    
    // Collect all tags (keys and values)
    for (const [tag, related] of Object.entries(TAG_RELATIONSHIPS)) {
      allTags.add(tag);
      for (const relatedTag of related) {
        allTags.add(relatedTag);
      }
    }
    
    // Check that most referenced tags also exist as keys
    const referencedOnly = new Set<string>();
    for (const tag of allTags) {
      if (!TAG_RELATIONSHIPS[tag]) {
        referencedOnly.add(tag);
      }
    }
    
    // Some tags may only be referenced (like specific library names)
    // but there shouldn't be too many
    const orphanedRatio = referencedOnly.size / allTags.size;
    expect(orphanedRatio).toBeLessThan(0.3); // Less than 30% orphaned
  });
});