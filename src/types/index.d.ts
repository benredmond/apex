// APEX Type Definitions

export interface PatternMetadata {
  id: string;
  category: string;
  trustScore: number;
  usageCount: number;
  successRate: number;
  lastUsed?: Date;
  description?: string;
  example?: string;
}

export interface TaskContext {
  id: string;
  title: string;
  phase: "ARCHITECT" | "BUILDER" | "VALIDATOR" | "REVIEWER" | "DOCUMENTER";
  status: "open" | "in_progress" | "completed" | "blocked";
  complexity?: number;
  patterns?: string[];
  files?: string[];
}

export interface IntelligenceContext {
  relevantPatterns: PatternMetadata[];
  similarTasks: TaskContext[];
  predictedFailures: PredictedFailure[];
  complexityScore: number;
  recommendedApproach?: string;
}

export interface PredictedFailure {
  pattern: string;
  probability: number;
  prevention: string;
  context?: string;
}

export interface PatternResult {
  id: string;
  success: boolean;
  modified?: boolean;
  notes?: string;
}

export interface TaskLearning {
  taskId: string;
  duration: {
    estimated: string;
    actual: string;
  };
  complexity: {
    predicted: number;
    actual: number;
  };
  patternsUsed: PatternResult[];
  newDiscoveries?: string[];
  errors?: string[];
  recommendations?: string[];
}

export interface FailureRecord {
  id: string;
  task: string;
  error: string;
  cause: string;
  fix: string;
  pattern?: string;
  frequency: number;
  lastSeen: Date;
  contexts: string[];
}

export interface ApexConfig {
  projectName: string;
  version: string;
  workflowPhases: string[];
  patternPromotionThreshold: number;
  trustScoreThreshold: number;
  intelligenceTriggers?: Record<string, string[]>;
}
