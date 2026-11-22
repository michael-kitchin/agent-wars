/**
 * Keeps or replaces the campaign objective at each consult.
 *
 * Purpose: Applies the keep rule, the retarget rule, and the staging and phase refresh to a stored objective. Phase and unit-role rules are in `campaignRules`, and target and staging choice are in `campaignTargetSelection`.
 * When to use: From campaignObjectiveFlow, which supplies inputs derived from the snapshot, and from tests.
 * Expected outcome: The same result for the same inputs. Nothing here reads the database or the terrain cache.
 * Exceptions: None.
 */

import type { CampaignApproach, CampaignObjective } from '../../shared/campaignTypes';
import { logDebug } from '../logger';
import {
  CAMPAIGN_REACH_LIMIT_STEPS,
  campaignAssaultThreshold,
  campaignMassCenters,
  countMassedUnits,
  nextCampaignPhase,
  type HopDistance,
} from './campaignRules';
import { CAMPAIGN_SEA_REACH_LIMIT_STEPS } from './campaignSeaConstants';
import { campaignApproachFor, campaignSeaTargetExpired, type CampaignSkip } from './campaignSeaRules';
import { chooseCampaignTarget, chooseStagingHex, type CampaignCity } from './campaignTargetSelection';

/**
 * The approach and skip fields of a resolved objective.
 *
 * Purpose: A land target stores no approach and no skip stores no skip fields, so a plain land campaign reads back as it did before sea targets existed.
 * When to use: When building a new or kept objective in `resolveCampaignObjective`.
 * Expected outcome: An object holding only the fields that apply: `approach` for a sea target, and both skip fields when a skip is active.
 * Exceptions: None.
 */
function seaFields(approach: CampaignApproach, skip: CampaignSkip | null): Partial<CampaignObjective> {
  return {
    ...(approach === 'sea' ? { approach } : {}),
    ...(skip !== null ? { skippedTargetH3: skip.targetH3, skippedTurn: skip.sinceTurn } : {}),
  };
}

/**
 * The objective to store for this consult.
 *
 * Purpose: Keeps a valid target, refreshes a lost staging hex, and retargets when the city is gone, out of reach, or a sea target that waited too long for a campaign lift.
 * When to use: Once per strategic consult, before the briefing.
 * Expected outcome: Null with no ground units or no candidate. Otherwise the kept objective, with its staging hex refreshed only when it was lost, and the phase from `nextCampaignPhase`. A stored target is out of reach when its land steps are missing or greater than `CAMPAIGN_REACH_LIMIT_STEPS` and it has no sea route within `CAMPAIGN_SEA_REACH_LIMIT_STEPS`, unless it is a sea target with a campaign lift stored for it, which stays reachable and keeps the sea approach. When the stored target is not a candidate, is out of reach, or has expired, a new engine objective in assemble, or in assault without a staging hex, chosen without the skipped city. Every objective gets `approach` from `campaignApproachFor` (stored only for sea), keeps `liftLaunchedTurn` and `liftCancelledTurn` while the target is kept (a new target starts without them), and carries the skip.
 * Exceptions: None.
 */
