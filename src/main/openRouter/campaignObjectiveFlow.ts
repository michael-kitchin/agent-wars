/**
 * Turns a side's briefing snapshot into campaign inputs, refreshes the stored objective once per consult, and builds the plan the briefing builders receive.
 *
 * Purpose: One consult computes one plan. Builders do not read the database to find it.
 * When to use: `requestOrdersFlow` before the strategic briefing, and the campaignTarget override.
 * Expected outcome: A stored objective and a plan for an AI seat in a region-versus-region match. Outside that match, null.
 * Exceptions: A missing terrain cache is logged and skips the campaign. A database error propagates.
 */

import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { postureSettingsForSeat } from '../gameDb/postureMemory';
import { operationUnitIdsForSeat } from '../gameDb/operationMemory';
import { briefingOwnSeatId, ownHomeHexes } from '../briefing/briefingPerspective';
import { getLandStepDistances, landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { isAiSeatId } from '../../shared/seatIds';
import type { CampaignObjective } from '../../shared/campaignTypes';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { logDebug, logError, logTrace } from '../logger';
import {
  CAMPAIGN_REACH_LIMIT_STEPS,
  buildCampaignPlan,
  campaignAssaultMinUnitsFor,
  campaignWaypoint,
  resolveCampaignObjective,
  type CampaignPlan,
  type CampaignUnitInput,
} from './campaignRules';
import { knownCampaignCities, type CampaignCity } from './campaignTargetSelection';

/**
 * The snapshot facts the pure campaign rules need.
 *
 * Purpose: The flow derives them once and the rules stay free of the database.
 * When to use: `resolveCampaignObjectiveForSeat` and `campaignPlanForState`.
 * Expected outcome: Ground units, visible enemies, candidate cities, and the hexes land steps may cross.
 * Exceptions: None.
 */
export interface CampaignStateInputs {
  /**
   * The commander this snapshot belongs to.
   *
   * Contract: The briefing seat.
   * When to use: The stored-row key.
   * Expected outcome: An AI seat id when the perspective is an AI seat.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Infantry and armor that are not aboard a carrier.
   *
   * Contract: Roster order.
   * When to use: The force that can join the campaign.
   * Expected outcome: Id and hex for each ground unit.
   * Exceptions: None.
   */
  readonly groundUnits: readonly CampaignUnitInput[];
  /**
   * The commander's home hexes.
   *
   * Contract: From `ownHomeHexes`.
   * When to use: The home-defender check.
   * Expected outcome: A set of H3 indexes.
   * Exceptions: None.
   */
  readonly ownHomeHexes: ReadonlySet<string>;
  /**
   * Visible units of active enemy seats.
   *
   * Contract: The snapshot's unit list is already limited to units this seat can see.
   * When to use: Contact. Intel is not included.
   * Expected outcome: H3 indexes.
   * Exceptions: None.
   */
  readonly enemyUnitHexes: readonly string[];
  /**
   * Visible infantry and armor of active enemy seats, one entry per unit.
   *
   * Contract: A subset of `enemyUnitHexes`. Embarked units are included when the snapshot lists them.
   * When to use: Home-defense threats. Only these units can take a city.
   * Expected outcome: H3 indexes. Stacked units repeat their hex.
   * Exceptions: None.
   */
  readonly enemyGroundUnitHexes: readonly string[];
  /**
   * Enemy cities under the fog rule.
   *
   * Contract: The output of `knownCampaignCities`.
   * When to use: Target choice.
   * Expected outcome: Candidate cities.
   * Exceptions: None.
   */
  readonly cities: readonly CampaignCity[];
  /**
   * Land hexes this side controls and a land unit can occupy.
   *
   * Contract: Staging candidates.
   * When to use: `chooseStagingHex`.
   * Expected outcome: H3 indexes.
   * Exceptions: None.
   */
  readonly ownControlledLandHexes: readonly string[];
  /**
   * Hexes a land step may enter.
   *
   * Contract: The snapshot hex list.
   * When to use: `getLandStepDistances`.
   * Expected outcome: A set of H3 indexes.
   * Exceptions: None.
   */
  readonly hexSet: ReadonlySet<string>;
}

/**
 * Derives campaign inputs from one briefing snapshot.
 *
 * Purpose: Ground units are the seat's infantry and armor that are not aboard a carrier. Enemy units are visible units of active enemy seats, and enemy ground units are the infantry and armor among them. Cities follow `knownCampaignCities`. A hex in more than one enemy home has no assumed owner.
 * When to use: Once per resolve and once per plan build.
 * Expected outcome: The inputs above. Ground units already assigned to a sea operation are omitted. An unexplored hex in two enemy homes is not a candidate.
 * Exceptions: None.
 */
export function campaignInputsFromState(state: GameStateSnapshot, landMass: LandMassByH3): CampaignStateInputs {
  const seatId = briefingOwnSeatId(state);
  const activeEnemySeatIds = new Set<string>(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId)
  );
  const inOperation = operationUnitIdsForSeat(seatId);
  const groundUnits = state.units
    .filter(
      (unit) =>
        unit.player === seatId &&
        (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
        !unit.embarkedOnCarrierUnitId &&
        !inOperation.has(unit.id)
    )
    .map((unit) => ({ id: unit.id, h3Index: unit.h3Index }));
  const enemyUnits = state.units.filter((unit) => activeEnemySeatIds.has(unit.player));
  const enemyUnitHexes = enemyUnits.map((unit) => unit.h3Index);
  const enemyGroundUnitHexes = enemyUnits
    .filter((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor')
    .map((unit) => unit.h3Index);
  const homeSeatByH3 = new Map<string, string>();
  const inSeveralHomes = new Set<string>();
  for (const enemySeatId of activeEnemySeatIds) {
    for (const h3Index of state.homeRegionHexesBySeat?.[enemySeatId] ?? []) {
      if (homeSeatByH3.has(h3Index)) inSeveralHomes.add(h3Index);
      homeSeatByH3.set(h3Index, enemySeatId);
    }
  }
  for (const h3Index of inSeveralHomes) homeSeatByH3.delete(h3Index);
  const controllerByH3 = new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const explored = new Set(state.exploredHexes ?? state.hexes.map((hex) => hex.h3Index));
  const cities = knownCampaignCities({
    activeEnemySeatIds,
    infrastructure: state.strategicInfrastructure ?? [],
    controllerByH3,
    explored,
    homeSeatByH3,
  });
  const ownControlledLandHexes = (state.strategicControl ?? [])
    .filter((row) => row.controllerPlayerId === seatId && landUnitCanOccupyHex(row.h3Index, landMass))
    .map((row) => row.h3Index);
  logTrace('campaignObjectiveFlow campaignInputsFromState', {
    seatId,
    groundUnitCount: groundUnits.length,
    enemyGroundUnitCount: enemyGroundUnitHexes.length,
    cityCount: cities.length,
  });
  return {
    seatId,
    groundUnits,
    ownHomeHexes: new Set(ownHomeHexes(state)),
    enemyUnitHexes,
    enemyGroundUnitHexes,
    cities,
    ownControlledLandHexes,
    hexSet: new Set(state.hexes.map((hex) => hex.h3Index)),
  };
}

/**
 * Loads the terrain cache for land steps.
 *
 * Purpose: Campaign reach is land distance, which the cache already classified.
 * When to use: Once per resolve and once per plan build.
 * Expected outcome: The terrain cache's land-mass records, or null after logging when the cache cannot be loaded.
 * Exceptions: None. A cache error is logged and returns null.
 */
export function loadCampaignLandMass(seatId: string): LandMassByH3 | null {
  try {
    return getStrategicLandMassByH3();
  } catch (err) {
    logError('campaignObjectiveFlow: terrain cache unavailable; no campaign this consult', { seatId }, err);
    return null;
  }
}

/**
 * Land steps from the given origins.
 *
 * Purpose: A kept target 13 to 30 steps away must still be in the map, so the depth is `CAMPAIGN_REACH_LIMIT_STEPS`.
 * When to use: From the force, and again from a candidate target.
 * Expected outcome: Land steps from the origins up to that depth.
 * Exceptions: None.
 */
export function campaignLandSteps(
  inputs: CampaignStateInputs,
  landMass: LandMassByH3,
  originH3s: readonly string[]
): Map<string, number> {
  const steps = getLandStepDistances({
    originH3s,
    hexSet: inputs.hexSet,
    data: landMass,
    maxDepth: CAMPAIGN_REACH_LIMIT_STEPS,
  });
  logTrace('campaignObjectiveFlow campaignLandSteps', { originCount: originH3s.length, reached: steps.size });
  return steps;
}

/**
 * Resolves and stores this seat's objective.
 *
 * Purpose: The briefing that follows this call reads the row this function just wrote.
 * When to use: Once per strategic consult, only when standing orders are on. The caller checks that flag.
 * Expected outcome: Outside `region_vs_region`, or when the terrain cache is missing, null and nothing written. Otherwise the resolved objective, also written for the seat; null clears the seat's entry.
 * Exceptions: Propagates a database error.
 */
export function resolveCampaignObjectiveForSeat(state: GameStateSnapshot): CampaignObjective | null {
  if (state.scenarioId !== 'region_vs_region') {
    logDebug('campaignObjectiveFlow resolveCampaignObjectiveForSeat', { skipped: 'scenario' });
    return null;
  }
  const seatId = briefingOwnSeatId(state);
  const assaultMinUnits = campaignAssaultMinUnitsFor(postureSettingsForSeat(seatId).campaignAssaultFactor);
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return null;
  const inputs = campaignInputsFromState(state, landMass);
  const ops = { getOne: dbGetOne, run: dbRun };
  const stored = readCampaignObjectives(ops).get(seatId) ?? null;
  const groundUnitHexes = inputs.groundUnits.map((unit) => unit.h3Index);
  const next = resolveCampaignObjective({
    stored,
    turnNumber: state.turnNumber,
    cities: inputs.cities,
    landStepsFromForce: campaignLandSteps(inputs, landMass, groundUnitHexes),
    ownControlledLandHexes: inputs.ownControlledLandHexes,
    landStepsFromTarget: (targetH3) => campaignLandSteps(inputs, landMass, [targetH3]),
    groundUnitHexes,
    hopDistance: computeGridDistanceWithPathFallbackPure,
    assaultMinUnits,
  });
  writeCampaignObjectiveForSeat(ops, seatId, next);
  logDebug('campaignObjectiveFlow resolveCampaignObjectiveForSeat', {
    seatId,
    turnNumber: state.turnNumber,
    storedTarget: stored?.targetH3 ?? null,
    target: next?.targetH3 ?? null,
    staging: next?.stagingH3 ?? null,
    phase: next?.phase ?? null,
  });
  return next;
}

/**
 * Builds the plan from the stored objective.
 *
 * Purpose: Briefing builders receive this object and do not query the row themselves.
 * When to use: Immediately after `resolveCampaignObjectiveForSeat` in the same consult.
 * Expected outcome: Null unless the snapshot belongs to an AI seat with a stored objective whose target is on this map.
 * Exceptions: Propagates a database error, which only happens when no match is open.
 */
export function campaignPlanForState(state: GameStateSnapshot): CampaignPlan | null {
  if (state.scenarioId !== 'region_vs_region') {
    logTrace('campaignObjectiveFlow campaignPlanForState', { skipped: 'scenario' });
    return null;
  }
  if (!state.playerPerspective || !isAiSeatId(state.playerPerspective)) {
    logTrace('campaignObjectiveFlow campaignPlanForState', { skipped: 'perspective' });
    return null;
  }
  const seatId = briefingOwnSeatId(state);
  const assaultMinUnits = campaignAssaultMinUnitsFor(postureSettingsForSeat(seatId).campaignAssaultFactor);
  const objective = readCampaignObjectives({ getOne: dbGetOne }).get(seatId) ?? null;
  if (objective === null) return null;
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return null;
  const inputs = campaignInputsFromState(state, landMass);
  if (!inputs.hexSet.has(objective.targetH3)) return null;
  const plan = buildCampaignPlan({
    objective,
    groundUnits: inputs.groundUnits,
    ownHomeHexes: inputs.ownHomeHexes,
    enemyUnitHexes: inputs.enemyUnitHexes,
    enemyGroundUnitHexes: inputs.enemyGroundUnitHexes,
    landStepsFromWaypoint: campaignLandSteps(inputs, landMass, [campaignWaypoint(objective)]),
    hopDistance: computeGridDistanceWithPathFallbackPure,
    assaultMinUnits,
  });
  logDebug('campaignObjectiveFlow campaignPlanForState', {
    seatId,
    waypoint: plan.waypointH3,
    campaignUnitCount: plan.campaignUnitIds.size,
    defenderCount: plan.defenderUnitIds.length,
    homeThreatCount: plan.homeThreatCount,
    homeDefenseCapped: plan.homeDefenseCapped,
  });
  return plan;
}
