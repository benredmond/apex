// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Incremental TypeScript adoption
import { z } from "zod";

// Pattern storage types aligned with APE-23 schema validation
export interface Pattern {
  id: string;
  schema_version: string;
  pattern_version: string;
  type:
    | "CODEBASE"
    | "LANG"
    | "ANTI"
    | "FAILURE"
    | "POLICY"
    | "TEST"
    | "MIGRATION";
  title: string;
  summary: string;
  trust_score: number;
  alpha?: number; // Beta-Bernoulli parameter
  beta?: number; // Beta-Bernoulli parameter
  created_at: string; // ISO8601
  updated_at: string; // ISO8601
  source_repo?: string;
  tags: string[];
  pattern_digest: string;
  json_canonical: string;
  invalid?: boolean;
  invalid_reason?: string;
}

export interface PatternLanguage {
  pattern_id: string;
  lang: string;
}

export interface PatternFramework {
  pattern_id: string;
  framework: string;
  semver?: string;
}

export interface PatternPath {
  pattern_id: string;
  glob: string;
}

export interface PatternRepo {
  pattern_id: string;
  repo_glob: string;
}

export interface PatternTaskType {
  pattern_id: string;
  task_type: string;
}

export interface PatternEnv {
  pattern_id: string;
  env: string;
}

export interface PatternTag {
  pattern_id: string;
  tag: string;
}

export interface Snippet {
  snippet_id: string;
  pattern_id: string;
  label?: string;
  language?: string;
  file_ref?: string;
  line_count?: number;
  bytes?: number;
}

// Query interfaces
export interface LookupQuery {
  task?: string;
  signals?: Record<string, any>;
  k?: number;
  type?: Pattern["type"][];
  languages?: string[];
  frameworks?: string[];
  tags?: string[];
  paths?: string[];
  task_types?: string[];
  envs?: string[];
}

export interface QueryFacets {
  type?: Pattern["type"];
  languages?: string[];
  frameworks?: string[];
  tags?: string[];
  paths?: string[];
  task_types?: string[];
  envs?: string[];
}

export interface PatternPack {
  patterns: Pattern[];
  total: number;
  query: LookupQuery;
}

export interface ValidationResult {
  pattern_id: string;
  valid: boolean;
  errors?: string[];
}

// Cache types
export interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
}

// Database migration
export interface Migration {
  id: string;
  sql: string;
  applied_at?: string;
}

// File watcher events
export interface FileChangeEvent {
  path: string;
  type: "add" | "change" | "unlink";
  timestamp: number;
}

// Pattern metadata enrichment types (added in migration 002)
export interface PatternMetadata {
  pattern_id: string;
  key: string;
  value: any; // JSON value
  created_at: string;
}

export interface PatternTrigger {
  pattern_id: string;
  trigger_type: "error" | "keyword" | "scenario" | "file_glob";
  trigger_value: string;
  regex: boolean; // 0=false, 1=true in database
  priority: number;
}

export interface PatternVocab {
  pattern_id: string;
  term: string;
  term_type: "verb" | "noun" | "tech" | "concept";
  weight: number;
}

// Extended metadata for patterns (stored in pattern_metadata table)
export interface ExtendedPatternMetadata {
  complexity?: "low" | "medium" | "high";
  performance_impact?: "minimal" | "moderate" | "significant";
  prerequisites?: string[];
  related_patterns?: string[];
  common_mistakes?: string[];
  time_estimate?: string;
  review_required?: boolean;
}
