/**
 * Chooses the air drops a seat could start.
 *
 * Purpose: The turn advance and the menu share one search for an empty enemy city an air unit can reach.
 * When to use: When the seat still has a free air slot. Pass terrain built from the full unit list.
 * Expected outcome: At most `OPERATION_MENU_AIR_ROWS` rows for one air unit, or the one named city. Empty when no pair exists.
 * Exceptions: None. A missing path is a skipped city, not a throw.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { AIRLIFT_INFANTRY_CAPACITY } from '../../shared/carrierCargoRules';
import { findReachableAirportFerryDestinations } from '../../shared/airportFerryRoute';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { getLandStepDistances, landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { LIFT_OBJECTIVE_CLEAR_RADIUS, rankLiftCities } from './liftRules';
import type { LiftTerrain } from './liftTerrain';
import { OPERATION_MENU_AIR_ROWS, OPERATION_MUSTER_MAX_LAND_STEPS } from './operationRules';
import { listKnownEnemyCities } from './seaOperationCandidates';

type UnitRow = GameStateSnapshot['units'][number];

/**
 * Orders two ids by their raw string order.
 *
 * Purpose: `localeCompare` follows the machine locale and can reorder ids between runs.
 * When to use: Unit ids and hex ids in this file.
 * Expected outcome: Negative when `left` is first, positive when `right` is first, zero when equal.
 * Exceptions: None.
 */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Enemy ground units that could arrive after the drop and are not already within the clear radius.
 *
 * Purpose: The menu's risk column uses the same count a sea row uses.
 * When to use: Once per kept city.
 * Expected outcome: Infantry and armor of other sides inside `etaTurns` and outside the clear radius.
 * Exceptions: None.
 */
function countReinforcers(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly cityH3: string;
  readonly etaTurns: number;
}): number {
  let count = 0;
  for (const unit of args.state.units) {
    if (unit.player === args.seatId) continue;
    if (unit.unitType !== 'infantry' && unit.unitType !== 'armor') continue;
    if (!isWithinGridRangePure(args.cityH3, unit.h3Index, args.etaTurns)) continue;
    if (isWithinGridRangePure(args.cityH3, unit.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS)) continue;
    count += 1;
  }
  return count;
}

/**
 * Airports the seat controls that this air unit can use as a drop base.
 *
 * Purpose: The drop is legal only from an airport the air unit is on or can ferry to.
 * When to use: Once per free air unit.
 * Expected outcome: The unit's own controlled airport, plus every reachable controlled airport. Enemy airports are not included.
 * Exceptions: None.
 */
