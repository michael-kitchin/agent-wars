/**
 * Launches the sea operation that carries a campaign's ground units across the water.
 *
 * Purpose: A campaign target the ground units cannot walk to needs ships. The engine gathers the units that cannot walk to the campaign at a port and sails them, lift by lift.
 * When to use: Once per seat per operation tick, after raids, from `advanceOperationsForSeat`.
 * Expected outcome: A new campaign lift operation when every launch condition holds, otherwise null.
 * Exceptions: None. A thrown error is logged and gives null.
 */

import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne } from '../gameDb';
import { readCampaignObjectives } from '../gameDb/campaignObjectiveMemory';
import { nextOperationId } from '../gameDb/operationMemory';
import { postureSettingsForSeat } from '../gameDb/postureMemory';
import { compareCodeUnits } from '../../shared/codeUnitOrder';
import { getLandStepDistances, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { isLandUnitType } from '../../shared/landUnitType';
import type { Operation } from '../../shared/operationTypes';
import { logDebug, logError, logTrace } from '../logger';
import { campaignPlanForState } from '../openRouter/campaignObjectiveFlow';
import { cityHeldByPactPartner } from '../openRouter/campaignPactPartners';
import { campaignWaypoint, CAMPAIGN_REACH_LIMIT_STEPS } from '../openRouter/campaignRules';
import { CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS, CAMPAIGN_LIFT_LANDING_MAX_STEPS } from '../openRouter/campaignSeaConstants';
import { campaignLiftRequiredUnits } from '../openRouter/campaignSeaRules';
import { countObjectiveReinforcers, LIFT_OBJECTIVE_CLEAR_RADIUS, liftProtectedUnitIds } from './liftRules';
import { buildLiftTerrain, type LiftTerrain } from './liftTerrain';
import { campaignLiftHasRoom } from './operationCandidates';
import { OPERATION_MIN_GROUND_UNITS } from './operationRules';
import { buildSeaLiftForce, listKnownEnemyCities } from './seaOperationCandidates';

/**
 * Lists the hexes a campaign lift may land on.
 *
 * Purpose: The first lift lands beside the target, and later lifts may land on a hex the seat already holds near it, so a landing is reinforced lift by lift.
 * When to use: When a campaign lift picks its beach, from the launch check and from the operation facts.
 * Expected outcome: The target's own landing hexes plus every hex the seat controls that passes `debarkLegal` and `shipCanEnter` within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` land steps of the target. De-duplicated and sorted by code unit.
 * Exceptions: None.
 */
export function campaignLiftLandings(args: {
  /**
   * The snapshot whose control rows are read.
   *
   * Contract: The seat's snapshot.
   * When to use: Pass the snapshot the terrain was built from.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat whose held hexes may serve as landings.
   *
   * Contract: An AI seat id.
   * When to use: The seat launching or running the lift.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The land-mass data for land steps near the target.
   *
   * Contract: The terrain cache the campaign uses, keyed by H3 index.
   * When to use: Measuring which held hexes are within `CAMPAIGN_LIFT_LANDING_MAX_STEPS` of the target.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landMass: LandMassByH3;
  /**
   * The lift terrain rules.
   *
   * Contract: Built by `buildLiftTerrain` for the same seat and snapshot.
   * When to use: Reading the target's landing hexes and the debark and ship-entry rules.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly terrain: LiftTerrain;
  /**
   * The campaign target the lift serves.
   *
   * Contract: An H3 index of the stored target.
   * When to use: Pass the objective's target.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly targetH3: string;
}): readonly string[] {
  const { state, seatId, landMass, terrain, targetH3 } = args;
  const hexSet = new Set(state.hexes.map((hex) => hex.h3Index));
  const nearTarget = getLandStepDistances({
    originH3s: [targetH3],
    hexSet,
    data: landMass,
    maxDepth: CAMPAIGN_LIFT_LANDING_MAX_STEPS,
  });
  const held = (state.strategicControl ?? [])
    .filter((row) => row.controllerPlayerId === seatId && nearTarget.has(row.h3Index))
    .map((row) => row.h3Index)
    .filter((h3Index) => terrain.debarkLegal(h3Index) && terrain.shipCanEnter(h3Index));
  const landings = [...new Set([...terrain.landingHexes(targetH3), ...held])].sort(compareCodeUnits);
  logTrace('campaignLiftLaunch campaignLiftLandings', { seatId, targetH3, landingCount: landings.length });
  return landings;
}

/**
 * Builds the next campaign lift for one seat, when the launch conditions hold.
 *
 * Purpose: Ground units that cannot walk to the campaign's target sail there in lifts of their own, sized to what waits at the target and to the posture's lift share.
 * When to use: Once per seat per operation tick, after raids. Pass the snapshot with the full unit list, the seat's running operations, and the units released earlier in the tick.
 * Expected outcome: A campaign lift in its muster phase, or null when there is no stored target, the engine picked the target and `cityHeldByPactPartner` says a pact partner holds it, the commander cancelled a campaign lift for it fewer than `CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS` turns ago, there is no free campaign lift slot, too few units that cannot walk, no landing or route, or too little force for the defenders and reinforcers.
 * Exceptions: None. A thrown error is logged and gives null.
 */
export function campaignLiftForSeat(args: {
  /**
   * The snapshot the launch reads.
   *
   * Contract: The seat's snapshot with the full unit list, including units the seat has not seen.
   * When to use: Pass the snapshot the operation tick already built.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat that launches.
   *
   * Contract: An AI seat id with a stored campaign objective, or the call returns null.
   * When to use: The seat whose operations are advancing.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The land-mass data for walking distances.
   *
   * Contract: The terrain cache the campaign uses, keyed by H3 index.
   * When to use: Measuring which units cannot walk to the waypoint and the hexes near the target.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly landMass: LandMassByH3;
  /**
   * The seat's operations still running after this tick's advances and raid launch.
   *
   * Contract: Their units and ships do not board, and their campaign lifts fill the campaign lift slot.
   * When to use: Pass the list the tick will store.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly active: readonly Operation[];
  /**
   * Units released earlier in the tick that must not board.
   *
   * Contract: Ids an operation released earlier in this tick.
   * When to use: Pass the ids the tick withheld, so a unit just released keeps the order its operation gave it.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly withheldIds: ReadonlySet<string>;
}): Operation | null {
  const { state, seatId, landMass, active, withheldIds } = args;
  logDebug('campaignLiftLaunch campaignLiftForSeat', { seatId, turnNumber: state.turnNumber, active: active.length });
  try {
    const objective = readCampaignObjectives({ getOne: dbGetOne }).get(seatId);
    if (objective === undefined) return skip(seatId, 'no objective');
    if (objective.source === 'engine' && cityHeldByPactPartner(state, seatId, objective.targetH3)) {
      return skip(seatId, 'engine target held by a pact partner');
    }
    if (
      objective.liftCancelledTurn !== undefined &&
      state.turnNumber - objective.liftCancelledTurn < CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS
    ) {
      return skip(seatId, 'cancelled lift cooldown');
    }
    if (!campaignLiftHasRoom(state, active)) return skip(seatId, 'no slot');
    if (!listKnownEnemyCities(state, seatId).some((city) => city.h3Index === objective.targetH3)) {
      return skip(seatId, 'target is not a known enemy city');
    }
    const terrain = buildLiftTerrain({ state, seatId, landMass });
    const hexSet = new Set(state.hexes.map((hex) => hex.h3Index));
    const fromWaypoint = getLandStepDistances({
      originH3s: [campaignWaypoint(objective)],
      hexSet,
      data: landMass,
      maxDepth: CAMPAIGN_REACH_LIMIT_STEPS,
    });
    const protectedIds = liftProtectedUnitIds({
      state,
      seatId,
      terrain,
      defenderUnitIds: campaignPlanForState(state)?.defenderUnitIds ?? [],
      withheldIds,
    });
    const busy = new Set(active.flatMap((operation) => [...operation.unitIds, ...operation.carrierIds]));
    const own = state.units.filter((unit) => unit.player === seatId && isLandUnitType(unit.unitType));
    const eligible = new Set(
      own
        .filter(
          (unit) =>
            !unit.embarkedOnCarrierUnitId &&
            !busy.has(unit.id) &&
            !protectedIds.has(unit.id) &&
            !fromWaypoint.has(unit.h3Index),
        )
        .map((unit) => unit.id),
    );
    if (eligible.size < OPERATION_MIN_GROUND_UNITS) return skip(seatId, 'too few units that cannot walk');
    const landings = campaignLiftLandings({ state, seatId, landMass, terrain, targetH3: objective.targetH3 });
    if (landings.length === 0) return skip(seatId, 'no landing');
    const force = buildSeaLiftForce({
      state,
      seatId,
      landMass,
      terrain,
      active,
      protectedUnitIds: protectedIds,
      eligibleUnitIds: eligible,
      groundShare: { hasCampaignPlan: true, campaignShare: postureSettingsForSeat(seatId).liftGroundShare },
    });
    if (force === null) return skip(seatId, 'no force');
    const sail = landings
      .map((landing) => terrain.sailTurns(force.port, landing))
      .filter((turns): turns is number => turns !== null)
      .reduce<number | null>((best, turns) => (best === null || turns < best ? turns : best), null);
    if (sail === null) return skip(seatId, 'no route');
    const etaTurns = force.musterTurns + sail + 1;
    const nearTargetSteps = getLandStepDistances({
      originH3s: [objective.targetH3],
      hexSet,
      data: landMass,
      maxDepth: CAMPAIGN_LIFT_LANDING_MAX_STEPS,
    });
    const friendlyNearby = own.filter((unit) => !unit.embarkedOnCarrierUnitId && nearTargetSteps.has(unit.h3Index)).length;
    const required = campaignLiftRequiredUnits({
      defenders: terrain.enemyUnitsWithin(objective.targetH3, LIFT_OBJECTIVE_CLEAR_RADIUS),
      reinforcers: countObjectiveReinforcers({ state, seatId, cityH3: objective.targetH3, etaTurns }),
      friendlyNearby,
    });
    if (force.units.length < required) {
      logDebug('campaignLiftLaunch campaignLiftForSeat', { seatId, skipped: 'force too small', have: force.units.length, required });
      return null;
    }
    return {
      id: nextOperationId(seatId, active, state.turnNumber),
      method: 'sea',
      purpose: 'campaign',
      objectiveH3: objective.targetH3,
      musterH3: force.port,
      landingH3: null,
      unitIds: force.units.map((unit) => unit.id),
      carrierIds: force.ships.map((ship) => ship.id),
      phase: 'muster',
      source: 'engine',
      launchedTurn: state.turnNumber,
      phaseTurn: state.turnNumber,
      minGroundUnits: required,
    };
  } catch (err) {
    logError('campaignLiftLaunch campaignLiftForSeat failed', { seatId }, err);
    return null;
  }
}

/**
 * Logs why no campaign lift launched.
 *
 * Purpose: A seat with a target and no lift needs a reason in the log.
 * When to use: At each early exit of `campaignLiftForSeat`.
 * Expected outcome: Null, so the caller can return it.
 * Exceptions: None.
 */
function skip(seatId: string, reason: string): null {
  logDebug('campaignLiftLaunch campaignLiftForSeat', { seatId, skipped: reason });
  return null;
}