export function resolveCampaignObjective(args: {
  readonly stored: CampaignObjective | null;
  readonly turnNumber: number;
  readonly cities: readonly CampaignCity[];
  readonly landStepsFromForce: ReadonlyMap<string, number>;
  readonly ownControlledLandHexes: readonly string[];
  readonly landStepsFromTarget: (targetH3: string) => ReadonlyMap<string, number>;
  readonly groundUnitHexes: readonly string[];
  readonly hopDistance: HopDistance;
  readonly assaultMinUnits?: number;
  /**
   * Sea steps of each city that has a feasible sea route.
   *
   * Contract: Built from `chooseCampaignSeaRoutes`. A city with no entry has no sea route.
   * When to use: Choosing a new target, keeping a stored one, and setting the approach.
   * Expected outcome: A map that may be empty.
   * Exceptions: None.
   */
  readonly seaStepsByH3: ReadonlyMap<string, number>;
  /**
   * Whether the seat has a campaign lift stored for the stored target.
   *
   * Contract: True when a stored operation of the seat is a campaign lift whose objective is the stored objective's target. A lift left over from an earlier target does not count.
   * When to use: A target with a lift running does not expire, and a sea target with a lift running stays reachable when the lift's own troops and ships leave too little capacity for a fresh route.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly campaignLiftRunning: boolean;
  /**
   * The sea target to leave out, with the turn it was dropped.
   *
   * Contract: From `campaignSkipFor`. Null when no skip is active.
   * When to use: Removing the city from the choice and storing the skip on the objective.
   * Expected outcome: A skip or null.
   * Exceptions: None.
   */
  readonly skip: CampaignSkip | null;
}): CampaignObjective | null {
  if (args.groundUnitHexes.length === 0) {
    logDebug('campaignObjectiveResolution resolveCampaignObjective', { storedTarget: args.stored?.targetH3 ?? null, target: null, steps: null, phase: null });
    return null;
  }
  const candidateH3s = new Set(args.cities.map((city) => city.h3Index));
  const stored = args.stored;
  const storedSteps = stored === null ? undefined : args.landStepsFromForce.get(stored.targetH3);
  const storedSeaSteps = stored === null ? undefined : args.seaStepsByH3.get(stored.targetH3);
  const landReachable = storedSteps !== undefined && storedSteps <= CAMPAIGN_REACH_LIMIT_STEPS;
  const seaReachable = storedSeaSteps !== undefined && storedSeaSteps <= CAMPAIGN_SEA_REACH_LIMIT_STEPS;
  // A lift for this target already holds the troops and ships, so the route search sees too little free capacity once it launches. A stored sea target counts as reachable while its lift is stored.
  const liftHoldsSeaTarget = stored !== null && stored.approach === 'sea' && !landReachable && args.campaignLiftRunning;
  let objective: CampaignObjective;
  if (
    stored === null ||
    !candidateH3s.has(stored.targetH3) ||
    !(landReachable || seaReachable || liftHoldsSeaTarget) ||
    campaignSeaTargetExpired({
      objective: stored,
      turnNumber: args.turnNumber,
      landReachable,
      campaignLiftRunning: args.campaignLiftRunning,
    })
  ) {
    const choices = args.cities.filter((city) => city.h3Index !== args.skip?.targetH3);
    const targetH3 = chooseCampaignTarget(choices, args.landStepsFromForce, args.seaStepsByH3);
    if (targetH3 === null) {
      logDebug('campaignObjectiveResolution resolveCampaignObjective', { storedTarget: stored?.targetH3 ?? null, target: null, steps: null, phase: null });
      return null;
    }
    const stagingH3 = chooseStagingHex({
      ownControlledLandHexes: args.ownControlledLandHexes,
      landStepsFromTarget: args.landStepsFromTarget(targetH3),
      landStepsFromForce: args.landStepsFromForce,
    });
    objective = {
      targetH3,
      stagingH3,
      phase: stagingH3 === null ? 'assault' : 'assemble',
      source: 'engine',
      chosenTurn: args.turnNumber,
      ...seaFields(
        campaignApproachFor({ landSteps: args.landStepsFromForce.get(targetH3), seaSteps: args.seaStepsByH3.get(targetH3) }),
        args.skip
      ),
    };
  } else {
    const stagingStillHeld = stored.stagingH3 !== null && args.ownControlledLandHexes.includes(stored.stagingH3);
    const stagingH3 =
      stored.stagingH3 === null || stagingStillHeld
        ? stored.stagingH3
        : chooseStagingHex({
            ownControlledLandHexes: args.ownControlledLandHexes,
            landStepsFromTarget: args.landStepsFromTarget(stored.targetH3),
            landStepsFromForce: args.landStepsFromForce,
          });
    const withStaging: CampaignObjective = { ...stored, stagingH3 };
    const phase = nextCampaignPhase({
      phase: stored.phase,
      stagingH3,
      massedCount: countMassedUnits(args.groundUnitHexes, campaignMassCenters(withStaging), args.hopDistance),
      threshold: campaignAssaultThreshold(args.groundUnitHexes.length, args.assaultMinUnits),
    });
    objective = {
      targetH3: stored.targetH3,
      stagingH3,
      phase,
      source: stored.source,
      chosenTurn: stored.chosenTurn,
      ...(stored.liftLaunchedTurn !== undefined ? { liftLaunchedTurn: stored.liftLaunchedTurn } : {}),
      ...(stored.liftCancelledTurn !== undefined ? { liftCancelledTurn: stored.liftCancelledTurn } : {}),
      ...seaFields(
        liftHoldsSeaTarget ? 'sea' : campaignApproachFor({ landSteps: storedSteps, seaSteps: storedSeaSteps }),
        args.skip
      ),
    };
  }
  logDebug('campaignObjectiveResolution resolveCampaignObjective', {
    storedTarget: stored?.targetH3 ?? null,
    target: objective.targetH3,
    steps: args.landStepsFromForce.get(objective.targetH3) ?? null,
    phase: objective.phase,
    approach: objective.approach ?? 'land',
    skip: args.skip?.targetH3 ?? null,
  });
  return objective;
}
