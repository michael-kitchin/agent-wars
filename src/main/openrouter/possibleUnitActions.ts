/**
 * Builds the "Possible unit actions" markdown block for AI Commander's Briefings.
 * Derives legal moves/melee reach, air ferry destinations, ranged attacks, and air strikes from order validation rules.
 *
 * Strategic vs tactical reachability (intentional parity of *pipeline*, not hex sets):
 * - Strategic ground: `getValidDestinations` → res1 `getLandMassReachableHexes` (hop BFS).
 * - Tactical ground: `collectTacticalLegalMoveDestinationRes4Hexes` → single-source MP reachability (Ready rules).
 * Best Options This Turn interest/approach live in `possibleUnitActionsBestOptionsInterest.ts`
 * (enemy ∪ uncontrolled unoccupied infra; empty interest falls back to approach).
 */

import { gridDistance, gridDisk } from 'h3-js';
import { type GameStateSnapshot, listRes4FeatureOverridesForGame } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { collectTacticalLegalMoveDestinationRes4Hexes } from '../../shared/collectTacticalLegalMoveDestinationRes4Hexes';
import { unitHasDirectRangedPlanning } from '../../shared/rangePerimeterModel';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { collectTacticalLegalRangedTargetRes4Hexes } from '../../shared/tacticalTerrainCombatModifiers';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { isWithinAirFerryGridRange, isWithinAirStrikeGridRange } from '../game-actions/gridRange';
import { logDebug } from '../logger';
import { logHexControllerParityMismatch } from '../snapshotDbParity';
import { compareHexIds, partitionHomelandNearestOther } from './possibleUnitActionsPartition';
import {
  ACTION_AIR_STRIKES,
  ACTION_MOVES_MELEE,
  ACTION_RANGED,
  aggregateRows,
  BUCKET_TITLES,
  ENEMY_PLAYER,
  excludeUnitCurrentHex,
  FRIENDLY_PLAYER,
  groupRowsByBucket,
  markdownTableLines,
  selectTopRowsPerUnit,
  type PossibleActionTableRow,
  type RawPossibleActionRow,
} from './possibleUnitActionsTableAssembly';
import { collectRangedTargetHexes } from './possibleUnitActionsStrategicRanged';
import {
  applyInterestOrApproach,
  describeTacticalBestOptionsInfrastructure,
  filterGroundMoveHexesForThisTurnOptionsTable,
  filterTacticalGroundMoveHexesForThisTurnOptionsTable,
  filterTacticalRangedHexesForThisTurnOptionsTable,
  tacticalBestOptionsUrbanHexCount,
  type TacticalBestOptionsInterestContext,
} from './possibleUnitActionsBestOptionsInterest';

export { partitionHomelandNearestOther };
export type { PossibleActionTableRow } from './possibleUnitActionsTableAssembly';

