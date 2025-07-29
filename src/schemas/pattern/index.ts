import { z } from 'zod';

// Import all pattern type schemas
import { CodebasePatternSchema } from './types/codebase.js';
import { LangPatternSchema } from './types/lang.js';
import { AntiPatternSchema } from './types/anti.js';
import { FailurePatternSchema } from './types/failure.js';
import { PolicyPatternSchema } from './types/policy.js';
import { TestPatternSchema } from './types/test.js';
import { MigrationPatternSchema } from './types/migration.js';

// Re-export base schemas and types
export * from './base.js';
export * from './types/codebase.js';
export * from './types/lang.js';
export * from './types/anti.js';
export * from './types/failure.js';
export * from './types/policy.js';
export * from './types/test.js';
export * from './types/migration.js';

// [PAT:INFRA:TYPESCRIPT_MIGRATION] ★★★☆☆ (2 uses) - Discriminated union pattern
export const PatternSchema = z.discriminatedUnion('type', [
  CodebasePatternSchema,
  LangPatternSchema,
  AntiPatternSchema,
  FailurePatternSchema,
  PolicyPatternSchema,
  TestPatternSchema,
  MigrationPatternSchema
]);

// Main pattern type
export type Pattern = z.infer<typeof PatternSchema>;

// Pattern type enum for convenience
export const PatternType = {
  CODEBASE: 'CODEBASE',
  LANG: 'LANG',
  ANTI: 'ANTI',
  FAILURE: 'FAILURE',
  POLICY: 'POLICY',
  TEST: 'TEST',
  MIGRATION: 'MIGRATION'
} as const;

export type PatternTypeValue = typeof PatternType[keyof typeof PatternType];