/**
 * Enemy cities the land campaign could turn to.
 *
 * Purpose: Operation Options can offer a new campaign target without storing an operation.
 * When to use: When the commander's menu includes land rows. A named land launch stores the target directly and does not call this search.
 * Expected outcome: Up to `OPERATION_MENU_LAND_ROWS` cities inside `CAMPAIGN_MAX_LAND_STEPS`, excluding the current target. Empty when the match has no campaign or no ground unit.
 * Exceptions: None. A missing campaign row reads as no current target.
 */

import type { LandMassByH3 } from '../../shared/landTraversalStrategic';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne } from '../gameDb';
import { readCampaignObjectives } from '../gameDb/campaignObjectiveMemory';
import { logDebug } from '../logger';
import { campaignInputsFromState, campaignLandSteps } from '../openRouter/campaignObjectiveFlow';
import {
  CAMPAIGN_ENEMY_HOME_WEIGHT,
  CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP,
  CAMPAIGN_MAX_LAND_STEPS,
  chooseStagingHex,
  type CampaignCity,
} from '../openRouter/campaignTargetSelection';
import type { OperationCandidate } from '../../shared/operationTypes';
import { countObjectiveReinforcers, LIFT_OBJECTIVE_CLEAR_RADIUS } from './liftRules';
import type { LiftTerrain } from './liftTerrain';
import { OPERATION_MENU_LAND_ROWS } from './operationRules';

/**
 * True when the first city outranks the second.
 *
 * Purpose: The menu uses the same cross-multiply as the campaign's own target choice, so a float score cannot reorder a tie.
 * When to use: Sorting the cities that passed the step cap.
 * Expected outcome: True only when the first score is strictly greater.
 * Exceptions: None.
 */
function scoreBeats(city: CampaignCity, steps: number, other: CampaignCity, otherSteps: number): boolean {
  const weight = city.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const otherWeight = other.inEnemyHome ? CAMPAIGN_ENEMY_HOME_WEIGHT : 1;
  const left =
    city.urbanHexCount * weight * (otherSteps + 2) * (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + other.knownFortifiedCount);
  const right =
    other.urbanHexCount * otherWeight * (steps + 2) * (CAMPAIGN_FORTIFICATIONS_PER_PENALTY_STEP + city.knownFortifiedCount);
  return left > right;
}

/**
 * Lists the campaign targets this seat could choose.
 *
 * Purpose: One search fills the land rows of the menu.
 * When to use: Pass the caller's snapshot, not the unmasked unit list. Pass `onlyObjectiveH3` to return that one city, including the current target, when it is inside the step limit.
 * Expected outcome: Ranked rows, at most `OPERATION_MENU_LAND_ROWS` unless one city was named. `clear` is true when no enemy unit stands within the clear radius.
 * Exceptions: None.
 */
export function listLandOperationCandidates(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
  readonly terrain: LiftTerrain;
  readonly onlyObjectiveH3?: string;
}): OperationCandidate[] {
  const finish = (candidates: readonly OperationCandidate[]): OperationCandidate[] => {
    logDebug('landOperationCandidates listLandOperationCandidates', {
      seatId: args.seatId,
      candidateCount: candidates.length,
      only: args.onlyObjectiveH3 ?? null,
    });
    return [...candidates];
  };
  if (args.state.scenarioId !== 'region_vs_region') return finish([]);
  const inputs = campaignInputsFromState(args.state, args.landMass);
  if (inputs.groundUnits.length === 0) return finish([]);
  const steps = campaignLandSteps(inputs, args.landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const current = readCampaignObjectives({ getOne: dbGetOne }).get(args.seatId)?.targetH3 ?? null;
  const named = args.onlyObjectiveH3;
  const cities = inputs.cities.filter((city) => {
    if (named !== undefined && city.h3Index !== named) return false;
    if (named === undefined && city.h3Index === current) return false;
    const distance = steps.get(city.h3Index);
    return distance !== undefined && distance <= CAMPAIGN_MAX_LAND_STEPS;
  });
  cities.sort((left, right) => {
    const leftSteps = steps.get(left.h3Index) ?? 0;
    const rightSteps = steps.get(right.h3Index) ?? 0;
    if (scoreBeats(left, leftSteps, right, rightSteps)) return -1;
    if (scoreBeats(right, rightSteps, left, leftSteps)) return 1;
    if (leftSteps !== rightSteps) return leftSteps - rightSteps;
    return left.h3Index < right.h3Index ? -1 : left.h3Index > right.h3Index ? 1 : 0;
  });
  const kept = named === undefined ? cities.slice(0, OPERATION_MENU_LAND_ROWS) : cities;
  return finish(kept.map((city) => {
    const etaTurns = steps.get(city.h3Index) ?? 0;
    const staging = chooseStagingHex({
      ownControlledLandHexes: inputs.ownControlledLandHexes,
      landStepsFromTarget: campaignLandSteps(inputs, args.landMass, [city.h3Index]),
      landStepsFromForce: steps,
    });
    const defenders = args.terrain.enemyUnitsWithin(city.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS);
    return {
      method: 'land' as const,
      objectiveH3: city.h3Index,
      musterH3: staging ?? city.h3Index,
      landingH3: city.h3Index,
      unitIds: inputs.groundUnits.map((unit) => unit.id),
      carrierIds: [],
      etaTurns,
      urbanHexCount: city.urbanHexCount,
      inEnemyHome: city.inEnemyHome,
      knownFortifiedCount: city.knownFortifiedCount,
      defenders,
      reinforcers: countObjectiveReinforcers({ state: args.state, seatId: args.seatId, cityH3: city.h3Index, etaTurns }),
      clear: defenders === 0,
    };
  }));
}