function launchAirports(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly air: UnitRow;
}): readonly string[] {
  const control = new Map((args.state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const controlled = (args.state.strategicInfrastructure ?? []).filter(
    (row) => (row.airportCount ?? 0) > 0 && control.get(row.h3Index) === args.seatId
  );
  const nodes = controlled.map((row) => ({
    h3Index: row.h3Index,
    owner: args.seatId,
    intact: true,
    neutralBorder: isNeutralBorderHex(row.h3Index),
  }));
  const reachable = findReachableAirportFerryDestinations({
    originH3Index: args.air.h3Index,
    owner: args.seatId,
    nodes,
    gridDistance: computeGridDistancePure,
    unmeasuredHopWithinRange: isWithinGridRangePure,
    hopRangeHexes: (destinationH3Index) => strategicFerryRangeOnState(args.air, destinationH3Index, args.state),
  });
  const airports = new Set<string>(reachable);
  const ownCount = (args.state.strategicInfrastructure ?? []).find((row) => row.h3Index === args.air.h3Index)?.airportCount ?? 0;
  if (control.get(args.air.h3Index) === args.seatId && ownCount > 0) airports.add(args.air.h3Index);
  return [...airports];
}

/**
 * The airport a drop on this city would launch from.
 *
 * Purpose: The air unit's own hex wins when the city is already in drop range.
 * When to use: Once per city that passed the empty-city checks.
 * Expected outcome: The own hex, or the in-range airport with the lowest id. Null when none is in range.
 * Exceptions: None.
 */
function launchAirportForCity(airH3: string, airports: readonly string[], cityH3: string): string | null {
  if (airports.includes(airH3) && isWithinGridRangePure(airH3, cityH3, AIR_STRIKE_RANGE_HEXES)) return airH3;
  const inRange = airports
    .filter((airport) => isWithinGridRangePure(airport, cityH3, AIR_STRIKE_RANGE_HEXES))
    .sort(compareIds);
  return inRange[0] ?? null;
}

/**
 * Lists the air drops this seat could launch.
 *
 * Purpose: One search produces the engine's launch and the air rows of the commander's menu.
 * When to use: When an air slot is free. Pass `onlyObjectiveH3` to test one named city and no others.
 * Expected outcome: Rows for the first air unit that has both an infantry unit and a city, at most `OPERATION_MENU_AIR_ROWS`. Empty when none do. `clear` is true on every row.
 * Exceptions: None.
 */
export function listAirOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly active: readonly Operation[];
  readonly protectedUnitIds: ReadonlySet<string>;
  readonly onlyObjectiveH3?: string;
}): OperationCandidate[] {
  const finish = (candidates: readonly OperationCandidate[]): OperationCandidate[] => {
    logDebug('airOperationCandidates listAirOperationCandidates', {
      seatId: args.seatId,
      candidateCount: candidates.length,
    });
    return [...candidates];
  };
  const busy = new Set<string>();
  for (const operation of args.active) {
    for (const unitId of operation.unitIds) busy.add(unitId);
    for (const carrierId of operation.carrierIds) busy.add(carrierId);
  }
  const control = new Map((args.state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const airportCount = new Map((args.state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.airportCount ?? 0]));
  const own = args.state.units.filter((unit) => unit.player === args.seatId);
  const freeAir = own
    .filter(
      (unit) =>
        unit.unitType === 'air' &&
        !busy.has(unit.id) &&
        !args.state.units.some((cargo) => cargo.embarkedOnCarrierUnitId === unit.id) &&
        control.get(unit.h3Index) === args.seatId &&
        (airportCount.get(unit.h3Index) ?? 0) > 0
    )
    .sort((left, right) => compareIds(left.id, right.id));
  if (freeAir.length === 0 || AIRLIFT_INFANTRY_CAPACITY < 1) return finish([]);
  const ranked = rankLiftCities(listKnownEnemyCities(args.state, args.seatId));
  const cities = args.onlyObjectiveH3 === undefined
    ? ranked
    : ranked.filter((city) => city.h3Index === args.onlyObjectiveH3);
  const hexSet = new Set(args.state.hexes.map((hex) => hex.h3Index));
  for (const air of freeAir) {
    const steps = getLandStepDistances({
      originH3s: [air.h3Index],
      hexSet,
      data: args.landMass,
      maxDepth: OPERATION_MUSTER_MAX_LAND_STEPS,
    });
    const infantry = own
      .filter(
        (unit) =>
          unit.unitType === 'infantry' &&
          !unit.embarkedOnCarrierUnitId &&
          !busy.has(unit.id) &&
          !args.protectedUnitIds.has(unit.id) &&
          steps.has(unit.h3Index)
      )
      .sort((left, right) => {
        const stepDelta = (steps.get(left.h3Index) ?? 0) - (steps.get(right.h3Index) ?? 0);
        if (stepDelta !== 0) return stepDelta;
        return compareIds(left.id, right.id);
      })
      .slice(0, AIRLIFT_INFANTRY_CAPACITY);
    const chosen = infantry[0];
    if (chosen === undefined) continue;
    const airports = launchAirports({ state: args.state, seatId: args.seatId, air });
    const kept: OperationCandidate[] = [];
    for (const city of cities) {
      if (args.onlyObjectiveH3 === undefined && kept.length >= OPERATION_MENU_AIR_ROWS) break;
      if (city.h3Index === air.h3Index) continue;
      if (args.terrain.enemyUnitsWithin(city.h3Index, 0) > 0) continue;
      if (city.knownFortifiedCount > 0) continue;
      if (!landUnitCanOccupyHex(city.h3Index, args.landMass)) continue;
      const landingH3 = launchAirportForCity(air.h3Index, airports, city.h3Index);
      if (landingH3 === null) continue;
      const infantrySteps = steps.get(chosen.h3Index) ?? 0;
      const etaTurns = infantrySteps + 1 + (landingH3 === air.h3Index ? 0 : 1);
      const defenders = args.terrain.enemyUnitsWithin(city.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS);
      kept.push({
        method: 'air',
        objectiveH3: city.h3Index,
        musterH3: air.h3Index,
        landingH3,
        unitIds: [chosen.id],
        carrierIds: [air.id],
        etaTurns,
        urbanHexCount: city.urbanHexCount,
        inEnemyHome: city.inEnemyHome,
        knownFortifiedCount: city.knownFortifiedCount,
        defenders,
        reinforcers: countReinforcers({ state: args.state, seatId: args.seatId, cityH3: city.h3Index, etaTurns }),
        clear: true,
      });
    }
    if (kept.length > 0) return finish(kept);
  }
  return finish([]);
}
