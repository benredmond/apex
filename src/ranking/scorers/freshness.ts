import { PatternMeta } from "../types.js";

const MS_PER_DAY = 86400000;
const LN_2 = Math.log(2);

export function scoreFreshness(
  pattern: PatternMeta,
  now: number = Date.now(),
  defaultHalfLife: number = 90,
): { points: number; age_days: number; half_life_days: number } {
  const lastReviewed = pattern.metadata?.lastReviewed
    ? new Date(pattern.metadata.lastReviewed).getTime()
    : now - MS_PER_DAY * 365; // Default to 1 year old

  const halfLifeDays = pattern.metadata?.halfLifeDays ?? defaultHalfLife;
  const ageDays = Math.max(0, (now - lastReviewed) / MS_PER_DAY);

  // Exponential decay: e^(-ln(2) * age / halfLife)
  const freshnesssFactor = Math.exp((-LN_2 * ageDays) / halfLifeDays);
  const points = 20 * freshnesssFactor;

  return {
    points: Math.round(points * 10) / 10,
    age_days: Math.round(ageDays * 10) / 10,
    half_life_days: halfLifeDays,
  };
}
