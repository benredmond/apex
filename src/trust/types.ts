/**
 * Beta-Bernoulli Trust Model Types
 * Provides statistical trust scoring with confidence intervals
 */

export interface TrustScore {
  /** Mean of Beta distribution (0-1) */
  value: number;
  
  /** Width of CI, inverse measure (0-1), higher = more confident */
  confidence: number;
  
  /** Total trials (alpha + beta - priors) */
  samples: number;
  
  /** 95% credible interval [lower, upper] */
  interval: [number, number];
  
  /** Wilson lower bound for backward compatibility */
  wilsonLower: number;
  
  /** Last update timestamp */
  lastUpdated: Date;
  
  /** Whether time decay has been applied */
  decayApplied: boolean;
  
  /** Raw alpha parameter */
  alpha: number;
  
  /** Raw beta parameter */
  beta: number;
}

export interface TrustUpdate {
  patternId: string;
  outcome: boolean;
  timestamp?: Date;
}

export interface BatchUpdateResult {
  updated: number;
  failed: number;
  duration: number;
  errors?: Array<{ patternId: string; error: string }>;
}

export interface TrustPrior {
  alpha: number;
  beta: number;
  source?: 'default' | 'configured' | 'similar_patterns';
}

export interface TrustModelConfig {
  /** Default prior alpha (default: 1 for uniform) */
  defaultAlpha: number;
  
  /** Default prior beta (default: 1 for uniform) */
  defaultBeta: number;
  
  /** Default half-life in days for trust decay */
  defaultHalfLife: number;
  
  /** Confidence level for intervals (default: 0.95) */
  confidenceLevel: number;
  
  /** Enable caching for expensive calculations */
  enableCache: boolean;
  
  /** Maximum cache size */
  maxCacheSize: number;
  
  /** Pattern type specific configurations */
  patternTypeConfig?: Map<string, PatternTypeConfig>;
}

export interface PatternTypeConfig {
  prior?: TrustPrior;
  halfLife?: number;
  minSamples?: number;
}

export interface TrustModel {
  // Core calculations
  calculateTrust(successes: number, failures: number): TrustScore;
  updateTrust(patternId: string, outcome: boolean): Promise<TrustScore>;
  
  // Confidence intervals
  getConfidenceInterval(patternId: string): Promise<[number, number]>;
  getQuantile(patternId: string, p: number): Promise<number>;
  
  // Time decay
  decayTrust(patternId: string, days: number): Promise<void>;
  setHalfLife(patternType: string, days: number): void;
  
  // Batch operations
  batchUpdate(updates: TrustUpdate[]): Promise<BatchUpdateResult>;
  
  // Priors
  setPrior(patternType: string, alpha: number, beta: number): void;
  getSimilarPatternPrior(patternId: string): Promise<TrustPrior>;
  
  // Utilities
  getConfig(): TrustModelConfig;
  clearCache(): void;
}

export interface PatternStorage {
  getPattern(patternId: string): Promise<StoredPattern | null>;
  updatePattern(patternId: string, updates: Partial<StoredPattern>): Promise<void>;
  batchGetPatterns(patternIds: string[]): Promise<Map<string, StoredPattern>>;
  batchUpdatePatterns(updates: Map<string, Partial<StoredPattern>>): Promise<void>;
}

export interface StoredPattern {
  id: string;
  type: string;
  trust: {
    alpha: number;
    beta: number;
    lastUpdated: string;
    decayApplied?: boolean;
  };
}