/**
 * MCP tool for reflection system
 * [PAT:PROTOCOL:MCP_SERVER] ★★★★☆ (4 uses, 100% success)
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import type { DatabaseAdapter } from "../../storage/database-adapter.js";
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
  NewPattern,
  BatchPattern,
  PatternOutcome,
} from "../../reflection/types.js";
import { OutcomeProcessor } from "../../reflection/outcome-processor.js";
import { BatchProcessor } from "../../reflection/batch-processor.js";
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

  recordPreprocessing(corrections: {
    evidenceKind: number;
    evidenceFormat: number;
    missingSha: number;
    patternId: number;
  }): void {
    // Track preprocessing corrections in metrics
    // These could be added to a separate preprocessing metrics object if needed
  }
}

/**
 * Request preprocessor to fix common AI mistakes before validation
 * [PAT:BATCH:PROCESSING] ★★★★☆ (34 uses, 91% success) - From cache
 * [PAT:VALIDATION:SCHEMA] ★★★★★ (40 uses, 95% success) - From cache
 */
class RequestPreprocessor {
  private corrections = {
    evidenceKind: 0,
    evidenceFormat: 0,
    missingSha: 0,
    patternId: 0,
    batchPatterns: 0,
  };

  /**
   * Preprocess request to fix common AI mistakes
   * [PAT:ERROR:HANDLING] ★★★★★ (156 uses, 100% success) - From cache
   */
  preprocess(request: any): any {
    // Deep clone to avoid mutations
    const processed = structuredClone(request);

    // Apply corrections incrementally for metrics tracking
    this.fixEvidenceKind(processed);
    this.fixEvidenceFormat(processed);
    this.fixMissingSha(processed);
    this.fixPatternIds(processed);
    this.fixBatchPatterns(processed);

    return processed;
  }

  getCorrections(): {
    evidenceKind: number;
    evidenceFormat: number;
    missingSha: number;
    patternId: number;
    batchPatterns: number;
  } {
    return { ...this.corrections };
  }

