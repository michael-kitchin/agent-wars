/**
 * Suggested missions for units the AI has left without a standing order.
 *
 * Purpose: The Standing Order Status "units without orders" table used to name only the unit and its type, so the model
 * had to join it against Unit Status and Best Options by id across a very large prompt to find anywhere to send the unit.
 * Weaker models skipped that join and marched units to their own hex, which is dropped as already-arrived — leaving the
 * unit orderless again next turn, permanently idle. Putting a legal mission beside the question breaks that loop.
 * When an enemy is visible the mission is still a one-step march that closes on that enemy. When none is visible, a
 * ground unit is pointed at the enemy home region and an air unit that can strike is told to defend where it sits.
 * When to use: Strategic `getInjectionText` and the strategic briefing, for the ids being listed as having no standing order.
 * Expected outcome: A march or defend suggestion per unit that should be ordered, never a march to the unit's current hex.
 * Units with nowhere useful to go are absent from the map so the caller can render an em dash.
 * Exceptions: None; this is advisory briefing content and never constrains what the model may actually order.
 */

import { cellToLatLng } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { collectAggregatedPossibleActionRows } from '../openRouter/possibleUnitActions';
import { formatLatLng } from '../openRouter/promptText';
import {
  landUnitCanOccupyHex,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type LandMassByH3,
  type StrategicLandMassRecord,
} from '../../shared/landTraversalStrategic';
import { logDebug, logTrace } from '../logger';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { terrainIsPassableForDomain } from '../pathfinding';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import {
  gridHopDistanceBetween,
  pickApproachHexesTowardNearestEnemy,
} from './assessUnitProximity';
import {
  ACTION_AIR_STRIKES,
  ACTION_APPROACH,
  ACTION_MOVES_MELEE,
} from '../openRouter/possibleUnitActionsTableAssembly';
import { canAssignStandingOrderType } from './standingOrdersShared';
import { stayPutFriendlyOccupiedHexes, readStandingThisPeriodMoves } from './stayPutFriendlyOccupancy';

/** Action labels that count as a one-step move the model can copy this turn. */
const ONE_STEP_MOVE_LABELS = new Set<string>([ACTION_APPROACH, ACTION_MOVES_MELEE]);

/**
 * Stand-in land-mass map for a naval blind march.
 *
 * Purpose: Naval passability is read from snapshot terrain, not continent ids. Keeping an empty map here lets a
 * ship skip `getStrategicLandMassByH3` when no land unit on the same call needs it.
 * When to use: Only as the land-mass argument for a naval unit inside `suggestApproachDestinationsForOrderlessUnits`.
 * Expected outcome: Lookups miss, and the naval branch returns before it would read a record.
 * Exceptions: None.
 */
const EMPTY_LAND_MASS: LandMassByH3 = new Map();

/**
 * Unit ids from one Best Options pass that change what an orderless unit should be told.
 *
 * Purpose: The orderless table and Unit Status both need the same air-strike and one-step-move sets, and those sets
 * must come from a single row collection rather than a second search per unit.
 * When to use: The value of `orderlessMissionSignalsFromActionRows`.
 * Expected outcome: `airStrikeUnitIds` names units with an air strike row. `oneStepMoveUnitIds` names units with an
 * approach or move/melee row.
 * Exceptions: None.
 */
export interface OrderlessMissionActionSignals {
  /** Units that can strike this turn, so an orderless air unit can be told to defend. */
  airStrikeUnitIds: ReadonlySet<string>;
  /** Units with a this-turn approach or move/melee row, so Action needed can count that step. */
  oneStepMoveUnitIds: ReadonlySet<string>;
}

/**
 * Splits one Best Options row list into the unit-id sets the orderless mission uses.
 *
 * Purpose: `getInjectionText` and `formatBriefing` each collect rows once. This reads that list so neither caller
 * walks it with its own label rules.
 * When to use: Immediately after `collectAggregatedPossibleActionRows` with `forThisTurnOptionsTable: true`.
 * Expected outcome: The two id sets. A unit in both is present in both. An empty row list yields two empty sets.
 * Exceptions: None.
 */
