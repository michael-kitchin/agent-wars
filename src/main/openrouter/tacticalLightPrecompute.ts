import { logDebug } from '../logger';

/**
 * Developer-only experiment: further restrict tactical OpenRouter tool names to reduce wall-clock latency.
 *
 * Purpose: Phase 6 “light precompute” spike — strips heavy assessment tools from the tactical tool loop while leaving
 * routing and distance checks available (default **off** so production behavior is unchanged).
 * When to use: Set to `true` locally when profiling tactical `requestAiOrders`; never ship enabled without re-validating
 * prompt/tool parity.
 * Expected outcome: When `true`, tactical passes intersect `enabledToolNames` with `TACTICAL_LIGHT_TOOL_NAMES`.
 * Exceptions: None.
 */
export const TACTICAL_LIGHT_PRECOMPUTE_ENABLED = false;

/**
 * Tool names retained in tactical “light” mode (subset of the full catalog after strategic-only stripping).
 *
 * Purpose: Keeps plan_route / check_distance for valid explicit_move construction without assess_* / estimate_combat.
 * When to use: Only when `TACTICAL_LIGHT_PRECOMPUTE_ENABLED` is true.
 * Expected outcome: Model still has minimal geometry helpers; omitting names here removes them from the tactical pass.
 * Exceptions: None.
 */
const TACTICAL_LIGHT_TOOL_NAMES = new Set([
  'plan_route',
  'check_distance',
  'query_orders',
  'cancel_order',
]);

/**
 * Optionally intersects tactical enabled tool names with the light allowlist.
 *
 * Purpose: Applies `TACTICAL_LIGHT_PRECOMPUTE_ENABLED` without scattering flag checks through `requestOrdersFlow`.
 * When to use: Immediately after tactical strategic-only tool stripping in `requestOrdersFlow`.
 * Expected outcome: Unchanged names when the flag is false; filtered list with debug log when true.
 * Exceptions: None.
 */
export function maybeApplyTacticalLightPrecomputeToolAllowlist(
  tacticalBattleId: string,
  names: string[] | undefined
): string[] | undefined {
  if (!TACTICAL_LIGHT_PRECOMPUTE_ENABLED || names === undefined) {
    return names;
  }
  const filtered = names.filter((n) => TACTICAL_LIGHT_TOOL_NAMES.has(n));
  logDebug('openRouter tactical light precompute: tool allowlist applied', {
    battleId: tacticalBattleId,
    beforeCount: names.length,
    afterCount: filtered.length,
  });
  return filtered;
}
