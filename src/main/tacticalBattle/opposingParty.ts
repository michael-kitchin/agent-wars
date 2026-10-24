/**
 * Resolves the non-human owner of a tactical battle.
 */

import type { OwnerId } from '../../shared/seatIds';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logTrace } from '../logger';

/**
 * Returns the owner fighting the human in this battle.
 *
 * Purpose: Tempo fire, draft checks, and the other side's embark and ferry all need one id.
 * When to use: Once per beat, after the snapshot exists. A snapshot stored before the field existed is the first AI seat.
 * Expected outcome: `opposingPartyId` when set, otherwise the first AI seat.
 * Exceptions: None.
 */
export function opposingPartyIdOf(
  battle: Pick<TacticalBattleSnapshot, 'battleId' | 'opposingPartyId'>
): OwnerId {
  const party = battle.opposingPartyId ?? AI_SEAT_IDS[0];
  logTrace('opposingPartyIdOf', { battleId: battle.battleId, party });
  return party;
}
