import { z } from 'zod';
import { BasePatternSchema } from '../base.js';

// CODEBASE patterns - Project-wide patterns and conventions
export const CodebasePatternSchema = BasePatternSchema.extend({
  type: z.literal('CODEBASE'),
  
  // CODEBASE-specific fields can be added here
  // For now, CODEBASE patterns use only the base fields
});

export type CodebasePattern = z.infer<typeof CodebasePatternSchema>;