/**
 * Documents the `InfraCounts` interface as a named contract surface (interface InfraCounts).

 * Purpose: Supports maintainability by documenting why `InfraCounts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

interface InfraCounts {
   /**
   * Specifies the contract for the `urban` member (urban: number;).

   * Contract: Describes stable behavior for callers of `urban` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 urban: number;
   /**
   * Specifies the contract for the `seaport` member (seaport: number;).

   * Contract: Describes stable behavior for callers of `seaport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 seaport: number;
   /**
   * Specifies the contract for the `airport` member (airport: number;).

   * Contract: Describes stable behavior for callers of `airport` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 airport: number;
}

/**
 * Documents the `IndexedState` interface as a named contract surface (interface IndexedState).

 * Purpose: Supports maintainability by documenting why `IndexedState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

interface IndexedState {
   /**
   * Specifies the contract for the `infraByHex` member (infraByHex: Map<string, InfraCounts>;).

   * Contract: Describes stable behavior for callers of `infraByHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 infraByHex: Map<string, InfraCounts>;
   /**
   * Specifies the contract for the `controlByHex` member (controlByHex: Map<string, string | null>;).

   * Contract: Describes stable behavior for callers of `controlByHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 controlByHex: Map<string, string | null>;
   /**
   * Specifies the contract for the `enemyUnitsByHex` member (enemyUnitsByHex: Map<string, Array<{ id: string; unitType: string }>>;).

   * Contract: Describes stable behavior for callers of `enemyUnitsByHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemyUnitsByHex: Map<string, Array<{ id: string; unitType: string }>>;
   /**
   * Friendly (AI) units keyed by hex so this-turn interest can drop own-occupied uncontrolled infra.
   *
   * Contract: Opponent units only; contested hexes may appear in both this map and `enemyUnitsByHex`.
   * When to use: Strategic Best Options occupancy filter.
   * Expected outcome: Every opponent unit in the snapshot appears under its `h3Index`.
   * Exceptions: None.
   */
 friendlyUnitsByHex: Map<string, Array<{ id: string; unitType: string }>>;
   /**
   * Specifies the contract for the `hexSet` member (hexSet: Set<string>;).

   * Contract: Describes stable behavior for callers of `hexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 hexSet: Set<string>;
}
/**
 * Defines the `buildIndexedState` function shape (function buildIndexedState(state: GameStateSnapshot): IndexedState).

 * Purpose: Supports maintainability by documenting why `buildIndexedState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function buildIndexedState(state: GameStateSnapshot): IndexedState {
  const infraByHex = new Map<string, InfraCounts>();
  for (const row of state.res1Infrastructure ?? []) {
    infraByHex.set(row.h3Index, {
      urban: Number(row.urbanHexCount ?? 0),
      seaport: Number(row.seaportCount ?? 0),
      airport: Number(row.airportCount ?? 0),
    });
  }
  const controlByHex = new Map<string, string | null>();
  for (const row of state.res1Control ?? []) {
    controlByHex.set(row.h3Index, row.controllerPlayerId ?? null);
  }
  const enemyUnitsByHex = new Map<string, Array<{ id: string; unitType: string }>>();
  const friendlyUnitsByHex = new Map<string, Array<{ id: string; unitType: string }>>();
  for (const unit of state.units) {
    let bucket: Map<string, Array<{ id: string; unitType: string }>> | null = null;
    if (unit.player === ENEMY_PLAYER) bucket = enemyUnitsByHex;
    else if (unit.player === FRIENDLY_PLAYER) bucket = friendlyUnitsByHex;
    if (!bucket) continue;
    const list = bucket.get(unit.h3Index) ?? [];
    list.push({ id: unit.id, unitType: unit.unitType });
    bucket.set(unit.h3Index, list);
  }
  return {
    infraByHex,
    controlByHex,
    enemyUnitsByHex,
    friendlyUnitsByHex,
    hexSet: new Set(state.hexes.map((h) => h.h3Index)),
  };
}

/** Indexed snapshot maps reused across possible-action collection within one AI request. */
export type PossibleActionsIndexedState = IndexedState;

/**
 * Builds indexed control/infrastructure maps for possible-action collection.
 *
 * Purpose: Allows callers to build once per AI request and pass into `collectAggregatedPossibleActionRows`.
 * When to use: From `requestOrdersFlow` before briefing/operational-map assembly.
 * Expected outcome: Same structure as the internal builder used when `indexedState` is omitted.
 * Exceptions: None.
 */
export function buildPossibleActionsIndexedState(state: GameStateSnapshot): PossibleActionsIndexedState {
  const indexed = buildIndexedState(state);
  logDebug('possibleUnitActions buildPossibleActionsIndexedState', {
    turnNumber: state.turnNumber,
    enemyOccupiedHexCount: indexed.enemyUnitsByHex.size,
    friendlyOccupiedHexCount: indexed.friendlyUnitsByHex.size,
  });
  return indexed;
}

