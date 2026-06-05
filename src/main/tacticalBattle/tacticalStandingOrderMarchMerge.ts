/**
 * Phase 5 — merges human strategic standing-order march previews into tactical res4 march rows before Ready applies them.
 *
 * Contract: Standing-derived rows use the same Tool 5 preview as strategic merge (`mutateProgress: false`); explicit renderer marches win per parent stack when any sub-unit of that parent is listed.
 * When to use: Only `commitHumanTacticalDraftOrders` after validation and before range-limited march expansion.
 * Expected outcome: Deterministic superset of `explicitMovementOrders` that may add sub-unit rows toward the strategic next hex projected into the battle footprint.
 * Exceptions: None; failures fall back to explicit-only (caller should not throw here).
 */

import { cellToLatLng } from 'h3-js';
import type { AirStrikeTargetType } from '../../shared/ipc/ordersTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildLatLngCoordinateMap } from '../mapData';
import { dbGetAll, getGameStateForPlayer } from '../gameDb';
import { logDebug } from '../logger';
import { generateOrdersForStandingOrders } from '../tools/tool5StandingOrders';
import {
  generateTacticalDefendEngagementForPlayer,
  pickClosestEnemyTacticalRangedTargetForSubUnit,
} from './tacticalRangedTargetResolve';

/**
 * Picks the footprint res4 cell whose centroid is closest to the strategic H3 destination centroid.
 *
 * Purpose: Tactical battles only animate res4 legs; this maps a strategic `orderToH3` onto a plausible first-step target inside `battle.res4ChildH3Indexes`.
 * When to use: From `mergeHumanStandingOrdersIntoTacticalMarchOrders` for each standing parent movement row.
 * Expected outcome: Returns a res4 id in the footprint, or `undefined` when lat/lng math fails or the footprint is empty.
 * Exceptions: None; invalid indexes are caught and treated as undefined.
 */
export function pickTacticalRes4TowardStrategicH3(
  battle: TacticalBattleSnapshot,
  strategicTargetH3Index: string
): string | undefined {
  const footprint = battle.res4ChildH3Indexes;
  if (footprint.length === 0) return undefined;
  try {
    const [tLat, tLng] = cellToLatLng(strategicTargetH3Index);
    let best: { h: string; d: number } | null = null;
    for (const h of footprint) {
      const [aLat, aLng] = cellToLatLng(h);
      const d = (aLat - tLat) ** 2 + (aLng - tLng) ** 2;
      if (!best || d < best.d) best = { h, d };
    }
    return best?.h;
  } catch {
    return undefined;
  }
}

/**
 * Merges Tool 5 human standing movement into tactical sub-unit march orders (strategic-style precedence: standing first, explicit overwrites per parent).
 *
 * Purpose: Phase 5 parity with `executeReadyStrategicTurn` merged human movement without double-mutating standing_orders during tactical Ready.
 * When to use: Tactical commit path only; requires an active battle snapshot and DB-backed human `GameStateSnapshot`.
 * Expected outcome: Stable ordered list of `{ unitId, toH3Index }` res4 destinations; explicit rows for a parent suppress standing expansion for that parent's entire tactical stack.
 * Exceptions: None.
 */
