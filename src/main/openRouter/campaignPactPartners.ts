/**
 * Which sides the commander has an active pact with.
 *
 * Purpose: The engine's own choices leave a side the commander has promised not to attack alone, and the prompt says where the two sides meet.
 * When to use: Campaign target choice and its override, campaign lifts, engine-launched operations, the Campaign Objective section, the contact lines, and tests.
 * Expected outcome: A set of seat ids, and the one test for a city a pact partner holds. The set is empty while the talk stage is off and when agreements cannot be read.
 * Exceptions: None. A failed read is logged and treated as no pacts.
 */

import { sideAgreementStanding, type SideAgreementKind } from '../../shared/sideAgreements';
import type { GameStateSnapshot } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { listSideAgreementsForSeat, type SideAgreementRow } from '../gameDb/sideAgreementStore';
import { logDebug, logError, logTrace } from '../logger';
import { campaignTargetHolderSeatId } from './briefingSectionsCampaign';
import { sideAgreementsEnabled } from './sideAgreementGate';

/**
 * Agreement kinds that count as a pact against attacking the counterpart.
 *
 * Purpose: A non-aggression pact or a ceasefire in place both mean the two sides are not fighting.
 * When to use: `pactPartnerSeatIdsFrom`.
 * Expected outcome: `non_aggression` and `ceasefire_in_place`.
 * Exceptions: None.
 */
export const CAMPAIGN_PACT_KINDS: readonly SideAgreementKind[] = ['non_aggression', 'ceasefire_in_place'];

/**
 * Seats the commander has an active pact with, from agreement rows already read.
 *
 * Purpose: Keeps the rule testable without a database.
 * When to use: `readActivePactPartnerSeatIds`, and tests.
 * Expected outcome: The counterpart of every row whose kind is in `CAMPAIGN_PACT_KINDS` and whose standing for `turnNumber` is `active`. A proposed, expired, lapsed, or otherwise closed row does not count, and neither does a pact with an inactive counterpart.
 * Exceptions: None.
 */
export function pactPartnerSeatIdsFrom(args: {
  readonly rows: readonly SideAgreementRow[];
  readonly turnNumber: number;
  readonly activeSeatIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  logTrace('campaignPactPartners pactPartnerSeatIdsFrom', { turnNumber: args.turnNumber, rowCount: args.rows.length });
  const partners = new Set<string>();
  for (const row of args.rows) {
    if (!CAMPAIGN_PACT_KINDS.includes(row.kind)) continue;
    const standing = sideAgreementStanding({
      status: row.status,
      endTurn: row.endTurn,
      currentTurn: args.turnNumber,
      counterpartActive: args.activeSeatIds.has(row.counterpartSeatId),
    });
    if (standing === 'active') partners.add(row.counterpartSeatId);
  }
  return partners;
}

/**
 * Reads the commander's own agreements and returns its active pact partners.
 *
 * Purpose: One read gives every caller the same partners.
 * When to use: Whenever an engine choice or a prompt line depends on the commander's active pacts.
 * Expected outcome: The partners from `pactPartnerSeatIdsFrom`. An empty set while `sideAgreementsEnabled('strategic')` is false, so stored pacts steer nothing the commander cannot see, and when the read fails.
 * Exceptions: None. A read error is logged with the seat and turn.
 */
export function readActivePactPartnerSeatIds(args: {
  readonly seatId: string;
  readonly turnNumber: number;
  readonly activeSeatIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  logDebug('campaignPactPartners readActivePactPartnerSeatIds', { seatId: args.seatId, turnNumber: args.turnNumber });
  if (!sideAgreementsEnabled('strategic')) return new Set();
  try {
    return pactPartnerSeatIdsFrom({
      rows: listSideAgreementsForSeat(gameDbOps, args.seatId),
      turnNumber: args.turnNumber,
      activeSeatIds: args.activeSeatIds,
    });
  } catch (err) {
    logError(`campaignPactPartners: reading agreements failed for ${args.seatId} on turn ${args.turnNumber}`, err);
    return new Set();
  }
}

/**
 * Seats still in the match, other than one seat.
 *
 * Purpose: Pact reads and known-city lists need the same set of other sides.
 * When to use: Before reading pact partners or listing enemy cities from a snapshot.
 * Expected outcome: The seat id of every roster row with no out turn, without `seatId`. Empty when the snapshot has no roster.
 * Exceptions: None.
 */
export function activeOtherSeatIds(state: Pick<GameStateSnapshot, 'seats'>, seatId: string): ReadonlySet<string> {
  const others = new Set<string>(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId)
  );
  logTrace('campaignPactPartners activeOtherSeatIds', { seatId, count: others.size });
  return others;
}

/**
 * The active pact partners of one seat on the turn of a snapshot.
 *
 * Purpose: Every caller that holds a snapshot passes the same turn and the same other seats.
 * When to use: An engine choice or a prompt line built from a game state snapshot.
 * Expected outcome: The result of `readActivePactPartnerSeatIds` for the snapshot's turn and `activeOtherSeatIds`.
 * Exceptions: None.
 */
export function readPactPartnerSeatIdsForState(
  state: Pick<GameStateSnapshot, 'seats' | 'turnNumber'>,
  seatId: string
): ReadonlySet<string> {
  logTrace('campaignPactPartners readPactPartnerSeatIdsForState', { seatId, turnNumber: state.turnNumber });
  return readActivePactPartnerSeatIds({ seatId, turnNumber: state.turnNumber, activeSeatIds: activeOtherSeatIds(state, seatId) });
}

/**
 * Whether a side the seat has an active pact with holds a city, as far as the seat knows.
 *
 * Purpose: The engine's own attacks on a city are judged by the same fog rule that picks campaign cities, so a hidden capture neither blocks nor allows one.
 * When to use: Before the engine sends a lift to a target it picked, and when the commander names such a target. `state` must be the snapshot taken for `seatId`, because the fog rule reads its perspective.
 * Expected outcome: True only when `campaignTargetHolderSeatId` is an active pact partner.
 * Exceptions: None. A failed agreement read gives false.
 */
export function cityHeldByPactPartner(state: GameStateSnapshot, seatId: string, h3Index: string): boolean {
  const holderSeatId = campaignTargetHolderSeatId(state, h3Index);
  const held = holderSeatId !== null && readPactPartnerSeatIdsForState(state, seatId).has(holderSeatId);
  logTrace('campaignPactPartners cityHeldByPactPartner', { seatId, h3Index, holderSeatId, held });
  return held;
}
