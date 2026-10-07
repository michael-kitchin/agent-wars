import { gridDisk, gridDistance } from 'h3-js';
import type {
  AirStrikeOrder,
  FerryOrder,
  GameStateSnapshot,
  RangedAttackOrder,
} from '../../shared/ipcTypes';

/**
 * Minimal id→hex rows for resolving an attacker's cell when `GameStateSnapshot.units` keys strategic ids only.
 *
 * Purpose: Tactical pending orders reference `TacticalSubUnitSnapshot.id` while `S.gameState.units` stays on the strategic roster.
 * When to use: Pass `tacticalBattleSnapshot.subUnits` from the renderer when formatting tactical draft order labels.
 * Expected outcome: Same `h3Index` resolution the map uses for sub-units (tactical during tactical play).
 * Exceptions: None.
 */
export type UnitH3PositionLookup = readonly { id: string; h3Index: string }[];

/**
 * Defines the `resolveAttackerH3ForOrderLabel` function shape (function resolveAttackerH3ForOrderLabel(unitId: string, state: GameStateSnapshot | null, tacticalPositions?: UnitH3PositionLookup | null): string | null).

 * Purpose: Picks the origin hex for grid-distance labels whether the unit is keyed on the strategic snapshot or tactical sub-units.
 * When to use: Before calling `computeGridDistanceForLabel` for ranged, strike, or ferry sidebar strings.
 * Expected outcome: Tactical rows win when present and contain `unitId`; otherwise falls back to `state.units`.
 * Exceptions: None.
 */
function resolveAttackerH3ForOrderLabel(
  unitId: string,
  state: GameStateSnapshot | null,
  tacticalPositions?: UnitH3PositionLookup | null
): string | null {
  if (tacticalPositions && tacticalPositions.length > 0) {
    const tactical = tacticalPositions.find((u) => u.id === unitId);
    if (tactical) return tactical.h3Index;
  }
  if (!state) return null;
  const strategic = state.units.find((u) => u.id === unitId);
  return strategic?.h3Index ?? null;
}

/**
 * Renderer-only H3 edge count for **sidebar / UI distance labels** (strategic or tactical resolution of the hex ids).
 *
 * Purpose: Keeps label formatting lightweight in the renderer bundle: uses `h3-js` `gridDistance` with a small
 * `gridDisk` ring probe when `gridDistance` throws (far-apart or awkward pairs), and intentionally does **not** import
 * main-process helpers or `computeGridDistancePure` from `src/shared/h3GridRangePure.ts`.
 * When to use: Pending-order labels (`…Nh`) next to ranged, ferry, and strike rows in the tactical UI.
 * Expected outcome: A non-negative step count or `null` when neither direct distance nor disk probe resolves the pair.
 * **Not used for order legality:** validation and AI briefings use main-process range checks (`isWithinGridRangeSafe`,
 * `isWithinGridRangePure`, tactical terrain caps, etc.); those paths may log disk fallbacks and must stay authoritative.
 * Exceptions: Returns `null` if every probe ring throws (rare).
 */
function computeGridDistanceForLabel(originH3: string, targetH3: string): number | null {
  try {
    return Math.max(0, gridDistance(originH3, targetH3));
  } catch {
    // gridDistance may throw for some valid far-apart pairs; probe by rings as a label-only fallback.
    const maxRadius = 128;
    for (let radius = 0; radius <= maxRadius; radius++) {
      try {
        const ring = gridDisk(originH3, radius);
        if (ring.includes(targetH3)) return radius;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Defines the `formatDistanceLabelForPlannedAttack` function shape (function formatDistanceLabelForPlannedAttack(state: GameStateSnapshot | null, unitId: string, targetH3Index: string, tacticalPositions?: UnitH3PositionLookup | null): string).

 * Purpose: Supports maintainability by documenting why `formatDistanceLabelForPlannedAttack` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: `Nh` where `N` is H3 grid edge count at the snapshot resolution (strategic or tactical).
 * Exceptions: None.
 */
function formatDistanceLabelForPlannedAttack(
  state: GameStateSnapshot | null,
  unitId: string,
  targetH3Index: string,
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(unitId, state, tacticalPositions);
  if (!originH3) return '?h';
  const distance = computeGridDistanceForLabel(originH3, targetH3Index);
  return distance == null ? '?h' : `${distance}h`;
}

/**
 * Defines the `formatPendingRangedAttackSidebarLabel` function shape (export function formatPendingRangedAttackSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingRangedAttackSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingRangedAttackSidebarLabel(
  state: GameStateSnapshot | null,
  order: RangedAttackOrder,
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  return formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index, tacticalPositions);
}

/**
 * Defines the `formatPendingAirStrikeSidebarLabel` function shape (export function formatPendingAirStrikeSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingAirStrikeSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingAirStrikeSidebarLabel(
  state: GameStateSnapshot | null,
  order: AirStrikeOrder,
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const targetTypeLabel =
    order.targetType === 'units'
      ? 'units'
      : order.targetType === 'urban'
        ? 'urban'
        : order.targetType === 'airport'
          ? 'airport'
          : 'seaport';
  return `${formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index, tacticalPositions)} (${targetTypeLabel})`;
}

/**
 * Defines the `formatPendingFerryOrderSidebarLabel` function shape (export function formatPendingFerryOrderSidebarLabel().

 * Purpose: Supports maintainability by documenting why `formatPendingFerryOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingFerryOrderSidebarLabel(
  state: GameStateSnapshot | null,
  order: FerryOrder,
  tacticalPositions?: UnitH3PositionLookup | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(order.unitId, state, tacticalPositions);
  if (!originH3) return '?h (ferry)';
  const ferryDistance = computeGridDistanceForLabel(originH3, order.destinationH3Index);
  return `${ferryDistance == null ? '?' : ferryDistance}h (ferry)`;
}
