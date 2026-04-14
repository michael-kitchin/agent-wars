/**
 * Pure construction of march hover preview payloads for tactical (res4) battles so the renderer can
 * mirror strategic `HumanOrderGroupPreviewResult` without calling `previewHumanMarchOrders` (blocked in main).
 */

import { cellToLatLng, getResolution, gridDistance } from 'h3-js';
import {
  buildHumanOrderGroupPreviewEnvelope,
  representativeTacticalMarchPreviewUnitIdsByOriginH3,
  uniqueTacticalMarchPreviewUnitIds,
} from './humanMarchPreviewGroupAssembly';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import type {
  HumanOrderGroupPreviewResult,
  HumanOrderGroupPreviewUnitResult,
  HumanOrderPreviewResult,
} from './ipc/humanOrderPreviewTypes';
import { planTacticalRes4March } from './tacticalRes4MovementPlanner';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from './tacticalTerrainCombatModifiers';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  tacticalMovementUnitTypeForPathfinding,
  tacticalTerrainLayerSignature,
} from './tacticalTerrainMovement';

const TACTICAL_H3_RESOLUTION = 4;

/** Milestone 2.2 §3.4: renderer-only march plan memo bound (LRU by Map insertion order). */
const MAX_TACTICAL_HOVER_PLAN_MEMO = 64;

/**
 * Stable fingerprint of tactical sub-unit positions for hover memo invalidation.
 *
 * Purpose: Mirrors main-process `tacticalMovementPlanningCache` invalidation intent for renderer-only previews.
 * When to use: `ensureTacticalHoverPlanMemo` before caching `planTacticalRes4March` results.
 * Expected outcome: Deterministic string for a given `subUnits` array.
 * Exceptions: None.
 */
function tacticalHoverSubUnitPlacementSignature(subUnits: readonly { id: string; h3Index: string }[]): string {
  return [...subUnits]
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
}

let tacticalHoverPlanMemoKey = '';
const tacticalHoverPlanMemo = new Map<string, ReturnType<typeof planTacticalRes4March>>();

/**
 * Resets the renderer-side tactical march plan memo when the tactical battle environment changes.
 *
 * Purpose: Clears entries when battle id, tactical turn, or any sub-unit position changes.
 * When to use: Before each tactical hover plan lookup in `buildPreviewForSubUnit`.
 * Expected outcome: Bounded reuse across repeated hovers for the same battle state.
 * Exceptions: None.
 */
function ensureTacticalHoverPlanMemo(battle: TacticalBattleSnapshot): void {
  const k = `${battle.battleId}|${battle.tacticalTurnNumber}|${tacticalHoverSubUnitPlacementSignature(battle.subUnits)}|${tacticalTerrainLayerSignature(battle)}`;
  if (k !== tacticalHoverPlanMemoKey) {
    tacticalHoverPlanMemoKey = k;
    tacticalHoverPlanMemo.clear();
  }
}

/**
 * Resolves a sub-unit's committed origin for preview and validation.
 *
 * Purpose: Keeps tactical planning parity with strategic behavior where planning never changes a unit's current cell.
 * When to use: Internally by `buildTacticalMarchHoverPreview` / `buildPreviewForSubUnit` only.
 * Expected outcome: Returns the active snapshot `h3Index` for the given sub-unit id.
 * Exceptions: None; missing ids yield empty string.
 */
function tacticalMarchCommittedOriginH3(battle: TacticalBattleSnapshot, subUnitId: string): string {
  return battle.subUnits.find((u) => u.id === subUnitId)?.h3Index ?? '';
}

function h3PathToLatLngHexes(path: readonly string[]): [number, number][] {
  return path.map((h) => {
    const [lat, lng] = cellToLatLng(h);
    return [lat, lng] as [number, number];
  });
}

