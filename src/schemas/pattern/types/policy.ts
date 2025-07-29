import { z } from 'zod';
import { BasePatternSchema } from '../base.js';

// POLICY patterns - Organizational policies
export const PolicyPatternSchema = BasePatternSchema.extend({
  type: z.literal('POLICY'),
  
  // Policy-specific fields
  rules: z.record(z.unknown()).optional() // Flexible rules object for policy definitions
});

export type PolicyPattern = z.infer<typeof PolicyPatternSchema>;