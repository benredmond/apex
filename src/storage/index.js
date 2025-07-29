// [BUILD:MODULE:ESM] ★★★☆☆ (3 uses) - ES module with .js extensions
// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Incremental TypeScript adoption
export { PatternRepository } from './repository.js';
export { PatternDatabase } from './database.js';
export { PatternCache } from './cache.js';
export { PatternLoader } from './loader.js';
export { PatternWatcher } from './watcher.js';
export async function createPatternRepository(options) {
  const { PatternRepository } = await import('./repository.js');
  const repository = new PatternRepository(options);
  await repository.initialize();
  return repository;
}
