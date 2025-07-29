import { z } from "zod";
import { BasePatternSchema } from "../base.js";

// ANTI patterns - Anti-patterns to avoid
export const AntiPatternSchema = BasePatternSchema.extend({
  type: z.literal("ANTI"),

  // Evidence is strongly recommended for ANTI patterns
  // but not required to allow gradual migration
});

export type AntiPattern = z.infer<typeof AntiPatternSchema>;
