import { z } from 'zod';
import { BasePatternSchema } from '../base.js';

// MIGRATION patterns - Migration strategies
export const MigrationPatternSchema = BasePatternSchema.extend({
  type: z.literal('MIGRATION'),
  
  // MIGRATION-specific fields can be added here
  // For now, MIGRATION patterns use only the base fields
});

export type MigrationPattern = z.infer<typeof MigrationPatternSchema>;