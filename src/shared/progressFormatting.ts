/**
 * Defines the `computeRoundedPercentage` function shape (export function computeRoundedPercentage(numerator: number, denominator: number): number).

 * Purpose: Supports maintainability by documenting why `computeRoundedPercentage` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeRoundedPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
