import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: Supports maintainability by documenting why `isWaitingForPrecomputedAiOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  return S.runButtonOn && S.precomputedAiOrders === null;
}
