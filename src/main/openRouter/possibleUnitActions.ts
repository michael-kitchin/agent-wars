/**
 * Builds the "Possible unit actions" markdown block for AI Commander's Briefings.
 * Derives legal moves/melee reach, air ferry destinations, ranged attacks, and air strikes from order validation rules.
 *
 * Strategic vs tactical reachability (intentional parity of *pipeline*, not hex sets):
 * - Strategic ground: `getValidDestinations` → strategic `getLandMassReachableHexes` (hop BFS).
 * - Tactical ground: `collectTacticalLegalMoveDestinationTacticalHexes` → single-source MP reachability (Ready rules).
 * Best Options This Turn interest/approach live in `possibleUnitActionsBestOptionsInterest.ts`
 * (enemy ∪ uncontrolled unoccupied infra; empty interest falls back to approach; this-turn air strikes
 * list enemy-occupied or human-controlled infra only strategically, and human-occupied footprint cells
 * tactically when the parent strategic airport is intact; tactical Best Options lists airport-to-airport ferry dests).
 * The indexed snapshot maps and cell text live in `possibleUnitActionsIndexedState.ts`; strategic ferry and strike
 * destinations and the per-request destination caches live in `possibleUnitActionsDestinations.ts`.
 */

import { briefingOwnSeatId, enemyHomeHexes } from '../briefing/briefingPerspective';
import { type GameStateSnapshot, listTacticalFeatureOverridesForGame } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { collectTacticalLegalMoveDestinationHexes } from '../../shared/collectTacticalLegalMoveDestinationHexes';
import { collectTacticalLegalFerryDestinationHexes } from '../tacticalBattle/tacticalFerryAirportGuards';
import { unitHasDirectRangedPlanning } from '../../shared/rangePerimeterModel';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { collectTacticalLegalRangedTargetHexes } from '../../shared/tacticalTerrainCombatModifiers';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { isMissileUnitType } from '../../shared/missileRules';
import { compareUnitIdsNaturally } from '../../shared/unitIds';
import { logDebug, logTrace } from '../logger';
import {
  airBaseHasIntactAirport,
  buildPossibleActionsIndexedState,
  enemyCell,
  featuresCellForHex,
  featuresCellForStrike,
  getInfra,
  strikeKindsForHex,
  tacticalParentAirportIntact,
  type PossibleActionsIndexedState,
} from './possibleUnitActionsIndexedState';
import {
  collectLegalFerryDestinationHexes,
  collectStrikeHexesForAirUnit,
  rememberComputedHexList,
  tacticalLegalMoveDestCacheKey,
  tacticalRangedDestCacheKey,
} from './possibleUnitActionsDestinations';
import {
  friendlyOccupantsFromHexIndex,
  readStandingThisPeriodMoves,
  stayPutFriendlyOccupiedHexes,
} from '../tools/stayPutFriendlyOccupancy';
import { compareHexIds, partitionHomelandNearestOther } from './possibleUnitActionsPartition';
import {
  ACTION_AIR_STRIKES,
  ACTION_FERRY,
  ACTION_MOVES_MELEE,
  ACTION_RANGED,
  aggregateRows,
  BUCKET_TITLES,
  excludeUnitCurrentHex,
  groupRowsByBucket,
  markdownTableLines,
  omitThisTurnFerryRowsForStrikingAir,
  selectTopRowsPerUnit,
  type PossibleActionTableRow,
  type RawPossibleActionRow,
} from './possibleUnitActionsTableAssembly';
import { collectRangedTargetHexes } from './possibleUnitActionsStrategicRanged';
import {
  applyInterestOrApproach,
  describeTacticalBestOptionsInfrastructure,
  filterGroundMoveHexesForThisTurnOptionsTable,
  filterStrategicAirStrikeHexesForThisTurnOptionsTable,
  filterTacticalAirStrikeHexesForThisTurnOptionsTable,
  filterTacticalGroundMoveHexesForThisTurnOptionsTable,
  filterTacticalRangedHexesForThisTurnOptionsTable,
  tacticalBestOptionsUrbanHexCount,
  type TacticalBestOptionsInterestContext,
} from './possibleUnitActionsBestOptionsInterest';

export { buildPossibleActionsIndexedState, partitionHomelandNearestOther };
export type { PossibleActionsIndexedState };
export type { PossibleActionTableRow } from './possibleUnitActionsTableAssembly';

