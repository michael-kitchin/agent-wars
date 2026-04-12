/**
 * Shared tactical order validation result shape for opponent tactical AI validation helpers.
 */

/**
 * Describes the outcome of a tactical AI order validation pass against a tactical plan snapshot.
 *
 * Contract: `valid: true` carries no reason; `valid: false` always includes a human-facing `reason` string.
 * When to use: Return type for `validateTacticalOpponent*` helpers consumed by `requestOrdersFlow`.
 * Expected outcome: Callers branch on `valid` without additional sentinel values.
 * Exceptions: None.
 */
export type TacticalValidationResult = { valid: true } | { valid: false; reason: string };

/**
 * Returns a successful tactical validation marker without allocating new object shapes beyond the constant union.
 *
 * Contract: Always `{ valid: true }`; stable reference is not guaranteed across calls.
 * When to use: Terminal success returns in tactical opponent validators.
 * Expected outcome: Caller treats the order as accepted for tactical projection.
 * Exceptions: None.
 */
export function tacticalValidResult(): TacticalValidationResult {
  return { valid: true };
}

/**
 * Returns a failed tactical validation marker carrying a stable reason string for AI drop diagnostics.
 *
 * Contract: `reason` must be non-empty and safe to surface in logs or UI toasts downstream.
 * When to use: Any tactical validation branch that rejects an order before tactical snapshot mutation.
 * Expected outcome: Caller records `reason` and skips the associated order.
 * Exceptions: None.
 */
export function tacticalInvalidResult(reason: string): TacticalValidationResult {
  return { valid: false, reason };
}
