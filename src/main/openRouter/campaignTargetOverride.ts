/**
 * Stores a commander-chosen campaign target after the consult's orders are applied.
 *
 * Purpose: The briefing for this turn still shows the previous target. The next consult uses the new one.
 * When to use: After a strategic orders envelope names `campaignTarget`.
 * Expected outcome: A valid new city replaces the stored objective. An echo of the current target changes nothing.
 * Exceptions: None. A bad code is a drop reason.
 */

import { codeToH3 } from '../briefing/map/hexCodeTranslator';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { briefingOwnSeatId } from '../briefing/briefingPerspective';
import { dbGetOne, dbRun, type GameStateSnapshot } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { logDebug } from '../logger';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import { CAMPAIGN_SEA_REACH_LIMIT_STEPS } from './campaignSeaConstants';
import { campaignSeaRoutesForState } from './campaignSeaFlow';
import { activeCampaignSkip } from './campaignSeaRules';
import { chooseStagingHex } from './campaignTargetSelection';

/**
 * Validates `campaignTarget` and stores it when it names a reachable enemy city.
 *
 * Purpose: The commander may change the city. Repeating the current code must not reset the phase.
 * When to use: Once, at the end of applying a parsed strategic envelope, when the field is present and orders are on.
 * Expected outcome: `{ applied: true }` for a stored target or an echo. A drop reason names why a code was ignored.
 * Exceptions: None.
 */
export function applyCampaignTargetOverride(args: {
  readonly state: GameStateSnapshot;
  readonly code: string;
  readonly context: CoordinateContext;
}): { readonly applied: boolean; readonly dropReasons: string[] } {
  const drop = (reason: string): { readonly applied: boolean; readonly dropReasons: string[] } => {
    logDebug('campaignTargetOverride applyCampaignTargetOverride', { applied: false, reason });
    return { applied: false, dropReasons: [`campaignTarget dropped: ${reason}`] };
  };
  if (args.state.scenarioId !== 'region_vs_region') return drop('this scenario has no campaign.');
  let targetH3: string;
  try {
    targetH3 = codeToH3(args.code, args.context);
  } catch {
    return drop(`${args.code} is not a hex code on this map.`);
  }
  return applyCampaignTargetH3({ state: args.state, targetH3, label: args.code, allowSea: true });
}

/**
 * Stores a commander-chosen campaign target that is already an H3 index.
 *
 * Purpose: A menu letter and a hex code share one reach check and one write.
 * When to use: After `codeToH3`, and when a land row already names the city hex. Pass `allowSea` true for the commander's `campaignTarget`, so a city reachable only by a campaign lift is accepted. A land launch passes false.
 * Expected outcome: `{ applied: true }` for a stored target or an echo. A city out of land reach is stored as a sea target when `allowSea` is true and a sea route exists within `CAMPAIGN_SEA_REACH_LIMIT_STEPS`. The new target keeps the stored objective's skip while it is active, unless the commander named the skipped city. A drop reason names the city with `label`.
 * Exceptions: None. A match with no campaign, a missing land mass, an unknown city, and an unreachable city are drop reasons.
 */
export function applyCampaignTargetH3(args: {
  readonly state: GameStateSnapshot;
  readonly targetH3: string;
  readonly label: string;
  /**
   * Whether a city out of land reach may become a sea target.
   *
   * Contract: True for the commander's campaign target. False for a land launch, which never stores a sea target.
   * When to use: Set by the caller.
   * Expected outcome: When false, a city out of land reach is refused with the land-only text.
   * Exceptions: None.
   */
  readonly allowSea: boolean;
}): { readonly applied: boolean; readonly dropReasons: string[] } {
  const drop = (reason: string): { readonly applied: boolean; readonly dropReasons: string[] } => {
    logDebug('campaignTargetOverride applyCampaignTargetH3', { applied: false, reason, label: args.label });
    return { applied: false, dropReasons: [`campaignTarget dropped: ${reason}`] };
  };
  if (args.state.scenarioId !== 'region_vs_region') return drop('this scenario has no campaign.');
  const seatId = briefingOwnSeatId(args.state);
  const ops = { getOne: dbGetOne, run: dbRun };
  const stored = readCampaignObjectives(ops).get(seatId) ?? null;
  if (stored?.targetH3 === args.targetH3) {
    logDebug('campaignTargetOverride: echo of the current target ignored', { seatId, label: args.label });
    return { applied: true, dropReasons: [] };
  }
  const skip = activeCampaignSkip(stored, args.state.turnNumber);
  const keptSkip =
    skip !== null && skip.targetH3 !== args.targetH3 ? { skippedTargetH3: skip.targetH3, skippedTurn: skip.sinceTurn } : {};
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return drop('terrain data is not loaded.');
  const inputs = campaignInputsFromState(args.state, landMass);
  if (!inputs.cities.some((city) => city.h3Index === args.targetH3)) return drop(`${args.label} is not a known enemy city.`);
  const landStepsFromForce = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const steps = landStepsFromForce.get(args.targetH3);
  if (steps === undefined || steps > CAMPAIGN_REACH_LIMIT_STEPS) {
    if (!args.allowSea) return drop(`no ground unit of yours can reach ${args.label} by land.`);
    const route = campaignSeaRoutesForState({
      state: args.state,
      seatId,
      landMass,
      cities: inputs.cities,
      landStepsFromForce,
      mustTestH3: args.targetH3,
      skipH3: null,
    }).get(args.targetH3);
    if (route === undefined || route.seaSteps > CAMPAIGN_SEA_REACH_LIMIT_STEPS) {
      return drop(`no ground unit of yours can reach ${args.label} by land or by a campaign lift.`);
    }
    writeCampaignObjectiveForSeat(ops, seatId, {
      targetH3: args.targetH3,
      stagingH3: null,
      phase: 'assault',
      source: 'commander',
      chosenTurn: args.state.turnNumber,
      approach: 'sea',
      ...keptSkip,
    });
    logDebug('campaignTargetOverride: commander sea target stored', { seatId, label: args.label, seaSteps: route.seaSteps });
    return { applied: true, dropReasons: [] };
  }
  const stagingH3 = chooseStagingHex({
    ownControlledLandHexes: inputs.ownControlledLandHexes,
    landStepsFromTarget: campaignLandSteps(inputs, landMass, [args.targetH3]),
    landStepsFromForce,
  });
  writeCampaignObjectiveForSeat(ops, seatId, {
    targetH3: args.targetH3,
    stagingH3,
    phase: stagingH3 === null ? 'assault' : 'assemble',
    source: 'commander',
    chosenTurn: args.state.turnNumber,
    ...keptSkip,
  });
  logDebug('campaignTargetOverride: commander target stored', { seatId, label: args.label, stagingH3 });
  return { applied: true, dropReasons: [] };
}
