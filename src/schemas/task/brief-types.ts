/**
 * PRD-compliant Task Brief types
 * Full specification from Section 8.1 of PRD
 */

export interface PlanStep {
  step: string;
  action: string;
  files?: string[];
}

export interface Fact {
  fact: string;
  source_refs: string[];
}

export interface CodeSnippet {
  code: string;
  language: string;
  description: string;
  source_ref?: string;
}

export interface Question {
  question: string;
  guess?: string;
  confidence?: number; // 0-1
}

export interface InFlightWork {
  task_id: string;
  title: string;
  overlap_type: "files" | "components" | "functionality";
  risk_level: "low" | "medium" | "high";
}

export interface TestSpec {
  test_name: string;
  test_type: "unit" | "integration" | "e2e";
  description: string;
  scaffold?: string;
}

export interface TaskBrief {
  // Core fields (stream first for performance)
  tl_dr: string[]; // 3-5 key points
  objectives: string[]; // Clear goals
  constraints: string[]; // Technical/business constraints
  acceptance_criteria: string[]; // Testable criteria

  // Detail fields (stream second)
  plan: PlanStep[]; // Step-by-step approach
  facts: Fact[]; // With source_refs
  snippets: CodeSnippet[]; // Relevant code with citations
  risks_and_gotchas: string[]; // Known issues from failure corpus
  open_questions: Question[]; // With guesses and confidence
  in_flight: InFlightWork[]; // Concurrent work that might conflict
  test_scaffold: TestSpec[]; // Test requirements and scaffolds

  // Optional/metadata
  approvers?: string[]; // Optional approvers
  drilldowns: {
    // Additional context
    prior_impls: string[]; // Similar completed tasks
    files: string[]; // Key files to review
  };
  provenance: {
    // Metadata
    generated_at: string; // ISO timestamp
    sources: string[]; // Data sources used
    cache_hit?: boolean; // Whether from cache
    generation_time_ms?: number; // Performance metric
  };
}

export interface BriefOptions {
  useCache?: boolean;
  streamingMode?: boolean;
  includeInFlight?: boolean;
  maxSimilarTasks?: number;
  maxPatterns?: number;
}

export interface BriefGenerationMetrics {
  cache_hit: boolean;
  total_time_ms: number;
  data_fetch_ms: number;
  generation_ms: number;
  similar_tasks_found: number;
  patterns_applied: number;
  failures_analyzed: number;
}
