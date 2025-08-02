/**
 * Metrics collection for pattern lookup operations
 * Exposes metrics as MCP resource
 */

export interface LookupMetrics {
  requests_total: number;
  cache_hits: number;
  cache_misses: number;
  total_latency_ms: number;
  signals_provided: {
    task: number;
    language: number;
    framework: number;
    current_file: number;
    recent_errors: number;
    repo_path: number;
  };
  errors: {
    validation: number;
    lookup: number;
    ranking: number;
    other: number;
  };
  patterns_returned: {
    total: number;
    avg_per_request: number;
    max_per_request: number;
  };
}

export class MetricsCollector {
  private metrics: LookupMetrics;

  constructor() {
    this.metrics = {
      requests_total: 0,
      cache_hits: 0,
      cache_misses: 0,
      total_latency_ms: 0,
      signals_provided: {
        task: 0,
        language: 0,
        framework: 0,
        current_file: 0,
        recent_errors: 0,
        repo_path: 0,
      },
      errors: {
        validation: 0,
        lookup: 0,
        ranking: 0,
        other: 0,
      },
      patterns_returned: {
        total: 0,
        avg_per_request: 0,
        max_per_request: 0,
      },
    };
  }

  /**
   * Record a new request with its signals
   */
  recordRequest(request: Record<string, any>): void {
    this.metrics.requests_total++;

    // Track which signals were provided
    if (request.task) this.metrics.signals_provided.task++;
    if (request.language) this.metrics.signals_provided.language++;
    if (request.framework) this.metrics.signals_provided.framework++;
    if (request.current_file) this.metrics.signals_provided.current_file++;
    if (request.recent_errors?.length > 0)
      this.metrics.signals_provided.recent_errors++;
    if (request.repo_path) this.metrics.signals_provided.repo_path++;
  }

  /**
   * Record cache hit
   */
  recordCacheHit(): void {
    this.metrics.cache_hits++;
  }

  /**
   * Record cache miss
   */
  recordCacheMiss(): void {
    this.metrics.cache_misses++;
  }

  /**
   * Record request latency
   */
  recordLatency(latencyMs: number): void {
    this.metrics.total_latency_ms += latencyMs;
  }

  /**
   * Record an error
   */
  recordError(type: "validation" | "lookup" | "ranking" | "other"): void {
    this.metrics.errors[type]++;
  }

  /**
   * Record patterns returned
   */
  recordPatternsReturned(count: number): void {
    this.metrics.patterns_returned.total += count;

    // Update max if needed
    if (count > this.metrics.patterns_returned.max_per_request) {
      this.metrics.patterns_returned.max_per_request = count;
    }

    // Recalculate average
    const totalRequests =
      this.metrics.requests_total -
      Object.values(this.metrics.errors).reduce((a, b) => a + b, 0);

    if (totalRequests > 0) {
      this.metrics.patterns_returned.avg_per_request =
        this.metrics.patterns_returned.total / totalRequests;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): LookupMetrics & { avg_latency_ms: number } {
    const avgLatency =
      this.metrics.requests_total > 0
        ? this.metrics.total_latency_ms / this.metrics.requests_total
        : 0;

    return {
      ...this.metrics,
      avg_latency_ms: Math.round(avgLatency),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      requests_total: 0,
      cache_hits: 0,
      cache_misses: 0,
      total_latency_ms: 0,
      signals_provided: {
        task: 0,
        language: 0,
        framework: 0,
        current_file: 0,
        recent_errors: 0,
        repo_path: 0,
      },
      errors: {
        validation: 0,
        lookup: 0,
        ranking: 0,
        other: 0,
      },
      patterns_returned: {
        total: 0,
        avg_per_request: 0,
        max_per_request: 0,
      },
    };
  }
}

// Global metrics instance
export const lookupMetrics = new MetricsCollector();
