/**
 * Use this to compute integer percentages for progress summaries in prompts and UI text.
 * Returns zero when the denominator is not positive.
 */
export function computeRoundedPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
