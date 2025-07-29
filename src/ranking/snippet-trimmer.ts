import { createHash } from 'crypto';

export interface TrimOptions {
  targetLines: number;
  contextLines?: number;
  preserveFunction?: boolean;
}

export interface TrimResult {
  code: string;
  startLine: number;
  endLine: number;
  snippetId: string;
  wasTrimmed: boolean;
}

/**
 * SnippetTrimmer - Intelligently extracts and trims code snippets
 * Preserves semantic boundaries and function context
 */
export class SnippetTrimmer {
  private cache: Map<string, TrimResult> = new Map();

  /**
   * Trim a code snippet to target size while preserving context
   */
  trimSnippet(
    code: string,
    sourceRef: string,
    targetLine: number,
    options: TrimOptions
  ): TrimResult {
    const cacheKey = `${sourceRef}:${targetLine}:${options.targetLines}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const lines = code.split('\n');
    const totalLines = lines.length;
    
    // Parse source reference to get original line numbers
    const [, lineRange] = sourceRef.split(':');
    const [startStr, endStr] = lineRange?.split('-') || ['1', String(totalLines)];
    const originalStart = parseInt(startStr.replace('L', ''), 10);
    
    // Calculate the target line index within the snippet
    const targetIndex = targetLine - originalStart;
    
    // Determine extraction boundaries
    let extractStart = targetIndex;
    let extractEnd = targetIndex;
    
    if (options.preserveFunction !== false) {
      // Try to find function/class boundaries
      const boundaries = this.findFunctionBoundaries(lines, targetIndex);
      if (boundaries) {
        extractStart = boundaries.start;
        extractEnd = boundaries.end;
      }
    }
    
    // Apply context window
    const contextLines = options.contextLines || 6;
    extractStart = Math.max(0, extractStart - contextLines);
    extractEnd = Math.min(totalLines - 1, extractEnd + contextLines);
    
    // Enforce target line limit
    if (extractEnd - extractStart + 1 > options.targetLines) {
      // Center around target line if possible
      const halfTarget = Math.floor(options.targetLines / 2);
      extractStart = Math.max(0, targetIndex - halfTarget);
      extractEnd = Math.min(totalLines - 1, extractStart + options.targetLines - 1);
      
      // Adjust if we hit the end
      if (extractEnd === totalLines - 1) {
        extractStart = Math.max(0, extractEnd - options.targetLines + 1);
      }
    }
    
    // Extract the snippet
    const trimmedLines = lines.slice(extractStart, extractEnd + 1);
    const trimmedCode = trimmedLines.join('\n');
    
    // Generate snippet ID
    const snippetId = this.generateSnippetId(trimmedCode);
    
    // Calculate new line numbers
    const newStartLine = originalStart + extractStart;
    const newEndLine = originalStart + extractEnd;
    
    const result: TrimResult = {
      code: trimmedCode,
      startLine: newStartLine,
      endLine: newEndLine,
      snippetId,
      wasTrimmed: extractEnd - extractStart + 1 < totalLines,
    };
    
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Find function or class boundaries around a target line
   */
  private findFunctionBoundaries(
    lines: string[],
    targetIndex: number
  ): { start: number; end: number } | null {
    // Simple heuristic-based detection
    let functionStart = targetIndex;
    let functionEnd = targetIndex;
    let braceCount = 0;
    let inFunction = false;
    
    // Search backwards for function/class start
    for (let i = targetIndex; i >= 0; i--) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check for function/class/method declarations
      if (this.isFunctionDeclaration(trimmed)) {
        functionStart = i;
        inFunction = true;
        break;
      }
      
      // Track braces to find containing block
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceCount += closeBraces - openBraces;
      
      if (braceCount > 0 && this.isBlockStart(trimmed)) {
        functionStart = i;
        inFunction = true;
        break;
      }
    }
    
    if (!inFunction) {
      return null;
    }
    
    // Search forward for function end
    braceCount = 0;
    let foundOpenBrace = false;
    
    for (let i = functionStart; i < lines.length; i++) {
      const line = lines[i];
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      
      braceCount += openBraces - closeBraces;
      if (openBraces > 0) {
        foundOpenBrace = true;
      }
      
      if (foundOpenBrace && braceCount === 0) {
        functionEnd = i;
        break;
      }
    }
    
    return { start: functionStart, end: functionEnd };
  }

  /**
   * Check if a line appears to be a function declaration
   */
  private isFunctionDeclaration(line: string): boolean {
    const patterns = [
      /^(export\s+)?(async\s+)?function\s+\w+/,
      /^(export\s+)?const\s+\w+\s*=\s*(async\s*)?\(/,
      /^(export\s+)?const\s+\w+\s*=\s*(async\s*)?function/,
      /^(public|private|protected)?\s*(static\s*)?(async\s*)?\w+\s*\(/,
      /^class\s+\w+/,
      /^(export\s+)?class\s+\w+/,
      /^def\s+\w+\s*\(/,  // Python
      /^func\s+\w+\s*\(/,  // Go
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if a line appears to start a code block
   */
  private isBlockStart(line: string): boolean {
    return line.endsWith('{') || line.endsWith(':');
  }

  /**
   * Generate a unique ID for a snippet
   */
  private generateSnippetId(code: string): string {
    const hash = createHash('sha256').update(code).digest('hex');
    return `snip:${hash.substring(0, 8)}`;
  }

  /**
   * Update source reference with new line numbers
   */
  updateSourceRef(
    originalRef: string,
    startLine: number,
    endLine: number
  ): string {
    const [filePart] = originalRef.split(':');
    return `${filePart}:L${startLine}-L${endLine}`;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}