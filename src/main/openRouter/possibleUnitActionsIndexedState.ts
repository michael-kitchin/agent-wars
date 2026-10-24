/**
 * Indexed snapshot maps for possible-action collection, and the read-only lookups and cell text built from them.
 */

import { strategicParentOf } from '../../shared/h3Resolutions';

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logInfo, logTrace } from '../logger';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';

/**
 * Infrastructure counts on one world hex.
 *
 * Purpose: Answers "what can be struck or captured here" without rescanning `strategicInfrastructure`.
 * When to use: Values of `PossibleActionsIndexedState.infraByHex`, read through `getInfra`.
 * Expected outcome: Non-negative counts; a hex with no row reads as all zeros.
 * Exceptions: None.
 */
export interface InfraCounts {
  /**
   * Urban cells under the hex.
   *
   * Contract: From `urbanHexCount`; 0 when absent.
   * When to use: Strike kinds, features text, and urban ranking.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly urban: number;
  /**
   * Seaports on the hex.
   *
   * Contract: From `seaportCount`; 0 when absent.
   * When to use: Strike kinds and features text.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly seaport: number;
  /**
   * Airports on the hex.
   *
   * Contract: From `airportCount`; 0 means no intact airport.
   * When to use: Air base checks, ferry destinations, strike kinds, and features text.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly airport: number;
}

/**
 * Snapshot maps reused across possible-action collection within one AI request.
 *
 * Purpose: Best Options and the possible-actions block look up infrastructure, control, and occupancy for many hexes;
 *   building these maps once keeps each lookup constant time.
 * When to use: Build with `buildPossibleActionsIndexedState` once per request and pass it to
 *   `collectAggregatedPossibleActionRows`.
 * Expected outcome: Maps keyed by world hex, or by battle cell when the snapshot is a battle plan state.
 * Exceptions: None.
 */
export interface PossibleActionsIndexedState {
  /**
   * Infrastructure counts per hex that has a `strategicInfrastructure` row.
   *
   * Contract: Hexes without a row are absent; read through `getInfra` for zero defaults.
   * When to use: Any infrastructure lookup.
   * Expected outcome: One entry per infrastructure row.
   * Exceptions: None.
   */
  readonly infraByHex: Map<string, InfraCounts>;
  /**
   * Controlling player per hex, or `null` for uncontrolled.
   *
   * Contract: Hexes without a `strategicControl` row are absent, which callers treat as uncontrolled.
   * When to use: Ferry destination ownership and Best Options interest.
   * Expected outcome: One entry per control row.
   * Exceptions: None.
   */
  readonly controlByHex: Map<string, string | null>;
  /**
   * Seat treated as friendly for this index.
   *
   * Contract: Matches `briefingOwnSeatId` for the snapshot that built the index.
   * When to use: Enemy-control checks that must not treat another seat's land as friendly.
   * Expected outcome: That seat's id.
   * Exceptions: None.
   */
  readonly ownSeatId: string;
  /**
   * The human's units, which the AI sees as enemies, keyed by hex.
   *
   * Contract: Only units the snapshot lists, so fog has already been applied.
   * When to use: Enemy text, strike kinds, contact detection, and enemy counts.
   * Expected outcome: Every listed human unit appears under its `h3Index`.
   * Exceptions: None.
   */
  readonly enemyUnitsByHex: Map<string, Array<{ id: string; unitType: string }>>;
  /**
   * Friendly (AI) units keyed by hex so this-turn interest can drop own-occupied uncontrolled infra.
   *
   * Contract: Opponent units only; contested hexes may appear in both this map and `enemyUnitsByHex`.
   * When to use: Strategic Best Options occupancy filter.
   * Expected outcome: Every opponent unit in the snapshot appears under its `h3Index`.
   * Exceptions: None.
   */
  readonly friendlyUnitsByHex: Map<string, Array<{ id: string; unitType: string }>>;
  /**
   * Every hex the snapshot lists.
   *
   * Contract: Destinations outside this set are never offered.
   * When to use: Clipping ferry and strike disks to the known map.
   * Expected outcome: The `h3Index` of each `state.hexes` entry.
   * Exceptions: None.
   */
  readonly hexSet: Set<string>;
}

/**
 * Builds indexed control/infrastructure maps for possible-action collection.
 *
 * Purpose: Allows callers to build once per AI request and pass into `collectAggregatedPossibleActionRows`.
 * When to use: From `requestOrdersFlow` before briefing/operational-map assembly, and inside
 *   `collectAggregatedPossibleActionRows` when no prebuilt state is passed.
 * Expected outcome: One pass over infrastructure, control, units, and hexes. The briefing seat's units are friendly;
 *   every other owner, including Neutral, is an enemy.
 * Exceptions: None.
 */
export function buildPossibleActionsIndexedState(state: GameStateSnapshot): PossibleActionsIndexedState {
  const infraByHex = new Map<string, InfraCounts>();
  for (const row of state.strategicInfrastructure ?? []) {
    infraByHex.set(row.h3Index, {
      urban: Number(row.urbanHexCount ?? 0),
      seaport: Number(row.seaportCount ?? 0),
      airport: Number(row.airportCount ?? 0),
    });
  }
  const controlByHex = new Map<string, string | null>();
  for (const row of state.strategicControl ?? []) {
    controlByHex.set(row.h3Index, row.controllerPlayerId ?? null);
  }
  const ownSeatId = briefingOwnSeatId(state);
  const enemyUnitsByHex = new Map<string, Array<{ id: string; unitType: string }>>();
  const friendlyUnitsByHex = new Map<string, Array<{ id: string; unitType: string }>>();
  for (const unit of state.units) {
    const bucket = unit.player === ownSeatId ? friendlyUnitsByHex : enemyUnitsByHex;
    const list = bucket.get(unit.h3Index) ?? [];
    list.push({ id: unit.id, unitType: unit.unitType });
    bucket.set(unit.h3Index, list);
  }
  logDebug('possibleUnitActions buildPossibleActionsIndexedState', {
    turnNumber: state.turnNumber,
    ownSeatId,
    enemyOccupiedHexCount: enemyUnitsByHex.size,
    friendlyOccupiedHexCount: friendlyUnitsByHex.size,
  });
  return {
    infraByHex,
    controlByHex,
    ownSeatId,
    enemyUnitsByHex,
    friendlyUnitsByHex,
    hexSet: new Set(state.hexes.map((h) => h.h3Index)),
  };
}

/**
 * Returns the infrastructure counts on one hex.
 *
 * Purpose: Single zero-default lookup so callers never branch on a missing row.
 * When to use: Every infrastructure read in possible-action collection.
 * Expected outcome: The indexed counts, or all zeros when the hex has no row.
 * Exceptions: None.
 */
export function getInfra(indexed: PossibleActionsIndexedState, h3: string): InfraCounts {
  logTrace('possibleUnitActions getInfra', h3);
  return indexed.infraByHex.get(h3) ?? { urban: 0, seaport: 0, airport: 0 };
}

/**
 * Summarizes the enemy units on one hex by type.
 *
 * Purpose: Fills the enemy column of possible-action rows.
 * When to use: Through `enemyCell`, or directly when `null` must mean "no enemies".
 * Expected outcome: Text such as `1 armor, 2 infantry`, types in alphabetical order, or `null` when the hex is empty.
 * Exceptions: None.
 */
export function describeEnemyUnitsAtHex(indexed: PossibleActionsIndexedState, h3: string): string | null {
  logTrace('possibleUnitActions describeEnemyUnitsAtHex', h3);
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
 * Describes a hex's infrastructure counts in words.
 *
 * Purpose: Shared text for the features column of move and strike rows.
 * When to use: `featuresCellForHex` and `featuresCellForStrike`.
 * Expected outcome: Text such as `2 urban hexes, 1 airport`, in urban, seaport, airport order with plurals, or `null`
 *   when every count is 0.
 * Exceptions: None.
 */
export function describeInfrastructure(inf: InfraCounts): string | null {
  logTrace('possibleUnitActions describeInfrastructure', inf);
  const parts: string[] = [];
  if (inf.urban > 0) parts.push(`${inf.urban} urban hex${inf.urban === 1 ? '' : 'es'}`);
  if (inf.seaport > 0) parts.push(`${inf.seaport} seaport${inf.seaport === 1 ? '' : 's'}`);
  if (inf.airport > 0) parts.push(`${inf.airport} airport${inf.airport === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

/**
 * Lists what an air strike could hit on one hex.
 *
 * Purpose: Strategic air strike rows are offered only where something can be struck, and the features column names it.
 * When to use: Filtering strategic strike disks and building strike row text.
 * Expected outcome: Any of `enemy units`, `urban`, `airport`, and `seaport`, in that order; empty when nothing is there.
 * Exceptions: None.
 */
export function strikeKindsForHex(indexed: PossibleActionsIndexedState, targetH3: string): string[] {
  logTrace('possibleUnitActions strikeKindsForHex', targetH3);
  const kinds: string[] = [];
  if ((indexed.enemyUnitsByHex.get(targetH3)?.length ?? 0) > 0) kinds.push('enemy units');
  const inf = getInfra(indexed, targetH3);
  if (inf.urban > 0) kinds.push('urban');
  if (inf.airport > 0) kinds.push('airport');
  if (inf.seaport > 0) kinds.push('seaport');
  return kinds;
}

/**
 * Builds the features column for an air strike row.
 *
 * Purpose: Tells the model both what is on the hex and what the strike could hit.
 * When to use: Strike rows in `appendRowsForLegalHexes`.
 * Expected outcome: `<infrastructure>; strike: <kinds>`, either part alone when the other is empty, or `—`.
 * Exceptions: None.
 */
export function featuresCellForStrike(indexed: PossibleActionsIndexedState, h3: string): string {
  logTrace('possibleUnitActions featuresCellForStrike', h3);
  const inf = describeInfrastructure(getInfra(indexed, h3));
  const kinds = strikeKindsForHex(indexed, h3);
  const strikePart = kinds.length > 0 ? `strike: ${kinds.join(', ')}` : '';
  if (inf && strikePart) return `${inf}; ${strikePart}`;
  if (strikePart) return strikePart;
  if (inf) return inf;
  return '—';
}

/**
 * Builds the features column for a strategic move or ranged row.
 *
 * Purpose: Names the infrastructure a move would reach.
 * When to use: Non-strike rows outside a battle.
 * Expected outcome: The infrastructure text, or `—` when the hex has none.
 * Exceptions: None.
 */
export function featuresCellForHex(indexed: PossibleActionsIndexedState, h3: string): string {
  logTrace('possibleUnitActions featuresCellForHex', h3);
  return describeInfrastructure(getInfra(indexed, h3)) ?? '—';
}

/**
 * Builds the enemy column for a possible-action row.
 *
 * Purpose: Table cells need a placeholder rather than an empty string.
 * When to use: Rows without an explicit enemy summary override.
 * Expected outcome: The `describeEnemyUnitsAtHex` text, or `—` when there are no enemies.
 * Exceptions: None.
 */
export function enemyCell(indexed: PossibleActionsIndexedState, h3: string): string {
  logTrace('possibleUnitActions enemyCell', h3);
  return describeEnemyUnitsAtHex(indexed, h3) ?? '—';
}

/**
 * True when an air unit's strategic base hex has an intact airport.
 *
 * Purpose: Strategic strikes and ferries need an intact airport at the base, as order validation requires.
 * When to use: Strategic air rows and ferry destination collection.
 * Expected outcome: `true` when the hex's airport count is above 0.
 * Exceptions: None.
 */
export function airBaseHasIntactAirport(indexed: PossibleActionsIndexedState, airH3: string): boolean {
  logTrace('possibleUnitActions airBaseHasIntactAirport', airH3);
  return getInfra(indexed, airH3).airport > 0;
}

/**
 * True when the air unit's parent strategic hex still has an airport in the plan-state snapshot.
 *
 * Purpose: Tactical strike validation keys airport presence on `strategicParentOf(unit.h3Index)`, not the tactical cell the
 *   aircraft occupies. Best Options must use the same gate so the tempo rule does not list a strike the engine will
 *   reject.
 * When to use: Tactical branch of air-strike row collection in `collectAggregatedPossibleActionRows`.
 * Expected outcome: `true` when snapshot infra for the parent strategic has `airport > 0`; `false` when parent lookup fails
 *   or the airport is gone.
 * Exceptions: Returns false and logs at info level if `cellToParent` throws.
 */
export function tacticalParentAirportIntact(indexed: PossibleActionsIndexedState, airH3: string): boolean {
  logTrace('possibleUnitActions tacticalParentAirportIntact', airH3);
  try {
    return getInfra(indexed, strategicParentOf(airH3)).airport > 0;
  } catch (err) {
    logInfo('possibleUnitActions tacticalParentAirportIntact: cellToParent failed, treating airport as gone', { airH3, err });
    return false;
  }
}