/**
 * Defines the `enemyHomelandHexSet` function shape (function enemyHomelandHexSet(state: GameStateSnapshot): Set<string>).

 * Purpose: Supports maintainability by documenting why `enemyHomelandHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function enemyHomelandHexSet(state: GameStateSnapshot): Set<string> {
  return new Set(state.humanHomeRegionHexes ?? []);
}
/**
 * Defines the `sortHexesByLatLng` function shape (function sortHexesByLatLng(hexes: string[], latLngByH3: Map<string, [number, number]>): string[]).

 * Purpose: Supports maintainability by documenting why `sortHexesByLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function sortHexesByLatLng(hexes: string[], latLngByH3: Map<string, [number, number]>): string[] {
  return [...hexes].sort((a, b) => {
    const la = latLngByH3.get(a);
    const lb = latLngByH3.get(b);
    if (la && lb) {
      if (la[0] !== lb[0]) return la[0] - lb[0];
      if (la[1] !== lb[1]) return la[1] - lb[1];
    }
    return compareHexIds(a, b);
  });
}
/**
 * Defines the `getInfra` function shape (function getInfra(indexed: IndexedState, h3: string): InfraCounts).

 * Purpose: Supports maintainability by documenting why `getInfra` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function getInfra(indexed: IndexedState, h3: string): InfraCounts {
  return indexed.infraByHex.get(h3) ?? { urban: 0, seaport: 0, airport: 0 };
}
/**
 * Defines the `describeEnemyUnitsAtHex` function shape (function describeEnemyUnitsAtHex(indexed: IndexedState, h3: string): string | null).

 * Purpose: Supports maintainability by documenting why `describeEnemyUnitsAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function describeEnemyUnitsAtHex(indexed: IndexedState, h3: string): string | null {
  const atHex = indexed.enemyUnitsByHex.get(h3) ?? [];
  if (atHex.length === 0) return null;
  const byType = new Map<string, number>();
  for (const u of atHex) {
    byType.set(u.unitType, (byType.get(u.unitType) ?? 0) + 1);
  }
  return [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
}
/**
 * Defines the `describeInfrastructure` function shape (function describeInfrastructure(inf: InfraCounts): string | null).

 * Purpose: Supports maintainability by documenting why `describeInfrastructure` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function describeInfrastructure(inf: InfraCounts): string | null {
  const parts: string[] = [];
  if (inf.urban > 0) parts.push(`${inf.urban} urban hex${inf.urban === 1 ? '' : 'es'}`);
  if (inf.seaport > 0) parts.push(`${inf.seaport} seaport${inf.seaport === 1 ? '' : 's'}`);
  if (inf.airport > 0) parts.push(`${inf.airport} airport${inf.airport === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return parts.join(', ');
}
/**
 * Defines the `strikeKindsForHex` function shape (function strikeKindsForHex(indexed: IndexedState, targetH3: string): string[]).

 * Purpose: Supports maintainability by documenting why `strikeKindsForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function strikeKindsForHex(indexed: IndexedState, targetH3: string): string[] {
  const kinds: string[] = [];
  if ((indexed.enemyUnitsByHex.get(targetH3)?.length ?? 0) > 0) kinds.push('enemy units');
  const inf = getInfra(indexed, targetH3);
  if (inf.urban > 0) kinds.push('urban');
  if (inf.airport > 0) kinds.push('airport');
  if (inf.seaport > 0) kinds.push('seaport');
  return kinds;
}
/**
 * Defines the `featuresCellForStrike` function shape (function featuresCellForStrike(indexed: IndexedState, h3: string): string).

 * Purpose: Supports maintainability by documenting why `featuresCellForStrike` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function featuresCellForStrike(indexed: IndexedState, h3: string): string {
  const inf = describeInfrastructure(getInfra(indexed, h3));
  const kinds = strikeKindsForHex(indexed, h3);
  const strikePart = kinds.length > 0 ? `strike: ${kinds.join(', ')}` : '';
  if (inf && strikePart) return `${inf}; ${strikePart}`;
  if (strikePart) return strikePart;
  if (inf) return inf;
  return '—';
}
/**
 * Defines the `featuresCellForHex` function shape (function featuresCellForHex(indexed: IndexedState, h3: string): string).

 * Purpose: Supports maintainability by documenting why `featuresCellForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function featuresCellForHex(indexed: IndexedState, h3: string): string {
  return describeInfrastructure(getInfra(indexed, h3)) ?? '—';
}
/**
 * Defines the `enemyCell` function shape (function enemyCell(indexed: IndexedState, h3: string): string).

 * Purpose: Supports maintainability by documenting why `enemyCell` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function enemyCell(indexed: IndexedState, h3: string): string {
  return describeEnemyUnitsAtHex(indexed, h3) ?? '—';
}

/**
 * Defines the `safeGridDistance` function shape (function safeGridDistance(from: string, to: string): number | null).

 * Purpose: Supports maintainability by documenting why `safeGridDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function safeGridDistance(from: string, to: string): number | null {
  try {
    return gridDistance(from, to);
  } catch {
    return null;
  }
}

/**
 * Defines the `appendRowsForLegalHexes` function shape (function appendRowsForLegalHexes(args: { rows: RawPossibleActionRow[]; unitId: string; unitType: string; unitH3: string; actionType: string; l).

 * Purpose: Supports maintainability by documenting why `appendRowsForLegalHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function appendRowsForLegalHexes(args: {
  rows: RawPossibleActionRow[];
  unitId: string;
  unitType: string;
  unitH3: string;
  actionType: string;
  legalHexes: string[];
  homeland: Set<string>;
  indexed: IndexedState;
  latLngByH3: Map<string, [number, number]>;
  isAirStrike: boolean;
  /** When set, overrides per-hex enemy occupancy text (used for approach rows targeting empty approach cells). */
  enemySummaryOverride?: string;
  /** Tactical interest context so Target Infrastructure / urban rank use res4 flags instead of strategic res1 maps. */
  tacticalInterest?: TacticalBestOptionsInterestContext;
}): void {
  const parts = partitionHomelandNearestOther(args.legalHexes, args.homeland);
  const addForBucket = (bucket: PossibleActionTableRow['bucket'], hexList: string[]): void => {
    for (const h3 of sortHexesByLatLng(hexList, args.latLngByH3)) {
      const d = safeGridDistance(args.unitH3, h3);
      if (d === null) continue;
      const tacticalCtx = args.tacticalInterest;
      args.rows.push({
        bucket,
        unitId: args.unitId,
        unitType: args.unitType,
        actionType: args.actionType,
        targetH3: h3,
        distance: d,
        enemySummary: args.enemySummaryOverride ?? enemyCell(args.indexed, h3),
        featuresSummary: args.isAirStrike
          ? featuresCellForStrike(args.indexed, h3)
          : tacticalCtx
            ? describeTacticalBestOptionsInfrastructure(h3, tacticalCtx)
            : featuresCellForHex(args.indexed, h3),
        enemyUnitCount: (args.indexed.enemyUnitsByHex.get(h3) ?? []).length,
        urbanHexCount: tacticalCtx
          ? tacticalBestOptionsUrbanHexCount(h3, tacticalCtx)
          : getInfra(args.indexed, h3).urban,
      });
    }
  };
  addForBucket('homeland', parts.homeland);
  addForBucket('nearest', parts.nearest);
  addForBucket('other', parts.other);
}
/**
 * Defines the `airBaseHasIntactAirport` function shape (function airBaseHasIntactAirport(indexed: IndexedState, airH3: string): boolean).

 * Purpose: Supports maintainability by documenting why `airBaseHasIntactAirport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function airBaseHasIntactAirport(indexed: IndexedState, airH3: string): boolean {
  return getInfra(indexed, airH3).airport > 0;
}
/**
 * Defines the `collectLegalFerryDestinationHexes` function shape (function collectLegalFerryDestinationHexes().

 * Purpose: Lists friendly-controlled hexes with intact airports within air-ferry grid range of the unit's base.
 * When to use: From `collectAggregatedPossibleActionRows` for air units with an intact home airport.
 * Expected outcome: Every returned hex is already within `AIR_FERRY_RANGE_HEXES`; callers must not re-apply range checks.
 * Exceptions: Returns [] when the unit is not air or its base airport is damaged.
 */

