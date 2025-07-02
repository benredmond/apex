/**
 * APEX Intelligence - Pattern Manager
 * Core engine for pattern recognition, tracking, and promotion
 */

import fs from 'fs-extra';
import path from 'path';

export class PatternManager {
  constructor(projectRoot = '.') {
    this.projectRoot = projectRoot;
    this.apexDir = path.join(projectRoot, '.apex');
    this.conventionsPath = path.join(this.apexDir, 'CONVENTIONS.md');
    this.pendingPath = path.join(this.apexDir, 'CONVENTIONS.pending.md');
    this.metadataPath = path.join(this.apexDir, 'PATTERN_METADATA.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(this.apexDir, 'config.json');
    try {
      return fs.readJsonSync(configPath).apex || {};
    } catch {
      return {
        patternPromotionThreshold: 3,
        trustScoreThreshold: 0.8,
        enableAutoPatterns: true
      };
    }
  }

  /**
   * Parse a pattern ID into components
   * Format: [TYPE:CATEGORY:SPECIFIC]
   */
  parsePatternId(patternId) {
    const match = patternId.match(/\[(\w+):(\w+):(\w+)\]/);
    if (!match) return null;
    
    return {
      type: match[1],
      category: match[2],
      specific: match[3],
      fullId: match[0]
    };
  }

  /**
   * Calculate trust score based on usage statistics
   */
  calculateTrustScore(uses, successRate) {
    // Base score from success rate
    let score = successRate;
    
    // Boost for high usage
    if (uses > 50) score *= 1.1;
    else if (uses > 20) score *= 1.05;
    
    // Penalty for low usage
    if (uses < 3) score *= 0.8;
    
    return Math.min(score, 1.0);
  }

  /**
   * Get star rating from trust score
   */
  getStarRating(trustScore) {
    if (trustScore >= 0.95) return '★★★★★';
    if (trustScore >= 0.85) return '★★★★☆';
    if (trustScore >= 0.70) return '★★★☆☆';
    if (trustScore >= 0.50) return '★★☆☆☆';
    return '★☆☆☆☆';
  }

  /**
   * Load pattern metadata
   */
  async loadMetadata() {
    try {
      return await fs.readJson(this.metadataPath);
    } catch {
      return {};
    }
  }

  /**
   * Save pattern metadata
   */
  async saveMetadata(metadata) {
    await fs.writeJson(this.metadataPath, metadata, { spaces: 2 });
  }

  /**
   * Extract patterns from a markdown file
   */
  extractPatterns(content) {
    const patterns = [];
    const patternRegex = /\[(\w+:\w+:\w+)\]([^[]*?)(?=\[|$)/gs;
    
    let match;
    while ((match = patternRegex.exec(content)) !== null) {
      const patternId = `[${match[1]}]`;
      const patternContent = match[2].trim();
      
      // Extract metadata from content
      const statsMatch = patternContent.match(/\((\d+) uses?, (\d+)% success\)/);
      const uses = statsMatch ? parseInt(statsMatch[1]) : 0;
      const successRate = statsMatch ? parseInt(statsMatch[2]) / 100 : 0;
      
      patterns.push({
        id: patternId,
        content: patternContent,
        uses,
        successRate,
        trustScore: this.calculateTrustScore(uses, successRate)
      });
    }
    
    return patterns;
  }

  /**
   * Find patterns relevant to a task
   */
  async findRelevantPatterns(taskDescription, taskContext = {}) {
    const conventions = await fs.readFile(this.conventionsPath, 'utf-8');
    const patterns = this.extractPatterns(conventions);
    
    // Simple keyword matching (can be enhanced with better NLP)
    const keywords = taskDescription.toLowerCase().split(/\s+/);
    const relevant = [];
    
    for (const pattern of patterns) {
      const patternText = pattern.content.toLowerCase();
      const matchCount = keywords.filter(kw => patternText.includes(kw)).length;
      
      if (matchCount > 0) {
        relevant.push({
          ...pattern,
          relevance: matchCount / keywords.length
        });
      }
    }
    
    // Sort by relevance and trust score
    return relevant.sort((a, b) => {
      const scoreA = a.relevance * a.trustScore;
      const scoreB = b.relevance * b.trustScore;
      return scoreB - scoreA;
    });
  }

  /**
   * Record pattern usage
   */
  async recordUsage(patternId, success) {
    const metadata = await this.loadMetadata();
    
    if (!metadata[patternId]) {
      metadata[patternId] = {
        uses: 0,
        successes: 0,
        failures: 0,
        lastUsed: null,
        promoted: false
      };
    }
    
    metadata[patternId].uses++;
    if (success) {
      metadata[patternId].successes++;
    } else {
      metadata[patternId].failures++;
    }
    metadata[patternId].lastUsed = new Date().toISOString();
    
    await this.saveMetadata(metadata);
    
    // Check if pattern should be promoted
    if (metadata[patternId].uses >= this.config.patternPromotionThreshold &&
        !metadata[patternId].promoted) {
      const successRate = metadata[patternId].successes / metadata[patternId].uses;
      if (successRate >= this.config.trustScoreThreshold) {
        await this.promotePattern(patternId);
        metadata[patternId].promoted = true;
        await this.saveMetadata(metadata);
      }
    }
  }

  /**
   * Promote a pattern from pending to active
   */
  async promotePattern(patternId) {
    const pending = await fs.readFile(this.pendingPath, 'utf-8');
    const conventions = await fs.readFile(this.conventionsPath, 'utf-8');
    
    // Find pattern in pending
    const patterns = this.extractPatterns(pending);
    const pattern = patterns.find(p => p.id === patternId);
    
    if (!pattern) return false;
    
    // Update pattern stats
    const metadata = await this.loadMetadata();
    const stats = metadata[patternId] || {};
    const successRate = stats.successes / stats.uses;
    const trustScore = this.calculateTrustScore(stats.uses, successRate);
    const stars = this.getStarRating(trustScore);
    
    // Format pattern for conventions
    const formattedPattern = pattern.content
      .replace(/★[★☆]+/, stars)
      .replace(/\(\d+ uses?, \d+% success\)/, `(${stats.uses} uses, ${Math.round(successRate * 100)}% success)`);
    
    // Add to conventions
    const updatedConventions = conventions + '\n' + formattedPattern + '\n';
    await fs.writeFile(this.conventionsPath, updatedConventions);
    
    // Remove from pending
    const updatedPending = pending.replace(pattern.content, '');
    await fs.writeFile(this.pendingPath, updatedPending);
    
    return true;
  }

  /**
   * Add a new pattern to pending
   */
  async addPattern(patternDefinition) {
    const pending = await fs.readFile(this.pendingPath, 'utf-8');
    
    // Format pattern
    const formatted = `
${patternDefinition.id} ${this.getStarRating(0.5)} (0 uses, 0% success) ${patternDefinition.tags.join(' ')}
${patternDefinition.code}
CONTEXT: ${patternDefinition.context}
PREVENTS: ${patternDefinition.prevents}
${patternDefinition.seeAlso ? `SEE_ALSO: ${patternDefinition.seeAlso}` : ''}
`;
    
    await fs.writeFile(this.pendingPath, pending + formatted);
    
    return patternDefinition.id;
  }

  /**
   * Analyze pattern performance
   */
  async analyzePatterns() {
    const metadata = await this.loadMetadata();
    const analysis = {
      total: 0,
      active: 0,
      pending: 0,
      highPerformers: [],
      needsAttention: [],
      recentlyUsed: []
    };
    
    for (const [patternId, stats] of Object.entries(metadata)) {
      analysis.total++;
      
      if (stats.promoted) analysis.active++;
      else analysis.pending++;
      
      const successRate = stats.uses > 0 ? stats.successes / stats.uses : 0;
      
      if (successRate >= 0.9 && stats.uses > 10) {
        analysis.highPerformers.push({ patternId, successRate, uses: stats.uses });
      }
      
      if (successRate < 0.5 && stats.uses > 5) {
        analysis.needsAttention.push({ patternId, successRate, uses: stats.uses });
      }
      
      if (stats.lastUsed) {
        const daysSinceUse = (Date.now() - new Date(stats.lastUsed)) / (1000 * 60 * 60 * 24);
        if (daysSinceUse < 7) {
          analysis.recentlyUsed.push({ patternId, lastUsed: stats.lastUsed });
        }
      }
    }
    
    return analysis;
  }
}

export default PatternManager;