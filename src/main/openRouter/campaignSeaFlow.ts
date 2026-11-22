/**
 * Finds the sea routes a campaign may use, from one briefing snapshot.
 *
 * Purpose: Reads the seat's ports, ships, and the units near each city, then hands the pure route rules what they need. The result lets the campaign choose a target across the water.
 * When to use: Once per campaign resolution and once per commander campaign target that is out of land reach.
 * Expected outcome: A map from city hex to its feasible sea route, empty when the seat cannot sail a force.
 * Exceptions: None. A thrown error is logged and gives an empty map.
 */

import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, listUnitsForSnapshot } from '../gameDb';
import { readOperations } from '../gameDb/operationMemory';
import { postureSettingsForSeat } from '../gameDb/postureMemory';
import { compareCodeUnits } from '../../shared/codeUnitOrder';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import type { LandMassByH3 } from '../../shared/landTraversalStrategic';
import { logDebug, logError } from '../logger';
import { countObjectiveReinforcers, LIFT_OBJECTIVE_CLEAR_RADIUS, liftProtectedUnitIds } from '../operations/liftRules';
import { buildLiftTerrain } from '../operations/liftTerrain';
import { OPERATION_MUSTER_MAX_LAND_STEPS } from '../operations/operationRules';
import { buildSeaLiftForce } from '../operations/seaOperationCandidates';
import { CAMPAIGN_SEA_PORT_LIMIT } from './campaignSeaConstants';
import { chooseCampaignSeaRoutes, type CampaignSeaRoute } from './campaignSeaRules';
import type { CampaignCity } from './campaignTargetSelection';

/**
 * Computes the feasible sea route of each city the seat's ground units cannot walk to.
 *
 * Purpose: Target choice, a kept target, and a commander's target all read the same routes, so they agree on which cities a campaign lift can serve.
 * When to use: From campaign objective resolution and the commander target override, with the cities and land steps those callers already hold.
 * Expected outcome: A map from city hex to its best route. Empty when the seat has no ship, no port within `OPERATION_MUSTER_MAX_LAND_STEPS` land steps, or a lift capacity below the minimum force. Enemy units the seat has not seen are counted, as raids do.
 * Exceptions: None. A thrown error is logged and returns an empty map.
 */
export function campaignSeaRoutesForState(args: {
  /**
   * The briefing snapshot the routes are read from.
   *
   * Contract: The seat's snapshot. The function swaps in the full unit list so unseen enemy units count.
   * When to use: Pass the consult's snapshot.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat whose ports and ships are used.
   *
   * Contract: An AI seat id.
   * When to use: The seat being consulted.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The land-mass data for embark, landing, and sailing rules.
   *
   * Contract: The terrain cache the campaign uses, keyed by H3 index.
   * When to use: Pass the map the caller loaded with `loadCampaignLandMass`.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landMass: LandMassByH3;
  /**
   * The candidate cities.
   *
   * Contract: The enemy cities the campaign may target.
   * When to use: Pass the same list target choice reads.
   * Expected outcome: Read only. Only these cities can get a route.
   * Exceptions: None.
   */
  readonly cities: readonly CampaignCity[];
  /**
   * Land steps from the seat's ground units.
   *
   * Contract: Built to `CAMPAIGN_REACH_LIMIT_STEPS` depth. A hex with no entry cannot be walked to.
   * When to use: Choosing ports within `OPERATION_MUSTER_MAX_LAND_STEPS` and leaving out cities in land reach.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landStepsFromForce: ReadonlyMap<string, number>;
  /**
   * A city to test for a route even when the city cap would leave it out.
   *
   * Contract: Passed through to `chooseCampaignSeaRoutes`. Null tests only the cities the cap keeps.
   * When to use: Pass the stored target, or the commander's named target, so its route is always known.
   * Expected outcome: An H3 index or null.
   * Exceptions: None.
   */
  readonly mustTestH3: string | null;
  /**
   * A city to leave out of the route search.
   *
   * Contract: Passed through to `chooseCampaignSeaRoutes`. Null leaves no city out.
   * When to use: Pass the active skip's target, so a dropped sea target is not chosen again while skipped.
   * Expected outcome: An H3 index or null.
   * Exceptions: None.
   */
  readonly skipH3: string | null;
}): ReadonlyMap<string, CampaignSeaRoute> {
  const { state, seatId, landMass, landStepsFromForce } = args;
  logDebug('campaignSeaFlow campaignSeaRoutesForState', { seatId, turnNumber: state.turnNumber, cityCount: args.cities.length });
  try {
    const seen: GameStateSnapshot = { ...state, units: listUnitsForSnapshot() };
    if (!seen.units.some((unit) => unit.player === seatId && unit.unitType === 'naval')) return new Map();
    const terrain = buildLiftTerrain({ state: seen, seatId, landMass });
    const controlByHex = new Map((seen.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
    const seaportByHex = new Map((seen.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.seaportCount]));
    const ports = seen.hexes
      .map((hex) => hex.h3Index)
      .filter((h3Index) => {
        const landSteps = landStepsFromForce.get(h3Index);
        return (
          controlByHex.get(h3Index) === seatId &&
          (seaportByHex.get(h3Index) ?? 0) > 0 &&
          terrain.embarkLegal(h3Index) &&
          terrain.shipCanEnter(h3Index) &&
          landSteps !== undefined &&
          landSteps <= OPERATION_MUSTER_MAX_LAND_STEPS
        );
      })
      .map((h3Index) => ({ h3Index, landSteps: landStepsFromForce.get(h3Index) ?? 0 }))
      .sort((left, right) => left.landSteps - right.landSteps || compareCodeUnits(left.h3Index, right.h3Index))
      .slice(0, CAMPAIGN_SEA_PORT_LIMIT);
    const force = buildSeaLiftForce({
      state: seen,
      seatId,
      landMass,
      terrain,
      active: readOperations({ getOne: dbGetOne }).get(seatId) ?? [],
      protectedUnitIds: liftProtectedUnitIds({
        state: seen,
        seatId,
        terrain,
        defenderUnitIds: [],
        withheldIds: new Set<string>(),
      }),
      groundShare: { hasCampaignPlan: true, campaignShare: postureSettingsForSeat(seatId).liftGroundShare },
    });
    return chooseCampaignSeaRoutes({
      cities: args.cities,
      landStepsFromForce,
      ports,
      sailTurns: terrain.sailTurns,
      landingHexes: terrain.landingHexes,
      hopDistance: computeGridDistanceWithPathFallbackPure,
      defendersNear: (h3Index) => terrain.enemyUnitsWithin(h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS),
      reinforcersFor: (h3Index, etaTurns) => countObjectiveReinforcers({ state: seen, seatId, cityH3: h3Index, etaTurns }),
      liftCapacity: force?.units.length ?? 0,
      mustTestH3: args.mustTestH3,
      skipH3: args.skipH3,
    });
  } catch (err) {
    logError('campaignSeaFlow campaignSeaRoutesForState failed', { seatId }, err);
    return new Map();
  }
}
