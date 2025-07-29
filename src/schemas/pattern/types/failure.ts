import { z } from "zod";
import { BasePatternSchema } from "../base.js";

// FAILURE patterns - Known failure patterns
export const FailurePatternSchema = BasePatternSchema.extend({
  type: z.literal("FAILURE"),

  // Failure-specific fields
  signature: z.string().optional(),
  mitigations: z.array(z.string()).optional(), // Pattern IDs of mitigation patterns
});

export type FailurePattern = z.infer<typeof FailurePatternSchema>;
