/**
 * Hexes a commander shares with a side it has an active pact with.
 *
 * Purpose: Units of two sides in one hex fight whatever was agreed, so the orders prompt names the hexes where that is about to happen.
 * When to use: The Messages section of a strategic orders prompt.
 * Expected outcome: A short block naming each partner and the shared hex codes, or null.
 * Exceptions: None. A failed read is logged and gives no lines.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { isSeatActive } from '../../shared/seatRoster';
import { listUnitsForSnapshot } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { readTurnNumberOrFirst } from '../gameDb/turnStateReads';
import { logDebug, logError, logTrace } from '../logger';
import { readActivePactPartnerSeatIds } from '../openRouter/campaignPactPartners';
import { STRATEGIC_ZONE_CODE_TRANSLATOR } from './sideAgreementZoneCodes';

/**
 * Most hex codes one partner's line lists.
 *
 * Purpose: A long shared front must not fill the prompt.
 * When to use: `formatPactContactLines`.
 * Expected outcome: 6. Further hexes are counted at the end of the line.
 * Exceptions: None.
 */
export const PACT_CONTACT_MAX_HEXES_PER_SIDE = 6;

/**
 * The hexes where the commander's units and a pact partner's units both stand.
 *
 * Purpose: Only a shared hex leads to fighting, so only those are reported.
 * When to use: With the full unit list and the active pact partners.
 * Expected outcome: For each partner with a shared hex, those hexes sorted as strings. An embarked unit does not count. A partner with no shared hex has no entry.
 * Exceptions: None.
 */
export function sharedHexesWithPactPartners(args: {
  readonly ownSeatId: string;
  readonly partnerSeatIds: ReadonlySet<string>;
  readonly units: readonly {
    readonly player: string;
    readonly h3Index: string;
    readonly embarkedOnCarrierUnitId?: string | null;
  }[];
}): ReadonlyMap<string, readonly string[]> {
  logTrace('pactContactLines sharedHexesWithPactPartners', {
    ownSeatId: args.ownSeatId,
    partnerCount: args.partnerSeatIds.size,
    unitCount: args.units.length,
  });
  const standing = args.units.filter((unit) => !unit.embarkedOnCarrierUnitId);
  const ownHexes = new Set(standing.filter((unit) => unit.player === args.ownSeatId).map((unit) => unit.h3Index));
  const shared = new Map<string, readonly string[]>();
  for (const partner of args.partnerSeatIds) {
    const hexes = new Set(
      standing.filter((unit) => unit.player === partner && ownHexes.has(unit.h3Index)).map((unit) => unit.h3Index)
    );
    if (hexes.size > 0) shared.set(partner, [...hexes].sort());
  }
  return shared;
}

/**
 * Writes the contact block.
 *
 * Purpose: One line per partner says where the two sides are about to fight.
 * When to use: After `sharedHexesWithPactPartners`.
 * Expected outcome: Null when no partner has a hex with a code. Otherwise the heading and one line per partner, in the map's order, with at most `PACT_CONTACT_MAX_HEXES_PER_SIDE` codes and a count of the rest. A hex with no code is left out.
 * Exceptions: None.
 */
export function formatPactContactLines(args: {
  readonly sharedByPartner: ReadonlyMap<string, readonly string[]>;
  readonly sideName: (seatId: string) => string;
  readonly hexCode: (h3Index: string) => string | null;
}): string | null {
  logTrace('pactContactLines formatPactContactLines', { partnerCount: args.sharedByPartner.size });
  const lines: string[] = [];
  for (const [partner, hexes] of args.sharedByPartner) {
    const codes = hexes.map((h3Index) => args.hexCode(h3Index)).filter((code): code is string => code !== null);
    if (codes.length === 0) continue;
    const listed = codes.slice(0, PACT_CONTACT_MAX_HEXES_PER_SIDE).join(', ');
    const rest = codes.length - PACT_CONTACT_MAX_HEXES_PER_SIDE;
    const more = rest > 0 ? ` and ${rest} more` : '';
    lines.push(
      `- ${args.sideName(partner)}: your units and theirs are both in ${listed}${more}. Units in the same hex fight at the end of every turn until one side leaves.`
    );
  }
  return lines.length > 0 ? ['Contact with sides you have an active agreement with:', ...lines].join('\n') : null;
}

/**
 * Reads the open match and writes one commander's contact block.
 *
 * Purpose: Reading every unit is safe here, because only hexes that hold the commander's own units are reported, and a unit always sees what stands in its own hex.
 * When to use: Once per strategic orders prompt that includes agreements.
 * Expected outcome: The block from `formatPactContactLines`, or null with no active pact partner or no shared hex.
 * Exceptions: None. A failed read is logged and gives null, so it never stops a prompt.
 */
export function readPactContactLines(args: {
  readonly seatId: AiSeatId;
  readonly sideName: (seatId: string) => string;
}): string | null {
  logDebug('pactContactLines readPactContactLines', { seatId: args.seatId });
  try {
    const partnerSeatIds = readActivePactPartnerSeatIds({
      seatId: args.seatId,
      turnNumber: readTurnNumberOrFirst(gameDbOps.getOne),
      activeSeatIds: new Set(
        readSeatRoster(gameDbOps)
          .filter((seat) => seat.seatId !== args.seatId && isSeatActive(seat))
          .map((seat) => seat.seatId)
      ),
    });
    if (partnerSeatIds.size === 0) return null;
    return formatPactContactLines({
      sharedByPartner: sharedHexesWithPactPartners({ ownSeatId: args.seatId, partnerSeatIds, units: listUnitsForSnapshot() }),
      sideName: args.sideName,
      hexCode: STRATEGIC_ZONE_CODE_TRANSLATOR.h3ToCode,
    });
  } catch (err) {
    logError('pactContactLines readPactContactLines failed', { seatId: args.seatId }, err);
    return null;
  }
}
