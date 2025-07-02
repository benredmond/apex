import { PatternManager } from '../src/intelligence/pattern-manager.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('PatternManager', () => {
  let tempDir;
  let patternManager;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `apex-test-${Date.now()}`);
    await fs.ensureDir(path.join(tempDir, '.apex'));
    
    // Initialize pattern manager with temp directory
    patternManager = new PatternManager(tempDir);
    
    // Create initial files
    await fs.writeFile(
      path.join(tempDir, '.apex', 'CONVENTIONS.md'),
      `# Conventions

## Patterns

[CMD:TEST:UNIT] ★★★★★ (45 uses, 98% success) @testing @jest
\`\`\`bash
npm test
\`\`\`
CONTEXT: Running unit tests
PREVENTS: Untested code

[PAT:ERROR:HANDLING] ★★★★☆ (23 uses, 87% success) @error @async
\`\`\`javascript
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed:', error);
  throw new AppError('User-friendly message', error);
}
\`\`\`
CONTEXT: Handling async errors gracefully
PREVENTS: Unhandled promise rejections
`
    );
    
    await fs.writeFile(
      path.join(tempDir, '.apex', 'CONVENTIONS.pending.md'),
      '# Pending Conventions\n\n'
    );
    
    await fs.writeJson(
      path.join(tempDir, '.apex', 'config.json'),
      { apex: { patternPromotionThreshold: 3, trustScoreThreshold: 0.8 } }
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.remove(tempDir);
  });

  describe('parsePatternId', () => {
    it('should parse valid pattern IDs', () => {
      const result = patternManager.parsePatternId('[CMD:TEST:UNIT]');
      expect(result).toEqual({
        type: 'CMD',
        category: 'TEST',
        specific: 'UNIT',
        fullId: '[CMD:TEST:UNIT]'
      });
    });

    it('should return null for invalid pattern IDs', () => {
      expect(patternManager.parsePatternId('invalid')).toBeNull();
      expect(patternManager.parsePatternId('[INVALID]')).toBeNull();
    });
  });

  describe('calculateTrustScore', () => {
    it('should calculate trust score based on usage and success rate', () => {
      expect(patternManager.calculateTrustScore(50, 0.95)).toBeGreaterThan(0.9);
      expect(patternManager.calculateTrustScore(10, 0.80)).toBeGreaterThan(0.7);
      expect(patternManager.calculateTrustScore(2, 0.90)).toBeLessThan(0.8);
    });

    it('should cap trust score at 1.0', () => {
      expect(patternManager.calculateTrustScore(100, 1.0)).toBe(1.0);
    });
  });

  describe('getStarRating', () => {
    it('should return correct star ratings', () => {
      expect(patternManager.getStarRating(0.96)).toBe('★★★★★');
      expect(patternManager.getStarRating(0.88)).toBe('★★★★☆');
      expect(patternManager.getStarRating(0.75)).toBe('★★★☆☆');
      expect(patternManager.getStarRating(0.55)).toBe('★★☆☆☆');
      expect(patternManager.getStarRating(0.40)).toBe('★☆☆☆☆');
    });
  });

  describe('extractPatterns', () => {
    it('should extract patterns from markdown content', async () => {
      const content = await fs.readFile(
        path.join(tempDir, '.apex', 'CONVENTIONS.md'),
        'utf-8'
      );
      const patterns = patternManager.extractPatterns(content);
      
      expect(patterns).toHaveLength(2);
      expect(patterns[0]).toMatchObject({
        id: '[CMD:TEST:UNIT]',
        uses: 45,
        successRate: 0.98
      });
      expect(patterns[1]).toMatchObject({
        id: '[PAT:ERROR:HANDLING]',
        uses: 23,
        successRate: 0.87
      });
    });
  });

  describe('findRelevantPatterns', () => {
    it('should find patterns matching task description', async () => {
      const patterns = await patternManager.findRelevantPatterns('write unit tests for error handling');
      
      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).toBe('[CMD:TEST:UNIT]'); // Higher trust score
      expect(patterns[0].relevance).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', async () => {
      const patterns = await patternManager.findRelevantPatterns('deploy to kubernetes');
      expect(patterns).toHaveLength(0);
    });
  });

  describe('recordUsage', () => {
    it('should record pattern usage and update metadata', async () => {
      await patternManager.recordUsage('[CMD:TEST:UNIT]', true);
      
      const metadata = await fs.readJson(
        path.join(tempDir, '.apex', 'PATTERN_METADATA.json')
      );
      
      expect(metadata['[CMD:TEST:UNIT]']).toMatchObject({
        uses: 1,
        successes: 1,
        failures: 0
      });
    });

    it('should track failures', async () => {
      await patternManager.recordUsage('[CMD:TEST:UNIT]', false);
      
      const metadata = await fs.readJson(
        path.join(tempDir, '.apex', 'PATTERN_METADATA.json')
      );
      
      expect(metadata['[CMD:TEST:UNIT]'].failures).toBe(1);
    });
  });

  describe('addPattern', () => {
    it('should add new pattern to pending', async () => {
      const patternDef = {
        id: '[PAT:API:VALIDATION]',
        code: 'const validated = validator.validate(input);',
        tags: ['@api', '@validation'],
        context: 'API input validation',
        prevents: 'Invalid data processing'
      };
      
      await patternManager.addPattern(patternDef);
      
      const pending = await fs.readFile(
        path.join(tempDir, '.apex', 'CONVENTIONS.pending.md'),
        'utf-8'
      );
      
      expect(pending).toContain('[PAT:API:VALIDATION]');
      expect(pending).toContain('API input validation');
    });
  });
});