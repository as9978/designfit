// src/score.ts

/**
 * Fidelity score 0..100 = share of (error-eligible) checks that passed.
 * Only enforced checks reach totalChecks — hardcoded-value token checks are skipped
 * from scoring (they surface as advisory warns), so every counted check is one whose
 * failure is an error. errors must be <= totalChecks.
 */
export function computeScore(errors: number, totalChecks: number): number {
  if (totalChecks === 0) return 100;
  return Math.round(100 * (1 - errors / totalChecks));
}
