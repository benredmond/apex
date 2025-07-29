/**
 * Trust Distribution Visualization
 * Generates visual representations of Beta distributions
 */

import { TrustScore } from './types.js';
import { getDecaySchedule } from './decay.js';

export interface DistributionPoint {
  x: number;
  y: number;
}

export interface TrustVisualization {
  distribution: DistributionPoint[];
  mean: number;
  mode: number;
  median: number;
  confidenceInterval: [number, number];
  percentiles: Map<number, number>;
}

export interface TrustHistogram {
  buckets: Array<{ range: [number, number]; count: number; percentage: number }>;
  totalCount: number;
}

/**
 * Generate points for Beta distribution PDF
 * @param alpha Alpha parameter
 * @param beta Beta parameter
 * @param points Number of points to generate
 * @returns Array of {x, y} points for plotting
 */
export function generateBetaDistribution(
  alpha: number,
  beta: number,
  points: number = 100
): DistributionPoint[] {
  const distribution: DistributionPoint[] = [];
  
  // Handle edge cases
  if (alpha <= 0 || beta <= 0) {
    return [];
  }
  
  // Generate points from 0 to 1
  for (let i = 0; i <= points; i++) {
    const x = i / points;
    const y = betaPDF(x, alpha, beta);
    
    distribution.push({
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
    });
  }
  
  return distribution;
}

/**
 * Beta distribution PDF
 */
function betaPDF(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0;
  
  // Handle special cases
  if (alpha === 1 && beta === 1) return 1; // Uniform
  
  // Use log scale to avoid overflow
  const logPDF = 
    (alpha - 1) * Math.log(x) +
    (beta - 1) * Math.log(1 - x) -
    logBeta(alpha, beta);
  
  return Math.exp(logPDF);
}

/**
 * Log of Beta function
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log Gamma approximation
 */
function logGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Generate complete visualization data for a trust score
 */
export function generateTrustVisualization(
  trustScore: TrustScore,
  percentiles: number[] = [0.05, 0.25, 0.5, 0.75, 0.95]
): TrustVisualization {
  const { alpha, beta } = trustScore;
  
  // Generate distribution
  const distribution = generateBetaDistribution(alpha, beta);
  
  // Calculate statistics
  const mean = alpha / (alpha + beta);
  const mode = calculateMode(alpha, beta);
  const median = calculateMedian(alpha, beta);
  
  // Calculate percentiles
  const percentileMap = new Map<number, number>();
  for (const p of percentiles) {
    percentileMap.set(p, approximateQuantile(p, alpha, beta));
  }
  
  return {
    distribution,
    mean,
    mode,
    median,
    confidenceInterval: trustScore.interval,
    percentiles: percentileMap,
  };
}

/**
 * Calculate mode of Beta distribution
 */
function calculateMode(alpha: number, beta: number): number {
  if (alpha > 1 && beta > 1) {
    return (alpha - 1) / (alpha + beta - 2);
  } else if (alpha < 1 && beta < 1) {
    return 0; // Bimodal at 0 and 1
  } else if (alpha < 1) {
    return 0;
  } else if (beta < 1) {
    return 1;
  } else {
    return 0.5; // alpha = beta = 1 (uniform)
  }
}

/**
 * Calculate median of Beta distribution
 * Uses approximation for efficiency
 */
function calculateMedian(alpha: number, beta: number): number {
  // For symmetric case
  if (alpha === beta) return 0.5;
  
  // Use approximation: median ≈ (alpha - 1/3) / (alpha + beta - 2/3)
  if (alpha > 1 && beta > 1) {
    return (alpha - 1/3) / (alpha + beta - 2/3);
  }
  
  // Fall back to quantile calculation
  return approximateQuantile(0.5, alpha, beta);
}

/**
 * Approximate quantile using binary search
 */
function approximateQuantile(p: number, alpha: number, beta: number): number {
  let low = 0;
  let high = 1;
  let mid = 0.5;
  const tolerance = 1e-6;
  const maxIterations = 50;
  
  for (let i = 0; i < maxIterations; i++) {
    mid = (low + high) / 2;
    const cdf = approximateCDF(mid, alpha, beta);
    
    if (Math.abs(cdf - p) < tolerance) {
      break;
    }
    
    if (cdf < p) {
      low = mid;
    } else {
      high = mid;
    }
  }
  
  return Math.round(mid * 1000) / 1000;
}