function collectLegalFerryDestinationHexes(
  unit: { id: string; h3Index: string; player: string; unitType: string },
  indexed: IndexedState
): string[] {
  if (unit.unitType !== 'air') return [];
  if (!airBaseHasIntactAirport(indexed, unit.h3Index)) return [];
  let candidates: string[];
  try {
    candidates = gridDisk(unit.h3Index, AIR_FERRY_RANGE_HEXES).filter((h3) => indexed.hexSet.has(h3) && h3 !== unit.h3Index);
  } catch {
    candidates = [];
    for (const h3 of indexed.hexSet) {
      if (h3 === unit.h3Index) continue;
      if (isWithinAirFerryGridRange(unit.h3Index, h3, 'possibleUnitActions ferry disk fallback')) {
        candidates.push(h3);
      }
    }
  }
  const out = new Set<string>();
  for (const h3 of candidates) {
    if (getInfra(indexed, h3).airport <= 0) continue;
    const snapshotController = indexed.controlByHex.get(h3) ?? null;
    if (snapshotController !== unit.player) continue;
    logHexControllerParityMismatch({
      h3Index: h3,
      snapshotController,
      context: 'possibleUnitActions ferry destination',
      unitId: unit.id,
    });
    out.add(h3);
  }
  return [...out];
}