export function orderlessMissionSignalsFromActionRows(
  rows: readonly { unitId: string; actionTypes: string }[]
): OrderlessMissionActionSignals {
  const airStrikeUnitIds = new Set<string>();
  const oneStepMoveUnitIds = new Set<string>();
  for (const row of rows) {
    const labels = row.actionTypes.split(',').map((part) => part.trim());
    if (labels.includes(ACTION_AIR_STRIKES)) airStrikeUnitIds.add(row.unitId);
    if (labels.some((label) => ONE_STEP_MOVE_LABELS.has(label))) oneStepMoveUnitIds.add(row.unitId);
  }
  logTrace('orderlessUnitSuggestions orderlessMissionSignalsFromActionRows', {
    rowCount: rows.length,
    airStrikeCount: airStrikeUnitIds.size,
    oneStepMoveCount: oneStepMoveUnitIds.size,
  });
  return { airStrikeUnitIds, oneStepMoveUnitIds };
}

/**
 * The id sets Unit Status and Attention Flags need for orderless units.
 *
 * Purpose: A suggestion and a this-turn move are different reasons to mark Action needed, and the briefing must not
 * treat a bare neighbor step as either one.
 * When to use: The optional argument on `buildUnitStatusTable` and `buildAttentionFlags`.
 * Expected outcome: `suggestedUnitIds` are units with a march or defend mission. `oneStepMoveUnitIds` are units with
 * an approach or move/melee row.
 * Exceptions: None.
 */
export interface OrderlessActionNeededSets {
  /** Units `suggestApproachDestinationsForOrderlessUnits` returned a mission for. */
  suggestedUnitIds: ReadonlySet<string>;
  /** Units with a Best Options approach or move/melee row this turn. */
  oneStepMoveUnitIds: ReadonlySet<string>;
}

/**
 * Collects one turn's orderless missions and the Best Options rows that feed them.
 *
 * Purpose: The orderless table and Unit Status must read the same air-strike and move rows. Calling the row collector
 * once here keeps those surfaces from drifting and keeps the search off the per-unit path.
 * When to use: Once from strategic `getInjectionText` and once from strategic `formatBriefing`, for the ids that have
 * no standing order. Do not call it from `needsAction`.
 * Expected outcome: The suggestion map plus the one-step move ids. Air units appear in the map only when they have an
 * air strike row. An empty id list still scans rows, so a move id for a unit that was not requested can still be returned.
 * Exceptions: Throws when Best Options row collection throws, or when a blind land march cannot load the terrain cache.
 * A unit that cannot be scored is simply absent from the suggestion map.
 */
export function collectOrderlessMissionContext(args: {
  playerId: string;
  state: GameStateSnapshot;
  orderlessUnitIds: readonly string[];
  latLngByH3?: ReadonlyMap<string, [number, number]>;
  thisPeriodMoveByUnitId?: ReadonlyMap<string, string>;
}): { suggestions: ReadonlyMap<string, OrderlessMissionSuggestion> } & OrderlessActionNeededSets {
  const latLngByH3 = args.latLngByH3 ?? latLngForState(args.state);
  const signals = orderlessMissionSignalsFromActionRows(
    collectAggregatedPossibleActionRows({
      state: args.state,
      latLngByH3: new Map(latLngByH3),
      formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
      forThisTurnOptionsTable: true,
    })
  );
  const suggestions = suggestApproachDestinationsForOrderlessUnits(
    args.playerId,
    args.state,
    args.orderlessUnitIds,
    args.thisPeriodMoveByUnitId,
    signals.airStrikeUnitIds
  );
  logDebug('orderlessUnitSuggestions collectOrderlessMissionContext', {
    playerId: args.playerId,
    turnNumber: args.state.turnNumber,
    orderlessCount: args.orderlessUnitIds.length,
    suggestedCount: suggestions.size,
    oneStepMoveCount: signals.oneStepMoveUnitIds.size,
  });
  return {
    suggestions,
    suggestedUnitIds: new Set(suggestions.keys()),
    oneStepMoveUnitIds: signals.oneStepMoveUnitIds,
  };
}

/**
 * Builds a lat/lng map for every hex on the snapshot.
 *
 * Purpose: Best Options rows need centers, and both briefing callers would otherwise build the same map.
 * When to use: When the caller has not already built `latLngByH3`.
 * Expected outcome: One entry per `state.hexes` row.
 * Exceptions: None.
 */
function latLngForState(state: GameStateSnapshot): Map<string, [number, number]> {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const hex of state.hexes) {
    latLngByH3.set(hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]);
  }
  return latLngByH3;
}

