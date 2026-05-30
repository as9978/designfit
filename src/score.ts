// src/score.ts

/** Fidelity score 0..100 = share of checks that passed. errors must be <= totalChecks. */
export function computeScore(errors: number, totalChecks: number): number {
  if (totalChecks === 0) return 100;
  return Math.round(100 * (1 - errors / totalChecks));
}
