/**
 * Builds the "Possible unit actions" markdown block for AI Commander's Briefings.
 * Derives legal one-step moves/melee reach, air ferry destinations, ranged attacks, and air strikes from order validation rules.
 */

import { gridDistance, gridDisk } from 'h3-js';
import { type GameStateSnapshot } from '../gameDb';
import { getRange } from '../combatConstants';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { isWithinGridRangeSafe } from '../game-actions/gridRange';
import { logDebug, logTrace } from '../logger';
import { logHexControllerParityMismatch } from '../snapshotDbParity';
import { buildPromptTableLines } from '../promptTableUtils';

/**
 * Documents the module-scope binding `ENEMY_PLAYER` (ENEMY_PLAYER).

 * Purpose: Supports maintainability by documenting why `ENEMY_PLAYER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const ENEMY_PLAYER = 'human';
/**
 * Documents the module-scope binding `FRIENDLY_PLAYER` (FRIENDLY_PLAYER).

 * Purpose: Supports maintainability by documenting why `FRIENDLY_PLAYER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const FRIENDLY_PLAYER = 'opponent';

/**
 * Documents the module-scope binding `ACTION_MOVES_MELEE` (ACTION_MOVES_MELEE).

 * Purpose: Supports maintainability by documenting why `ACTION_MOVES_MELEE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const ACTION_MOVES_MELEE = 'move/melee';
/**
 * Documents the module-scope binding `ACTION_RANGED` (ACTION_RANGED).

 * Purpose: Supports maintainability by documenting why `ACTION_RANGED` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const ACTION_RANGED = 'ranged attack';
/**
 * Documents the module-scope binding `ACTION_AIR_STRIKES` (ACTION_AIR_STRIKES).

 * Purpose: Supports maintainability by documenting why `ACTION_AIR_STRIKES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const ACTION_AIR_STRIKES = 'air strike';
/**
 * Documents the module-scope binding `BUCKET_TITLES` (BUCKET_TITLES: Array<{ bucket: PossibleActionTableRow['bucket']; title: string }>).

 * Purpose: Supports maintainability by documenting why `BUCKET_TITLES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const BUCKET_TITLES: Array<{ bucket: PossibleActionTableRow['bucket']; title: string }> = [
  { bucket: 'homeland', title: 'Enemy Homeland Hexes' },
  { bucket: 'nearest', title: 'Hexes Nearest to Enemy Homeland' },
  { bucket: 'other', title: 'Other Hexes' },
];
/**
 * Documents the module-scope binding `BUCKET_PRIORITY` (BUCKET_PRIORITY: Record<PossibleActionTableRow['bucket'], number>).

 * Purpose: Supports maintainability by documenting why `BUCKET_PRIORITY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const BUCKET_PRIORITY: Record<PossibleActionTableRow['bucket'], number> = {
   /**
   * Documents the object literal property `homeland` (homeland: 0).

   * Purpose: Supports maintainability by documenting why `homeland` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 homeland: 0,
   /**
   * Documents the object literal property `nearest` (nearest: 1).

   * Purpose: Supports maintainability by documenting why `nearest` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 nearest: 1,
   /**
   * Documents the object literal property `other` (other: 2).

   * Purpose: Supports maintainability by documenting why `other` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 other: 2,
};

/**
 * Documents the `PossibleActionTableRow` interface as a named contract surface (export interface PossibleActionTableRow).

 * Purpose: Supports maintainability by documenting why `PossibleActionTableRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

export interface PossibleActionTableRow {
   /**
   * Specifies the contract for the `bucket` member (bucket: 'homeland' | 'nearest' | 'other';).

   * Contract: Describes stable behavior for callers of `bucket` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 bucket: 'homeland' | 'nearest' | 'other';
   /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 unitId: string;
   /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 unitType: string;
   /**
   * Specifies the contract for the `actionTypes` member (actionTypes: string;).

   * Contract: Describes stable behavior for callers of `actionTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 actionTypes: string;
   /**
   * Specifies the contract for the `targetH3` member (targetH3: string;).

   * Contract: Describes stable behavior for callers of `targetH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 targetH3: string;
   /**
   * Specifies the contract for the `distance` member (distance: number;).

   * Contract: Describes stable behavior for callers of `distance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 distance: number;
   /**
   * Specifies the contract for the `enemySummary` member (enemySummary: string;).

   * Contract: Describes stable behavior for callers of `enemySummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemySummary: string;
   /**
   * Specifies the contract for the `featuresSummary` member (featuresSummary: string;).

   * Contract: Describes stable behavior for callers of `featuresSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 featuresSummary: string;
   /**
   * Specifies the contract for the `enemyUnitCount` member (enemyUnitCount: number;).

   * Contract: Describes stable behavior for callers of `enemyUnitCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemyUnitCount: number;
   /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 urbanHexCount: number;
}
/**
 * Defines the `excludeUnitCurrentHex` function shape (function excludeUnitCurrentHex(unitH3: string, hexes: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `excludeUnitCurrentHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function excludeUnitCurrentHex(unitH3: string, hexes: string[]): string[] {
  return hexes.filter((h3) => h3 !== unitH3);
}

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
 * Defines the `minDistanceToHomeland` function shape (function minDistanceToHomeland(h3: string, homeland: Set<string>): number | null).

 * Purpose: Supports maintainability by documenting why `minDistanceToHomeland` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function minDistanceToHomeland(h3: string, homeland: Set<string>): number | null {
  if (homeland.size === 0) return null;
  let min = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h3, t);
      if (d < min) min = d;
    } catch {
      continue;
    }
  }
  return min === Infinity ? null : min;
}

/**
 * Defines the `partitionHomelandNearestOther` function shape (export function partitionHomelandNearestOther(legalHexes: string[], homelandSet: Set<string>): { homeland: string[]; nearest: string[]; other: string[]).

 * Purpose: Supports maintainability by documenting why `partitionHomelandNearestOther` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

export function partitionHomelandNearestOther(legalHexes: string[], homelandSet: Set<string>): {
  homeland: string[];
  nearest: string[];
  other: string[];
} {
  logTrace('possibleUnitActions partitionHomelandNearestOther', {
    legalHexCount: legalHexes.length,
    homelandHexCount: homelandSet.size,
  });
  const unique = [...new Set(legalHexes)];
  if (homelandSet.size === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const inHomeland = unique.filter((h) => homelandSet.has(h));
  if (inHomeland.length > 0) {
    const other = unique.filter((h) => !homelandSet.has(h)).sort(compareHexIds);
    return { homeland: inHomeland.sort(compareHexIds), nearest: [], other };
  }
  const withDist = unique
    .map((h) => ({ h, d: minDistanceToHomeland(h, homelandSet) }))
    .filter((x): x is { h: string; d: number } => x.d !== null);
  if (withDist.length === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const minD = Math.min(...withDist.map((x) => x.d));
  const nearest = withDist.filter((x) => x.d === minD).map((x) => x.h).sort(compareHexIds);
  const other = withDist.filter((x) => x.d > minD).map((x) => x.h).sort(compareHexIds);
  return { homeland: [], nearest, other };
}
/**
 * Defines the `compareHexIds` function shape (function compareHexIds(a: string, b: string): number).

 * Purpose: Supports maintainability by documenting why `compareHexIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function compareHexIds(a: string, b: string): number {
  return a.localeCompare(b);
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
 * Documents the `RawPossibleActionRow` interface as a named contract surface (interface RawPossibleActionRow).

 * Purpose: Supports maintainability by documenting why `RawPossibleActionRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

interface RawPossibleActionRow {
   /**
   * Specifies the contract for the `bucket` member (bucket: 'homeland' | 'nearest' | 'other';).

   * Contract: Describes stable behavior for callers of `bucket` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 bucket: 'homeland' | 'nearest' | 'other';
   /**
   * Specifies the contract for the `unitId` member (unitId: string;).

   * Contract: Describes stable behavior for callers of `unitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 unitId: string;
   /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 unitType: string;
   /**
   * Specifies the contract for the `actionType` member (actionType: string;).

   * Contract: Describes stable behavior for callers of `actionType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 actionType: string;
   /**
   * Specifies the contract for the `targetH3` member (targetH3: string;).

   * Contract: Describes stable behavior for callers of `targetH3` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 targetH3: string;
   /**
   * Specifies the contract for the `distance` member (distance: number;).

   * Contract: Describes stable behavior for callers of `distance` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 distance: number;
   /**
   * Specifies the contract for the `enemySummary` member (enemySummary: string;).

   * Contract: Describes stable behavior for callers of `enemySummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemySummary: string;
   /**
   * Specifies the contract for the `featuresSummary` member (featuresSummary: string;).

   * Contract: Describes stable behavior for callers of `featuresSummary` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 featuresSummary: string;
   /**
   * Specifies the contract for the `enemyUnitCount` member (enemyUnitCount: number;).

   * Contract: Describes stable behavior for callers of `enemyUnitCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 enemyUnitCount: number;
   /**
   * Specifies the contract for the `urbanHexCount` member (urbanHexCount: number;).

   * Contract: Describes stable behavior for callers of `urbanHexCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 urbanHexCount: number;
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
      if (isWithinGridRangeSafe(unit.h3Index, h3, AIR_FERRY_RANGE_HEXES, 'possibleUnitActions ferry disk fallback')) {
        candidates.push(h3);
      }
    }
  }
  const out = new Set<string>();
  for (const h3 of candidates) {
    if (!isWithinGridRangeSafe(unit.h3Index, h3, AIR_FERRY_RANGE_HEXES, 'possibleUnitActions ferry')) continue;
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
 * Defines the `collectRangedTargetHexes` function shape (function collectRangedTargetHexes(unitH3: string, unitType: string, indexed: IndexedState): string[]).

 * Purpose: Supports maintainability by documenting why `collectRangedTargetHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function collectRangedTargetHexes(unitH3: string, unitType: string, indexed: IndexedState): string[] {
  const r = getRange(unitType);
  if (r < 1) return [];
  const out = new Set<string>();
  for (const enemyHex of indexed.enemyUnitsByHex.keys()) {
    try {
      const d = gridDistance(unitH3, enemyHex);
      if (d >= 0 && d <= r) out.add(enemyHex);
    } catch {
      continue;
    }
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
      if (isWithinGridRangeSafe(airH3, h3, AIR_STRIKE_RANGE_HEXES, 'possibleUnitActions strike scan')) out.push(h3);
    }
    return out;
  }
}

/**
 * Documents the module-scope binding `TABLE_HEADERS` (TABLE_HEADERS).

 * Purpose: Supports maintainability by documenting why `TABLE_HEADERS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const TABLE_HEADERS = ['Unit ID', 'Unit Type', 'Action Types', 'Hex', 'Distance', 'Enemy Units', 'Hex Features'];

/**
 * Documents the module-scope binding `ACTION_TYPE_ORDER` (ACTION_TYPE_ORDER: Record<string, number>).

 * Purpose: Supports maintainability by documenting why `ACTION_TYPE_ORDER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

const ACTION_TYPE_ORDER: Record<string, number> = {
   /**
   * Documents the object literal property `move/melee` ('move/melee': 0).

   * Purpose: Supports maintainability by documenting why `move/melee` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 'move/melee': 0,
   /**
   * Documents the object literal property `ranged attack` ('ranged attack': 1).

   * Purpose: Supports maintainability by documenting why `ranged attack` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 'ranged attack': 1,
   /**
   * Documents the object literal property `air strike` ('air strike': 2).

   * Purpose: Supports maintainability by documenting why `air strike` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
 'air strike': 2,
};
/**
 * Defines the `preferredSummary` function shape (function preferredSummary(a: string, b: string): string).

 * Purpose: Supports maintainability by documenting why `preferredSummary` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function preferredSummary(a: string, b: string): string {
  if (a === '—') return b;
  if (b === '—') return a;
  return b.length > a.length ? b : a;
}
/**
 * Defines the `aggregateRows` function shape (function aggregateRows(rows: RawPossibleActionRow[]): PossibleActionTableRow[]).

 * Purpose: Supports maintainability by documenting why `aggregateRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function aggregateRows(rows: RawPossibleActionRow[]): PossibleActionTableRow[] {
  const byKey = new Map<string, { row: Omit<PossibleActionTableRow, 'actionTypes'>; actionTypes: Set<string> }>();
  for (const row of rows) {
    const key = `${row.unitId}|${row.unitType}|${row.targetH3}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        row: {
          bucket: row.bucket,
          unitId: row.unitId,
          unitType: row.unitType,
          targetH3: row.targetH3,
          distance: row.distance,
          enemySummary: row.enemySummary,
          featuresSummary: row.featuresSummary,
          enemyUnitCount: row.enemyUnitCount,
          urbanHexCount: row.urbanHexCount,
        },
        actionTypes: new Set([row.actionType]),
      });
      continue;
    }
    existing.actionTypes.add(row.actionType);
    if (BUCKET_PRIORITY[row.bucket] < BUCKET_PRIORITY[existing.row.bucket]) {
      existing.row.bucket = row.bucket;
    }
    existing.row.enemySummary = preferredSummary(existing.row.enemySummary, row.enemySummary);
    existing.row.featuresSummary = preferredSummary(existing.row.featuresSummary, row.featuresSummary);
    existing.row.enemyUnitCount = Math.max(existing.row.enemyUnitCount, row.enemyUnitCount);
    existing.row.urbanHexCount = Math.max(existing.row.urbanHexCount, row.urbanHexCount);
  }
  const out: PossibleActionTableRow[] = [];
  for (const { row, actionTypes } of byKey.values()) {
    const sortedTypes = [...actionTypes].sort((a, b) => (ACTION_TYPE_ORDER[a] ?? 999) - (ACTION_TYPE_ORDER[b] ?? 999) || a.localeCompare(b));
    out.push({ ...row, actionTypes: sortedTypes.join(', ') });
  }
  return out;
}
/**
 * Defines the `markdownTableLines` function shape (function markdownTableLines(rows: string[][]): string[]).

 * Purpose: Supports maintainability by documenting why `markdownTableLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function markdownTableLines(rows: string[][]): string[] {
  return buildPromptTableLines(TABLE_HEADERS, rows);
}
/**
 * Defines the `compareTableRowsForUnitPriority` function shape (function compareTableRowsForUnitPriority().

 * Purpose: Supports maintainability by documenting why `compareTableRowsForUnitPriority` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function compareTableRowsForUnitPriority(
  a: PossibleActionTableRow,
  b: PossibleActionTableRow,
  latLngByH3: Map<string, [number, number]>
): number {
  if (a.enemyUnitCount !== b.enemyUnitCount) return b.enemyUnitCount - a.enemyUnitCount;
  if (a.urbanHexCount !== b.urbanHexCount) return b.urbanHexCount - a.urbanHexCount;
  if (a.distance !== b.distance) return a.distance - b.distance;
  const byAction = a.actionTypes.localeCompare(b.actionTypes);
  if (byAction !== 0) return byAction;
  const la = latLngByH3.get(a.targetH3);
  const lb = latLngByH3.get(b.targetH3);
  if (la && lb) {
    if (la[0] !== lb[0]) return la[0] - lb[0];
    if (la[1] !== lb[1]) return la[1] - lb[1];
  }
  const ca = compareHexIds(a.targetH3, b.targetH3);
  if (ca !== 0) return ca;
  return a.unitType.localeCompare(b.unitType);
}
/**
 * Defines the `selectTopRowsPerUnit` function shape (function selectTopRowsPerUnit().

 * Purpose: Supports maintainability by documenting why `selectTopRowsPerUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function selectTopRowsPerUnit(
  rows: PossibleActionTableRow[],
  latLngByH3: Map<string, [number, number]>
): PossibleActionTableRow[] {
  const byUnit = new Map<string, PossibleActionTableRow[]>();
  for (const row of rows) {
    const list = byUnit.get(row.unitId) ?? [];
    list.push(row);
    byUnit.set(row.unitId, list);
  }
  const unitIds = [...byUnit.keys()].sort((a, b) => a.localeCompare(b));
  const out: PossibleActionTableRow[] = [];
  for (const unitId of unitIds) {
    const unitRows = byUnit.get(unitId) ?? [];
    unitRows.sort((a, b) => compareTableRowsForUnitPriority(a, b, latLngByH3));
    out.push(...unitRows.slice(0, 5));
  }
  return out;
}
/**
 * Defines the `groupRowsByBucket` function shape (function groupRowsByBucket(rows: PossibleActionTableRow[]): Record<PossibleActionTableRow['bucket'], PossibleActionTableRow[]>).

 * Purpose: Supports maintainability by documenting why `groupRowsByBucket` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */

function groupRowsByBucket(rows: PossibleActionTableRow[]): Record<PossibleActionTableRow['bucket'], PossibleActionTableRow[]> {
  const grouped: Record<PossibleActionTableRow['bucket'], PossibleActionTableRow[]> = {
    homeland: [],
    nearest: [],
    other: [],
  };
  for (const row of rows) grouped[row.bucket].push(row);
  return grouped;
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
}): string {
  logDebug('possibleUnitActions buildPossibleUnitActionsMarkdown', { turnNumber: args.state.turnNumber });
  const { state, latLngByH3, formatLatLng } = args;
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
          .filter((h3) => isWithinGridRangeSafe(unit.h3Index, h3, AIR_STRIKE_RANGE_HEXES, 'possibleUnitActions air strike'))
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
      const rangedHexes = excludeUnitCurrentHex(unit.h3Index, collectRangedTargetHexes(unit.h3Index, unit.unitType, indexed));
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
