// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Incremental TypeScript adoption

export { PatternRepository } from "./repository.js";
export { PatternDatabase } from "./database.js";
export { PatternCache } from "./cache.js";
export { PatternLoader } from "./loader.js";
export { PatternWatcher } from "./watcher.js";

// Re-export types
export type {
  Pattern,
  PatternLanguage,
  PatternFramework,
  PatternPath,
  PatternRepo,
  PatternTaskType,
  PatternEnv,
  PatternTag,
  Snippet,
  LookupQuery,
  QueryFacets,
  PatternPack,
  ValidationResult,
  Migration,
  FileChangeEvent,
} from "./types.js";

// Factory function for easy initialization
import type { PatternRepository as PatternRepositoryType } from "./repository.js";

export async function createPatternRepository(options?: {
  dbPath?: string;
  cacheSize?: number;
  watchDebounce?: number;
  watch?: boolean;
}): Promise<PatternRepositoryType> {
  const { PatternRepository } = await import("./repository.js");
  const repository = new PatternRepository(options);
  // By default, don't watch for CLI commands
  await repository.initialize({ watch: options?.watch ?? false });
  return repository;
}
