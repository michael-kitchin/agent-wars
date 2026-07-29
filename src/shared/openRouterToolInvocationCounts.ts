/**
 * Shared decision for OpenRouter tool-group counts after strategic Ready or tactical commit.
 */

/**
 * Chooses which tool-invocation count map should drive the UI after Ready zeros the counters.
 *
 * Purpose: Strategic Ready and tactical commit must agree: prefer this resolution’s consult counts when present;
 * otherwise optionally restore cached precomputed counts so prefetch telemetry is not wiped.
 * When to use: Renderer `applyToolInvocationCountsAfterReady` and unit tests for Ready telemetry parity.
 * Expected outcome: A shallow copy of `fromResult` when set; else a copy of `cachedPrecomputed` when fallback is
 * allowed and that cache is non-null; otherwise `null` (leave the zeroed UI state).
 * Exceptions: None.
 */
export function resolveToolInvocationCountsAfterReady(args: {
  fromResult?: Record<string, number>;
  cachedPrecomputed: Record<string, number> | null;
  allowPrecomputedFallback: boolean;
}): Record<string, number> | null {
  if (args.fromResult) return { ...args.fromResult };
  if (args.allowPrecomputedFallback && args.cachedPrecomputed) return { ...args.cachedPrecomputed };
  return null;
}