function buildPreviewForSubUnit(args: {
  battle: TacticalBattleSnapshot;
  unitId: string;
  hoveredH3Index: string;
  res4Set: ReadonlySet<string>;
}): HumanOrderPreviewResult {
  const sub = args.battle.subUnits.find((u) => u.id === args.unitId);
  if (!sub || sub.player !== 'human') {
    return { valid: false, showInvalidMarker: false, invalidReason: 'Not a human tactical sub-unit', segments: [] };
  }
  const origin = tacticalMarchCommittedOriginH3(args.battle, args.unitId);
  let resOk = true;
  try {
    resOk =
      getResolution(origin) === TACTICAL_H3_RESOLUTION && getResolution(args.hoveredH3Index) === TACTICAL_H3_RESOLUTION;
  } catch {
    resOk = false;
  }
  if (!resOk) {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Invalid tactical cell', segments: [] };
  }
  if (!args.res4Set.has(args.hoveredH3Index)) {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Outside tactical footprint', segments: [] };
  }
  try {
    void gridDistance(origin, args.hoveredH3Index);
  } catch {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Could not measure distance', segments: [] };
  }
  if (origin === args.hoveredH3Index) {
    return { valid: true, showInvalidMarker: false, segments: [] };
  }
  const moveType = tacticalMovementUnitTypeForPathfinding(sub, args.hoveredH3Index);
  if (moveType === 'air') {
    return { valid: false, showInvalidMarker: true, invalidReason: 'Air units do not use tactical march', segments: [] };
  }
  const budget = effectiveTacticalMovementPointBudgetForMarchLeg(args.battle, sub, args.battle.subUnits, moveType);
  const terrain = buildTacticalTerrainKindResolverFromSnapshot(args.battle);
  ensureTacticalHoverPlanMemo(args.battle);
  const memoKey = `${args.unitId}|${origin}|${args.hoveredH3Index}|${moveType}|${budget}`;
  let plan = tacticalHoverPlanMemo.get(memoKey);
  if (plan) {
    tacticalHoverPlanMemo.delete(memoKey);
    tacticalHoverPlanMemo.set(memoKey, plan);
  } else {
    plan = planTacticalRes4March({
      fromH3: origin,
      toH3: args.hoveredH3Index,
      res4Set: args.res4Set,
      unitTypeForMovement: moveType,
      movementPointBudget: Math.max(0, budget),
      terrain,
    });
    while (tacticalHoverPlanMemo.size >= MAX_TACTICAL_HOVER_PLAN_MEMO) {
      const oldest = tacticalHoverPlanMemo.keys().next().value;
      if (oldest === undefined) break;
      tacticalHoverPlanMemo.delete(oldest);
    }
    tacticalHoverPlanMemo.set(memoKey, plan);
  }
  if (!plan.reachable || !plan.pathToDestination || plan.pathToDestination.length < 2) {
    return { valid: false, showInvalidMarker: true, invalidReason: 'No valid tactical route', segments: [] };
  }
  const path = plan.pathToDestination;
  const [destLat, destLng] = cellToLatLng(args.hoveredH3Index);
  if (plan.reachableThisTurn) {
    return {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: [destLat, destLng],
      segments: [{ turn: 1, hexes: h3PathToLatLngHexes(path) }],
    };
  }
  const stopH3 = plan.firstStopWithinBudget.stopH3;
  const stopIdx = path.lastIndexOf(stopH3);
  const safeIdx = stopIdx >= 0 ? stopIdx : 0;
  const leg1 = path.slice(0, safeIdx + 1);
  const leg2 = path.slice(safeIdx);
  return {
    valid: true,
    showInvalidMarker: false,
    arrowLatLng: [destLat, destLng],
    segments: [
      { turn: 1, hexes: h3PathToLatLngHexes(leg1) },
      { turn: 2, hexes: h3PathToLatLngHexes(leg2) },
    ],
  };
}

/**
 * Builds a grouped march hover preview for selected tactical sub-units toward a hovered res4 cell.
 *
 * Purpose: Supplies `drawHoverRoutePreview` with the same data shape as strategic previews while respecting res4 footprint and §12.4 movement budgets.
 * When to use: Renderer `refreshHoverRoutePreview` when `S.tacticalBattleSnapshot` is set and ranged/air modes are off.
 * Expected outcome: One preview per distinct origin (stack parity with strategic), with solid edges for the current turn and dashed continuation for future turns.
 * Exceptions: None; returns empty previews when there are no eligible human sub-units in `unitIds`.
 */
export function buildTacticalMarchHoverPreview(
  battle: TacticalBattleSnapshot,
  unitIds: readonly string[],
  hoveredH3Index: string | null
): HumanOrderGroupPreviewResult {
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const uniqueIds = uniqueTacticalMarchPreviewUnitIds(unitIds);
  const selectedHuman = uniqueIds
    .map((id) => battle.subUnits.find((u) => u.id === id && u.player === 'human'))
    .filter((u): u is NonNullable<typeof u> => !!u);
  if (!hoveredH3Index || selectedHuman.length === 0) {
    return {
      validForAll: false,
      showInvalidMarker: false,
      slowestMovementRange: 0,
      previews: [],
    };
  }
  const previewUnitIds = representativeTacticalMarchPreviewUnitIdsByOriginH3(
    selectedHuman.map((u) => ({
      unitId: u.id,
      originH3: tacticalMarchCommittedOriginH3(battle, u.id),
      unitType: u.unitType,
    }))
  );
  const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
    unitId,
    preview: buildPreviewForSubUnit({
      battle,
      unitId,
      hoveredH3Index,
      res4Set,
    }),
  }));
  const budgets = previewUnitIds.map((id) => {
    const u = battle.subUnits.find((s) => s.id === id);
    if (!u) return 1;
    const moveType = tacticalMovementUnitTypeForPathfinding(u, hoveredH3Index);
    return effectiveTacticalMovementPointBudgetForMarchLeg(battle, u, battle.subUnits, moveType);
  });
  const slowestMovementRange = budgets.length > 0 ? Math.min(...budgets) : 0;
  return buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange });
}

/**
 * Builds a single human sub-unit march preview toward a drafted destination cell for tactical overlay rendering.
 *
 * Purpose: Reuses the same res4 terrain-aware planner as hover (`planTacticalRes4March`) so solid pending-Ready
 * march lines match the route execution and hover preview; avoids geometric `gridPathCells` polylines that ignore terrain costs.
 * When to use: Renderer only (e.g. `drawTacticalPendingMarchPlanLines`); main-process commit validation remains authoritative.
 * Expected outcome: `segments` mirror `buildTacticalMarchHoverPreview` for one unit and destination; unreachable legs yield `valid: false` with empty segments.
 * Exceptions: None; non-marchable units and out-of-footprint targets return invalid previews without throwing.
 */
export function buildTacticalMarchDraftDestinationPreview(
  battle: TacticalBattleSnapshot,
  subUnitId: string,
  destinationH3Index: string
): HumanOrderPreviewResult {
  const res4Set = new Set(battle.res4ChildH3Indexes);
  return buildPreviewForSubUnit({
    battle,
    unitId: subUnitId,
    hoveredH3Index: destinationH3Index,
    res4Set,
  });
}
