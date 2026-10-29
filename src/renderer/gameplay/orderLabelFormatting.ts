import { gridDisk, gridDistance } from 'h3-js';
import type {
  AirStrikeOrder,
  FerryOrder,
  GameStateSnapshot,
  MissileLaunchOrder,
  RangedAttackOrder,
} from '../../shared/ipcTypes';
import { AIR_STRIKE_TARGET_TYPE_LABELS, formatOrderRowDetail } from '../../shared/orderRowDetail';
import { orderTargetHexCode } from '../../shared/orderTargetHexCode';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * The parts of a battle snapshot that order lines read.
 *
 * Purpose: Tactical pending orders reference `TacticalSubUnitSnapshot.id`, while `S.gameState.units` stays on the
 *   strategic roster, and a battle cell's code depends on the battle's world hex.
 * When to use: Pass `S.tacticalBattleSnapshot` while a battle is active; omit it on the world map.
 * Expected outcome: Sub-unit positions win over strategic positions, and target codes read `XX.YY`.
 * Exceptions: None.
 */
export type OrderLabelBattle = Pick<TacticalBattleSnapshot, 'enclosingStrategicH3Index' | 'subUnits'>;

/**
 * Picks the origin hex for an order line's distance.
 *
 * Purpose: The unit may be a battle sub-unit or a strategic unit.
 * When to use: Before calling `computeGridDistanceForLabel` for ranged, strike, or ferry lines.
 * Expected outcome: The battle sub-unit's cell when the battle lists `unitId`; otherwise the strategic unit's hex.
 * Exceptions: None.
 */
function resolveAttackerH3ForOrderLabel(
  unitId: string,
  state: GameStateSnapshot | null,
  battle?: OrderLabelBattle | null
): string | null {
  const tactical = battle?.subUnits.find((u) => u.id === unitId);
  if (tactical) return tactical.h3Index;
  if (!state) return null;
  const strategic = state.units.find((u) => u.id === unitId);
  return strategic?.h3Index ?? null;
}

/**
 * Renderer-only H3 edge count for order-row distance labels (strategic or tactical resolution of the hex ids).
 *
 * Purpose: Keeps label formatting lightweight in the renderer bundle: uses `h3-js` `gridDistance` with a small
 * `gridDisk` ring probe when `gridDistance` throws (far-apart or awkward pairs), and intentionally does **not** import
 * main-process helpers or `computeGridDistancePure` from `src/shared/h3GridRangePure.ts`.
 * When to use: The distance part of ranged, ferry, and strike rows.
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
 * Builds the line for an order that goes from a unit to a target hex.
 *
 * Purpose: Ranged, strike, and ferry rows share the code, the distance, and the layout.
 * When to use: From the three exported formatters below.
 * Expected outcome: `→ <code> · <steps>h`, plus ` · <note>` when a note is given. Unknown parts show `?`.
 * Exceptions: None.
 */
function formatUnitToTargetDetail(
  state: GameStateSnapshot | null,
  unitId: string,
  targetH3Index: string,
  battle: OrderLabelBattle | null | undefined,
  note: string | null
): string {
  const originH3 = resolveAttackerH3ForOrderLabel(unitId, state, battle);
  return formatOrderRowDetail({
    targetCode: orderTargetHexCode(targetH3Index, battle ?? null),
    distanceHexes: originH3 ? computeGridDistanceForLabel(originH3, targetH3Index) : null,
    note,
  });
}

/**
 * Formats the line for a queued ranged attack.
 *
 * Purpose: The Ranged attacks group and the selection panel show the same line.
 * When to use: For each row of `S.pendingRangedAttacks`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ GD · 1h`.
 * Exceptions: None.
 */
export function formatPendingRangedAttackSidebarLabel(
  state: GameStateSnapshot | null,
  order: RangedAttackOrder,
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(state, order.unitId, order.targetH3Index, battle, null);
}

/**
 * Formats the line for a queued air strike, naming the target type as the target-type list does.
 *
 * Purpose: The Air strikes group and the selection panel show the same line.
 * When to use: For each row of `S.pendingAirStrikes`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ GK · 2h · Airports`.
 * Exceptions: None.
 */
export function formatPendingAirStrikeSidebarLabel(
  state: GameStateSnapshot | null,
  order: AirStrikeOrder,
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(
    state,
    order.unitId,
    order.targetH3Index,
    battle,
    AIR_STRIKE_TARGET_TYPE_LABELS[order.targetType] ?? null
  );
}

/**
 * Formats the line for a queued missile launch.
 *
 * Purpose: The Missile launches group and the selection panel show the same line.
 * When to use: For each row of `S.pendingMissileLaunches`.
 * Expected outcome: For example `→ GK · 2h · Missile`.
 * Exceptions: None.
 */
export function formatPendingMissileLaunchSidebarLabel(
  state: GameStateSnapshot | null,
  order: MissileLaunchOrder,
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(state, order.unitId, order.targetH3Index, battle, 'Missile');
}

/**
 * Formats the line for a queued ferry.
 *
 * Purpose: Ferry rows sit in the Movement group and say they are ferries.
 * When to use: For each row of `S.pendingFerryOrders`. Pass the battle snapshot during a battle.
 * Expected outcome: For example `→ E8 · 1h · Ferry`.
 * Exceptions: None.
 */
export function formatPendingFerryOrderSidebarLabel(
  state: GameStateSnapshot | null,
  order: FerryOrder,
  battle?: OrderLabelBattle | null
): string {
  return formatUnitToTargetDetail(state, order.unitId, order.destinationH3Index, battle, 'Ferry');
}
