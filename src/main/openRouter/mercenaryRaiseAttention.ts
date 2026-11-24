/**
 * The attention line for the mercenary raises a treasury can carry.
 *
 * Purpose: A rich seat should spend credits across several cells in one turn. This line names up to six cells from the Raise Options table, paused cities first, each with a count, and keeps 20 turns of total upkeep in the treasury.
 * When to use: Strategic status injection when production is on.
 * Expected outcome: One line naming the cells, or null when the economy is missing or no cell is affordable.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logTrace } from '../logger';
import { HIRE_COUNT_MAX, HIREABLE_UNIT_TYPES } from '../../shared/mercenaryRules';
import { isSeatId, type SeatId } from '../../shared/seatIds';
import type { HireRaiseOption } from '../../shared/ipc/mercenaryTypes';
import { raiseOptionRowsForSeat, type RaiseOptionRow } from './briefingSectionsMercenaries';
import { MERCENARY_BRIEFING_MAX_ROWS } from './promptSpec/gameRuleMercenaryText';

/**
 * Turns of total upkeep the treasury must still cover after the raises.
 *
 * Purpose: A raise is worth flagging only while the seat can keep paying every mercenary it has and every one it raises.
 * When to use: `planMercenaryRaises` and the bullet text.
 * Expected outcome: Twenty. The upkeep counted is the current roster's plus the new raises'.
 * Exceptions: None.
 */
export const MERCENARY_UPKEEP_RESERVE_TURNS = 20;

/**
 * Most cells the raise bullet names.
 *
 * Purpose: Keeps the bullet one readable line while still spreading a large treasury.
 * When to use: `planMercenaryRaises`.
 * Expected outcome: Six.
 * Exceptions: None.
 */
export const MERCENARY_RAISE_ATTENTION_MAX_CELLS = 6;

/**
 * One cell the raise bullet names.
 *
 * Purpose: The bullet text and the tests read the same plan.
 * When to use: The result of `planMercenaryRaises`.
 * Expected outcome: A cell, the option raised there, how many, and whether it restarts a paused queue.
 * Exceptions: None.
 */