/**
 * Hexes in the human's home region, which the AI sees as the enemy homeland.
 *
 * Purpose: Rows targeting the enemy homeland are grouped into their own bucket.
 * When to use: Once per `collectAggregatedPossibleActionRows` call, passed to `appendRowsForLegalHexes`.
 * Expected outcome: A set of the other active seats' home hexes; empty when the snapshot has none.
 * Exceptions: None.
 */
function enemyHomelandHexSet(state: GameStateSnapshot): Set<string> {
  return new Set(enemyHomeHexes(state));
}

/**
 * Orders hexes south to north, then west to east, for stable row order.
 *
 * Purpose: Row order must not depend on H3 iteration order so prompts stay reproducible.
 * When to use: Before pushing rows for one bucket in `appendRowsForLegalHexes`.
 * Expected outcome: A sorted copy by latitude, then longitude; hexes without coordinates fall back to hex id order.
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
 * Ranking distance used when H3 cannot measure a pair that is still a legal destination.
 *
 * Purpose: `gridDistance` throws across many strategic icosahedron-face crossings even when `gridDisk` includes the dest. Dropping those rows hid entire air bases from Best Options while Air Operations still counted ferry dests.
 * When to use: `tableRowDistance` fallback only; never as a range check.
 * Expected outcome: Unmeasurable legal dests sort after measurable ones, then by urban count / lat-lng.
 * Exceptions: None.
 */
const UNMEASURABLE_DEST_RANK_DISTANCE = 999;

/**
 * Grid-step distance for Best Options / possible-action row ranking.
 *
 * Purpose: Prefer a real H3 distance when available; keep the legal dest when measurement fails instead of omitting the action.
 * When to use: `appendRowsForLegalHexes` before pushing a row.
 * Expected outcome: Non-negative integer; `UNMEASURABLE_DEST_RANK_DISTANCE` when both `gridDistance` and `gridPathCells` fail.
 * Exceptions: None.
 */
function tableRowDistance(from: string, to: string, unitId: string): number {
  const d = computeGridDistancePure(from, to);
  if (d !== null) return d;
  logTrace('possibleUnitActions tableRowDistance: unmeasurable pair, using rank fallback', {
    unitId,
    from,
    to,
    fallback: UNMEASURABLE_DEST_RANK_DISTANCE,
  });
  return UNMEASURABLE_DEST_RANK_DISTANCE;
}

