/**
 * Time Decay Calculations for Trust Scores
 * Implements exponential decay with configurable half-life
 */

export interface DecayResult {
  alpha: number;
  beta: number;
  decayFactor: number;
}

/**
 * Calculate decay factor based on elapsed time and half-life
 * @param days Number of days elapsed
 * @param halfLife Half-life in days
 * @returns Decay factor between 0 and 1
 */
export function calculateDecayFactor(days: number, halfLife: number): number {
  if (days <= 0) return 1;
  if (halfLife <= 0) {
    throw new Error("Half-life must be positive");
  }

  // Exponential decay: e^(-ln(2) * t / half_life)
  return Math.exp((-Math.LN2 * days) / halfLife);
}

/**
 * Apply decay to Beta distribution parameters
 * Decays towards the prior distribution
 * @param alpha Current alpha parameter
 * @param beta Current beta parameter
 * @param days Days elapsed since last update
 * @param halfLife Half-life for decay
 * @param priorAlpha Prior alpha value
 * @param priorBeta Prior beta value
 * @returns Decayed parameters
 */
export function applyDecay(
  alpha: number,
  beta: number,
  days: number,
  halfLife: number,
  priorAlpha: number = 1,
  priorBeta: number = 1,
): DecayResult {
  const decayFactor = calculateDecayFactor(days, halfLife);

  // Decay towards prior
  // New = Prior + (Current - Prior) * decay_factor
  const decayedAlpha = priorAlpha + (alpha - priorAlpha) * decayFactor;
  const decayedBeta = priorBeta + (beta - priorBeta) * decayFactor;

  return {
    alpha: decayedAlpha,
    beta: decayedBeta,
    decayFactor,
  };
}

/**
 * Calculate the effective age of evidence
 * Returns the equivalent age if all evidence was collected at once
 * @param alpha Current alpha
 * @param beta Current beta
 * @param priorAlpha Prior alpha
 * @param priorBeta Prior beta
 * @param halfLife Half-life in days
 * @returns Effective age in days
 */
export function calculateEffectiveAge(
  alpha: number,
  beta: number,
  priorAlpha: number,
  priorBeta: number,
  halfLife: number,
): number {
  // Calculate what decay factor would produce current parameters
  const currentEvidence = alpha - priorAlpha + (beta - priorBeta);
  const originalEvidence =
    currentEvidence / calculateAverageDecay(alpha, beta, priorAlpha, priorBeta);

  if (originalEvidence <= currentEvidence) {
    return 0; // No decay detected
  }

  const decayFactor = currentEvidence / originalEvidence;

  // Solve for time: t = -half_life * ln(decay_factor) / ln(2)
  return (-halfLife * Math.log(decayFactor)) / Math.LN2;
}

/**
 * Calculate average decay factor across alpha and beta
 */
function calculateAverageDecay(
  alpha: number,
  beta: number,
  priorAlpha: number,
  priorBeta: number,
): number {
  const alphaDecay = alpha - priorAlpha > 0 ? 1 : 0;
  const betaDecay = beta - priorBeta > 0 ? 1 : 0;

  if (alphaDecay + betaDecay === 0) return 1;

  return (alphaDecay + betaDecay) / 2;
}

/**
 * Calculate the number of days until trust score reaches a target value
 * @param currentAlpha Current alpha parameter
 * @param currentBeta Current beta parameter
 * @param targetTrust Target trust value (0-1)
 * @param halfLife Half-life in days
 * @param priorAlpha Prior alpha
 * @param priorBeta Prior beta
 * @returns Days until target reached, or null if never
 */
export function daysUntilTarget(
  currentAlpha: number,
  currentBeta: number,
  targetTrust: number,
  halfLife: number,
  priorAlpha: number = 1,
  priorBeta: number = 1,
): number | null {
  const priorTrust = priorAlpha / (priorAlpha + priorBeta);

  // If prior trust equals target, it will reach it eventually
  if (Math.abs(priorTrust - targetTrust) < 0.001) {
    return Infinity;
  }

  // If current trust is already at or past target in the decay direction
  const currentTrust = currentAlpha / (currentAlpha + currentBeta);
  if (priorTrust < targetTrust && currentTrust <= targetTrust) {
    return null; // Will never reach target
  }
  if (priorTrust > targetTrust && currentTrust >= targetTrust) {
    return null; // Will never reach target
  }

  // Binary search for the number of days
  let low = 0;
  let high = halfLife * 10; // Search up to 10 half-lives
  const tolerance = 0.1; // 0.1 day precision

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    const decayed = applyDecay(
      currentAlpha,
      currentBeta,
      mid,
      halfLife,
      priorAlpha,
      priorBeta,
    );
    const decayedTrust = decayed.alpha / (decayed.alpha + decayed.beta);

    if (priorTrust < targetTrust) {
      if (decayedTrust < targetTrust) {
        high = mid;
      } else {
        low = mid;
      }
    } else {
      if (decayedTrust > targetTrust) {
        high = mid;
      } else {
        low = mid;
      }
    }
  }

  return (low + high) / 2;
}

/**
 * Get decay schedule for visualization
 * Returns trust values at regular intervals
 * @param alpha Starting alpha
 * @param beta Starting beta
 * @param days Number of days to project
 * @param halfLife Half-life in days
 * @param intervals Number of data points
 * @param priorAlpha Prior alpha
 * @param priorBeta Prior beta
 * @returns Array of {day, trust, alpha, beta}
 */
export function getDecaySchedule(
  alpha: number,
  beta: number,
  days: number,
  halfLife: number,
  intervals: number = 30,
  priorAlpha: number = 1,
  priorBeta: number = 1,
): Array<{ day: number; trust: number; alpha: number; beta: number }> {
  const schedule = [];
  const stepSize = days / intervals;

  for (let i = 0; i <= intervals; i++) {
    const day = i * stepSize;
    const decayed = applyDecay(
      alpha,
      beta,
      day,
      halfLife,
      priorAlpha,
      priorBeta,
    );
    const trust = decayed.alpha / (decayed.alpha + decayed.beta);

    schedule.push({
      day: Math.round(day * 10) / 10,
      trust: Math.round(trust * 1000) / 1000,
      alpha: Math.round(decayed.alpha * 100) / 100,
      beta: Math.round(decayed.beta * 100) / 100,
    });
  }

  return schedule;
}