export function mergeHumanStandingOrdersIntoTacticalMarchOrders(
  battle: TacticalBattleSnapshot,
  explicitMovementOrders: readonly { unitId: string; toH3Index: string }[]
): { unitId: string; toH3Index: string }[] {
  const humanSubs = battle.subUnits.filter((u) => u.player === 'human');
  if (humanSubs.length === 0) {
    return [...explicitMovementOrders];
  }

  const parentsWithExplicitMarch = new Set<string>();
  for (const o of explicitMovementOrders) {
    const su = battle.subUnits.find((u) => u.id === o.unitId);
    if (su?.player === 'human') parentsWithExplicitMarch.add(su.parentUnitId);
  }

  const state = getGameStateForPlayer('human', { maskUnexploredTerrain: false });
  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const { movementOrders: standingParentMoves } = generateOrdersForStandingOrders(
    'human',
    state,
    latLngByH3,
    resolveToH3,
    { mutateProgress: false }
  );

  const parentsInBattle = new Set(humanSubs.map((u) => u.parentUnitId));
  const merged = new Map<string, string>();

  for (const o of standingParentMoves) {
    if (!parentsInBattle.has(o.unitId)) continue;
    if (parentsWithExplicitMarch.has(o.unitId)) continue;
    const res4Dest = pickTacticalRes4TowardStrategicH3(battle, o.toH3Index);
    if (!res4Dest) continue;
    for (const su of humanSubs) {
      if (su.parentUnitId !== o.unitId) continue;
      if (su.h3Index === res4Dest) continue;
      merged.set(su.id, res4Dest);
    }
  }

  for (const o of explicitMovementOrders) {
    merged.set(o.unitId, o.toH3Index);
  }

  const out = [...merged.entries()]
    .map(([unitId, toH3Index]) => ({ unitId, toH3Index }))
    .filter((o) => battle.subUnits.some((s) => s.id === o.unitId && s.h3Index !== o.toH3Index));

  logDebug('tacticalStandingOrderMarchMerge mergeHumanStandingOrdersIntoTacticalMarchOrders', {
    battleId: battle.battleId,
    explicitCount: explicitMovementOrders.length,
    standingParentMoveCount: standingParentMoves.length,
    mergedMarchCount: out.length,
    suppressedParentCount: parentsWithExplicitMarch.size,
  });

  return out;
}

/**
 * Expands opponent standing-order rows keyed by strategic parent unit id into per–sub-unit tactical orders in the battle footprint.
 *
 * Purpose: `generateOrdersForStandingOrders` emits strategic `unitId` values; tactical `requestAiOrders` validation and
 * application require tactical sub-unit ids and res4 targets derived from strategic path endpoints.
 * When to use: Tactical branch of `requestOrdersFlow` after Tool 5 generation with `mutateProgress: false`.
 * Expected outcome: Movement uses `pickTacticalRes4TowardStrategicH3` per parent march; ranged maps each sub-unit to the
 * closest legal enemy res4 cell (not the footprint anchor nearest to a strategic res1 target); air strikes are expanded from
 * strategic parent unit ids to tactical sub-unit ids targeting the closest legal enemy res4 cell.
 * Exceptions: None.
 */