/**
 * Reports whether an orderless unit should read Action needed for a mission rather than a threat.
 *
 * Purpose: A blind march, a legal shot, or a listed one-step move is work even when no enemy is close enough to be a
 * threat. A healthy standing order is not, and a neighbor step that Best Options did not list is not.
 * When to use: Unit Status and the mission attention bullet, after the suggestion map and Best Options rows exist.
 * Do not call the collectors from here.
 * Expected outcome: True only for a strategic orderless unit, with standing orders active, that has a suggestion, a
 * legal attack, or an approach or move/melee row. False for tactical rows and for units that already have an order.
 * Exceptions: None.
 */
export function orderlessUnitNeedsMission(args: {
  strategic: boolean;
  standingOrdersActive: boolean;
  hasStandingOrder: boolean;
  hasLegalAttack: boolean;
  unitId: string;
  suggestedUnitIds: ReadonlySet<string>;
  oneStepMoveUnitIds: ReadonlySet<string>;
}): boolean {
  const needed =
    args.strategic &&
    args.standingOrdersActive &&
    !args.hasStandingOrder &&
    (args.suggestedUnitIds.has(args.unitId) ||
      args.hasLegalAttack ||
      args.oneStepMoveUnitIds.has(args.unitId));
  logTrace('orderlessUnitSuggestions orderlessUnitNeedsMission', {
    unitId: args.unitId,
    needed,
  });
  return needed;
}

/**
 * Writes the one Attention Flags sentence for orderless missions.
 *
 * Purpose: Threat bullets name enemies. This sentence names the work of assigning a mission, without listing ids or
 * claiming that every counted unit has a suggested hex.
 * When to use: When the count is at least one and standing orders are active. It replaces `None.` when it is the only bullet.
 * Expected outcome: The count, plus the instruction to assign a named Suggested Destination and to copy a listed move or strike.
 * Exceptions: None.
 */
export function orderlessMissionAttentionText(count: number): string {
  logTrace('orderlessUnitSuggestions orderlessMissionAttentionText', { count });
  return (
    `${count} unit(s) have no standing order and can take a mission this turn. ` +
    'Assign the Suggested Destination when that cell names one, and copy a Best Options move or strike when the table lists that unit.'
  );
}

/**
 * One cell the orderless table can turn into an `assign_order` without further search.
 *
 * Purpose: A bare hex and a defend order are different orders, and the renderer must not guess which one a string is.
 * When to use: As the value of `suggestApproachDestinationsForOrderlessUnits`.
 * Expected outcome: `march` names a hex other than the unit's own. `defend` names the air unit's current hex.
 * Exceptions: None.
 */
export interface OrderlessMissionSuggestion {
  /** `assign_order` type the cell is asking for. March is a ground unit; defend is an air unit that can strike. */
  orderType: 'march' | 'defend';
  /** H3 the order should name. Never the unit's own hex when `orderType` is `march`. */
  destinationH3: string;
}

/**
 * Collects enemy-occupied hexes from the same snapshot Best Options reads.
 *
 * Purpose: Suggestions must be drawn from the identical enemy set Best Options uses, or the briefing would recommend a
 * hex that the Best Options table does not list as legal and the model would rightly distrust both.
 * When to use: Once per `suggestApproachDestinationsForOrderlessUnits` call, before the per-unit scan.
 * Expected outcome: Hexes holding at least one unit not owned by `playerId`.
 * Exceptions: None.
 */
function enemyOccupiedHexes(state: GameStateSnapshot, playerId: string): ReadonlySet<string> {
  const occupied = new Set<string>();
  for (const unit of state.units) {
    if (unit.player !== playerId) occupied.add(unit.h3Index);
  }
  return occupied;
}

/**
 * Chooses the single closing destination to show for one unit.
 *
 * Purpose: Best Options lists every closing hex, but a suggestion column has room for one, so this ranks one pool
 * (unit-to-dest hop, then hex id). Callers try enemy-occupied dests before unoccupied approach dests.
 * When to use: Per orderless unit, once for the contact pool and again for the approach pool when contact does not close.
 * Expected outcome: The closest closing dest in that pool; null when no candidate in the pool strictly closes.
 * Exceptions: None.
 */
