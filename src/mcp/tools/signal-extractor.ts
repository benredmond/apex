/**
 * Signal extraction and normalization for pattern lookup
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success)
 */

import path from 'path';
import { Signals } from '../../ranking/types.js';

// Language mapping from file extensions
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript family
  'js': 'javascript',
  'jsx': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  
  // Python
  'py': 'python',
  'pyw': 'python',
  'pyi': 'python',
  
  // Java family
  'java': 'java',
  'kt': 'kotlin',
  'scala': 'scala',
  
  // C family
  'c': 'c',
  'h': 'c',
  'cpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  'hpp': 'cpp',
  'cs': 'csharp',
  
  // Web
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'sass',
  'less': 'less',
  
  // Other
  'go': 'go',
  'rs': 'rust',
  'rb': 'ruby',
  'php': 'php',
  'swift': 'swift',
  'm': 'objective-c',
  'r': 'r',
  'sql': 'sql',
  'sh': 'bash',
  'bash': 'bash',
  'zsh': 'zsh',
  'ps1': 'powershell',
  'yaml': 'yaml',
  'yml': 'yaml',
  'json': 'json',
  'xml': 'xml',
  'md': 'markdown',
};

// Common language aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'yml': 'yaml',
  'node': 'nodejs',
  'nodejs': 'javascript',
};

// Error type patterns for structured extraction
const ERROR_PATTERNS = {
  // JavaScript/TypeScript errors
  jsError: /^(\w+Error): (.+?) at (.+?):(\d+):(\d+)$/,
  jsStack: /at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/,
  
  // Python errors
  pythonError: /^(\w+Error): (.+)$/,
  pythonStack: /File "(.+?)", line (\d+), in (.+)/,
  
  // Generic error codes
  errorCode: /\b(E[A-Z0-9]+|ERR_[A-Z0-9_]+)\b/g,
  
  // HTTP status codes
  httpStatus: /\b(4\d{2}|5\d{2})\s+(error|Error|ERROR)/,
};

export interface ExtractedSignals {
  languages: string[];
  frameworks: { name: string; version?: string }[];
  paths: string[];
  repo?: string;
  org?: string;
  errorTypes?: string[];
  errorFiles?: string[];
}

/**
 * Normalize a language string to standard form
 */
function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] || lower;
}

/**
 * Extract language from file path
 */
function extractLanguageFromPath(filePath: string): string | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] || null;
}

/**
 * Parse framework string into name and optional version
 * Examples: "react", "react@18", "django==4.2"
 */
function parseFramework(framework: string): { name: string; version?: string } {
  // Handle various version separators
  const match = framework.match(/^([^@=><]+)(?:[@=><]+(.+))?$/);
  if (match) {
    return {
      name: match[1].trim().toLowerCase(),
      version: match[2]?.trim(),
    };
  }
  return { name: framework.toLowerCase() };
}

/**
 * Extract structured information from error strings
 */
function extractFromErrors(errors: string[]): {
  types: string[];
  files: string[];
  codes: string[];
} {
  const types = new Set<string>();
  const files = new Set<string>();
  const codes = new Set<string>();
  
  for (const error of errors) {
    // Extract error types
    const jsMatch = error.match(ERROR_PATTERNS.jsError);
    if (jsMatch) {
      types.add(jsMatch[1]);
      if (jsMatch[3]) files.add(jsMatch[3]);
    }
    
    const pyMatch = error.match(ERROR_PATTERNS.pythonError);
    if (pyMatch) {
      types.add(pyMatch[1]);
    }
    
    // Extract file paths from stack traces
    const jsStackMatch = error.match(ERROR_PATTERNS.jsStack);
    if (jsStackMatch && jsStackMatch[2]) {
      files.add(jsStackMatch[2]);
    }
    
    const pyStackMatch = error.match(ERROR_PATTERNS.pythonStack);
    if (pyStackMatch && pyStackMatch[1]) {
      files.add(pyStackMatch[1]);
    }
    
    // Extract error codes
    const codeMatches = error.matchAll(ERROR_PATTERNS.errorCode);
    for (const match of codeMatches) {
      codes.add(match[1]);
    }
  }
  
  return {
    types: Array.from(types),
    files: Array.from(files),
    codes: Array.from(codes),
  };
}

/**
 * Extract repository and organization from repo path
 */
function extractRepoInfo(repoPath?: string): { repo?: string; org?: string } {
  if (!repoPath) return {};
  
  // Try to extract from Git remote URL patterns
  // e.g., github.com:org/repo.git or https://github.com/org/repo
  const gitMatch = repoPath.match(/(?:github\.com[:/])([^/]+)\/([^/.]+)/);
  if (gitMatch) {
    return {
      org: gitMatch[1],
      repo: gitMatch[2],
    };
  }
  
  // Fallback to simple path-based extraction
  const parts = repoPath.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return {
      repo: parts[parts.length - 1],
      org: parts[parts.length - 2],
    };
  }
  
  return { repo: parts[parts.length - 1] };
}

/**
 * Extract and normalize signals from lookup request
 */
export function extractSignals(request: {
  task: string;
  current_file?: string;
  language?: string;
  framework?: string;
  recent_errors?: string[];
  repo_path?: string;
}): ExtractedSignals {
  const signals: ExtractedSignals = {
    languages: [],
    frameworks: [],
    paths: [],
  };
  
  // Extract languages
  const languages = new Set<string>();
  
  // Explicit language takes precedence
  if (request.language) {
    languages.add(normalizeLanguage(request.language));
  }
  
  // Extract from current file
  if (request.current_file) {
    const lang = extractLanguageFromPath(request.current_file);
    if (lang) languages.add(lang);
    
    // Add file path for locality scoring
    signals.paths.push(request.current_file);
  }
  
  signals.languages = Array.from(languages);
  
  // Parse framework
  if (request.framework) {
    signals.frameworks.push(parseFramework(request.framework));
  }
  
  // Extract from errors
  if (request.recent_errors && request.recent_errors.length > 0) {
    const errorInfo = extractFromErrors(request.recent_errors);
    
    // Add error types for pattern matching
    if (errorInfo.types.length > 0) {
      signals.errorTypes = errorInfo.types;
    }
    
    // Add files from errors as paths
    if (errorInfo.files.length > 0) {
      signals.paths.push(...errorInfo.files);
      signals.errorFiles = errorInfo.files;
      
      // Try to extract languages from error file paths
      for (const file of errorInfo.files) {
        const lang = extractLanguageFromPath(file);
        if (lang && !languages.has(lang)) {
          signals.languages.push(lang);
        }
      }
    }
  }
  
  // Extract repo/org info
  const repoInfo = extractRepoInfo(request.repo_path);
  if (repoInfo.repo) signals.repo = repoInfo.repo;
  if (repoInfo.org) signals.org = repoInfo.org;
  
  // Deduplicate paths
  signals.paths = Array.from(new Set(signals.paths));
  
  return signals;
}

/**
 * Convert extracted signals to ranking Signals format
 */
export function toRankingSignals(extracted: ExtractedSignals): Signals {
  return {
    paths: extracted.paths,
    languages: extracted.languages,
    frameworks: extracted.frameworks,
    repo: extracted.repo,
    org: extracted.org,
    // deps could be extracted from package.json/requirements.txt in future
  };
}