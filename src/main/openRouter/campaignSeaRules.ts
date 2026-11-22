/**
 * Pure rules for a campaign target reached by sea.
 *
 * Purpose: The required force, the sea route and its length, the approach, the expiry of a sea target, and the skip of a dropped one live here so target choice, the lift launch, and the briefing read one rule.
 * When to use: From campaign objective resolution, the sea route flow, the lift launch, and tests.
 * Expected outcome: The same result for the same inputs. Nothing here reads the database or the terrain cache.
 * Exceptions: None.
 */

import type { CampaignApproach, CampaignObjective } from '../../shared/campaignTypes';
import { OPERATION_MIN_GROUND_UNITS } from '../operations/operationRules';
import { compareCodeUnits } from '../../shared/codeUnitOrder';
import { logDebug, logTrace } from '../logger';
import { CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import {
  CAMPAIGN_LIFT_FORCE_RATIO,
  CAMPAIGN_SEA_CITY_TEST_LIMIT,
  CAMPAIGN_SEA_LANDING_TEST_LIMIT,
  CAMPAIGN_SEA_LAUNCH_WAIT_TURNS,
  CAMPAIGN_SEA_REACH_LIMIT_STEPS,
  CAMPAIGN_SEA_SKIP_TURNS,
  CAMPAIGN_SEA_STEP_PENALTY,
} from './campaignSeaConstants';
import { CAMPAIGN_MAX_LAND_STEPS, campaignScoreBeats, type CampaignCity } from './campaignTargetSelection';

/**
 * A dropped sea target and the turn it was dropped.
 *
 * Purpose: Target choice leaves the city out while the skip is active.
 * When to use: The result of `campaignSkipFor`.
 * Expected outcome: A target hex and the turn the skip began.
 * Exceptions: None.
 */
export interface CampaignSkip {
  /**
   * The dropped target.
   *
   * Contract: An H3 index of a city the engine will not pick while the skip is active.
   * When to use: Removing the city from the candidates.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly targetH3: string;
  /**
   * The turn the target was dropped.
   *
   * Contract: The turn the skip began. It is active for `CAMPAIGN_SEA_SKIP_TURNS` turns.
   * When to use: Storing the skip on the next objective.
   * Expected outcome: An integer turn number.
   * Exceptions: None.
   */
  readonly sinceTurn: number;
}

/**
 * The best sea route to one city.
 *
 * Purpose: Carries the port, the landing, and the route length so target choice and the lift launch agree on one route.
 * When to use: The values of `chooseCampaignSeaRoutes`.
 * Expected outcome: A feasible route whose length is within the reach limit.
 * Exceptions: None.
 */
export interface CampaignSeaRoute {
  /**
   * The city the route serves.
   *
   * Contract: A candidate city that ground units cannot reach by land within the new-target limit.
   * When to use: Keying the route.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly cityH3: string;
  /**
   * The own port the force sails from.
   *
   * Contract: One of the ports the caller passed in.
   * When to use: Describing the route.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly portH3: string;
  /**
   * The hex the force lands on.
   *
   * Contract: One of the city's landing hexes.
   * When to use: Describing the route.
   * Expected outcome: A non-empty H3 index.
   * Exceptions: None.
   */
  readonly landingH3: string;
  /**
   * The route length.
   *
   * Contract: Land steps to the port, plus sailing turns, plus `CAMPAIGN_SEA_STEP_PENALTY`.
   * When to use: The score distance and the reach limit.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly seaSteps: number;
}

/**
 * Inputs to the sea route choice.
 *
 * Purpose: Groups the cities, the ports, and the terrain lookups so the choice stays pure and testable.
 * When to use: The argument of `chooseCampaignSeaRoutes`.
 * Expected outcome: Plain data and lookup functions.
 * Exceptions: None.
 */
export interface CampaignSeaRouteArgs {
  /**
   * Candidate enemy cities.
   *
   * Contract: The campaign's known cities.
   * When to use: Choosing which cities get a route.
   * Expected outcome: A list that may be empty.
   * Exceptions: None.
   */
  readonly cities: readonly CampaignCity[];
  /**
   * Land steps from the force to each hex it can walk to.
   *
   * Contract: A city absent from the map is out of land reach.
   * When to use: Finding the cities that need a sea route.
   * Expected outcome: A map that may be empty.
   * Exceptions: None.
   */
  readonly landStepsFromForce: ReadonlyMap<string, number>;
  /**
   * Own ports to sail from.
   *
   * Contract: Already sorted by land steps and cut to `CAMPAIGN_SEA_PORT_LIMIT` by the caller.
   * When to use: Building routes.
   * Expected outcome: A list that may be empty.
   * Exceptions: None.
   */
  readonly ports: readonly { readonly h3Index: string; readonly landSteps: number }[];
  /**
   * Sailing turns between two hexes.
   *
   * Contract: Null when a ship cannot sail between them.
   * When to use: Measuring a route.
   * Expected outcome: A turn count or null.
   * Exceptions: None.
   */
  readonly sailTurns: (fromH3: string, toH3: string) => number | null;
  /**
   * Hexes a force may land on to attack a city.
   *
   * Contract: May be empty.
   * When to use: Finding the routes of a city.
   * Expected outcome: A list of H3 indexes.
   * Exceptions: None.
   */
  readonly landingHexes: (cityH3: string) => readonly string[];
  /**
   * Hops between two hexes.
   *
   * Contract: Null when the distance is unknown.
   * When to use: Ordering the landings of a city by nearness to the port.
   * Expected outcome: A hop count or null.
   * Exceptions: None.
   */
  readonly hopDistance: (a: string, b: string) => number | null;
  /**
   * Enemy units near a city.
   *
   * Contract: Counts every unit in range, including units the seat has not seen.
   * When to use: The required force.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly defendersNear: (cityH3: string) => number;
  /**
   * Enemy units that can reach a city within a number of turns.
   *
   * Contract: Counts every unit in range, including units the seat has not seen.
   * When to use: The required force.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly reinforcersFor: (cityH3: string, etaTurns: number) => number;
  /**
   * The force a campaign lift could carry now.
   *
   * Contract: The unit count of the best sea force with no eligibility filter. An upper bound.
   * When to use: The feasibility check.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly liftCapacity: number;
  /**
   * A city whose route is always measured.
   *
   * Contract: The stored target, or the commander's target. Null when there is none.
   * When to use: Keeping a stored target even when better cities fill the test limit.
   * Expected outcome: An H3 index or null.
   * Exceptions: None.
   */
  readonly mustTestH3: string | null;
  /**
   * A city that gets no route.
   *
   * Contract: The target under an active skip. Null when there is none.
   * When to use: Leaving a dropped target out.
   * Expected outcome: An H3 index or null.
   * Exceptions: None.
   */
  readonly skipH3: string | null;
}

/**
 * The ground units a campaign lift needs at a target.
 *
 * Purpose: One rule serves target choice, the lift launch, and posture fit, so they never disagree on what a landing needs.
 * When to use: With the enemy units near the target, those that can arrive first, and the own units already near it.
 * Expected outcome: At least `OPERATION_MIN_GROUND_UNITS`. Otherwise `CAMPAIGN_LIFT_FORCE_RATIO` times the enemy units, rounded up, less the friendly units near.
 * Exceptions: None.
 */
export function campaignLiftRequiredUnits(args: {
  /**
   * Enemy units near the target.
   *
   * Contract: A count of enemy units within `LIFT_OBJECTIVE_CLEAR_RADIUS` of the target, seen or not.
   * When to use: Pass the count the caller measured at the target.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly defenders: number;
  /**
   * Enemy units that can reach the target before the lift lands.
   *
   * Contract: A count from `countObjectiveReinforcers` for the lift's arrival turn.
   * When to use: Pass the count for the route's travel time.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly reinforcers: number;
  /**
   * The seat's own ground units already near the target.
   *
   * Contract: A count of own ground units within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target. Zero when the caller does not count them.
   * When to use: The lift launch counts them, and route choice passes zero.
   * Expected outcome: Read only. Each one lowers the required force by one.
   * Exceptions: None.
   */
  readonly friendlyNearby: number;
}): number {
  const required = Math.max(
    OPERATION_MIN_GROUND_UNITS,
    Math.ceil(CAMPAIGN_LIFT_FORCE_RATIO * (args.defenders + args.reinforcers)) - args.friendlyNearby
  );
  logTrace('campaignSeaRules campaignLiftRequiredUnits', { ...args, required });
  return required;
}

/**
 * Whether a sea target has waited too long for a campaign lift.
 *
 * Purpose: A target no lift can serve should not hold the campaign forever. A target some ground units march on never expires.
 * When to use: When resolving the stored objective and when computing the skip.
 * Expected outcome: True only for a sea objective that is not land-reachable, has no lift running, and whose wait since its last lift launch or its choice exceeds `CAMPAIGN_SEA_LAUNCH_WAIT_TURNS`.
 * Exceptions: None.
 */
export function campaignSeaTargetExpired(args: {
  /**
   * The stored objective being checked.
   *
   * Contract: Any stored objective. Only a sea objective can expire.
   * When to use: Pass the seat's stored objective.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly objective: CampaignObjective;
  /**
   * The current planning turn.
   *
   * Contract: An integer turn number.
   * When to use: Measuring the wait since the last lift launch or the choice.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Whether the ground units can walk to the target.
   *
   * Contract: True when its land steps are at most `CAMPAIGN_REACH_LIMIT_STEPS`.
   * When to use: A target the force can walk to never expires.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landReachable: boolean;
  /**
   * Whether a campaign lift for this target is stored.
   *
   * Contract: True only for a lift whose objective is the objective's target.
   * When to use: A target with a lift running never expires.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly campaignLiftRunning: boolean;
}): boolean {
  const { objective, turnNumber, landReachable, campaignLiftRunning } = args;
  const expired =
    objective.approach === 'sea'
    && !landReachable
    && !campaignLiftRunning
    && turnNumber - (objective.liftLaunchedTurn ?? objective.chosenTurn) > CAMPAIGN_SEA_LAUNCH_WAIT_TURNS;
  logTrace('campaignSeaRules campaignSeaTargetExpired', { targetH3: objective.targetH3, turnNumber, expired });
  return expired;
}

/**
 * How the force reaches a city.
 *
 * Purpose: Ground units that can still walk to a city take it by land. Only a city out of land reach, beyond `CAMPAIGN_REACH_LIMIT_STEPS` or with no land route at all, and with a feasible sea route is a sea target.
 * When to use: For a new target and for a kept target. Target choice and its score still use the sea steps of any city beyond the new-target land limit; this rule only decides how the chosen target is approached.
 * Expected outcome: `sea` when a sea route exists and the land steps are undefined or above `CAMPAIGN_REACH_LIMIT_STEPS`. Otherwise `land`.
 * Exceptions: None.
 */
export function campaignApproachFor(args: {
  /**
   * Land steps from the force to the city.
   *
   * Contract: Undefined when the force has no land route within the measured depth.
   * When to use: Pass the city's entry from the land-step map.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landSteps: number | undefined;
  /**
   * Sea steps of the city's feasible route.
   *
   * Contract: Undefined when the city has no feasible sea route.
   * When to use: Pass the city's entry from the sea-step map.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly seaSteps: number | undefined;
}): CampaignApproach {
  const { landSteps, seaSteps } = args;
  const approach: CampaignApproach =
    seaSteps !== undefined && (landSteps === undefined || landSteps > CAMPAIGN_REACH_LIMIT_STEPS) ? 'sea' : 'land';
  logTrace('campaignSeaRules campaignApproachFor', { landSteps: landSteps ?? null, seaSteps: seaSteps ?? null, approach });
  return approach;
}

/**
 * The skip to carry onto the next objective.
 *
 * Purpose: An expired sea target is skipped for `CAMPAIGN_SEA_SKIP_TURNS` turns so the engine does not pick it again at once.
 * When to use: Before resolving the objective.
 * Expected outcome: The stored target with this turn when it expired, otherwise the stored skip while it is still active, otherwise null.
 * Exceptions: None.
 */
export function campaignSkipFor(args: {
  /**
   * The stored objective, or null when the seat has none.
   *
   * Contract: The row read before this consult's resolution.
   * When to use: Pass the seat's stored objective.
   * Expected outcome: Read only. Null gives no skip.
   * Exceptions: None.
   */
  readonly stored: CampaignObjective | null;
  /**
   * The current planning turn.
   *
   * Contract: An integer turn number.
   * When to use: Checking expiry and whether a stored skip is still active.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Whether the ground units can walk to the stored target.
   *
   * Contract: True when its land steps are at most `CAMPAIGN_REACH_LIMIT_STEPS`.
   * When to use: Passed to `campaignSeaTargetExpired`.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly storedLandReachable: boolean;
  /**
   * Whether a campaign lift for the stored target is stored.
   *
   * Contract: True only for a lift whose objective is the stored target.
   * When to use: Passed to `campaignSeaTargetExpired`.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly campaignLiftRunning: boolean;
}): CampaignSkip | null {
  const { stored, turnNumber } = args;
  let skip: CampaignSkip | null = null;
  if (stored !== null) {
    if (
      campaignSeaTargetExpired({
        objective: stored,
        turnNumber,
        landReachable: args.storedLandReachable,
        campaignLiftRunning: args.campaignLiftRunning,
      })
    ) {
      skip = { targetH3: stored.targetH3, sinceTurn: turnNumber };
    } else {
      skip = activeCampaignSkip(stored, turnNumber);
    }
  }
  logTrace('campaignSeaRules campaignSkipFor', { turnNumber, skipH3: skip?.targetH3 ?? null });
  return skip;
}

/**
 * The skip a stored objective holds, while it is still active.
 *
 * Purpose: The engine's skip rule and a commander's new target read one activity test.
 * When to use: When a new objective replaces a stored one and should carry its skip.
 * Expected outcome: The stored skip when fewer than `CAMPAIGN_SEA_SKIP_TURNS` turns have passed since it began, otherwise null.
 * Exceptions: None.
 */
export function activeCampaignSkip(stored: CampaignObjective | null, turnNumber: number): CampaignSkip | null {
  const skip =
    stored?.skippedTargetH3 !== undefined
    && stored.skippedTurn !== undefined
    && turnNumber - stored.skippedTurn < CAMPAIGN_SEA_SKIP_TURNS
      ? { targetH3: stored.skippedTargetH3, sinceTurn: stored.skippedTurn }
      : null;
  logTrace('campaignSeaRules activeCampaignSkip', { turnNumber, skipH3: skip?.targetH3 ?? null });
  return skip;
}

/**
 * The best route to one city, over every port and the nearest landings.
 *
 * Purpose: Picks the fewest steps, then the lower port id, then the lower landing id.
 * When to use: For each city `chooseCampaignSeaRoutes` measures.
 * Expected outcome: The best route, or null when no port can sail to any tested landing.
 * Exceptions: None.
 */
function bestRouteForCity(args: CampaignSeaRouteArgs, cityH3: string): CampaignSeaRoute | null {
  const landings = args.landingHexes(cityH3);
  let best: CampaignSeaRoute | null = null;
  for (const port of args.ports) {
    const nearest = [...landings]
      .map((landing) => ({ landing, hops: args.hopDistance(port.h3Index, landing) }))
      .sort((a, b) => {
        if (a.hops === null || b.hops === null) {
          if (a.hops === b.hops) return compareCodeUnits(a.landing, b.landing);
          return a.hops === null ? 1 : -1;
        }
        return a.hops - b.hops || compareCodeUnits(a.landing, b.landing);
      })
      .slice(0, CAMPAIGN_SEA_LANDING_TEST_LIMIT);
    for (const { landing } of nearest) {
      const sail = args.sailTurns(port.h3Index, landing);
      if (sail === null) continue;
      const seaSteps = port.landSteps + sail + CAMPAIGN_SEA_STEP_PENALTY;
      const better =
        best === null
        || seaSteps < best.seaSteps
        || (seaSteps === best.seaSteps
          && (compareCodeUnits(port.h3Index, best.portH3) < 0
            || (port.h3Index === best.portH3 && compareCodeUnits(landing, best.landingH3) < 0)));
      if (better) best = { cityH3, portH3: port.h3Index, landingH3: landing, seaSteps };
    }
  }
  return best;
}

/**
 * The feasible sea route of each city the force cannot walk to.
 *
 * Purpose: Lets the campaign choose a target across the sea. A city is routed only when a lift could carry the force it needs.
 * When to use: Once per campaign resolution, from the sea route flow.
 * Expected outcome: A map from city hex to its best route. Empty when there is no port or the lift capacity is below `OPERATION_MIN_GROUND_UNITS`. A city beyond `CAMPAIGN_SEA_REACH_LIMIT_STEPS`, or needing more than the lift capacity, has no entry.
 * Exceptions: None.
 */
export function chooseCampaignSeaRoutes(args: CampaignSeaRouteArgs): ReadonlyMap<string, CampaignSeaRoute> {
  const routes = new Map<string, CampaignSeaRoute>();
  const firstPort = args.ports[0];
  if (firstPort === undefined || args.liftCapacity < OPERATION_MIN_GROUND_UNITS) {
    logDebug('campaignSeaRules chooseCampaignSeaRoutes', { portCount: args.ports.length, liftCapacity: args.liftCapacity, tested: 0, kept: 0 });
    return routes;
  }
  const baseSteps = firstPort.landSteps + CAMPAIGN_SEA_STEP_PENALTY;
  const candidates = args.cities
    .filter((city) => {
      const landSteps = args.landStepsFromForce.get(city.h3Index);
      return (
        city.h3Index !== args.skipH3
        && (landSteps === undefined || landSteps > CAMPAIGN_MAX_LAND_STEPS)
        && args.landingHexes(city.h3Index).length > 0
      );
    })
    .sort((a, b) => {
      if (campaignScoreBeats(a, baseSteps, b, baseSteps)) return -1;
      if (campaignScoreBeats(b, baseSteps, a, baseSteps)) return 1;
      return compareCodeUnits(a.h3Index, b.h3Index);
    });
  const tested = candidates.slice(0, CAMPAIGN_SEA_CITY_TEST_LIMIT);
  const must = candidates.find((city) => city.h3Index === args.mustTestH3);
  if (must !== undefined && !tested.includes(must)) tested.push(must);
  for (const city of tested) {
    const route = bestRouteForCity(args, city.h3Index);
    if (route === null || route.seaSteps > CAMPAIGN_SEA_REACH_LIMIT_STEPS) continue;
    const required = campaignLiftRequiredUnits({
      defenders: args.defendersNear(city.h3Index),
      reinforcers: args.reinforcersFor(city.h3Index, route.seaSteps - CAMPAIGN_SEA_STEP_PENALTY + 1),
      friendlyNearby: 0,
    });
    if (args.liftCapacity >= required) routes.set(city.h3Index, route);
  }
  logDebug('campaignSeaRules chooseCampaignSeaRoutes', {
    portCount: args.ports.length,
    liftCapacity: args.liftCapacity,
    tested: tested.length,
    kept: routes.size,
  });
  return routes;
}
