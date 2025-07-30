/**
 * Pattern mining from git diffs
 * Optional feature for discovering new patterns from successful changes
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { NewPattern } from './types.js';

interface DiffHunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  language?: string;
}

export class PatternMiner {
  private readonly maxDiffLines = 1000;
  private readonly minPatternLines = 3;
  private readonly maxPatternLines = 30;

  /**
   * Mine patterns from git commits
   */
  async minePatterns(commitShas: string[]): Promise<NewPattern[]> {
    const patterns: NewPattern[] = [];

    for (const sha of commitShas) {
      try {
        const hunks = await this.extractDiffHunks(sha);
        const candidates = this.identifyPatternCandidates(hunks);
        
        for (const candidate of candidates) {
          const pattern = this.createPattern(candidate, sha);
          if (pattern) {
            patterns.push(pattern);
          }
        }
      } catch (error) {
        // Log error but continue with other commits
        console.error(`Failed to mine patterns from ${sha}:`, error);
      }
    }

    return patterns;
  }

  /**
   * Extract diff hunks from a commit
   */
  private async extractDiffHunks(sha: string): Promise<DiffHunk[]> {
    const diff = await this.gitCommand(['show', '--no-color', '--pretty=', sha]);
    
    // Check diff size limit
    const lineCount = diff.split('\n').length;
    if (lineCount > this.maxDiffLines) {
      return [];
    }

    const hunks: DiffHunk[] = [];
    const lines = diff.split('\n');
    
    let currentFile: string | null = null;
    let currentHunk: string[] = [];
    let hunkStart = 0;
    
    for (const line of lines) {
      // File header
      if (line.startsWith('diff --git')) {
        // Save previous hunk if exists
        if (currentFile && currentHunk.length >= this.minPatternLines) {
          hunks.push({
            file: currentFile,
            startLine: hunkStart,
            endLine: hunkStart + currentHunk.length,
            content: currentHunk.join('\n'),
            language: this.detectLanguage(currentFile),
          });
        }
        
        // Extract filename
        const match = line.match(/b\/(.+)$/);
        currentFile = match ? match[1] : null;
        currentHunk = [];
        continue;
      }
      
      // Hunk header
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
        hunkStart = match ? parseInt(match[1]) : 0;
        continue;
      }
      
      // Added lines (potential patterns)
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.push(line.substring(1));
      }
    }
    
    // Save last hunk
    if (currentFile && currentHunk.length >= this.minPatternLines) {
      hunks.push({
        file: currentFile,
        startLine: hunkStart,
        endLine: hunkStart + currentHunk.length,
        content: currentHunk.join('\n'),
        language: this.detectLanguage(currentFile),
      });
    }
    
    return hunks;
  }

  /**
   * Identify pattern candidates from hunks
   */
  private identifyPatternCandidates(hunks: DiffHunk[]): DiffHunk[] {
    return hunks.filter(hunk => {
      const lines = hunk.content.split('\n');
      
      // Size constraints
      if (lines.length < this.minPatternLines || lines.length > this.maxPatternLines) {
        return false;
      }
      
      // Look for common pattern indicators
      const content = hunk.content.toLowerCase();
      const patternIndicators = [
        'function',
        'class',
        'interface',
        'type',
        'const',
        'export',
        'import',
        'async',
        'await',
        'try',
        'catch',
        'if',
        'for',
        'while',
        'return',
      ];
      
      // Must contain at least one pattern indicator
      return patternIndicators.some(indicator => content.includes(indicator));
    });
  }

  /**
   * Create a pattern from a candidate hunk
   */
  private createPattern(hunk: DiffHunk, sha: string): NewPattern | null {
    // Generate snippet ID
    const snippetId = this.generateSnippetId(hunk.content);
    
    // Extract a title from the content
    const title = this.extractTitle(hunk.content, hunk.language);
    if (!title) {
      return null;
    }
    
    // Generate summary
    const summary = this.generateSummary(hunk.content, hunk.language);
    
    return {
      title,
      summary,
      scope: {
        languages: hunk.language ? [hunk.language] : [],
        paths: [hunk.file],
      },
      snippets: [{
        label: 'auto-discovered',
        language: hunk.language,
        source_ref: {
          kind: 'git_lines',
          file: hunk.file,
          sha,
          start: hunk.startLine,
          end: hunk.endLine,
        },
        snippet_id: snippetId,
      }],
      evidence: [{
        kind: 'commit',
        sha,
      }],
    };
  }

  /**
   * Extract a title from code content
   */
  private extractTitle(content: string, language?: string): string | null {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return null;
    
    // Look for function/class/type definitions
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /(?:export\s+)?class\s+(\w+)/,
      /(?:export\s+)?interface\s+(\w+)/,
      /(?:export\s+)?type\s+(\w+)/,
      /(?:export\s+)?const\s+(\w+)/,
      /def\s+(\w+)\s*\(/,  // Python
      /class\s+(\w+)/,     // Python/Java/etc
    ];
    
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return `${match[1]} implementation pattern`;
        }
      }
    }
    
    // Fallback: use first non-empty line (truncated)
    const firstLine = lines[0];
    if (firstLine.length > 50) {
      return firstLine.substring(0, 47) + '...';
    }
    return firstLine;
  }

  /**
   * Generate a summary from code content
   */
  private generateSummary(content: string, language?: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    
    // Count key elements
    const hasAsync = /\basync\b/.test(content);
    const hasAwait = /\bawait\b/.test(content);
    const hasTryCatch = /\btry\b.*\bcatch\b/s.test(content);
    const hasError = /\berror\b/i.test(content);
    
    const features = [];
    if (hasAsync || hasAwait) features.push('async');
    if (hasTryCatch) features.push('error handling');
    if (hasError) features.push('error management');
    
    if (features.length > 0) {
      return `Code pattern with ${features.join(', ')} (${lines.length} lines)`;
    }
    
    return `Code pattern extracted from successful implementation (${lines.length} lines)`;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filename: string): string | undefined {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript', 
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'cs': 'csharp',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'hpp': 'cpp',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'r': 'r',
      'sql': 'sql',
      'sh': 'bash',
      'yaml': 'yaml',
      'yml': 'yaml',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
    };
    
    return ext ? languageMap[ext] : undefined;
  }

  /**
   * Generate snippet ID from content
   */
  private generateSnippetId(content: string): string {
    const hash = createHash('sha256');
    hash.update(content);
    return `snip:${hash.digest('hex').substring(0, 12)}`;
  }

  /**
   * Execute git command
   */
  private async gitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const git = spawn('git', args);

      let stdout = '';
      let stderr = '';

      git.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      git.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Git command failed with code ${code}`));
        }
      });

      git.on('error', (error) => {
        reject(error);
      });
    });
  }
}