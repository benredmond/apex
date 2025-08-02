export interface Signals {
  paths: string[];
  languages: string[];
  frameworks: { name: string; version?: string }[];
  repo?: string;
  org?: string;
  deps?: Record<string, string>;
  // Enhanced signals for better ranking
  taskIntent?: {
    type: string;
    confidence: number;
    subType?: string;
  };
  workflowPhase?: string;
  recentPatterns?: Array<{
    patternId: string;
    success: boolean;
    timestamp: string;
  }>;
  failedPatterns?: string[];
  testFramework?: string;
  buildTool?: string;
}

export interface Breakdown {
  scope: {
    points: number;
    raw: number;
    path?: string;
    language?: string;
    framework?: string;
    details?: string;
  };
  policy: {
    points: number;
  };
  trust: {
    points: number;
    alpha: number;
    beta: number;
    wilson: number;
  };
  freshness: {
    points: number;
    age_days: number;
    half_life_days: number;
  };
  locality: {
    points: number;
    reason?: string;
  };
}

export interface RankedPattern {
  id: string;
  score: number;
  explain: Breakdown;
}

export interface RankingConfig {
  weights: {
    scope: number;
    policy: number;
    trust: number;
    freshness: number;
    locality: number;
  };
  candidateCap: number;
  policyBoostRequiresScope: boolean;
  halfLifeDefaultDays: number;
}

export const defaultConfig: RankingConfig = {
  weights: {
    scope: 1,
    policy: 1,
    trust: 1,
    freshness: 1,
    locality: 1,
  },
  candidateCap: 1500,
  policyBoostRequiresScope: true,
  halfLifeDefaultDays: 90,
};

export interface PatternMeta {
  id: string;
  type: string;
  scope: {
    paths?: string[];
    languages?: string[];
    frameworks?: Array<{ name: string; range?: string }>;
  };
  trust?: {
    alpha?: number;
    beta?: number;
    score?: number;
  };
  metadata?: {
    lastReviewed?: string;
    halfLifeDays?: number;
    repo?: string;
    org?: string;
  };
}

export interface IndexStructures {
  byType: Map<string, Set<number>>;
  byLang: Map<string, Set<number>>;
  byFramework: Map<string, Set<number>>;
  byTag: Map<string, Set<number>>;
  byTaskType: Map<string, Set<number>>;
  byRepo: Map<string, Set<number>>;
  byOrg: Map<string, Set<number>>;
  patterns: PatternMeta[];
  idToIndex: Map<string, number>;
}

export interface CacheEntry {
  score: number;
  breakdown: Breakdown;
  timestamp: number;
}

export interface ScoringCache {
  query: Map<string, CacheEntry[]>;
  semver: Map<string, boolean>;
  path: Map<string, number>;
  wilson: Map<string, number>;
}

// PatternPack types for APE-26
export interface PackSnippet {
  language: string;
  code: string;
  source_ref: string;
  snippet_id: string;
}

export interface PackCandidate {
  id: string;
  type: string;
  title?: string;
  score: number;
  summary: string;
  snippet?: PackSnippet;
  policy_refs?: string[];
  anti_refs?: string[];
  test_refs?: string[];
}

export interface PackMeta {
  total_ranked: number;
  considered: number;
  included: number;
  bytes: number;
  budget_bytes: number;
  trimmed_reason?: string;
  explain?: boolean;
  reasons?: Array<{ id: string; [key: string]: number | string }>;
}

export interface PatternPack {
  task: string;
  candidates: PackCandidate[];
  anti_patterns: Array<{ id: string; summary: string }>;
  policies: Array<{ id: string; summary: string }>;
  tests: Array<{ id: string; summary: string }>;
  meta: PackMeta;
}

export interface PackOptions {
  budgetBytes?: number; // default 8192
  debug?: boolean; // include explain
  snippetLinesInit?: number; // default 18
  snippetLinesMin?: number; // default 8
  topCandidatesQuota?: number; // default 3
  failuresQuota?: number; // default 2
  antisQuota?: number; // default 1
  testsQuota?: number; // default 1
}