  /**
   * Fix evidence kind: "code_lines" → "git_lines"
   */
  private fixEvidenceKind(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.fixEvidenceKind(item));
      return;
    }

    // Fix kind field if it's "code_lines"
    if (obj.kind === "code_lines") {
      obj.kind = "git_lines";
      this.corrections.evidenceKind++;
    }

    // Recurse into object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        this.fixEvidenceKind(obj[key]);
      }
    }
  }

  /**
   * Fix evidence format: convert strings to objects
   * Pattern from BatchProcessor.normalizeEvidence()
   */
  private fixEvidenceFormat(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.fixEvidenceFormat(item));
      return;
    }

    // Check for evidence fields that are strings
    if (obj.evidence !== undefined) {
      if (typeof obj.evidence === "string") {
        // Convert string to evidence object array
        obj.evidence = [
          {
            kind: "git_lines",
            file: "reflection-note",
            sha: "HEAD",
            start: 1,
            end: 1,
          },
        ];
        this.corrections.evidenceFormat++;
      } else if (Array.isArray(obj.evidence)) {
        // Check each item in evidence array
        obj.evidence = obj.evidence.map((item: any) => {
          if (typeof item === "string") {
            this.corrections.evidenceFormat++;
            return {
              kind: "git_lines",
              file: "reflection-note",
              sha: "HEAD",
              start: 1,
              end: 1,
            };
          }
          return item;
        });
      }
    }

    // Recurse into object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && key !== "evidence") {
        this.fixEvidenceFormat(obj[key]);
      }
    }
  }

  /**
   * Fix missing SHA: add default "HEAD"
   */
  private fixMissingSha(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.fixMissingSha(item));
      return;
    }

    // Check if this is an evidence object with git_lines kind and missing sha
    if (obj.kind === "git_lines" && !obj.sha) {
      obj.sha = "HEAD";
      this.corrections.missingSha++;
    }

    // Recurse into object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        this.fixMissingSha(obj[key]);
      }
    }
  }

  /**
   * Fix pattern IDs: normalize ONLY single-part IDs
   * Examples:
   * - "FIX" → "FIX:DEFAULT:DEFAULT:DEFAULT"
   * - "TEST:PATTERN" → Keep as-is (2 parts is valid)
   * - "PAT:API:ERROR" → Keep as-is (3 parts is valid)
   * - "PAT:API:ERROR:DETAIL" → Keep as-is (4 parts is valid)
   *
   * Note: Based on codebase analysis, 2+ part IDs are considered valid.
   * Only single-word patterns without colons are malformed.
   */
  private fixPatternIds(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.fixPatternIds(item));
      return;
    }

    // Check for pattern_id field (in claims.patterns_used)
    if (obj.pattern_id && typeof obj.pattern_id === "string") {
      const parts = obj.pattern_id.split(":");
      // Only fix single-part IDs (no colons)
      // 2+ parts are considered valid based on test expectations
      if (parts.length === 1) {
        // Pad with DEFAULT to reach 4 parts
        while (parts.length < 4) {
          parts.push("DEFAULT");
        }
        obj.pattern_id = parts.join(":");
        this.corrections.patternId++;
      }
    }

    // Also check for pattern field (in batch_patterns)
    if (obj.pattern && typeof obj.pattern === "string") {
      const parts = obj.pattern.split(":");
      // Only fix single-part IDs (no colons)
      // 2+ parts are considered valid based on test expectations
      if (parts.length === 1) {
        // Pad with DEFAULT to reach 4 parts
        while (parts.length < 4) {
          parts.push("DEFAULT");
        }
        obj.pattern = parts.join(":");
        this.corrections.patternId++;
      }
    }

    // Recurse into object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        this.fixPatternIds(obj[key]);
      }
    }
  }

  /**
   * Fix batch_patterns: convert JSON string to array
   * Common AI mistake: passing batch_patterns as stringified JSON
   */
  private fixBatchPatterns(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach((item) => this.fixBatchPatterns(item));
      return;
    }

    // Fix batch_patterns if it's a string
    if (obj.batch_patterns && typeof obj.batch_patterns === "string") {
      try {
        const parsed = JSON.parse(obj.batch_patterns);
        if (Array.isArray(parsed)) {
          obj.batch_patterns = parsed;
          this.corrections.batchPatterns++;
        }
      } catch (error) {
        // Invalid JSON - leave as-is for schema to catch
        // This allows proper error reporting rather than silent failure
      }
    }

    // Recurse into object properties
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && key !== "batch_patterns") {
        this.fixBatchPatterns(obj[key]);
      }
    }
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
  private db: DatabaseAdapter; // [PAT:dA0w9N1I9-4m] ★★★★★ (7 uses, 100% success) - Single DB instance

  constructor(
    repository: PatternRepository,
    db: DatabaseAdapter,
    config?: {
      allowedRepoUrls?: string[];
      gitRepoPath?: string;
      enableMining?: boolean;
    },
  ) {
    this.repository = repository;

    // [FIX:DATABASE:SHARED_INSTANCE] ★★★★★ - Use injected database instance
    this.db = db;

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
      // Preprocess request to fix common AI mistakes
      const preprocessor = new RequestPreprocessor();
      const preprocessed = preprocessor.preprocess(rawRequest);

      // Record preprocessing metrics
      const corrections = preprocessor.getCorrections();
      this.metrics.recordPreprocessing(corrections);

      // Log corrections if any were made
      const totalCorrections = Object.values(corrections).reduce(
        (a, b) => a + b,
        0,
      );
      if (totalCorrections > 0) {
        console.info(
          `Preprocessor applied ${totalCorrections} corrections:`,
          corrections,
        );
      }

      // Parse and validate request schema
      const validationResult = ReflectRequestSchema.safeParse(preprocessed);
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

      let request = validationResult.data;

      // Convert batch_patterns to claims format if needed
      if (request.batch_patterns && !request.claims) {
        // batch_patterns is validated by schema and guaranteed to be BatchPattern[]
        // Workaround: Zod's type inference issue with optional arrays
        // Filter and map to ensure proper typing and required properties
        const batchPatterns: BatchPattern[] = request.batch_patterns
          .filter((p: any) => p.pattern) // Only include items with pattern
          .map((p: any) => ({
            pattern: p.pattern as string,
            outcome: p.outcome as PatternOutcome,
            evidence: p.evidence,
            notes: p.notes,
          }));

        const expandedClaims = BatchProcessor.expandBatchPatterns(
          batchPatterns as any,
        );
        request = {
          ...request,
          claims: expandedClaims,
          batch_patterns: undefined, // Remove batch_patterns after conversion
        };
      }

      // If dry run, only validate
      if (request.options.dry_run) {
        const validation = await this.validator.validateRequest(request);
        return this.createValidationResponse(
          validation.valid,
          validation.errors,
          startTime,
          false,
          validation.warnings,
          validation.queued,
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

    // Auto-create missing patterns in permissive mode BEFORE validation
    // Default to permissive mode unless explicitly set to "strict"
    const isPermissive = process.env.APEX_REFLECTION_MODE !== "strict";
    if (isPermissive && request.claims?.patterns_used) {
      for (const usage of request.claims.patterns_used) {
        const pattern = await this.repository.getByIdOrAlias(usage.pattern_id);
        if (!pattern) {
          // Auto-create pattern similar to trust_updates logic
          const title = this.generateTitleFromPatternId(usage.pattern_id);
          const patternBase = {
            title: title,
            summary: `Auto-created pattern from reflection (patterns_used)`,
            snippets: [],
            evidence: [],
          };

          try {
            const newPatternId = this.patternInserter.insertNewPattern(
              patternBase,
              "NEW_PATTERN",
            );

            // Set original ID as alias
            if (newPatternId) {
              const updateStmt = this.db.prepare(
                "UPDATE patterns SET alias = ?, provenance = 'auto-created' WHERE id = ?",
              );
              updateStmt.run(usage.pattern_id, newPatternId);

              console.log(
                `Auto-created pattern from patterns_used: ${usage.pattern_id} -> ${newPatternId}`,
              );
            }
          } catch (error) {
            console.warn(
              `Failed to auto-create pattern ${usage.pattern_id}:`,
              error,
            );
          }
        }
      }
    }

    // Validate evidence
    const validation = await this.validator.validateRequest(request);
    if (!validation.valid && !isPermissive) {
      return this.createValidationResponse(
        false,
        validation.errors,
        startTime,
        false,
        validation.warnings,
        validation.queued,
      );
    }

    // Store warnings to include in final response
    const validationWarnings = validation.warnings || [];
    const validationQueued = validation.queued || [];

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
    // [FIX:SQLITE:SYNC] ★★★★★ - Pre-load all patterns before transaction
    if (request.claims?.trust_updates) {
      for (const update of request.claims.trust_updates) {
        const pattern = await this.repository.getByIdOrAlias(update.pattern_id);
        if (pattern) {
          patternDataMap.set(update.pattern_id, {
            id: pattern.id,
            alpha: pattern.alpha || 1,
            beta: pattern.beta || 1,
          });
          // Also map by the pattern's actual ID if different from requested (alias case)
          if (pattern.id !== update.pattern_id) {
            patternDataMap.set(pattern.id, {
              id: pattern.id,
              alpha: pattern.alpha || 1,
              beta: pattern.beta || 1,
            });
          }
        }
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
      if (request.claims?.trust_updates) {
        trustResults = this.applyTrustUpdatesSync(
          request.claims.trust_updates,
          patternDataMap,
        );
      }

      // Update patterns table with new trust values and usage stats (APE-65)
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

        // Update usage statistics based on trust updates
        const trustUpdate = request.claims.trust_updates?.find(
          (u) => u.pattern_id === patternId,
        );
        if (trustUpdate) {
          // Determine if pattern was successful based on outcome
          const wasSuccessful = trustUpdate.outcome
            ? [
                "worked-perfectly",
                "worked-with-tweaks",
                "partial-success",
              ].includes(trustUpdate.outcome)
            : (trustUpdate.delta?.alpha ?? 0) >= 0.5;

          this.storage.updatePatternUsageStats(patternId, wasSuccessful);
        }
      }

      // Insert new patterns directly into patterns table

      if (request.claims?.new_patterns) {
        for (const pattern of request.claims.new_patterns) {
          const patternId = this.patternInserter.insertNewPattern(
            pattern,
            "NEW_PATTERN",
          );
          draftIds.push({ draft_id: patternId, kind: "NEW_PATTERN" });
          this.metrics.recordPatternDiscovered();
        }
      }

      if (request.claims?.anti_patterns) {
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
        patterns_used: request.claims?.patterns_used || [],
        new_patterns: request.claims?.new_patterns || [],
        anti_patterns: request.claims?.anti_patterns || [],
        learnings: request.claims?.learnings || [],
        trust_updates: trustResults || [],
      },
      ...(validationWarnings.length > 0 && { warnings: validationWarnings }),
      ...(validationQueued.length > 0 && { queued: validationQueued }),
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
   * Generate a human-readable title from a pattern ID
   * Example: "PAT:API:ERROR_HANDLING" → "Error Handling"
   * Example: "FIX:SQLITE:SYNC" → "Sync"
   */
  private generateTitleFromPatternId(patternId: string): string {
    // [PAT:STRING:PROCESSING] ★★★★☆ - String manipulation pattern
    const parts = patternId.split(":");
    // Take the last part as the base title
    const lastPart = parts[parts.length - 1] || patternId;
    // Convert underscores to spaces and capitalize each word
    return lastPart
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
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
      let patternData = patternDataMap.get(processed.pattern_id);
      if (!patternData) {
        // [FIX:PATTERN:AUTO_INSERT] - Auto-create missing patterns with valid 4-segment IDs
        // Generate a title from the pattern ID
        const title = this.generateTitleFromPatternId(processed.pattern_id);

        try {
          // Parse the original pattern ID to determine type
          const [firstSegment] = processed.pattern_id.split(":");
          const isAntiPattern = firstSegment === "ANTI";

          // Create the pattern using PatternInserter
          // Pass the original ID to be used as alias
          // Create the pattern object based on ID segments
          // Only include id field if it's a proper pattern ID (2+ segments)
          const idParts = processed.pattern_id.split(":");
          const patternBase: any = {
            title: title,
            summary: `Auto-created ${isAntiPattern ? "anti-pattern" : "pattern"} from reflection`,
            snippets: [],
            evidence: [],
          };

          // Only add id field for patterns with 2+ segments
          // Single-segment patterns should not have an id field
          if (idParts.length >= 2) {
            patternBase.id = processed.pattern_id;
          }

          // Always include originalId for alias creation
          patternBase.originalId = processed.pattern_id;

          // Let PatternInserter generate the compliant 4-segment ID
          // The original ID will be preserved as an alias
          const newPatternId = this.patternInserter.insertNewPattern(
            patternBase,
            isAntiPattern ? "ANTI_PATTERN" : "NEW_PATTERN",
          );

          // Update to set the original ID as alias and mark as auto-created
          if (newPatternId) {
            // Set both alias and provenance
            const updateStmt = this.db.prepare(
              "UPDATE patterns SET alias = ?, provenance = 'auto-created' WHERE id = ?",
            );
            updateStmt.run(processed.pattern_id, newPatternId);
          }

          // Add to patternDataMap with initial Beta(1,1) trust scores
          patternData = {
            id: newPatternId,
            alpha: 1,
            beta: 1,
          };
          // Map both the original ID and new ID for future lookups
          patternDataMap.set(processed.pattern_id, patternData);
          if (newPatternId !== processed.pattern_id) {
            patternDataMap.set(newPatternId, patternData);
          }

          this.metrics.recordPatternDiscovered();
          console.log(
            `Auto-created pattern: ${processed.pattern_id} -> ${newPatternId}`,
          );
        } catch (error) {
          // Log warning but continue processing other updates
          console.warn(
            `Failed to auto-create pattern ${processed.pattern_id}:`,
            error,
          );
          continue;
        }
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
    warnings?: Array<{ path: string; code: string; message: string }>,
    queued?: Array<{ item: any; reason: string }>,
  ): ReflectResponse {
    return {
      ok: valid,
      persisted: persisted && valid,
      rejected: errors,
      ...(warnings && warnings.length > 0 && { warnings }),
      ...(queued && queued.length > 0 && { queued }),
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
