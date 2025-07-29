import { z } from 'zod';
import { BasePatternSchema } from '../base.js';

// LANG patterns - Language/implementation patterns
export const LangPatternSchema = BasePatternSchema.extend({
  type: z.literal('LANG'),
  
  // Implementation guidance
  plan_steps: z.array(z.string()).optional(),
  when_to_use: z.array(z.string()).optional(),
  when_not_to_use: z.array(z.string()).optional(),
  
  // Test suggestions
  tests: z.object({
    suggestions: z.array(z.object({
      name: z.string(),
      type: z.string().optional(),
      target_file: z.string().optional()
    })).optional()
  }).optional()
});

export type LangPattern = z.infer<typeof LangPatternSchema>;