/**
 * Defines the `collectStrikeHexesForAirUnit` function shape (function collectStrikeHexesForAirUnit(airH3: string, indexed: IndexedState): string[]).

 * Purpose: Lists map hexes within air-strike grid range of a base hex.
 * When to use: From `collectAggregatedPossibleActionRows` before infrastructure/kind filters.
 * Expected outcome: Every returned hex is within `AIR_STRIKE_RANGE_HEXES` (via `gridDisk` or fallback scan); callers must not re-apply range checks.
 * Exceptions: Returns [] when `gridDisk` and fallback both fail.
 */
function collectStrikeHexesForAirUnit(airH3: string, indexed: IndexedState): string[] {
  try {
    const disk = gridDisk(airH3, AIR_STRIKE_RANGE_HEXES);
    return disk.filter((h3) => indexed.hexSet.has(h3));
  } catch {
    const out: string[] = [];
    for (const h3 of indexed.hexSet) {
      if (isWithinAirStrikeGridRange(airH3, h3, 'possibleUnitActions strike scan')) out.push(h3);
    }
    return out;
  }
}

/**
 * Defines the `collectAggregatedPossibleActionRows` function shape (export function collectAggregatedPossibleActionRows(args: { state: GameStateSnapshot; latLngByH3: Map<string, [number, number]>; formatLatLng: (ll: [number, number]) => string; tacticalBattle?: TacticalBattleSnapshot; forThisTurnOptionsTable?: boolean }): PossibleActionTableRow[]).

 * Purpose: Aggregates opponent legal moves, air strikes, and ranged targets into briefing table rows, optionally tightening targets for the Best Options This Turn prompt table.
 * When to use: `buildPossibleUnitActionsMarkdown` and operational map sections that render the Best Options This Turn table.
 * Expected outcome: Deduplicated `PossibleActionTableRow` list after `aggregateRows`, or an empty array when no raw rows.
 * Exceptions: None.
 */

