/**
 * The attention line for one affordable raise.
 *
 * Purpose: The Raise Options table can hide a hex past its tenth row. This line still names a hex, a type, and a fee the treasury can pay.
 * When to use: Strategic status injection when production is on.
 * Expected outcome: One sentence, or null when the economy is missing or no option is affordable.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import { HIREABLE_UNIT_TYPES } from '../../shared/mercenaryRules';
import { isSeatId, type SeatId } from '../../shared/seatIds';
import type { HireRaiseOption } from '../../shared/ipc/mercenaryTypes';
import { raiseOptionRowsForSeat, type RaiseOptionRow } from './briefingSectionsMercenaries';

/**
 * Turns of the chosen option's upkeep the treasury must still cover after the fee.
 *
 * Purpose: A raise that the seat cannot pay for next turn is not worth flagging.
 * When to use: `credits >= fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep`.
 * Expected outcome: Three. The seat's current roster upkeep is not part of the comparison.
 * Exceptions: None.
 */
export const MERCENARY_UPKEEP_RESERVE_TURNS = 3;

/**
 * True when the treasury covers the fee and three turns of this option's own upkeep.
 *
 * Purpose: Affordability is the option's price, not the roster the seat already has.
 * When to use: While choosing a row and then an option on that row.
 * Expected outcome: False when the economy cannot pay `fee + 3 * upkeep`.
 * Exceptions: None.
 */
function optionIsAffordable(credits: number, option: HireRaiseOption): boolean {
  return credits >= option.fee + MERCENARY_UPKEEP_RESERVE_TURNS * option.upkeep;
}

/**
 * The cheapest affordable option, infantry before armor before naval before air at the same fee.
 *
 * Purpose: The bullet names one type, and a tie on fee should follow the hire-type order.
 * When to use: After a row is chosen.
 * Expected outcome: Null when none of the row's options are affordable.
 * Exceptions: None.
 */
function cheapestAffordableOption(credits: number, row: RaiseOptionRow): HireRaiseOption | null {
  const affordable = row.options.filter((option) => optionIsAffordable(credits, option));
  affordable.sort(
    (left, right) =>
      left.fee - right.fee ||
      HIREABLE_UNIT_TYPES.indexOf(left.unitType) - HIREABLE_UNIT_TYPES.indexOf(right.unitType)
  );
  return affordable[0] ?? null;
}

/**
 * One raise the commander can order this turn.
 *
 * Purpose: Attention Flags names a hex even when the Raise Options table cut it off.
 * When to use: Strategic production injection. Pass the campaign target the table uses, or null when there is no campaign.
 * Expected outcome: Null when the economy is missing, the seat id is not a seat, or no option is affordable. Otherwise the sentence for the first affordable hex outside the seat's home region, or the first affordable hex when every affordable hex is at home.
 * Exceptions: `raiseOptionRowsForSeat` propagates a database error when no match is open.
 */
export function formatMercenaryRaiseAttention(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: string;
  readonly format: (h3Index: string) => string;
  readonly campaignTargetH3: string | null;
}): string | null {
  const economy = args.state.mercenaryEconomy;
  const seatIsKnown = isSeatId(args.ownSeat);
  let text: string | null = null;
  let hex: string | null = null;
  if (economy != null && seatIsKnown) {
    const ownSeat: SeatId = args.ownSeat;
    const home = new Set(args.state.homeRegionHexesBySeat?.[ownSeat] ?? []);
    const rows = raiseOptionRowsForSeat(args.state, ownSeat, args.campaignTargetH3);
    const affordableRow = (row: RaiseOptionRow): boolean => row.options.some((option) => optionIsAffordable(economy.credits, option));
    const chosen = rows.find((row) => !home.has(row.h3Index) && affordableRow(row)) ?? rows.find(affordableRow) ?? null;
    const option = chosen ? cheapestAffordableOption(economy.credits, chosen) : null;
    if (chosen && option) {
      hex = chosen.h3Index;
      text =
        `Mercenaries: your treasury of ${economy.credits} credits can raise ${option.unitType} at ${args.format(chosen.h3Index)} for ${option.fee}. ` +
        'Add a raise_mercenaries row to productionOrders.';
    }
  }
  logDebug('mercenaryRaiseAttention formatMercenaryRaiseAttention', {
    ownSeat: args.ownSeat,
    credits: economy?.credits ?? null,
    hex,
  });
  return text;
}
