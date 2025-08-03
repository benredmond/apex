/**
 * MCP tool for reflection system
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success)
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { PatternRepository } from "../../storage/repository.js";
import { BetaBernoulliTrustModel } from "../../trust/beta-bernoulli.js";
import { JSONStorageAdapter } from "../../trust/storage-adapter.js";
import { EvidenceValidator } from "../../reflection/validator.js";
import { ReflectionStorage } from "../../reflection/storage.js";
import { PatternMiner } from "../../reflection/miner.js";
import { PatternInserter } from "../../reflection/pattern-inserter.js";
// [PAT:IMPORT:ESM] ★★★★☆ (67 uses, 89% success) - From cache
import { MCP_SCHEMA_VERSION } from "../../config/constants.js";
import {
  ReflectRequestSchema,
  ReflectRequest,
  ReflectResponse,
  ValidationErrorCode,
  TrustUpdate,
} from "../../reflection/types.js";
import { OutcomeProcessor } from "../../reflection/outcome-processor.js";
import {
  InvalidParamsError,
  InternalError,
  ToolExecutionError,
} from "../errors.js";

// Metrics tracking
interface IReflectionMetrics {
  total: number;
  successful: number;
  failed: number;
  validationErrors: number;
  trustUpdates: number;
  patternsDiscovered: number;
  averageLatency: number;
}

class ReflectionMetrics {
  private metrics: IReflectionMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    validationErrors: 0,
    trustUpdates: 0,
    patternsDiscovered: 0,
    averageLatency: 0,
  };

  recordRequest(success: boolean, latency: number): void {
    this.metrics.total++;
    if (success) {
      this.metrics.successful++;
    } else {
      this.metrics.failed++;
    }

    // Update average latency
    const prevTotal = this.metrics.total - 1;
    this.metrics.averageLatency =
      (this.metrics.averageLatency * prevTotal + latency) / this.metrics.total;
  }

  recordValidationError(): void {
    this.metrics.validationErrors++;
  }

  recordTrustUpdate(): void {
    this.metrics.trustUpdates++;
  }

  recordPatternDiscovered(): void {
    this.metrics.patternsDiscovered++;
  }

  getMetrics(): IReflectionMetrics {
    return { ...this.metrics };
  }
}

export class ReflectionService {
  private repository: PatternRepository;
  private trustModel: BetaBernoulliTrustModel;
  private validator: EvidenceValidator;
  private storage: ReflectionStorage;
  private miner: PatternMiner | null;
  private metrics: ReflectionMetrics;
  private patternInserter: PatternInserter;
  private db: Database.Database; // [PAT:dA0w9N1I9-4m] ★★★★★ (7 uses, 100% success) - Single DB instance

  constructor(
    repository: PatternRepository,
    dbPath: string,
    config?: {
      allowedRepoUrls?: string[];
      gitRepoPath?: string;
      enableMining?: boolean;
    },
  ) {
    this.repository = repository;

    // [PAT:ARCHITECTURE:DATABASE_CONNECTION_SHARING] ★★★☆☆ (1 use, 100% success) - Create single DB connection
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    // [PAT:ARCHITECTURE:DATABASE_CONNECTION_SHARING] ★★★☆☆ (1 use, 100% success) - Inject shared DB into services
    this.patternInserter = new PatternInserter(this.db);
    this.storage = new ReflectionStorage(this.db);

    // Initialize trust model
    const trustAdapter = new JSONStorageAdapter("pattern_trust.json");
    this.trustModel = new BetaBernoulliTrustModel(trustAdapter);

    // Initialize validator
    this.validator = new EvidenceValidator(repository, {
      allowedRepoUrls: config?.allowedRepoUrls,
      gitRepoPath: config?.gitRepoPath,
    });

    // Initialize miner if enabled
    this.miner = config?.enableMining ? new PatternMiner() : null;

    // Initialize metrics
    this.metrics = new ReflectionMetrics();
  }

  /**
   * Main reflection method
   */
  async reflect(rawRequest: unknown): Promise<ReflectResponse> {
    const startTime = Date.now();
    const requestId = nanoid(12);

    try {
      // Parse and validate request schema
      const validationResult = ReflectRequestSchema.safeParse(rawRequest);
      if (!validationResult.success) {
        this.metrics.recordValidationError();
        const errors = validationResult.error.issues.map((issue) => {
          let message = issue.message;

          // Enhance error message for invalid outcomes
          if (
            issue.path.join(".").includes("outcome") &&
            issue.code === "invalid_enum_value"
          ) {
            const invalidValue = issue.received;
            const suggestion = OutcomeProcessor.suggestOutcome(
              String(invalidValue),
            );
            const descriptions = OutcomeProcessor.getOutcomeDescriptions();

            message = `Invalid outcome '${invalidValue}'. Valid outcomes are:\n`;
            message += Object.entries(descriptions)
              .map(([outcome, desc]) => `  - ${outcome}: ${desc}`)
              .join("\n");

            if (suggestion) {
              message += `\n\nDid you mean '${suggestion}'?`;
            }
          }

          return {
            path: issue.path.join("."),
            code: ValidationErrorCode.MALFORMED_EVIDENCE,
            message,
          };
        });

        return this.createErrorResponse(errors, startTime);
      }

      const request = validationResult.data;

      // If dry run, only validate
      if (request.options.dry_run) {
        const validation = await this.validator.validateRequest(request);
        return this.createValidationResponse(
          validation.valid,
          validation.errors,
          startTime,
          false,
        );
      }

      // Full processing
      const response = await this.processReflection(request, startTime);

      this.metrics.recordRequest(response.ok, Date.now() - startTime);

      return response;
    } catch (error) {
      this.metrics.recordRequest(false, Date.now() - startTime);

      if (
        error instanceof InvalidParamsError ||
        error instanceof ToolExecutionError
      ) {
        throw error;
      }

      throw new InternalError(`Reflection processing failed: ${error}`);
    }
  }

  /**
   * Process a reflection request
   */
  private async processReflection(
    request: ReflectRequest,
    startTime: number,
  ): Promise<ReflectResponse> {
    const validatedAt = Date.now();

    // Validate evidence
    const validation = await this.validator.validateRequest(request);
    if (!validation.valid) {
      return this.createValidationResponse(
        false,
        validation.errors,
        startTime,
        false,
      );
    }

    const validationMs = Date.now() - validatedAt;
    const persistStarted = Date.now();

    // Mine patterns before transaction if needed
    let minedPatterns: any[] = [];
    if (request.options.auto_mine && this.miner && request.artifacts?.commits) {
      minedPatterns = await this.miner.minePatterns(request.artifacts.commits);
    }

    // [FIX:SQLITE:SYNC] ★★★★★ (5 uses, 100% success) - Pre-load pattern data for synchronous transaction
    // Pre-load pattern data for trust updates to avoid async operations in transaction
    const patternDataMap = new Map<
      string,
      { alpha: number; beta: number; id: string }
    >();
    for (const update of request.claims.trust_updates) {
      const pattern = await this.repository.getByIdOrAlias(update.pattern_id);
      if (pattern) {
        patternDataMap.set(update.pattern_id, {
          id: pattern.id,
          alpha: pattern.alpha || 1,
          beta: pattern.beta || 1,
        });
      }
    }

    // Process synchronously within transaction
    // Note: better-sqlite3 transactions must be synchronous
    let trustResults: any[] = [];
    let draftIds: Array<{
      draft_id: string;
      kind: "NEW_PATTERN" | "ANTI_PATTERN";
    }> = [];

    const result = this.storage.transaction(() => {
      // Store reflection (idempotent)
      const { id, existed } = this.storage.storeReflection(request);

      if (existed && !request.options.auto_mine) {
        // Already processed this reflection
        return {
          ok: true,
          persisted: false,
          draftIds: [],
          message: "Reflection already processed",
        };
      }

      // [FIX:SQLITE:SYNC] ★★★★★ (5 uses, 100% success) - Apply trust updates synchronously inside transaction
      // Apply trust updates synchronously within the transaction
      trustResults = this.applyTrustUpdatesSync(
        request.claims.trust_updates,
        patternDataMap,
      );

      // Update patterns table with new trust values
      for (const [patternId, data] of patternDataMap) {
        const trustScore = this.trustModel.calculateTrust(
          data.alpha - 1,
          data.beta - 1,
        );
        this.storage.updatePatternTrust(
          patternId,
          data.alpha,
          data.beta,
          trustScore.value,
        );
      }

      // Insert new patterns directly into patterns table

      if (request.claims.new_patterns) {
        for (const pattern of request.claims.new_patterns) {
          const patternId = this.patternInserter.insertNewPattern(
            pattern,
            "NEW_PATTERN",
          );
          draftIds.push({ draft_id: patternId, kind: "NEW_PATTERN" });
          this.metrics.recordPatternDiscovered();
        }
      }

      if (request.claims.anti_patterns) {
        for (const pattern of request.claims.anti_patterns) {
          const patternId = this.patternInserter.insertNewPattern(
            pattern,
            "ANTI_PATTERN",
          );
          draftIds.push({ draft_id: patternId, kind: "ANTI_PATTERN" });
        }
      }

      // Store audit events
      for (const usage of request.claims.patterns_used) {
        this.storage.storeAuditEvent({
          task_id: request.task.id,
          kind: "pattern_used",
          pattern_id: usage.pattern_id,
        });
      }

      // Insert mined patterns directly
      for (const pattern of minedPatterns) {
        const patternId = this.patternInserter.insertNewPattern(
          pattern,
          "NEW_PATTERN",
        );
        draftIds.push({ draft_id: patternId, kind: "NEW_PATTERN" });
        this.metrics.recordPatternDiscovered();
      }

      return {
        ok: true,
        persisted: true,
        draftIds,
        trustResults, // Include trust results from synchronous update
      };
    });

    const persistMs = Date.now() - persistStarted;

    // [FIX:SQLITE:SYNC] ★★★★★ (5 uses, 100% success) - Trust updates now handled inside transaction
    if (result.persisted) {
      trustResults = result.trustResults || [];
      draftIds = result.draftIds || [];
    }

    // Get anti-pattern candidates
    const antiCandidates = this.storage.getAntiPatternCandidates();

    // Build response
    return {
      ok: result.ok,
      persisted: result.persisted,
      outcome: request.outcome,
      accepted: {
        patterns_used: request.claims.patterns_used,
        new_patterns: request.claims.new_patterns || [],
        anti_patterns: request.claims.anti_patterns || [],
        learnings: request.claims.learnings || [],
        trust_updates: trustResults || [],
      },
      rejected: [],
      drafts_created: draftIds || [],
      anti_candidates: antiCandidates.map((c) => ({
        title: c.title,
        count_30d: c.count,
      })),
      explain: request.options.return_explain
        ? {
            validators: [
              "git_lines",
              "pr_exists",
              "pattern_exists",
              "duplicate_trust_guard",
            ],
            hints: [],
          }
        : undefined,
      meta: {
        received_at: new Date(startTime).toISOString(),
        validated_in_ms: validationMs,
        persisted_in_ms: persistMs,
        schema_version: MCP_SCHEMA_VERSION,
      },
    };
  }

  /**
   * Apply trust updates to patterns
   */
  private async applyTrustUpdates(updates: TrustUpdate[]): Promise<
    Array<{
      pattern_id: string;
      applied_delta: { alpha: number; beta: number };
      alpha_after: number;
      beta_after: number;
      wilson_lb_after: number;
    }>
  > {
    const results = [];

    for (const update of updates) {
      // Get current pattern
      const pattern = await this.repository.getByIdOrAlias(update.pattern_id);
      if (!pattern) {
        continue;
      }

      // Apply trust update
      const currentAlpha = pattern.alpha || 1;
      const currentBeta = pattern.beta || 1;

      const newAlpha = currentAlpha + update.delta.alpha;
      const newBeta = currentBeta + update.delta.beta;

      // Calculate new trust score using the public method
      const trustScore = this.trustModel.calculateTrust(
        newAlpha - 1, // Remove default priors
        newBeta - 1, // Remove default priors
      );

      // Update pattern with new trust values
      await this.repository.update(pattern.id, {
        trust_score: trustScore.value,
        alpha: newAlpha,
        beta: newBeta,
      });

      this.metrics.recordTrustUpdate();

      results.push({
        pattern_id: update.pattern_id,
        applied_delta: update.delta,
        alpha_after: newAlpha,
        beta_after: newBeta,
        wilson_lb_after: trustScore.wilsonLower,
      });
    }

    return results;
  }

  /**
   * Apply trust updates to patterns (synchronous version for transactions)
   */
  private applyTrustUpdatesSync(
    updates: TrustUpdate[],
    patternDataMap: Map<string, { alpha: number; beta: number; id: string }>,
  ): Array<{
    pattern_id: string;
    applied_delta: { alpha: number; beta: number };
    alpha_after: number;
    beta_after: number;
    wilson_lb_after: number;
  }> {
    const results = [];

    for (const update of updates) {
      // Process outcome to delta if needed
      const processed = OutcomeProcessor.processTrustUpdate(update);

      // Get current pattern from map
      const patternData = patternDataMap.get(processed.pattern_id);
      if (!patternData) {
        continue;
      }

      // Apply trust update
      const currentAlpha = patternData.alpha || 1;
      const currentBeta = patternData.beta || 1;

      const newAlpha = currentAlpha + processed.delta.alpha;
      const newBeta = currentBeta + processed.delta.beta;

      // Calculate new trust score using the public method
      const trustScore = this.trustModel.calculateTrust(
        newAlpha - 1, // Remove default priors
        newBeta - 1, // Remove default priors
      );

      // Update pattern data in map for transaction
      patternDataMap.set(processed.pattern_id, {
        ...patternData,
        alpha: newAlpha,
        beta: newBeta,
      });

      this.metrics.recordTrustUpdate();

      results.push({
        pattern_id: processed.pattern_id,
        applied_delta: processed.delta,
        alpha_after: newAlpha,
        beta_after: newBeta,
        wilson_lb_after: trustScore.wilsonLower,
      });
    }

    return results;
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    errors: Array<{ path: string; code: string; message: string }>,
    startTime: number,
  ): ReflectResponse {
    return {
      ok: false,
      persisted: false,
      rejected: errors,
      drafts_created: [],
      meta: {
        received_at: new Date(startTime).toISOString(),
        validated_in_ms: Date.now() - startTime,
        schema_version: MCP_SCHEMA_VERSION,
      },
    };
  }

  /**
   * Create validation response
   */
  private createValidationResponse(
    valid: boolean,
    errors: Array<{ path: string; code: string; message: string }>,
    startTime: number,
    persisted: boolean,
  ): ReflectResponse {
    return {
      ok: valid,
      persisted: persisted && valid,
      rejected: errors,
      drafts_created: [],
      explain: {
        validators: ["schema", "evidence", "pattern_exists"],
        hints: errors.map((e) => `Fix ${e.path}: ${e.message}`),
      },
      meta: {
        received_at: new Date(startTime).toISOString(),
        validated_in_ms: Date.now() - startTime,
        schema_version: MCP_SCHEMA_VERSION,
      },
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): IReflectionMetrics {
    return this.metrics.getMetrics();
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.validator.clearCache();
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
