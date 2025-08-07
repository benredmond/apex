import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { 
  type BookPattern, 
  type CompleteBookPattern,
  CompleteBookPatternSchema,
  type BookSource
} from './schemas.js';

// [ARCH:VALIDATION:ZOD_SCHEMA] ★★★★★ - Schema validation for patterns
// [PAT:VALIDATION:SCHEMA] ★★★★★ - Pre-validation and deduplication

export class PatternValidator {
  private seenHashes = new Set<string>();

  /**
   * Validate and transform book patterns into database-ready format
   */
  validateAndTransform(
    patterns: BookPattern[],
    source: BookSource
  ): CompleteBookPattern[] {
    const validPatterns: CompleteBookPattern[] = [];

    for (const pattern of patterns) {
      try {
        const transformed = this.transformPattern(pattern, source);
        
        // Check for duplicates using content hash
        const hash = this.generateContentHash(transformed);
        if (this.seenHashes.has(hash)) {
          console.log(`[PatternValidator] Skipping duplicate pattern: ${pattern.title}`);
          continue;
        }
        
        // Validate against schema
        const validated = CompleteBookPatternSchema.parse(transformed);
        
        this.seenHashes.add(hash);
        validPatterns.push(validated);
      } catch (error) {
        console.error(`[PatternValidator] Failed to validate pattern "${pattern.title}":`, error);
      }
    }

    return validPatterns;
  }

  /**
   * Transform book pattern to complete pattern format
   */
  private transformPattern(
    pattern: BookPattern,
    source: BookSource
  ): CompleteBookPattern {
    // Generate pattern ID: BOOK:SOURCE:CATEGORY:IDENTIFIER
    const bookPrefix = source.book
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .substring(0, 20);
    
    const categoryPrefix = pattern.category
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_');
    
    const titleSlug = pattern.title
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .substring(0, 30);

    const patternId = `BOOK:${bookPrefix}:${categoryPrefix}:${titleSlug}`;

    // Build summary with key insight
    let summary = pattern.description;
    if (pattern.keyInsight) {
      summary += ` Key insight: ${pattern.keyInsight}`;
    }
    if (pattern.whenToUse) {
      summary += ` Use when: ${pattern.whenToUse}`;
    }

    // Create snippet
    const snippetId = `book-${nanoid(8)}`;
    const snippet = {
      snippet_id: snippetId,
      language: pattern.code.language,
      code: pattern.code.snippet,
      source_ref: {
        kind: 'book' as const,
        book: source.book,
        chapter: source.chapter,
        page: source.page
      }
    };

    // Combine tags
    const tags = [
      ...pattern.tags,
      'book-pattern',
      source.book.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      pattern.category.toLowerCase()
    ].filter((tag, index, array) => array.indexOf(tag) === index); // Remove duplicates

    return {
      id: patternId,
      type: 'PAT',
      title: pattern.title,
      summary,
      source,
      snippets: [snippet],
      tags,
      trust_score: 0.0, // Zero initial trust per architecture decision
      evidence: []
    };
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(pattern: CompleteBookPattern): string {
    const content = {
      title: pattern.title,
      summary: pattern.summary,
      code: pattern.snippets.map(s => s.code).join('\n')
    };
    
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Validate code syntax (basic check)
   */
  validateCodeSyntax(code: string, language: string): boolean {
    // Basic validation - check for common syntax issues
    if (!code || code.trim().length === 0) {
      return false;
    }

    // Language-specific basic checks
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'typescript':
        return this.validateJavaScriptSyntax(code);
      case 'python':
        return this.validatePythonSyntax(code);
      case 'java':
        return this.validateJavaSyntax(code);
      default:
        // For unknown languages, just check it's not empty
        return code.trim().length > 0;
    }
  }

  private validateJavaScriptSyntax(code: string): boolean {
    // Check for balanced braces, brackets, and parentheses
    const stack: string[] = [];
    const pairs: Record<string, string> = {
      '{': '}',
      '[': ']',
      '(': ')'
    };
    
    for (const char of code) {
      if (char in pairs) {
        stack.push(char);
      } else if (Object.values(pairs).includes(char)) {
        const last = stack.pop();
        if (!last || pairs[last] !== char) {
          return false;
        }
      }
    }
    
    return stack.length === 0;
  }

  private validatePythonSyntax(code: string): boolean {
    // Check for proper indentation (simplified)
    const lines = code.split('\n');
    let expectedIndent = 0;
    
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const indent = line.length - line.trimStart().length;
      
      // Check if line ends with colon (should increase indent)
      if (line.trimEnd().endsWith(':')) {
        expectedIndent = indent + 4;
      } else if (indent < expectedIndent && !line.trim().startsWith('#')) {
        // Allow dedent but not random indentation
        if (indent % 4 !== 0) {
          return false;
        }
        expectedIndent = indent;
      }
    }
    
    return true;
  }

  private validateJavaSyntax(code: string): boolean {
    // Similar to JavaScript but also check for semicolons
    const jsValid = this.validateJavaScriptSyntax(code);
    if (!jsValid) return false;
    
    // Check that statements end with semicolons (simplified)
    const lines = code.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && 
          !trimmed.endsWith('{') && 
          !trimmed.endsWith('}') && 
          !trimmed.startsWith('//') &&
          !trimmed.includes('*/') &&
          trimmed.length > 0) {
        // Statement lines should end with semicolon
        if (!trimmed.endsWith(';') && !trimmed.endsWith(',')) {
          // Could be a continuation, so this is a soft check
          console.warn(`[PatternValidator] Possible missing semicolon: ${trimmed}`);
        }
      }
    }
    
    return true;
  }

  /**
   * Reset seen hashes (for new extraction session)
   */
  reset(): void {
    this.seenHashes.clear();
  }
}