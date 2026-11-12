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
  const seatId = briefingOwnSeatId(args.state);
  const ops = { getOne: dbGetOne, run: dbRun };
  const stored = readCampaignObjectives(ops).get(seatId) ?? null;
  if (stored?.targetH3 === targetH3) {
    logDebug('campaignTargetOverride: echo of the current target ignored', { seatId, code: args.code });
    return { applied: true, dropReasons: [] };
  }
  const landMass = loadCampaignLandMass(seatId);
  if (landMass === null) return drop('terrain data is not loaded.');
  const inputs = campaignInputsFromState(args.state, landMass);
  if (!inputs.cities.some((city) => city.h3Index === targetH3)) return drop(`${args.code} is not a known enemy city.`);
  const landStepsFromForce = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const steps = landStepsFromForce.get(targetH3);
  if (steps === undefined || steps > CAMPAIGN_REACH_LIMIT_STEPS) {
    return drop(`no ground unit of yours can reach ${args.code} by land.`);
  }
  const stagingH3 = chooseStagingHex({
    ownControlledLandHexes: inputs.ownControlledLandHexes,
    landStepsFromTarget: campaignLandSteps(inputs, landMass, [targetH3]),
    landStepsFromForce,
  });
  writeCampaignObjectiveForSeat(ops, seatId, {
    targetH3,
    stagingH3,
    phase: stagingH3 === null ? 'assault' : 'assemble',
    source: 'commander',
    chosenTurn: args.state.turnNumber,
  });
  logDebug('campaignTargetOverride: commander target stored', { seatId, code: args.code, stagingH3 });
  return { applied: true, dropReasons: [] };
}
