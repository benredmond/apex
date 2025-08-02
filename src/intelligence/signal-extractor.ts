/**
 * Enhanced signal extraction for semantic pattern discovery
 * Extracts structured signals from task descriptions, error messages, and code context
 */

import type { Pattern } from "../storage/types.js";

type PatternType = "fix" | "code" | "pattern" | "refactor" | "command";
type PatternCategory = "auth" | "api" | "test" | "error" | "db" | "ui";

export interface ExtractedSignals {
  // Task analysis
  taskVerbs: string[]; // e.g., ["implement", "fix", "refactor"]
  taskNouns: string[]; // e.g., ["authentication", "api", "test"]

  // Error analysis
  errorTypes: string[]; // e.g., ["TypeError", "SyntaxError"]
  errorKeywords: string[]; // e.g., ["undefined", "null", "async"]

  // Technology detection
  languages: string[]; // e.g., ["typescript", "python"]
  frameworks: string[]; // e.g., ["react", "fastapi", "jest"]
  libraries: string[]; // e.g., ["axios", "lodash", "zod"]

  // Pattern hints
  suggestedTypes: PatternType[];
  suggestedCategories: PatternCategory[];

  // Context clues
  filePatterns: string[]; // e.g., ["*.test.ts", "api/*.py"]
  keywords: string[]; // All significant keywords for FTS
}

// Common task verbs with their stems
const TASK_VERBS = new Map([
  ["implement", "implement"],
  ["implementing", "implement"],
  ["fix", "fix"],
  ["fixing", "fix"],
  ["refactor", "refactor"],
  ["refactoring", "refactor"],
  ["test", "test"],
  ["testing", "test"],
  ["add", "add"],
  ["adding", "add"],
  ["create", "create"],
  ["creating", "create"],
  ["update", "update"],
  ["updating", "update"],
  ["optimize", "optimize"],
  ["optimizing", "optimize"],
  ["debug", "debug"],
  ["debugging", "debug"],
  ["migrate", "migrate"],
  ["migrating", "migrate"],
]);

// Technology indicators
const TECH_INDICATORS = {
  languages: {
    typescript: [".ts", ".tsx", "typescript", "tsc", ": string", ": number"],
    javascript: [".js", ".jsx", "javascript", "node", "npm"],
    python: [".py", "python", "pip", "pytest", "def ", "import "],
    rust: [".rs", "rust", "cargo", "fn ", "impl "],
    go: [".go", "golang", "go mod", "func "],
  },
  frameworks: {
    react: ["react", "jsx", "useState", "useEffect", "component"],
    vue: ["vue", ".vue", "v-model", "computed", "mounted"],
    angular: ["angular", "@angular", "ngOnInit", "injectable"],
    fastapi: ["fastapi", "@app.", "pydantic", "uvicorn"],
    express: ["express", "app.get", "app.post", "middleware"],
    django: ["django", "models.py", "views.py", "urls.py"],
    jest: ["jest", "describe", "it(", "expect", "beforeEach"],
    pytest: ["pytest", "test_", "assert ", "fixture"],
  },
};

// Error pattern extraction
const ERROR_PATTERNS = [
  /(\w+Error):\s*/g, // TypeError: ..., SyntaxError: ...
  /(\w+Exception):\s*/g, // ValueError: ..., KeyError: ...
  /Cannot\s+(\w+)\s+/g, // Cannot read ..., Cannot find ...
  /(\w+)\s+is not defined/g, // X is not defined
  /Unexpected\s+(\w+)/g, // Unexpected token, Unexpected identifier
];

