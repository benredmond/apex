/**
 * MCP Resource for exposing lookup metrics
 * Provides real-time metrics at apex://metrics/lookup
 */

import { Resource } from "@modelcontextprotocol/sdk/types.js";
import { lookupMetrics } from "../tools/metrics.js";

/**
 * Get the metrics resource definition
 */
export function getMetricsResource(): Resource {
  return {
    uri: "apex://metrics/lookup",
    name: "Pattern Lookup Metrics",
    description: "Real-time metrics for the pattern lookup service",
    mimeType: "application/json",
  };
}

/**
 * Handle read requests for the metrics resource
 */
export async function readMetricsResource(uri: string): Promise<string> {
  if (uri !== "apex://metrics/lookup") {
    throw new Error(`Unknown metrics resource: ${uri}`);
  }

  const metrics = lookupMetrics.getMetrics();

  // Format metrics for display
  const formatted = {
    requests_total: metrics.requests_total,
    cache_hits: metrics.cache_hits,
    cache_misses: metrics.cache_misses,
    cache_hit_rate:
      metrics.requests_total > 0
        ? ((metrics.cache_hits / metrics.requests_total) * 100).toFixed(2) + "%"
        : "0%",
    avg_latency_ms: metrics.avg_latency_ms,
    signals_provided: metrics.signals_provided,
    errors: metrics.errors,
    error_rate:
      metrics.requests_total > 0
        ? (
            (Object.values(metrics.errors).reduce((a, b) => a + b, 0) /
              metrics.requests_total) *
            100
          ).toFixed(2) + "%"
        : "0%",
    patterns_returned: {
      total: metrics.patterns_returned.total,
      avg_per_request: metrics.patterns_returned.avg_per_request.toFixed(1),
      max_per_request: metrics.patterns_returned.max_per_request,
    },
  };

  return JSON.stringify(formatted, null, 2);
}