export function collectAggregatedPossibleActionRows(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  formatLatLng: (ll: [number, number]) => string;
  tacticalBattle?: TacticalBattleSnapshot;
  /**
   * Specifies the contract for the `forThisTurnOptionsTable` member (forThisTurnOptionsTable?: boolean).

   * Contract: When true, narrows move/ranged candidate hexes for the operational-map Best Options This Turn table; when false or omitted, preserves legacy full-table row generation.
   * When to use: Set only from `buildStrategicOperationalMapSectionMarkdown` / `buildTacticalOperationalMapSectionMarkdown`.
   * Expected outcome: Ground move/melee filter for non-air units (strategic and tactical: human/enemy contact, else approach, else uncontrolled unoccupied infra); empty or infra-only interest falls back to approach in both modes; strategic ranged lists only enemy-occupied hexes in range (same as full markdown); tactical ranged Best Options lists only human-occupied cells (legal infra-only shots unchanged); air ferry lists unchanged.
   * Exceptions: None.
   */
  forThisTurnOptionsTable?: boolean;
  /** Pre-built indexed state; when omitted, built from `state` on this call. */
  indexedState?: PossibleActionsIndexedState;
}): PossibleActionTableRow[] {
  const forThisTurn = args.forThisTurnOptionsTable === true;
  logDebug('possibleUnitActions collectAggregatedPossibleActionRows', {
    turnNumber: args.state.turnNumber,
    tactical: Boolean(args.tacticalBattle),
    forThisTurnOptionsTable: forThisTurn,
    reusedIndexedState: Boolean(args.indexedState),
  });
  const { state, latLngByH3, tacticalBattle } = args;
  const indexed = args.indexedState ?? buildIndexedState(state);
  const homeland = enemyHomelandHexSet(state);
  const opponentUnits = state.units.filter((u) => u.player === FRIENDLY_PLAYER).sort((a, b) => a.id.localeCompare(b.id));
  const rawRows: RawPossibleActionRow[] = [];
  const thisTurnFilterStats = forThisTurn
    ? { moveIn: 0, moveOut: 0, rangedIn: 0, rangedOut: 0 }
    : null;
  const thisTurnStartedAt = forThisTurn && tacticalBattle ? performance.now() : null;
  let tacticalRangedRowsForFootprint:
    | ReadonlyArray<{
        h3Index: string;
        isUrban: boolean;
        isAirport: boolean;
        isSeaport: boolean;
        isRubble: boolean;
      }>
    | undefined;
  let tacticalHumanOccupiedH3: ReadonlySet<string> | undefined;
  let tacticalBestOptionsInterest: TacticalBestOptionsInterestContext | undefined;
  if (tacticalBattle) {
    tacticalHumanOccupiedH3 = new Set(
      tacticalBattle.subUnits.filter((s) => s.player === ENEMY_PLAYER).map((s) => s.h3Index)
    );
    try {
      const foot = new Set(tacticalBattle.res4ChildH3Indexes);
      tacticalRangedRowsForFootprint = listRes4FeatureOverridesForGame().filter(
        (r) => r.parentH3Index === tacticalBattle.enclosingRes1H3Index && foot.has(r.h3Index)
      );
    } catch {
      tacticalRangedRowsForFootprint = [];
    }
    tacticalBestOptionsInterest = {
      battle: tacticalBattle,
      humanOccupiedH3: tacticalHumanOccupiedH3,
      friendlyOccupiedH3: new Set(
        tacticalBattle.subUnits.filter((s) => s.player === FRIENDLY_PLAYER).map((s) => s.h3Index)
      ),
      enclosingController: indexed.controlByHex.get(tacticalBattle.enclosingRes1H3Index) ?? null,
      rowByH3: new Map((tacticalRangedRowsForFootprint ?? []).map((r) => [r.h3Index, r])),
    };
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows tactical interest', {
      enclosingController: tacticalBestOptionsInterest.enclosingController,
      humanOccupiedHexCount: tacticalBestOptionsInterest.humanOccupiedH3.size,
      friendlyOccupiedHexCount: tacticalBestOptionsInterest.friendlyOccupiedH3.size,
    });
  }

  const strategicEnemyOccupiedH3 = new Set(indexed.enemyUnitsByHex.keys());

  for (const unit of opponentUnits) {
    let moveHexes = excludeUnitCurrentHex(
      unit.h3Index,
      unit.unitType === 'air'
        ? collectLegalFerryDestinationHexes(unit, indexed)
        : tacticalBattle
          ? collectTacticalLegalMoveDestinationRes4Hexes(tacticalBattle, unit.id)
          : getValidDestinations(unit, state)
    );
    let moveActionType = ACTION_MOVES_MELEE;
    let moveEnemySummaryOverride: string | undefined;
    if (forThisTurn && unit.unitType !== 'air') {
      const before = moveHexes.length;
      if (tacticalBattle && tacticalBestOptionsInterest && tacticalHumanOccupiedH3) {
        const resolved = applyInterestOrApproach({
          unitH3: unit.h3Index,
          legalHexes: moveHexes,
          interest: filterTacticalGroundMoveHexesForThisTurnOptionsTable(
            moveHexes,
            tacticalBestOptionsInterest
          ),
          enemyOccupiedH3: tacticalHumanOccupiedH3,
          indexed,
        });
        moveHexes = resolved.hexes;
        moveActionType = resolved.actionType;
        moveEnemySummaryOverride = resolved.enemySummaryOverride;
      } else {
        const resolved = applyInterestOrApproach({
          unitH3: unit.h3Index,
          legalHexes: moveHexes,
          interest: filterGroundMoveHexesForThisTurnOptionsTable(indexed, moveHexes),
          enemyOccupiedH3: strategicEnemyOccupiedH3,
          indexed,
        });
        moveHexes = resolved.hexes;
        moveActionType = resolved.actionType;
        moveEnemySummaryOverride = resolved.enemySummaryOverride;
      }
      if (thisTurnFilterStats) {
        thisTurnFilterStats.moveIn += before;
        thisTurnFilterStats.moveOut += moveHexes.length;
      }
    }
    if (moveHexes.length > 0) {
      appendRowsForLegalHexes({
        rows: rawRows,
        unitId: unit.id,
        unitType: unit.unitType,
        unitH3: unit.h3Index,
        actionType: moveActionType,
        legalHexes: moveHexes,
        homeland,
        indexed,
        latLngByH3,
        isAirStrike: false,
        enemySummaryOverride: moveEnemySummaryOverride,
        tacticalInterest: tacticalBestOptionsInterest,
      });
    }

    if (unit.unitType === 'air' && airBaseHasIntactAirport(indexed, unit.h3Index)) {
      const strikeTargets = excludeUnitCurrentHex(
        unit.h3Index,
        collectStrikeHexesForAirUnit(unit.h3Index, indexed).filter((h3) => strikeKindsForHex(indexed, h3).length > 0)
      );
      if (strikeTargets.length > 0) {
        appendRowsForLegalHexes({
          rows: rawRows,
          unitId: unit.id,
          unitType: unit.unitType,
          unitH3: unit.h3Index,
          actionType: ACTION_AIR_STRIKES,
          legalHexes: strikeTargets,
          homeland,
          indexed,
          latLngByH3,
          isAirStrike: true,
        });
      }
    }

    if (unit.unitType !== 'air' && unitHasDirectRangedPlanning(unit.unitType, Boolean(tacticalBattle))) {
      const tacticalRangedRows = tacticalRangedRowsForFootprint;
      let rangedHexes = excludeUnitCurrentHex(
        unit.h3Index,
        tacticalBattle
          ? collectTacticalLegalRangedTargetRes4Hexes(tacticalBattle, unit.id, tacticalRangedRows)
          : collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed)
      );
      if (forThisTurn && tacticalBattle && tacticalBestOptionsInterest) {
        const before = rangedHexes.length;
        rangedHexes = filterTacticalRangedHexesForThisTurnOptionsTable(
          unit.id,
          rangedHexes,
          tacticalBestOptionsInterest
        );
        if (thisTurnFilterStats) {
          thisTurnFilterStats.rangedIn += before;
          thisTurnFilterStats.rangedOut += rangedHexes.length;
        }
      }
      if (rangedHexes.length > 0) {
        appendRowsForLegalHexes({
          rows: rawRows,
          unitId: unit.id,
          unitType: unit.unitType,
          unitH3: unit.h3Index,
          actionType: ACTION_RANGED,
          legalHexes: rangedHexes,
          homeland,
          indexed,
          latLngByH3,
          isAirStrike: false,
          tacticalInterest: tacticalBestOptionsInterest,
        });
      }
    }
  }

  if (forThisTurn && thisTurnFilterStats) {
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows thisTurnOptionsFilterTotals', {
      groundMoveHexSlotsOffered: thisTurnFilterStats.moveIn,
      groundMoveHexSlotsKept: thisTurnFilterStats.moveOut,
      rangedHexSlotsOffered: thisTurnFilterStats.rangedIn,
      rangedHexSlotsKept: thisTurnFilterStats.rangedOut,
      tactical: Boolean(tacticalBattle),
      elapsedMs: thisTurnStartedAt != null ? Math.round(performance.now() - thisTurnStartedAt) : undefined,
    });
  }

  if (rawRows.length === 0) return [];
  return aggregateRows(rawRows);
}