export function extractEnhancedSignals(
  task: string,
  errorContext?: string[],
  codeContext?: {
    currentFile?: string;
    imports?: string[];
    relatedFiles?: string[];
  },
): ExtractedSignals {
  const signals: ExtractedSignals = {
    taskVerbs: [],
    taskNouns: [],
    errorTypes: [],
    errorKeywords: [],
    languages: [],
    frameworks: [],
    libraries: [],
    suggestedTypes: [],
    suggestedCategories: [],
    filePatterns: [],
    keywords: [],
  };

  // Extract task verbs and nouns
  const taskLower = task.toLowerCase();
  const words = taskLower.split(/\s+/);

  for (const word of words) {
    const stem = TASK_VERBS.get(word);
    if (stem && !signals.taskVerbs.includes(stem)) {
      signals.taskVerbs.push(stem);
    }
  }

  // Extract significant nouns (basic approach)
  const nounPattern =
    /\b(api|auth|authentication|test|tests|database|db|cache|validation|error|component|service|controller|model|view|template|migration|configuration|config)\b/gi;
  const nouns = taskLower.match(nounPattern) || [];
  signals.taskNouns = [...new Set(nouns)];

  // Analyze error context
  if (errorContext) {
    for (const error of errorContext) {
      // Extract error types
      for (const pattern of ERROR_PATTERNS) {
        const matches = [...error.matchAll(pattern)];
        for (const match of matches) {
          if (match[1] && !signals.errorTypes.includes(match[1])) {
            signals.errorTypes.push(match[1]);
          }
        }
      }

      // Extract error keywords
      const keywords =
        error
          .toLowerCase()
          .match(
            /\b(undefined|null|async|await|promise|callback|timeout|connection|permission|invalid|missing)\b/g,
          ) || [];
      for (const keyword of keywords) {
        if (!signals.errorKeywords.includes(keyword)) {
          signals.errorKeywords.push(keyword);
        }
      }
    }
  }

  // Detect technologies from code context
  if (codeContext) {
    const contextStr = JSON.stringify(codeContext).toLowerCase();

    // Detect languages
    for (const [lang, indicators] of Object.entries(
      TECH_INDICATORS.languages,
    )) {
      if (indicators.some((ind) => contextStr.includes(ind))) {
        signals.languages.push(lang);
      }
    }

    // Detect frameworks
    for (const [framework, indicators] of Object.entries(
      TECH_INDICATORS.frameworks,
    )) {
      if (indicators.some((ind) => contextStr.includes(ind))) {
        signals.frameworks.push(framework);
      }
    }

    // Extract file patterns
    if (codeContext.currentFile) {
      const ext = codeContext.currentFile.substring(
        codeContext.currentFile.lastIndexOf("."),
      );
      signals.filePatterns.push(`*${ext}`);
    }
  }

  // Suggest pattern types based on signals
  if (signals.taskVerbs.includes("fix") || signals.errorTypes.length > 0) {
    signals.suggestedTypes.push("fix");
  }
  if (
    signals.taskVerbs.includes("implement") ||
    signals.taskVerbs.includes("create")
  ) {
    signals.suggestedTypes.push("code");
  }
  if (signals.taskVerbs.includes("test")) {
    signals.suggestedTypes.push("pattern");
    signals.suggestedCategories.push("test");
  }
  if (signals.taskVerbs.includes("refactor")) {
    signals.suggestedTypes.push("refactor");
  }

  // Suggest categories based on nouns and context
  if (signals.taskNouns.some((n) => n.includes("auth"))) {
    signals.suggestedCategories.push("auth");
  }
  if (signals.taskNouns.some((n) => n.includes("api"))) {
    signals.suggestedCategories.push("api");
  }
  if (signals.taskNouns.some((n) => n.includes("test"))) {
    signals.suggestedCategories.push("test");
  }
  if (signals.taskNouns.some((n) => n.includes("error"))) {
    signals.suggestedCategories.push("error");
  }

  // Combine all keywords for FTS
  signals.keywords = [
    ...signals.taskVerbs,
    ...signals.taskNouns,
    ...signals.errorKeywords,
    ...signals.languages,
    ...signals.frameworks,
  ].filter((k, i, arr) => arr.indexOf(k) === i); // dedupe

  return signals;
}

/**
 * Build a weighted query from extracted signals
 */
export function buildQueryFromSignals(signals: ExtractedSignals): {
  ftsQuery: string;
  facets: { types?: string[]; categories?: string[] };
  triggers: string[];
} {
  // Build FTS query from keywords
  const ftsTerms = signals.keywords
    .filter((k) => k.length > 2) // Skip very short words
    .slice(0, 10); // Limit to prevent overly complex queries

  const ftsQuery = ftsTerms.join(" OR ");

  // Build facets
  const facets: { types?: string[]; categories?: string[] } = {};
  if (signals.suggestedTypes.length > 0) {
    facets.types = signals.suggestedTypes;
  }
  if (signals.suggestedCategories.length > 0) {
    facets.categories = signals.suggestedCategories;
  }

  // Build triggers from errors and keywords
  const triggers = [
    ...signals.errorTypes.map((e) => `error:${e}`),
    ...signals.errorKeywords.map((k) => `keyword:${k}`),
  ];

  return { ftsQuery, facets, triggers };
}
