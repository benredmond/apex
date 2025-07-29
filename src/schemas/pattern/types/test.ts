import { z } from 'zod';
import { BasePatternSchema } from '../base.js';

// TEST patterns - Testing patterns
export const TestPatternSchema = BasePatternSchema.extend({
  type: z.literal('TEST'),
  
  // TEST-specific fields can be added here
  // For now, TEST patterns use only the base fields
});

export type TestPattern = z.infer<typeof TestPatternSchema>;