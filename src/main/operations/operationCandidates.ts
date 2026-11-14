/**
 * The sea landings a seat could start on this turn.
 *
 * Purpose: The turn advance and the briefing share one search, including units this tick has already released.
 * When to use: When a sea slot may still be free. The caller keeps its own early return when the land mass is missing.
 * Expected outcome: The same rows `listSeaOperationCandidates` would return, or an empty list when the seat cannot add one.
 * Exceptions: A thrown search is logged and returns an empty list.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { CAMPAIGN_CONTACT_RADIUS } from '../openRouter/campaignRules';
import { campaignPlanForState, loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { GAME_SIZE_MULTIPLIER, parseGameSize } from '../../shared/gameSize';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { buildLiftTerrain } from './liftTerrain';
import { OPERATION_MAX_SEA_PER_SIZE } from './operationRules';
import { listSeaOperationCandidates } from './seaOperationCandidates';

/**
 * How many sea operations this match allows one seat.
 *
 * Purpose: The launch and the menu stop at the same sea-slot count.
 * When to use: Before searching, and when the stored sea operations already fill the match.
 * Expected outcome: `OPERATION_MAX_SEA_PER_SIZE` times the match's size multiplier. An unknown size uses the small multiplier.
 * Exceptions: None.
 */
export function operationSlotsForState(state: GameStateSnapshot): number {
  const slots = OPERATION_MAX_SEA_PER_SIZE * GAME_SIZE_MULTIPLIER[parseGameSize(state.gameSize)];
  logTrace('operationCandidates operationSlotsForState', { gameSize: state.gameSize ?? null, slots });
  return slots;
}

/**
 * Lists the sea landings this seat could add.
 *
 * Purpose: One list feeds the engine's window and the commander's table.
 * When to use: Pass the operations still running and the units released earlier in this tick. Omit `withheldIds` when none were released.
 * Expected outcome: At most the menu size, clear cities first. Empty when every sea slot is taken, the land mass is missing, or the search throws.
 * Exceptions: None. A thrown error is logged and returns an empty list.
 */
export function operationCandidatesForSeat(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly active: readonly Operation[];
  readonly withheldIds?: ReadonlySet<string>;
}): OperationCandidate[] {
  logTrace('operationCandidates operationCandidatesForSeat', {
    seatId: args.seatId,
    active: args.active.length,
    withheld: args.withheldIds?.size ?? 0,
  });
  try {
    const seaActive = args.active.filter((operation) => operation.method === 'sea');
    if (seaActive.length >= operationSlotsForState(args.state)) {
      logDebug('operationCandidates operationCandidatesForSeat', { seatId: args.seatId, skipped: 'slots' });
      return [];
    }
    const landMass = loadCampaignLandMass(args.seatId);
    if (landMass === null) {
      logDebug('operationCandidates operationCandidatesForSeat', { seatId: args.seatId, skipped: 'terrain' });
      return [];
    }
    const terrain = buildLiftTerrain({ state: args.state, seatId: args.seatId, landMass });
    const plan = campaignPlanForState(args.state);
    const protectedUnitIds = new Set<string>([...(plan?.defenderUnitIds ?? []), ...(args.withheldIds ?? [])]);
    for (const unit of args.state.units) {
      if (unit.player !== args.seatId) continue;
      if (unit.unitType !== 'infantry' && unit.unitType !== 'armor') continue;
      if (terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0) protectedUnitIds.add(unit.id);
    }
    return listSeaOperationCandidates({
      state: args.state,
      seatId: args.seatId,
      landMass,
      terrain,
      active: args.active,
      protectedUnitIds,
      hasCampaignPlan: plan !== null,
    });
  } catch (err) {
    logError('operationCandidates operationCandidatesForSeat failed', { seatId: args.seatId }, err);
    return [];
  }
}