function bestClosingDestination(
  unitH3: string,
  candidates: readonly string[],
  enemyOccupiedH3: ReadonlySet<string>
): string | null {
  const closing = pickApproachHexesTowardNearestEnemy(unitH3, candidates, enemyOccupiedH3);
  if (closing.length === 0) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const h3 of closing) {
    const distance = gridHopDistanceBetween(unitH3, h3);
    if (distance === null) continue;
    if (distance < bestDistance || (distance === bestDistance && best !== null && h3 < best)) {
      best = h3;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Reports whether two land-mass records can appear on the same land route.
 *
 * Purpose: `assignOrder` rejects a march when `plan_route` cannot reach the hex, and a nearer home hex on another
 * landmass is a march the engine will drop. Sharing a continent id or an island id is the same overlap that route
 * edges require, without walking the path.
 * When to use: Before offering a land or armor unit a home-region hex.
 * Expected outcome: True when the records share at least one continent id or one island id.
 * Exceptions: None.
 */
function sharesLandMassId(origin: StrategicLandMassRecord, candidate: StrategicLandMassRecord): boolean {
  const originContinents = new Set(origin.continentIds);
  const originIslands = new Set(origin.islandIds);
  return (
    candidate.continentIds.some((id) => originContinents.has(id)) ||
    candidate.islandIds.some((id) => originIslands.has(id))
  );
}

/**
 * Decides whether a home-region hex is a legal blind march for this unit.
 *
 * Purpose: The home-region list mixes inland, coastal, and foreign-landmass cells. A naval unit can only be sent to
 * water or coastal terrain. A land unit can only be sent to a hex on this snapshot that shares a landmass and is dry
 * enough for the last step of a land route; `assignOrder` drops the march when `plan_route` cannot enter that hex.
 * When to use: Once per home hex while choosing a blind march.
 * Expected outcome: True when the hex is on the snapshot and passable for the unit. Land and armor also require a
 * shared continent or island id and a water fraction below `STRATEGIC_LAND_MAX_WATER_PCT`.
 * Exceptions: None.
 */
function blindHomeHexIsPassable(
  unitType: string,
  h3: string,
  originRecord: StrategicLandMassRecord | undefined,
  terrainByH3: ReadonlyMap<string, string>,
  landMass: LandMassByH3
): boolean {
  if (!terrainByH3.has(h3)) return false;
  if (unitType === 'naval') return terrainIsPassableForDomain(terrainByH3.get(h3), 'water');
  if (!originRecord) return false;
  if (!landUnitCanOccupyHex(h3, landMass)) return false;
  const candidate = landMass.get(h3);
  if (!candidate || !sharesLandMassId(originRecord, candidate)) return false;
  return candidate.waterPct < STRATEGIC_LAND_MAX_WATER_PCT;
}

/**
 * Picks the enemy-home hex a ground unit should march toward when no enemy unit is visible.
 *
 * Purpose: An orderless unit with an em dash stays idle, and the model then invents one-step moves that do not persist.
 * The enemy home region is a standing goal that survives the turn. Once the unit is already inside that region, the
 * remaining goal is the nearest home hex this player has not explored.
 * When to use: Only after the caller has confirmed the visible enemy set is empty and the unit can march.
 * Expected outcome: The nearest passable home hex, or null when the list is empty or nothing in it is usable. Never the
 * unit's current hex. Distance ties break by ascending H3.
 * Exceptions: None. A null hop distance skips that hex rather than guessing.
 */
function nearestEnemyHomeMarchHex(args: {
  unitH3: string;
  unitType: string;
  homeHexes: readonly string[];
  explored: ReadonlySet<string>;
  terrainByH3: ReadonlyMap<string, string>;
  landMass: LandMassByH3;
}): string | null {
  if (args.homeHexes.length === 0) return null;
  const originRecord = args.unitType === 'naval' ? undefined : args.landMass.get(args.unitH3);
  if (args.unitType !== 'naval' && !originRecord) return null;
  const homeSet = new Set(args.homeHexes);
  const insideHome = homeSet.has(args.unitH3);
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const h3 of args.homeHexes) {
    if (h3 === args.unitH3) continue;
    if (insideHome && args.explored.has(h3)) continue;
    if (!blindHomeHexIsPassable(args.unitType, h3, originRecord, args.terrainByH3, args.landMass)) continue;
    const distance = gridHopDistanceBetween(args.unitH3, h3);
    if (distance === null) continue;
    if (distance < bestDistance || (distance === bestDistance && (best === null || h3 < best))) {
      best = h3;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Maps each orderless unit to one mission: a closing march, a home-region march, or defend for a striking air unit.
 *
 * Purpose: Gives the Standing Order Status table something concrete to offer for every unit it asks the model to order,
 * including the turns when no enemy unit has been seen yet.
 * When to use: Strategic briefing assembly, passing only the ids being listed as orderless. This runs a destination
 * search per distinct unit, so do not call it for the whole roster. Pass `airStrikeUnitIds` when this turn's Best
 * Options rows are already in hand; omit it to leave every air unit out.
 * Expected outcome: `unitId -> mission`. When any enemy is visible, a closing one-step march, enemy-occupied preferred,
 * and no home-region substitute when that step is missing. When no enemy is visible, a march toward the enemy home
 * region, or defend on the current hex for an air unit in `airStrikeUnitIds`. Omitted when the unit is missing, cannot
 * take the mission, or has no legal hex. A march is never the unit's own hex.
 * Exceptions: A unit that cannot be scored is omitted. Loading the terrain cache for a blind land march throws if that
 * cache cannot be built.
 */
export function suggestApproachDestinationsForOrderlessUnits(
  playerId: string,
  state: GameStateSnapshot,
  unitIds: readonly string[],
  thisPeriodMoveByUnitId?: ReadonlyMap<string, string>,
  airStrikeUnitIds?: ReadonlySet<string>
): ReadonlyMap<string, OrderlessMissionSuggestion> {
  const suggestions = new Map<string, OrderlessMissionSuggestion>();
  if (unitIds.length === 0) {
    logDebug('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits', {
      playerId,
      turnNumber: state.turnNumber,
      requestedCount: 0,
      suggestedCount: 0,
    });
    return suggestions;
  }
  const enemyOccupiedH3 = enemyOccupiedHexes(state, playerId);
  const stayPut = stayPutFriendlyOccupiedHexes(
    state.units.filter((u) => u.player === playerId).map((u) => ({ id: u.id, h3Index: u.h3Index })),
    thisPeriodMoveByUnitId ?? readStandingThisPeriodMoves(playerId)
  );
  const unitsById = new Map(state.units.map((u) => [u.id, u]));
  const homeHexes = state.humanHomeRegionHexes ?? [];
  const explored = new Set(state.exploredHexes ?? []);
  const terrainByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, hex.terrain]));
  // Contact marches do not read land mass. Load it only for a blind land or armor march, so a contact turn does not
  // depend on the terrain cache and a naval-only blind turn does not either.
  let landMass: LandMassByH3 | undefined;
  const landMassForBlindMarch = (unitType: string): LandMassByH3 => {
    if (unitType !== 'naval' && landMass === undefined) landMass = getStrategicLandMassByH3();
    return landMass ?? EMPTY_LAND_MASS;
  };
  const enemyVisible = enemyOccupiedH3.size > 0;
  for (const unitId of unitIds) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;
    let suggestion: OrderlessMissionSuggestion | null = null;
    if (!canAssignStandingOrderType(unit.unitType, 'march')) {
      if (airStrikeUnitIds?.has(unitId)) {
        suggestion = { orderType: 'defend', destinationH3: unit.h3Index };
      }
    } else if (enemyVisible) {
      const legal = getValidDestinations(unit, state).filter((h3) => h3 !== unit.h3Index);
      const contact = legal.filter((h3) => enemyOccupiedH3.has(h3));
      const approach = legal.filter((h3) => !enemyOccupiedH3.has(h3) && !stayPut.has(h3));
      const destination =
        bestClosingDestination(unit.h3Index, contact, enemyOccupiedH3) ??
        bestClosingDestination(unit.h3Index, approach, enemyOccupiedH3);
      if (destination !== null) suggestion = { orderType: 'march', destinationH3: destination };
    } else {
      const destination = nearestEnemyHomeMarchHex({
        unitH3: unit.h3Index,
        unitType: unit.unitType,
        homeHexes,
        explored,
        terrainByH3,
        landMass: landMassForBlindMarch(unit.unitType),
      });
      if (destination !== null) suggestion = { orderType: 'march', destinationH3: destination };
    }
    if (suggestion !== null) suggestions.set(unitId, suggestion);
    logTrace('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits: unit', {
      unitId,
      unitType: unit.unitType,
      originH3: unit.h3Index,
      orderType: suggestion?.orderType ?? null,
      destination: suggestion?.destinationH3 ?? null,
      enemyVisible,
    });
  }
  logDebug('orderlessUnitSuggestions suggestApproachDestinationsForOrderlessUnits', {
    playerId,
    turnNumber: state.turnNumber,
    requestedCount: unitIds.length,
    enemyOccupiedCount: enemyOccupiedH3.size,
    stayPutCount: stayPut.size,
    homeHexCount: homeHexes.length,
    airStrikeCount: airStrikeUnitIds?.size ?? 0,
    suggestedCount: suggestions.size,
  });
  return suggestions;
}
