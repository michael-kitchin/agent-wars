/**
 * Shared formatting for human pending movement rows in sidebars (strategic standing orders + tactical drafts).
 *
 * Purpose: Keeps `Nh (status)` label contracts identical across modes; tactical uses tactical grid step counts for `N`.
 * When to use: Pending orders list rendering for strategic `HumanStandingOrderSnapshot` rows and tactical draft rows.
 * Expected outcome: Stable, parse-friendly labels suitable for sidebar rows and tests.
 * Exceptions: None for `formatPendingMovementSidebarTargetLabel`; distance helpers catch H3 failures when noted.
 */

import { gridDistance } from 'h3-js';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Default march `status` string shown for tactical draft rows, aligned with strategic `listHumanStandingOrders` defaulting.
 *
 * Purpose: Mirrors `String(o.status ?? 'en_route')` behavior for persisted strategic march rows when no status exists.
 * When to use: Tactical pending march draft sidebar labels until drafts are represented in the same persistence layer.
 * Expected outcome: Literal `en_route` token for display consistency with default strategic march orders.
 * Exceptions: None.
 */
export const TACTICAL_DRAFT_MARCH_DISPLAY_STATUS = 'en_route';

/**
 * Formats the right-hand side of a pending movement sidebar row as `Nh (status)`.
 *
 * Purpose: Single formatter for both strategic and tactical pending movement distance + status display.
 * When to use: Any sidebar row that mirrors `formatPendingOrderSidebarLabel` target shape.
 * Expected outcome: Non-negative integer `N` with the provided status string parenthesized.
 * Exceptions: None.
 */
export function formatPendingMovementSidebarTargetLabel(distanceHexSteps: number, orderStatus: string): string {
  return `${distanceHexSteps}h (${orderStatus})`;
}

/**
 * Builds the tactical draft march pending-order target label using tactical `gridDistance` and the shared status token.
 *
 * Purpose: Replaces ad-hoc tactical-only label builders with the same contract as strategic pending movement rows.
 * When to use: Tactical battle snapshot active and `S.tacticalPendingMarches` rows are rendered.
 * Expected outcome: `0h (en_route)` when the sub-unit row is missing; otherwise tactical step count to destination.
 * Exceptions: Invalid H3 indexes fall back to `0h (en_route)` without throwing.
 */
export function formatTacticalDraftMarchPendingOrderTargetLabel(
  battle: TacticalBattleSnapshot,
  subUnitId: string,
  destinationH3Index: string
): string {
  const origin = battle.subUnits.find((u) => u.id === subUnitId)?.h3Index;
  if (!origin) return formatPendingMovementSidebarTargetLabel(0, TACTICAL_DRAFT_MARCH_DISPLAY_STATUS);
  try {
    const steps = gridDistance(origin, destinationH3Index);
    return formatPendingMovementSidebarTargetLabel(steps, TACTICAL_DRAFT_MARCH_DISPLAY_STATUS);
  } catch {
    return formatPendingMovementSidebarTargetLabel(0, TACTICAL_DRAFT_MARCH_DISPLAY_STATUS);
  }
}