export interface MercenaryRaiseCell {
  /**
   * Hex where the units appear.
   *
   * Contract: A hex from the Raise Options rows.
   * When to use: The bullet text.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The cheapest affordable option on that hex.
   *
   * Contract: One of the row's options that keeps the reserve covered.
   * When to use: The unit type and the fee in the bullet.
   * Expected outcome: A hire option.
   * Exceptions: None.
   */
  readonly option: HireRaiseOption;
  /**
   * How many units to raise there.
   *
   * Contract: At least 1, within the hex's capacity and `HIRE_COUNT_MAX`.
   * When to use: The bullet text and the fee total.
   * Expected outcome: A positive whole number.
   * Exceptions: None.
   */
  readonly count: number;
  /**
   * Whether raising here restarts a paused city queue.
   *
   * Contract: Copied from the Raise Options row.
   * When to use: The bullet's "restarts its paused queue" note.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly resumes: boolean;
}

/**
 * Orders the rows: cells that resume first, then other cells outside home, then home cells.
 *
 * Purpose: A raise that restarts a paused queue pays twice, and a cell away from home reaches where the seat has no city.
 * When to use: The start of `planMercenaryRaises`.
 * Expected outcome: A new array with each group in its original order.
 * Exceptions: None.
 */
function orderRaiseRows(rows: readonly RaiseOptionRow[], homeHexes: ReadonlySet<string>): readonly RaiseOptionRow[] {
  const resuming = rows.filter((row) => row.resumes);
  const rest = rows.filter((row) => !row.resumes);
  return [...resuming, ...rest.filter((row) => !homeHexes.has(row.h3Index)), ...rest.filter((row) => homeHexes.has(row.h3Index))];
}

/**
 * The cheapest option the treasury can raise while keeping the reserve.
 *
 * Purpose: Each cell names one type, and a tie on fee follows the hire-type order.
 * When to use: For each row in `planMercenaryRaises`.
 * Expected outcome: Null when no option leaves the reserve covered.
 * Exceptions: None.
 */
function cheapestReservedOption(args: {
  /**
   * Credits still unspent in the plan.
   *
   * Contract: The treasury minus the fees of the cells already planned.
   * When to use: The reserve check.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly credits: number;
  /**
   * Upkeep per turn after the cells already planned.
   *
   * Contract: The roster's upkeep plus the planned raises' upkeep.
   * When to use: The reserve check.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly upkeep: number;
  /**
   * The row whose options are compared.
   *
   * Contract: A Raise Options row.
   * When to use: One row at a time.
   * Expected outcome: Read only. Its options array is copied before sorting.
   * Exceptions: None.
   */
  readonly row: RaiseOptionRow;
}): HireRaiseOption | null {
  const { credits, upkeep, row } = args;
  const kept = row.options.filter((option) => credits - option.fee >= MERCENARY_UPKEEP_RESERVE_TURNS * (upkeep + option.upkeep));
  kept.sort(
    (left, right) => left.fee - right.fee || HIREABLE_UNIT_TYPES.indexOf(left.unitType) - HIREABLE_UNIT_TYPES.indexOf(right.unitType)
  );
  return kept[0] ?? null;
}

/**
 * Spends a treasury across raise cells.
 *
 * Purpose: The only raise budget: the treasury left after the raises still covers 20 turns of total upkeep.
 * When to use: Building the raise bullet.
 * Expected outcome: At most six cells, each with a count of at least 1. Empty when no cell is affordable. The input is not changed.
 * Exceptions: None.
 */
export function planMercenaryRaises(input: {
  /**
   * Credits in the treasury now.
   *
   * Contract: `mercenaryEconomy.credits`, after reserved hire fees are taken.
   * When to use: The starting budget.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly credits: number;
  /**
   * Upkeep due each turn from the mercenaries the seat already has.
   *
   * Contract: `mercenaryEconomy.upkeepPerTurn`.
   * When to use: The starting upkeep the reserve must cover.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly upkeepPerTurn: number;
  /**
   * The raise rows to choose from.
   *
   * Contract: In `raiseOptionRowsForSeat` order, already cut to the rows the table shows.
   * When to use: Pass the same rows the Raise Options table lists.
   * Expected outcome: Read only. Resuming rows go first, then rows outside `homeHexes`, then home rows.
   * Exceptions: None.
   */
  readonly rows: readonly RaiseOptionRow[];
  /**
   * The seat's home-region hexes.
   *
   * Contract: From `homeRegionHexesBySeat`.
   * When to use: Puts home cells after cells outside home.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly homeHexes: ReadonlySet<string>;
}): readonly MercenaryRaiseCell[] {
  const reserve = MERCENARY_UPKEEP_RESERVE_TURNS;
  const cells: MercenaryRaiseCell[] = [];
  let credits = input.credits;
  let upkeep = input.upkeepPerTurn;
  for (const row of orderRaiseRows(input.rows, input.homeHexes)) {
    if (cells.length >= MERCENARY_RAISE_ATTENTION_MAX_CELLS) break;
    const option = cheapestReservedOption({ credits, upkeep, row });
    if (!option) continue;
    const byCredits = Math.floor((credits - reserve * upkeep) / (option.fee + reserve * option.upkeep));
    const count = Math.min(byCredits, Math.floor(row.capacityLeft / option.unitCost), HIRE_COUNT_MAX);
    if (count < 1) continue;
    cells.push({ h3Index: row.h3Index, option, count, resumes: row.resumes });
    credits -= count * option.fee;
    upkeep += count * option.upkeep;
  }
  logTrace('mercenaryRaiseAttention planMercenaryRaises', { credits: input.credits, upkeepPerTurn: input.upkeepPerTurn, cells: cells.length });
  return cells;
}

/**
 * The raise bullet and the cells it names.
 *
 * Purpose: Attention Flags names several affordable cells, all from the rows the Raise Options table shows.
 * When to use: Strategic production injection. Pass the campaign target the table uses, or null when there is no campaign.
 * Expected outcome: `text` is null, and `cells` empty, when the economy is missing, the seat id is not a seat, or no cell is affordable. Otherwise `text` names up to six cells with a count each, and the treasury left still covers 20 turns of upkeep.
 * Exceptions: `raiseOptionRowsForSeat` propagates a database error when no match is open.
 */
export function formatMercenaryRaiseAttention(args: {
  /**
   * The seat's planning snapshot.
   *
   * Contract: Carries `mercenaryEconomy` and `homeRegionHexesBySeat` when the match has them.
   * When to use: The same snapshot the briefing is built from.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat the bullet is written for.
   *
   * Contract: A seat id. Anything else gives no bullet.
   * When to use: The consulting seat.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly ownSeat: string;
  /**
   * Writes a hex the way the briefing does.
   *
   * Contract: The briefing's hex formatter.
   * When to use: Each cell in the bullet.
   * Expected outcome: The hex code the model copies into `raise_mercenaries`.
   * Exceptions: None.
   */
  readonly format: (h3Index: string) => string;
  /**
   * Campaign city the Raise Options table sorts toward.
   *
   * Contract: The same value the Mercenaries section gets, or null without a campaign.
   * When to use: Keeps the bullet's rows the table's rows.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly campaignTargetH3: string | null;
}): { readonly text: string | null; readonly cells: readonly MercenaryRaiseCell[] } {
  const economy = args.state.mercenaryEconomy;
  let cells: readonly MercenaryRaiseCell[] = [];
  if (economy != null && isSeatId(args.ownSeat)) {
    const ownSeat: SeatId = args.ownSeat;
    cells = planMercenaryRaises({
      credits: economy.credits,
      upkeepPerTurn: economy.upkeepPerTurn,
      rows: raiseOptionRowsForSeat(args.state, ownSeat, args.campaignTargetH3).slice(0, MERCENARY_BRIEFING_MAX_ROWS),
      homeHexes: new Set(args.state.homeRegionHexesBySeat?.[ownSeat] ?? []),
    });
  }
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  logDebug('mercenaryRaiseAttention formatMercenaryRaiseAttention', {
    ownSeat: args.ownSeat,
    credits: economy?.credits ?? null,
    cells: cells.length,
    total,
  });
  if (economy == null || cells.length === 0) return { text: null, cells };
  const fees = cells.reduce((sum, cell) => sum + cell.count * cell.option.fee, 0);
  const parts = cells
    .map((cell) => `${cell.count} ${cell.option.unitType} at ${args.format(cell.h3Index)}${cell.resumes ? ' (restarts its paused queue)' : ''}`)
    .join('; ');
  const text =
    `Mercenaries: your treasury of ${economy.credits} credits can raise ${total} ${total === 1 ? 'mercenary' : 'mercenaries'} this turn for ${fees} credits and still keep ${MERCENARY_UPKEEP_RESERVE_TURNS} turns of upkeep: ${parts}. ` +
    'Add one raise_mercenaries row per cell, with that count.';
  return { text, cells };
}
