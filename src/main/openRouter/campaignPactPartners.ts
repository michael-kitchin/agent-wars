/**
 * Which sides the commander has an active pact with, for campaign targeting.
 *
 * Purpose: A commander does not get the finishing bonus against a side it has promised not to attack.
 * When to use: `campaignInputsFromState`, and tests.
 * Expected outcome: A set of seat ids. A pure filter, and a reader that returns an empty set when agreements cannot be read.
 * Exceptions: None. A failed read is logged and treated as no pacts.
 */

import { sideAgreementStanding, type SideAgreementKind } from '../../shared/sideAgreements';
import { gameDbOps } from '../gameDb/dbConnection';
import { listSideAgreementsForSeat, type SideAgreementRow } from '../gameDb/sideAgreementStore';
import { logDebug, logError, logTrace } from '../logger';

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
 * Purpose: Campaign scoring withholds the finishing bonus from these sides.
 * When to use: Once per campaign input build.
 * Expected outcome: The partners from `pactPartnerSeatIdsFrom`, or an empty set when the read fails.
 * Exceptions: None. A read error is logged with the seat and turn.
 */
export function readActivePactPartnerSeatIds(args: {
  readonly seatId: string;
  readonly turnNumber: number;
  readonly activeSeatIds: ReadonlySet<string>;
}): ReadonlySet<string> {
  logDebug('campaignPactPartners readActivePactPartnerSeatIds', { seatId: args.seatId, turnNumber: args.turnNumber });
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