/**
 * Pushes one raw row per legal hex for a unit and action, grouped into homeland, nearest, and other buckets.
 *
 * Purpose: Move, ferry, ranged, and strike collection share the same row shape, ranking distance, and cell text.
 * When to use: From `collectAggregatedPossibleActionRows` after the legal hexes for one unit and action are final.
 * Expected outcome: `args.rows` grows by one row per legal hex. Strike rows describe strike kinds; tactical rows use
 *   tactical feature flags for the features column and urban rank.
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
  indexed: PossibleActionsIndexedState;
  latLngByH3: Map<string, [number, number]>;
  isAirStrike: boolean;
  /** When set, overrides per-hex enemy occupancy text (used for approach rows targeting empty approach cells). */
  enemySummaryOverride?: string;
  /** Tactical interest context so Target Infrastructure / urban rank use tactical flags instead of strategic maps. */
  tacticalInterest?: TacticalBestOptionsInterestContext;
}): void {
  const parts = partitionHomelandNearestOther(args.legalHexes, args.homeland);
  const addForBucket = (bucket: PossibleActionTableRow['bucket'], hexList: string[]): void => {
    for (const h3 of sortHexesByLatLng(hexList, args.latLngByH3)) {
      const d = tableRowDistance(args.unitH3, h3, args.unitId);
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
 * Collects the AI's legal actions as deduplicated table rows.
 *
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
   * Narrows targets for the Best Options This Turn table.
   *
   * Contract: When true, narrows move/ranged candidate hexes for the operational-map Best Options This Turn table; when false or omitted, preserves legacy full-table row generation.
   * When to use: Set only from `buildStrategicOperationalMapSectionMarkdown` / `buildTacticalOperationalMapSectionMarkdown`.
   * Expected outcome: Ground move/melee filter for non-air units (strategic and tactical: human/enemy contact, else approach, else uncontrolled unoccupied infra); empty or infra-only interest falls back to approach in both modes; strategic ranged lists only enemy-occupied hexes in range (same as full markdown); tactical ranged Best Options lists only human-occupied cells (legal infra-only shots unchanged); this-turn air strikes list enemy-occupied or human-controlled infra only (strategic) or human-occupied footprint cells when the parent strategic airport is intact (tactical); air ferry dests stay listed and are labeled `ferry` (strategic: owned airports in range 4; tactical: intact airport cells in the footprint).
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
  const ownSeat = briefingOwnSeatId(state);
  const indexed = args.indexedState ?? buildPossibleActionsIndexedState(state);
  const homeland = enemyHomelandHexSet(state);
  const opponentUnits = state.units.filter((u) => u.player === ownSeat).sort((a, b) => compareUnitIdsNaturally(a.id, b.id));
  const rawRows: RawPossibleActionRow[] = [];
  const thisTurnFilterStats = forThisTurn
    ? { moveIn: 0, moveOut: 0, rangedIn: 0, rangedOut: 0, airStrikeIn: 0, airStrikeOut: 0 }
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
      tacticalBattle.subUnits.filter((s) => s.player !== ownSeat).map((s) => s.h3Index)
    );
    try {
      const foot = new Set(tacticalBattle.tacticalChildH3Indexes);
      tacticalRangedRowsForFootprint = listTacticalFeatureOverridesForGame().filter(
        (r) => r.parentH3Index === tacticalBattle.enclosingStrategicH3Index && foot.has(r.h3Index)
      );
    } catch {
      tacticalRangedRowsForFootprint = [];
    }
    tacticalBestOptionsInterest = {
      battle: tacticalBattle,
      humanOccupiedH3: tacticalHumanOccupiedH3,
      friendlyOccupiedH3: new Set(
        tacticalBattle.subUnits.filter((s) => s.player === ownSeat).map((s) => s.h3Index)
      ),
      enclosingController: indexed.controlByHex.get(tacticalBattle.enclosingStrategicH3Index) ?? null,
      rowByH3: new Map((tacticalRangedRowsForFootprint ?? []).map((r) => [r.h3Index, r])),
    };
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows tactical interest', {
      enclosingController: tacticalBestOptionsInterest.enclosingController,
      humanOccupiedHexCount: tacticalBestOptionsInterest.humanOccupiedH3.size,
      friendlyOccupiedHexCount: tacticalBestOptionsInterest.friendlyOccupiedH3.size,
    });
  }

  const strategicEnemyOccupiedH3 = new Set(indexed.enemyUnitsByHex.keys());
  const stayPutFriendlyH3 =
    forThisTurn && !tacticalBattle
      ? stayPutFriendlyOccupiedHexes(
          friendlyOccupantsFromHexIndex(indexed.friendlyUnitsByHex),
          readStandingThisPeriodMoves(ownSeat)
        )
      : undefined;
  if (stayPutFriendlyH3) {
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows stayPut occupancy', {
      stayPutHexCount: stayPutFriendlyH3.size,
    });
  }

  const opponentAirCount = opponentUnits.filter((u) => u.unitType === 'air').length;
  if (tacticalBattle && opponentAirCount > 0) {
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows tacticalAirFerryRows', {
      opponentAirCount,
    });
  }

  const legalDestByKey = new Map<string, string[]>();
  const ferryDestByKey = new Map<string, string[]>();
  const strikeHexByOrigin = new Map<string, string[]>();
  const rangedDestByKey = new Map<string, string[]>();
  const strategicLandNavalOrigins = new Set<string>();

  for (const unit of opponentUnits) {
    if (isMissileUnitType(unit.unitType)) continue;
    const legalDests = (() => {
      if (unit.unitType === 'air') {
        if (tacticalBattle) {
          return rememberComputedHexList(
            ferryDestByKey,
            `${unit.h3Index}|tactical-ferry`,
            () => collectTacticalLegalFerryDestinationHexes(tacticalBattle, unit.h3Index, unit.player)
          );
        }
        return rememberComputedHexList(
          ferryDestByKey,
          `${unit.h3Index}|${unit.player}|${unit.weatherTags?.join(',') ?? ''}`,
          () => collectLegalFerryDestinationHexes(unit, indexed, args.state)
        );
      }
      if (tacticalBattle) {
        return rememberComputedHexList(
          legalDestByKey,
          tacticalLegalMoveDestCacheKey(tacticalBattle, unit.id),
          () => collectTacticalLegalMoveDestinationHexes(tacticalBattle, unit.id)
        );
      }
      strategicLandNavalOrigins.add(`${unit.h3Index}|${unit.unitType}`);
      return getValidDestinations(unit, state);
    })();
    let moveHexes = excludeUnitCurrentHex(unit.h3Index, legalDests);
    let moveActionType = unit.unitType === 'air' ? ACTION_FERRY : ACTION_MOVES_MELEE;
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
          stayPutFriendlyH3,
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

    if (unit.unitType === 'air') {
      const airCanStrike = tacticalBattle
        ? tacticalParentAirportIntact(indexed, unit.h3Index)
        : airBaseHasIntactAirport(indexed, unit.h3Index);
      if (airCanStrike) {
        let strikeTargets: string[];
        if (tacticalBattle && forThisTurn && tacticalBestOptionsInterest) {
          strikeTargets = rememberComputedHexList(
            strikeHexByOrigin,
            `tacticalThisTurn|${unit.h3Index}`,
            () =>
              filterTacticalAirStrikeHexesForThisTurnOptionsTable(
                unit.id,
                excludeUnitCurrentHex(unit.h3Index, [...indexed.hexSet]),
                tacticalBestOptionsInterest
              )
          );
          if (thisTurnFilterStats) {
            thisTurnFilterStats.airStrikeIn += indexed.hexSet.size;
            thisTurnFilterStats.airStrikeOut += strikeTargets.length;
          }
        } else {
          strikeTargets = excludeUnitCurrentHex(
            unit.h3Index,
            rememberComputedHexList(strikeHexByOrigin, unit.h3Index, () =>
              collectStrikeHexesForAirUnit(unit.h3Index, indexed).filter(
                (h3) => strikeKindsForHex(indexed, h3).length > 0
              )
            )
          );
          if (forThisTurn) {
            const before = strikeTargets.length;
            strikeTargets = filterStrategicAirStrikeHexesForThisTurnOptionsTable(indexed, strikeTargets);
            if (thisTurnFilterStats) {
              thisTurnFilterStats.airStrikeIn += before;
              thisTurnFilterStats.airStrikeOut += strikeTargets.length;
            }
          }
        }
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
    }

    if (unit.unitType !== 'air' && unitHasDirectRangedPlanning(unit.unitType, Boolean(tacticalBattle))) {
      const tacticalRangedRows = tacticalRangedRowsForFootprint;
      let rangedHexes = excludeUnitCurrentHex(
        unit.h3Index,
        tacticalBattle
          ? rememberComputedHexList(
              rangedDestByKey,
              tacticalRangedDestCacheKey(tacticalBattle, unit.id),
              () => collectTacticalLegalRangedTargetHexes(tacticalBattle, unit.id, tacticalRangedRows)
            )
          : rememberComputedHexList(
              rangedDestByKey,
              `${unit.h3Index}|${unit.unitType}`,
              () => collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed)
            )
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

  logDebug('possibleUnitActions collectAggregatedPossibleActionRows destCache', {
    opponentUnitCount: opponentUnits.length,
    landNavalOriginKeys: tacticalBattle ? legalDestByKey.size : strategicLandNavalOrigins.size,
    ferryOriginKeys: ferryDestByKey.size,
    strikeOriginKeys: strikeHexByOrigin.size,
    rangedOriginKeys: rangedDestByKey.size,
    tactical: Boolean(tacticalBattle),
  });

  if (forThisTurn && thisTurnFilterStats) {
    logDebug('possibleUnitActions collectAggregatedPossibleActionRows thisTurnOptionsFilterTotals', {
      groundMoveHexSlotsOffered: thisTurnFilterStats.moveIn,
      groundMoveHexSlotsKept: thisTurnFilterStats.moveOut,
      rangedHexSlotsOffered: thisTurnFilterStats.rangedIn,
      rangedHexSlotsKept: thisTurnFilterStats.rangedOut,
      airStrikeHexSlotsOffered: thisTurnFilterStats.airStrikeIn,
      airStrikeHexSlotsKept: thisTurnFilterStats.airStrikeOut,
      tactical: Boolean(tacticalBattle),
      elapsedMs: thisTurnStartedAt != null ? Math.round(performance.now() - thisTurnStartedAt) : undefined,
    });
  }

  if (rawRows.length === 0) return [];
  const rowsForTable = forThisTurn ? omitThisTurnFerryRowsForStrikingAir(rawRows) : rawRows;
  return aggregateRows(rowsForTable);
}

/**
 * Renders the AI's possible unit actions as bucketed markdown tables.
 *
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
   * When set, ranged target discovery uses tactical rules (terrain range cap, mountain LOS) for opponent units.
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