export function expandOpponentStandingOrdersForTacticalBattle(
  battle: TacticalBattleSnapshot,
  standingParentMovement: readonly { unitId: string; toH3Index: string }[],
  standingParentRanged: readonly { unitId: string; targetH3Index: string }[],
  standingParentAir: readonly { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[] = []
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[];
} {
  const oppSubs = battle.subUnits.filter((u) => u.player === 'opponent');
  const movementBySub = new Map<string, string>();
  for (const o of standingParentMovement) {
    const res4Dest = pickTacticalRes4TowardStrategicH3(battle, o.toH3Index);
    if (!res4Dest) continue;
    for (const su of oppSubs) {
      if (su.parentUnitId !== o.unitId) continue;
      if (su.h3Index === res4Dest) continue;
      movementBySub.set(su.id, res4Dest);
    }
  }
  const rangedBySub = new Map<string, string>();
  for (const r of standingParentRanged) {
    for (const su of oppSubs) {
      if (su.parentUnitId !== r.unitId) continue;
      const tacticalTarget =
        pickClosestEnemyTacticalRangedTargetForSubUnit(battle, su.id) ??
        pickTacticalRes4TowardStrategicH3(battle, r.targetH3Index);
      if (!tacticalTarget) continue;
      rangedBySub.set(su.id, tacticalTarget);
    }
  }
  const airBySubId = new Map<string, { targetH3Index: string; targetType: AirStrikeTargetType }>();
  for (const a of standingParentAir) {
    for (const su of oppSubs) {
      if (su.unitType !== 'air' || su.parentUnitId !== a.unitId) continue;
      const tacticalTarget = pickClosestEnemyTacticalRangedTargetForSubUnit(battle, su.id);
      if (!tacticalTarget) continue;
      airBySubId.set(su.id, { targetH3Index: tacticalTarget, targetType: a.targetType });
    }
  }
  logDebug('tacticalStandingOrderMarchMerge expandOpponentStandingOrdersForTacticalBattle', {
    battleId: battle.battleId,
    parentMovementIn: standingParentMovement.length,
    parentRangedIn: standingParentRanged.length,
    parentAirIn: standingParentAir.length,
    subMovementOut: movementBySub.size,
    subRangedOut: rangedBySub.size,
    subAirOut: airBySubId.size,
  });
  return {
    movementOrders: [...movementBySub.entries()].map(([unitId, toH3Index]) => ({ unitId, toH3Index })),
    rangedAttacks: [...rangedBySub.entries()].map(([unitId, targetH3Index]) => ({ unitId, targetH3Index })),
    airStrikes: [...airBySubId.entries()].map(([unitId, { targetH3Index, targetType }]) => ({
      unitId,
      targetH3Index,
      targetType,
    })),
  };
}

/**
 * Generates DEFEND auto-engagement ranged and air-strike rows for human sub-units in an active tactical battle and merges them with explicitly submitted orders (explicit wins on same sub-unit id).
 *
 * Purpose: Mirrors opponent DEFEND tactical expansion for the human player; reads the DB for current human DEFEND standing-order parent unit ids, then delegates to `generateTacticalDefendEngagementForPlayer`.
 * When to use: `commitHumanTacticalDraftOrders` after `preBattle` is available and before the beat is applied; call once per commit.
 * Expected outcome: Merged ranged/air arrays that include DEFEND-generated rows unless the human explicitly submitted an order for the same sub-unit.
 * Exceptions: None; DB errors return only explicit orders.
 */
export function mergeHumanTacticalDefendEngagementOrders(
  battle: TacticalBattleSnapshot,
  explicitRanged: readonly { unitId: string; targetH3Index: string }[],
  explicitAir: readonly { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[]
): {
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  airStrikes: { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[];
} {
  const defendRows = dbGetAll<{ unit_id: string }>(
    "SELECT unit_id FROM standing_orders WHERE player_id = 'human' AND order_type = 'defend'"
  );
  const defendParentIds = defendRows.map((r) => r.unit_id);
  if (defendParentIds.length === 0) {
    return { rangedAttacks: [...explicitRanged], airStrikes: [...explicitAir] };
  }
  const generated = generateTacticalDefendEngagementForPlayer(battle, 'human', defendParentIds);
  const explicitRangedUnitIds = new Set(explicitRanged.map((r) => r.unitId));
  const explicitAirUnitIds = new Set(explicitAir.map((a) => a.unitId));
  const mergedRanged = [
    ...generated.rangedAttacks.filter((r) => !explicitRangedUnitIds.has(r.unitId)),
    ...explicitRanged,
  ];
  const mergedAir = [
    ...generated.airStrikes.filter((a) => !explicitAirUnitIds.has(a.unitId)),
    ...explicitAir,
  ];
  logDebug('tacticalStandingOrderMarchMerge mergeHumanTacticalDefendEngagementOrders', {
    battleId: battle.battleId,
    defendParentCount: defendParentIds.length,
    generatedRangedCount: generated.rangedAttacks.length,
    generatedAirCount: generated.airStrikes.length,
    explicitRangedCount: explicitRanged.length,
    explicitAirCount: explicitAir.length,
    mergedRangedCount: mergedRanged.length,
    mergedAirCount: mergedAir.length,
  });
  return { rangedAttacks: mergedRanged, airStrikes: mergedAir };
}
