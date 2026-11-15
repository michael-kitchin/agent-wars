/**
 * Resolves the non-human owner of a tactical battle.
 */

import type { OwnerId } from '../../shared/seatIds';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { logTrace } from '../logger';

/**
 * Reports whether a seat is one of the two sides in this battle.
 *
 * Purpose: The player's staged messages are sent only on a beat of a battle that seat is in.
 * When to use: After reading the snapshot that was active before a tactical commit.
 * Expected outcome: True for either named party. A battle with no lead is a human battle, so the human seat is included. An AI-only battle does not include the human seat.
 * Exceptions: None.
 */
export function battleHasPartySeat(
  battle: Pick<TacticalBattleSnapshot, 'battleId' | 'leadPartyId' | 'opposingPartyId'>,
  seatId: string
): boolean {
  const included = seatId === battle.leadPartyId
    || seatId === battle.opposingPartyId
    || (battle.leadPartyId == null && seatId === HUMAN_SEAT_ID);
  logTrace('opposingParty battleHasPartySeat', { battleId: battle.battleId, included });
  return included;
}

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
