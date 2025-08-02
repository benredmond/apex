/**
 * Signal extraction and normalization for pattern lookup
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success)
 */

import path from "path";
import { Signals } from "../../ranking/types.js";

// Language mapping from file extensions
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript family
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",

  // Python
  py: "python",
  pyw: "python",
  pyi: "python",

  // Java family
  java: "java",
  kt: "kotlin",
  scala: "scala",

  // C family
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",

  // Other
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  m: "objective-c",
  r: "r",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "zsh",
  ps1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  xml: "xml",
  md: "markdown",
};

// Common language aliases
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  yml: "yaml",
  node: "nodejs",
  nodejs: "javascript",
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
  taskIntent?: {
    type: string;
    confidence: number;
    subType?: string;
  };
  dependencies?: Record<string, string>;
  testFramework?: string;
  buildTool?: string;
  ciPlatform?: string;
  workflowPhase?: string;
  imports?: string[];
  exports?: string[];
  relatedFiles?: string[];
  testFiles?: string[];
  recentPatterns?: Array<{
    patternId: string;
    success: boolean;
    timestamp: string;
  }>;
  failedPatterns?: string[];
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
  const parts = repoPath.split("/").filter(Boolean);
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
  task_intent?: {
    type: string;
    confidence: number;
    sub_type?: string;
  };
  code_context?: {
    current_file?: string;
    imports?: string[];
    exports?: string[];
    related_files?: string[];
    test_files?: string[];
  };
  error_context?: Array<{
    type: string;
    message: string;
    file?: string;
    line?: number;
    stack_depth?: number;
    frequency?: number;
  }>;
  session_context?: {
    recent_patterns: Array<{
      pattern_id: string;
      success: boolean;
      timestamp: string;
    }>;
    failed_patterns: string[];
  };
  project_signals?: {
    language?: string;
    framework?: string;
    test_framework?: string;
    build_tool?: string;
    ci_platform?: string;
    dependencies?: Record<string, string>;
  };
  workflow_phase?: string;
}): ExtractedSignals {
  const signals: ExtractedSignals = {
    languages: [],
    frameworks: [],
    paths: [],
  };

  // Extract languages
  const languages = new Set<string>();

  // Use project_signals language if available, otherwise fall back to legacy
  const primaryLanguage = request.project_signals?.language || request.language;
  if (primaryLanguage) {
    languages.add(normalizeLanguage(primaryLanguage));
  }

  // Extract from code context or legacy current_file
  const currentFile =
    request.code_context?.current_file || request.current_file;
  if (currentFile) {
    const lang = extractLanguageFromPath(currentFile);
    if (lang) languages.add(lang);
    signals.paths.push(currentFile);
  }

  signals.languages = Array.from(languages);

  // Parse frameworks - prefer project_signals
  const frameworkString =
    request.project_signals?.framework || request.framework;
  if (frameworkString) {
    signals.frameworks.push(parseFramework(frameworkString));
  }

  // Extract from structured error context if available
  if (request.error_context && request.error_context.length > 0) {
    const types = new Set<string>();
    const files = new Set<string>();

    for (const error of request.error_context) {
      types.add(error.type);
      if (error.file) {
        files.add(error.file);
        // Extract language from error file
        const lang = extractLanguageFromPath(error.file);
        if (lang && !languages.has(lang)) {
          signals.languages.push(lang);
        }
      }
    }

    signals.errorTypes = Array.from(types);
    signals.errorFiles = Array.from(files);
    signals.paths.push(...Array.from(files));
  } else if (request.recent_errors && request.recent_errors.length > 0) {
    // Fall back to legacy error parsing
    const errorInfo = extractFromErrors(request.recent_errors);
    if (errorInfo.types.length > 0) {
      signals.errorTypes = errorInfo.types;
    }
    if (errorInfo.files.length > 0) {
      signals.paths.push(...errorInfo.files);
      signals.errorFiles = errorInfo.files;
      for (const file of errorInfo.files) {
        const lang = extractLanguageFromPath(file);
        if (lang && !languages.has(lang)) {
          signals.languages.push(lang);
        }
      }
    }
  }

  // Extract enhanced signals
  if (request.task_intent) {
    signals.taskIntent = {
      type: request.task_intent.type,
      confidence: request.task_intent.confidence,
      subType: request.task_intent.sub_type,
    };
  }

  if (request.code_context) {
    if (request.code_context.imports)
      signals.imports = request.code_context.imports;
    if (request.code_context.exports)
      signals.exports = request.code_context.exports;
    if (request.code_context.related_files) {
      signals.relatedFiles = request.code_context.related_files;
      signals.paths.push(...request.code_context.related_files);
    }
    if (request.code_context.test_files) {
      signals.testFiles = request.code_context.test_files;
      signals.paths.push(...request.code_context.test_files);
    }
  }

  if (request.session_context) {
    if (request.session_context.recent_patterns.length > 0) {
      signals.recentPatterns = request.session_context.recent_patterns.map(
        (p) => ({
          patternId: p.pattern_id,
          success: p.success,
          timestamp: p.timestamp,
        }),
      );
    }
    if (request.session_context.failed_patterns.length > 0) {
      signals.failedPatterns = request.session_context.failed_patterns;
    }
  }

  if (request.project_signals) {
    if (request.project_signals.dependencies)
      signals.dependencies = request.project_signals.dependencies;
    if (request.project_signals.test_framework)
      signals.testFramework = request.project_signals.test_framework;
    if (request.project_signals.build_tool)
      signals.buildTool = request.project_signals.build_tool;
    if (request.project_signals.ci_platform)
      signals.ciPlatform = request.project_signals.ci_platform;
  }

  if (request.workflow_phase) {
    signals.workflowPhase = request.workflow_phase;
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
    deps: extracted.dependencies,
    // Additional context for enhanced ranking
    taskIntent: extracted.taskIntent,
    workflowPhase: extracted.workflowPhase,
    recentPatterns: extracted.recentPatterns,
    failedPatterns: extracted.failedPatterns,
    testFramework: extracted.testFramework,
    buildTool: extracted.buildTool,
  } as Signals;
}