/**
 * Defines the `buildPossibleUnitActionsMarkdown` function shape (export function buildPossibleUnitActionsMarkdown(args: { state: GameStateSnapshot; latLngByH3: Map<string, [number, number]>; formatLatLng: (ll: [number, number]) => string; tacticalBattle?: TacticalBattleSnapshot }): string).

 * Purpose: Emits bucketed markdown tables of possible opponent unit actions for legacy Commander briefing sections.
 * When to use: Callers that still embed the multi-section possible-actions block (not the compact Best Options This Turn table alone).
 * Expected outcome: Markdown string with `##` subsections per homeland/nearest/other buckets, or an empty string when no rows.
 * Exceptions: None.
 */
export function buildPossibleUnitActionsMarkdown(args: {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  formatLatLng: (ll: [number, number]) => string;
  /**
   * When set, ranged target discovery uses tactical res4 rules (terrain range cap, mountain LOS) for opponent units.
   *
   * Contract: `state.hexes` / `state.units` must already match this footprint (e.g. `buildTacticalAiPlanState` output).
   * When to use: Tactical AI `requestOrdersFlow` briefings.
   * Expected outcome: Ranged markdown reflects the same legality as `validateGroupRangedTarget` + apply filters.
   * Exceptions: None.
   */
  tacticalBattle?: TacticalBattleSnapshot;
}): string {
  logDebug('possibleUnitActions buildPossibleUnitActionsMarkdown', {
    turnNumber: args.state.turnNumber,
    tactical: Boolean(args.tacticalBattle),
  });
  const { latLngByH3, formatLatLng } = args;
  const rows = collectAggregatedPossibleActionRows(args);
  if (rows.length === 0) return '';

  const byBucket = groupRowsByBucket(rows);

  const subsection = (title: string, bucketRows: PossibleActionTableRow[]): string => {
    if (bucketRows.length === 0) return '';
    const trimmed = selectTopRowsPerUnit(bucketRows, latLngByH3);
    const tableBody = trimmed.map((r) => {
      const ll = latLngByH3.get(r.targetH3);
      const hexStr = ll ? formatLatLng(ll) : r.targetH3;
      return [r.unitId, r.unitType, r.actionTypes, hexStr, String(r.distance), r.enemySummary, r.featuresSummary];
    });
    const tableLines = markdownTableLines(tableBody);
    return `## ${title}\n\n${tableLines.join('\n')}`;
  };

  const blocks: string[] = [];
  for (const item of BUCKET_TITLES) {
    const block = subsection(item.title, byBucket[item.bucket]);
    if (block.length > 0) blocks.push(block);
  }
  return blocks.join('\n\n');
}
