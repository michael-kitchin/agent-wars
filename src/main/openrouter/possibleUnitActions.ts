/**
 * Builds the "Possible unit actions" markdown block for AI Commander's Briefings.
 * Derives legal one-step moves/melee reach, air ferry destinations, ranged attacks, and air strikes from order validation rules.
 *
 * When `tacticalBattle` is passed, **ranged** rows use `collectTacticalLegalRangedTargetRes4Hexes` (terrain caps + mountain LOS)
 * on the res4 footprint; movement and strikes still use the same strategic-style helpers on the projected `state`.
 */

import { gridDistance, gridDisk } from 'h3-js';
import { type GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getRange } from '../combatConstants';
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
   * Specifies the contract for the `enemyUnitsByHex` member (enemyUnitsByHex: Map<string, Array<{ unitType: string }>>;).

   * Contract: Describes stable behavior for callers of `enemyUnitsByHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemyUnitsByHex: Map<string, Array<{ unitType: string }>>;
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
  const enemyUnitsByHex = new Map<string, Array<{ unitType: string }>>();
  for (const unit of state.units) {
    if (unit.player !== ENEMY_PLAYER) continue;
    const list = enemyUnitsByHex.get(unit.h3Index) ?? [];
    list.push({ unitType: unit.unitType });
    enemyUnitsByHex.set(unit.h3Index, list);
  }
  return {
    infraByHex,
    controlByHex,
    enemyUnitsByHex,
    hexSet: new Set(state.hexes.map((h) => h.h3Index)),
  };
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
}): void {
  const parts = partitionHomelandNearestOther(args.legalHexes, args.homeland);
  const addForBucket = (bucket: PossibleActionTableRow['bucket'], hexList: string[]): void => {
    for (const h3 of sortHexesByLatLng(hexList, args.latLngByH3)) {
      const d = safeGridDistance(args.unitH3, h3);
      if (d === null) continue;
      args.rows.push({
        bucket,
        unitId: args.unitId,
        unitType: args.unitType,
        actionType: args.actionType,
        targetH3: h3,
        distance: d,
        enemySummary: enemyCell(args.indexed, h3),
        featuresSummary: args.isAirStrike ? featuresCellForStrike(args.indexed, h3) : featuresCellForHex(args.indexed, h3),
        enemyUnitCount: (args.indexed.enemyUnitsByHex.get(h3) ?? []).length,
        urbanHexCount: getInfra(args.indexed, h3).urban,
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

 * Purpose: Supports maintainability by documenting why `collectLegalFerryDestinationHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
    if (!isWithinAirFerryGridRange(unit.h3Index, h3, 'possibleUnitActions ferry')) continue;
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

 * Purpose: Supports maintainability by documenting why `collectStrikeHexesForAirUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `buildPossibleUnitActionsMarkdown` function shape (export function buildPossibleUnitActionsMarkdown(args: { state: GameStateSnapshot; latLngByH3: Map<string, [number, number]>; formatLatLng: (ll: [numbe).

 * Purpose: Supports maintainability by documenting why `buildPossibleUnitActionsMarkdown` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  const { state, latLngByH3, formatLatLng, tacticalBattle } = args;
  const indexed = buildIndexedState(state);
  const homeland = enemyHomelandHexSet(state);
  const opponentUnits = state.units.filter((u) => u.player === FRIENDLY_PLAYER).sort((a, b) => a.id.localeCompare(b.id));
  const rawRows: RawPossibleActionRow[] = [];

  for (const unit of opponentUnits) {
    const moveHexes = excludeUnitCurrentHex(
      unit.h3Index,
      unit.unitType === 'air'
        ? collectLegalFerryDestinationHexes(unit, indexed)
        : getValidDestinations(unit, state)
    );
    if (moveHexes.length > 0) {
      appendRowsForLegalHexes({
        rows: rawRows,
        unitId: unit.id,
        unitType: unit.unitType,
        unitH3: unit.h3Index,
        actionType: ACTION_MOVES_MELEE,
        legalHexes: moveHexes,
        homeland,
        indexed,
        latLngByH3,
        isAirStrike: false,
      });
    }

    if (unit.unitType === 'air' && airBaseHasIntactAirport(indexed, unit.h3Index)) {
      const strikeTargets = excludeUnitCurrentHex(
        unit.h3Index,
        collectStrikeHexesForAirUnit(unit.h3Index, indexed)
          .filter((h3) => isWithinAirStrikeGridRange(unit.h3Index, h3, 'possibleUnitActions air strike'))
          .filter((h3) => strikeKindsForHex(indexed, h3).length > 0)
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

    if (unit.unitType !== 'air' && getRange(unit.unitType as 'infantry' | 'armor' | 'naval' | 'air') >= 1) {
      const rangedHexes = excludeUnitCurrentHex(
        unit.h3Index,
        tacticalBattle
          ? collectTacticalLegalRangedTargetRes4Hexes(tacticalBattle, unit.id)
          : collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed)
      );
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
        });
      }
    }
  }

  if (rawRows.length === 0) return '';
  const rows = aggregateRows(rawRows);

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
