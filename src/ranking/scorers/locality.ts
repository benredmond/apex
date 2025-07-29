import { PatternMeta, Signals } from '../types.js';
import { minimatch } from 'minimatch';

export function scoreLocality(
  pattern: PatternMeta,
  signals: Signals
): { points: number; reason?: string } {
  // Check repo match first (highest priority)
  if (signals.repo && pattern.metadata?.repo) {
    // Support glob patterns in repo field
    if (pattern.metadata.repo === signals.repo || 
        minimatch(signals.repo, pattern.metadata.repo)) {
      return { points: 10, reason: 'same repo' };
    }
  }
  
  // Check org match
  if (signals.org && pattern.metadata?.org) {
    if (pattern.metadata.org === signals.org) {
      return { points: 5, reason: 'same org' };
    }
  }
  
  // Also check pattern ID namespace for org
  if (signals.org && pattern.id) {
    const idPrefix = pattern.id.split('.')[0];
    if (idPrefix.toLowerCase() === signals.org.toLowerCase()) {
      return { points: 5, reason: 'same org' };
    }
  }
  
  // Public/no match
  return { points: 0 };
}