/**
 * Approximate CDF using incomplete beta function
 * Simple approximation for visualization purposes
 */
function approximateCDF(x: number, alpha: number, beta: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  // For small values, use series expansion
  if (x < 0.5) {
    return incompleteBetaRegularized(x, alpha, beta);
  } else {
    return 1 - incompleteBetaRegularized(1 - x, beta, alpha);
  }
}

/**
 * Regularized incomplete beta function approximation
 */
function incompleteBetaRegularized(x: number, a: number, b: number): number {
  const maxTerms = 100;
  let sum = 0;
  let term = 1;
  
  for (let k = 0; k < maxTerms; k++) {
    if (k > 0) {
      term *= (x * (a + b + k - 1)) / (a + k);
    }
    sum += term / (b + k);
    
    if (Math.abs(term / (b + k)) < 1e-10) {
      break;
    }
  }
  
  return Math.pow(x, a) * Math.pow(1 - x, b) * sum / (a * Math.exp(logBeta(a, b)));
}

/**
 * Generate ASCII art visualization of trust distribution
 * Useful for console output
 */
export function generateASCIIVisualization(
  trustScore: TrustScore,
  width: number = 50,
  height: number = 10
): string[] {
  const { alpha, beta } = trustScore;
  const distribution = generateBetaDistribution(alpha, beta, width);
  
  // Find max Y value for scaling
  const maxY = Math.max(...distribution.map(p => p.y));
  
  // Create the plot
  const plot: string[] = [];
  
  // Add top border
  plot.push('┌' + '─'.repeat(width + 2) + '┐');
  
  // Generate plot rows
  for (let row = height - 1; row >= 0; row--) {
    const threshold = (row / height) * maxY;
    let line = '│ ';
    
    for (let col = 0; col < width; col++) {
      const point = distribution[Math.floor(col * distribution.length / width)];
      if (point.y >= threshold) {
        line += '█';
      } else if (point.y >= threshold - maxY / height / 2) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    
    line += ' │';
    plot.push(line);
  }
  
  // Add bottom border
  plot.push('└' + '─'.repeat(width + 2) + '┘');
  
  // Add statistics
  plot.push(`Trust: ${trustScore.value.toFixed(3)} ` +
    `[${trustScore.interval[0].toFixed(3)}, ${trustScore.interval[1].toFixed(3)}]`);
  plot.push(`Confidence: ${(trustScore.confidence * 100).toFixed(1)}% ` +
    `Samples: ${trustScore.samples}`);
  
  return plot;
}

/**
 * Generate star rating visualization
 * Compatible with existing pattern system
 */
export function generateStarRating(trustScore: TrustScore): string {
  const stars = Math.round(trustScore.value * 5);
  const filled = '★'.repeat(stars);
  const empty = '☆'.repeat(5 - stars);
  return filled + empty;
}

/**
 * Generate decay schedule visualization
 */
export function generateDecayVisualization(
  trustScore: TrustScore,
  halfLife: number,
  days: number = 180,
  width: number = 50
): string[] {
  const schedule = getDecaySchedule(
    trustScore.alpha,
    trustScore.beta,
    days,
    halfLife,
    width
  );
  
  const plot: string[] = [];
  const maxTrust = 1;
  const height = 10;
  
  // Header
  plot.push(`Trust Decay Over ${days} Days (Half-life: ${halfLife} days)`);
  plot.push('┌' + '─'.repeat(width + 2) + '┐');
  
  // Generate plot
  for (let row = height - 1; row >= 0; row--) {
    const threshold = (row / height) * maxTrust;
    let line = '│ ';
    
    for (let col = 0; col < width; col++) {
      const point = schedule[Math.floor(col * schedule.length / width)];
      if (point.trust >= threshold) {
        line += '█';
      } else if (point.trust >= threshold - maxTrust / height / 2) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    
    line += ' │';
    plot.push(line);
  }
  
  // Bottom border
  plot.push('└' + '─'.repeat(width + 2) + '┘');
  
  // Add key points
  plot.push(`Start: ${trustScore.value.toFixed(3)} → ` +
    `${halfLife}d: ${schedule[Math.floor(schedule.length / 2)].trust.toFixed(3)} → ` +
    `End: ${schedule[schedule.length - 1].trust.toFixed(3)}`);
  
  return plot;
}