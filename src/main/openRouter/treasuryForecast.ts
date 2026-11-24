/**
 * How long a seat's treasury pays its mercenary upkeep, and the prompt text built from that.
 *
 * Purpose: A commander sees the runway before mercenaries desert, and is told when its treasury holds more credits than it needs. The forecast steps through each credits queue's remaining items and banked points.
 * When to use: The Mercenaries briefing section and the strategic Attention Flags.
 * Expected outcome: One forecast per seat per briefing, from `buildTreasuryForecast`. The sentence and both bullets are built from it.
 * Exceptions: The forecast is an estimate. It ignores hire orders that have not filled, Keep building on an empty queue, and credits produced by anything but the queues' remaining items.
 */

import { CREDITS_PER_ITEM, CREDITS_QUEUE_ITEM } from '../../shared/creditsRules';
import { creditsItemCost } from '../../shared/gameRules';
import { GAME_SIZE_MULTIPLIER, getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import type { BuildUnitType } from '../../shared/ipc/productionTypes';
import { listOccupationPausedHexes } from '../../shared/productionBuildability';
import { logDebug, logTrace } from '../logger';
import { getPlayerUnitCountsByType } from '../productionCaps';

/**
 * Turns of cover at or below which the run-out bullet is shown.
 *
 * Purpose: Desertion happens the turn credits fall below one payroll, so the warning has to come earlier.
 * When to use: `formatTreasuryRunOutAttention`.
 * Expected outcome: Five.
 * Exceptions: None.
 */
export const TREASURY_RUN_OUT_WARNING_TURNS = 5;

/**
 * Turns of mercenary upkeep a treasury must hold before it counts as deep.
 *
 * Purpose: A deep treasury relative to upkeep is credits that could pay for more mercenaries.
 * When to use: `formatTreasuryHoardAttention`.
 * Expected outcome: Twenty. Read by `isTreasuryDeep`.
 * Exceptions: None.
 */
export const TREASURY_HOARD_UPKEEP_TURNS = 20;

/**
 * Credits per game-size step the treasury must hold before it counts as deep.
 *
 * Purpose: A seat with no upkeep still has a deep treasury once it holds this much.
 * When to use: `formatTreasuryHoardAttention`, multiplied by `GAME_SIZE_MULTIPLIER`.
 * Expected outcome: 500, 1,000, or 1,500 credits on Small, Default, or Large. Read by `isTreasuryDeep`.
 * Exceptions: None.
 */
export const TREASURY_HOARD_FLOOR_PER_SIZE = 500;

/**
 * Share of the combined unit caps that chooses the hoard bullet's wording.
 *
 * Purpose: Below this share the side still has room to build, so the bullet also points at unit production. At or above it, the bullet says mercenaries do not count toward caps.
 * When to use: `formatTreasuryHoardAttention`.
 * Expected outcome: One half.
 * Exceptions: None.
 */
export const TREASURY_HOARD_BUILT_CAP_SHARE = 0.5;

/**
 * The unit types the hoard comparison counts.
 *
 * Purpose: Missiles are not fielded the way the other types are, so they stay out of the forces-against-caps comparison.
 * When to use: `formatTreasuryHoardAttention`.
 * Expected outcome: Infantry, armor, naval, air.
 * Exceptions: None.
 */
export const TREASURY_HOARD_UNIT_TYPES: readonly BuildUnitType[] = ['infantry', 'armor', 'naval', 'air'];

/**
 * Turns the forecast steps through before it reports a queue that still pays.
 *
 * Purpose: A credits queue with a large count can outlast any planning horizon, so the projection stops and reports null.
 * When to use: `buildTreasuryForecast`.
 * Expected outcome: One hundred.
 * Exceptions: None.
 */
export const TREASURY_FORECAST_HORIZON_TURNS = 100;

/**
 * One credits queue the forecast steps through.
 *
 * Purpose: A queue buys items until its count runs out, so the forecast needs each queue's items and banked points.
 * When to use: The rows `creditsQueueRowsForSeat` returns and `projectCreditsQueues` reads.
 * Expected outcome: Plain numbers taken from the snapshot at one moment.
 * Exceptions: None.
 */
export interface CreditsQueueRow {
  /**
   * The city hex that owns the queue.
   *
   * Contract: A hex the seat controls.
   * When to use: Logs and tests.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Credits items the queue still buys.
   *
   * Contract: `nextRemainingCount`, at least 1.
   * When to use: The projection's item cap.
   * Expected outcome: A positive whole number.
   * Exceptions: None.
   */
  readonly remainingItems: number;
  /**
   * Production points banked toward the next item.
   *
   * Contract: `storedPoints`, at least 0.
   * When to use: The projection's starting points.
   * Expected outcome: A whole number of zero or more.
   * Exceptions: None.
   */
  readonly storedPoints: number;
  /**
   * Points the city adds each turn.
   *
   * Contract: Urban cells. Zero on a neutral border.
   * When to use: The projection's per-turn gain.
   * Expected outcome: A whole number of zero or more.
   * Exceptions: None.
   */
  readonly pointsPerTurn: number;
}

/**
 * One seat's treasury runway.
 *
 * Purpose: The Mercenaries section and the attention bullets read the same numbers.
 * When to use: Pass the result of `buildTreasuryForecast`.
 * Expected outcome: Plain numbers taken from the snapshot at one moment.
 * Exceptions: None.
 */
export interface TreasuryForecast {
  /**
   * Credits in the treasury now.
   *
   * Contract: `mercenaryEconomy.credits`, after hire fees are already taken.
   * When to use: The bullets and the sentence.
   * Expected outcome: The stored balance.
   * Exceptions: None.
   */
  readonly credits: number;
  /**
   * Upkeep due at the end of the turn.
   *
   * Contract: `mercenaryEconomy.upkeepPerTurn`.
   * When to use: The bullets and the sentence.
   * Expected outcome: Zero when the seat has no mercenaries.
   * Exceptions: None.
   */
  readonly upkeepPerTurn: number;
  /**
   * Credits the seat's credits queues can still add.
   *
   * Contract: Remaining items times `CREDITS_PER_ITEM`, summed over the queue rows.
   * When to use: The bullets and the sentence.
   * Expected outcome: A whole number, zero when no queue is left.
   * Exceptions: None.
   */
  readonly queuedCredits: number;
  /**
   * Payrolls the treasury and the queues cover, starting with this turn's.
   *
   * Contract: The value from `projectCreditsQueues`. Null means upkeep is covered through the horizon.
   * When to use: Deciding which sentence and bullets apply.
   * Expected outcome: Null, or a whole number of zero or more.
   * Exceptions: None.
   */
  readonly coverTurns: number | null;
}

/**
 * The seat's credits queues, one row each.
 *
 * Purpose: Lists the cities that are controlled, unpaused, outside occupation pauses, and queued on credits next.
 * When to use: Building a forecast.
 * Expected outcome: Rows with a positive remaining count. Empty when the snapshot carries no queue totals.
 * Exceptions: None.
 */
export function creditsQueueRowsForSeat(state: GameStateSnapshot, seatId: string): readonly CreditsQueueRow[] {
  const controlled = new Set((state.strategicControl ?? []).filter((row) => row.controllerPlayerId === seatId).map((row) => row.h3Index));
  const paused = listOccupationPausedHexes(state, seatId);
  const urbanByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.urbanHexCount]));
  const rows: CreditsQueueRow[] = [];
  for (const row of state.strategicBuildQueueTotals ?? []) {
    if (!controlled.has(row.h3Index) || row.nextUnitType !== CREDITS_QUEUE_ITEM) continue;
    if (row.buildPaused === true || paused.has(row.h3Index)) continue;
    const remainingItems = Math.trunc(row.nextRemainingCount ?? 0);
    if (remainingItems < 1) continue;
    rows.push({
      h3Index: row.h3Index,
      remainingItems,
      storedPoints: Math.max(0, Math.trunc(row.storedPoints)),
      pointsPerTurn: isNeutralBorderHex(row.h3Index) ? 0 : Math.max(0, Math.trunc(urbanByHex.get(row.h3Index) ?? 0)),
    });
  }
  logTrace('treasuryForecast creditsQueueRowsForSeat', { seatId, rowCount: rows.length });
  return rows;
}

/**
 * Steps the treasury through the credits queues, turn by turn.
 *
 * Purpose: Each turn the queues add their urban cells to banked points, buy whole items, and credit the treasury, then upkeep is paid.
 * When to use: Building a forecast.
 * Expected outcome: A queue that earns no points each turn counts only the items its banked points already pay for, so a neutral-border queue never inflates the total or keeps the projection running. `coverTurns` is the number of payrolls paid before the treasury falls short. After every queue is empty it adds the payrolls the remaining treasury covers. Null when upkeep is 0 or the horizon is reached while still paying. `queuedCredits` is the credits the queues can still add.
 * Exceptions: None.
 */
export function projectCreditsQueues(args: {
  /** Contract: Credits now. Negative values count as zero. */
  readonly credits: number;
  /** Contract: Upkeep due each turn. */
  readonly upkeepPerTurn: number;
  /** Contract: The seat's credits queues. */
  readonly rows: readonly CreditsQueueRow[];
  /** Contract: Production points one item costs. */
  readonly itemCost: number;
  /** Contract: Credits one item adds. */
  readonly creditsPerItem: number;
  /** Contract: Turns to step through. */
  readonly horizonTurns: number;
}): { readonly coverTurns: number | null; readonly queuedCredits: number } {
  const { upkeepPerTurn, itemCost, creditsPerItem } = args;
  const live = args.rows.map((row) => ({
    points: row.storedPoints,
    left: row.pointsPerTurn > 0 ? row.remainingItems : Math.min(row.remainingItems, Math.floor(row.storedPoints / itemCost)),
    perTurn: row.pointsPerTurn,
  }));
  const queuedCredits = live.reduce((sum, row) => sum + row.left * creditsPerItem, 0);
  if (upkeepPerTurn <= 0) return { coverTurns: null, queuedCredits };
  let treasury = Math.max(0, args.credits);
  for (let turn = 1; turn <= args.horizonTurns; turn += 1) {
    for (const row of live) {
      row.points += row.perTurn;
      const bought = Math.min(row.left, Math.floor(row.points / itemCost));
      row.points -= bought * itemCost;
      row.left -= bought;
      treasury += bought * creditsPerItem;
    }
    if (treasury < upkeepPerTurn) return { coverTurns: turn - 1, queuedCredits };
    treasury -= upkeepPerTurn;
    if (live.every((row) => row.left === 0)) return { coverTurns: turn + Math.floor(treasury / upkeepPerTurn), queuedCredits };
  }
  return { coverTurns: null, queuedCredits };
}

/**
 * The forecast for one seat.
 *
 * Purpose: One function feeds the Mercenaries section and the attention bullets.
 * When to use: Once per briefing build.
 * Expected outcome: The forecast, or null when the snapshot has no mercenary economy.
 * Exceptions: None.
 */
export function buildTreasuryForecast(state: GameStateSnapshot, seatId: string): TreasuryForecast | null {
  const economy = state.mercenaryEconomy;
  if (!economy) return null;
  const projection = projectCreditsQueues({
    credits: economy.credits,
    upkeepPerTurn: economy.upkeepPerTurn,
    rows: creditsQueueRowsForSeat(state, seatId),
    itemCost: creditsItemCost(),
    creditsPerItem: CREDITS_PER_ITEM,
    horizonTurns: TREASURY_FORECAST_HORIZON_TURNS,
  });
  logTrace('treasuryForecast buildTreasuryForecast', { seatId, credits: economy.credits, upkeepPerTurn: economy.upkeepPerTurn, ...projection });
  return { credits: economy.credits, upkeepPerTurn: economy.upkeepPerTurn, ...projection };
}

/**
 * "1 more turn" or "N more turns".
 *
 * Purpose: One spelling of the turn count for the sentence and the run-out bullet.
 * When to use: When `coverTurns` is at least 1.
 * Expected outcome: Singular for one turn, plural otherwise.
 * Exceptions: None.
 */
function moreTurnsText(turns: number): string {
  return turns === 1 ? '1 more turn' : `${turns} more turns`;
}

/**
 * The forecast sentence for the Mercenaries section.
 *
 * Purpose: Tells the commander what the credits queues still hold and how many turns the treasury pays upkeep.
 * When to use: Right after the treasury line.
 * Expected outcome: One sentence, or an empty string when upkeep and queued credits are both 0. When `deep` is true, a second sentence says the credits are more than needed and points at mercenaries and unit production, or stands alone when the first is empty.
 * Exceptions: None.
 */
export function formatTreasuryForecastSentence(args: {
  /**
   * The seat's forecast.
   *
   * Contract: From `buildTreasuryForecast`.
   * When to use: The Mercenaries section's forecast paragraph.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly forecast: TreasuryForecast;
  /**
   * Whether to add the "more than you need" sentence.
   *
   * Contract: `isTreasuryDeep` for this forecast, and true only when production is on, so the seat can raise or queue.
   * When to use: Pass false for a production-off seat.
   * Expected outcome: True appends the spend sentence.
   * Exceptions: None.
   */
  readonly deep: boolean;
}): string {
  const { forecast, deep } = args;
  logTrace('treasuryForecast formatTreasuryForecastSentence', { ...forecast, deep });
  const base = forecastBaseSentence(forecast);
  if (!deep) return base;
  const spend = `Your ${forecast.credits} credits are more than you need: spend them on mercenaries before you queue more credits, and queue units instead of credits where a city can still build them.`;
  return base === '' ? spend : `${base} ${spend}`;
}

/**
 * The forecast sentence without the deep-treasury addition.
 *
 * Purpose: Keeps the per-case wording apart from the optional spend sentence.
 * When to use: Only `formatTreasuryForecastSentence`.
 * Expected outcome: One sentence, or an empty string when upkeep and queued credits are both 0.
 * Exceptions: None.
 */
function forecastBaseSentence(forecast: TreasuryForecast): string {
  const { queuedCredits: q, upkeepPerTurn: u, coverTurns: n } = forecast;
  if (u === 0) return q === 0 ? '' : `Your credits queues hold ${q} more credits.`;
  if (q === 0) {
    return n !== null && n >= 1
      ? `No credits are queued, so the treasury covers upkeep for ${moreTurnsText(n)}.`
      : "No credits are queued, and the treasury cannot cover this turn's upkeep.";
  }
  if (n === null) return `Your credits queues hold ${q} more credits. With them, the treasury covers upkeep for at least ${TREASURY_FORECAST_HORIZON_TURNS} more turns.`;
  if (n === 0) return `Your credits queues hold ${q} more credits, but the treasury cannot cover this turn's upkeep.`;
  return `Your credits queues hold ${q} more credits. With them, the treasury covers upkeep for ${moreTurnsText(n)}.`;
}

/**
 * The attention bullet for a treasury about to run out.
 *
 * Purpose: Warns before desertion, which happens the turn credits fall below one payroll.
 * When to use: Strategic Attention Flags when production is on.
 * Expected outcome: One line when cover is 5 turns or fewer, otherwise null. Null for a missing forecast or covered upkeep.
 * Exceptions: None.
 */
export function formatTreasuryRunOutAttention(forecast: TreasuryForecast | null): string | null {
  if (forecast === null || forecast.coverTurns === null || forecast.coverTurns > TREASURY_RUN_OUT_WARNING_TURNS) return null;
  const { credits, queuedCredits, upkeepPerTurn, coverTurns } = forecast;
  const tail = 'Queue more credits, with a larger count or in more cities, raise no more mercenaries, or fire the ones you can spare. Otherwise random mercenaries desert to Neutral.';
  logTrace('treasuryForecast formatTreasuryRunOutAttention', { ...forecast });
  if (coverTurns === 0) {
    return `Treasury: your ${credits} credits and this turn's credits cannot pay this turn's ${upkeepPerTurn} credits of mercenary upkeep. ${tail}`;
  }
  return `Treasury: your ${credits} credits and the ${queuedCredits} credits still queued pay your ${upkeepPerTurn} credits of mercenary upkeep for only ${moreTurnsText(coverTurns)}. ${tail}`;
}

/**
 * Whether a treasury holds more credits than the seat needs.
 *
 * Purpose: The one "more than you need" test, shared by the hoard bullet and the forecast sentence.
 * When to use: Whenever a prompt line depends on the treasury being deep.
 * Expected outcome: True when credits reach the larger of 20 turns of upkeep and the size floor (500 credits per game-size step). With upkeep 0, only the size floor applies.
 * Exceptions: None.
 */
export function isTreasuryDeep(args: {
  /**
   * The seat's forecast.
   *
   * Contract: From `buildTreasuryForecast`. Only `credits` and `upkeepPerTurn` are read.
   * When to use: Pass the forecast the bullet or sentence is built from.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly forecast: TreasuryForecast;
  /**
   * The snapshot's game size.
   *
   * Contract: `GameStateSnapshot.gameSize`, parsed here with `parseGameSize`.
   * When to use: Scales the size floor.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly gameSize: GameStateSnapshot['gameSize'];
}): boolean {
  const { forecast } = args;
  const size = parseGameSize(args.gameSize);
  const creditsFloor = Math.max(TREASURY_HOARD_UPKEEP_TURNS * forecast.upkeepPerTurn, TREASURY_HOARD_FLOOR_PER_SIZE * GAME_SIZE_MULTIPLIER[size]);
  const deep = forecast.credits >= creditsFloor;
  logTrace('treasuryForecast isTreasuryDeep', { credits: forecast.credits, upkeepPerTurn: forecast.upkeepPerTurn, creditsFloor, deep });
  return deep;
}

/**
 * The attention bullet for a deep treasury.
 *
 * Purpose: Points a rich seat at mercenaries, and at unit production while its forces are small.
 * When to use: Strategic Attention Flags when production is on.
 * Expected outcome: One line whenever the treasury is deep. Under half the combined caps it also points at unit production. At or above half it says mercenaries do not count toward caps. Null when the treasury is not deep or there is no forecast.
 * Exceptions: None.
 */
export function formatTreasuryHoardAttention(args: {
  /** Contract: The planning snapshot with units and game size. */
  readonly state: GameStateSnapshot;
  /** Contract: The seat the bullet is written for. */
  readonly ownSeat: string;
  /** Contract: The seat's forecast, or null when there is no economy. */
  readonly forecast: TreasuryForecast | null;
}): string | null {
  const { forecast } = args;
  if (forecast === null || !isTreasuryDeep({ forecast, gameSize: args.state.gameSize })) return null;
  const size = parseGameSize(args.state.gameSize);
  const counts = getPlayerUnitCountsByType(args.state.units, args.ownSeat);
  const caps = getMaxUnitsPerType(size);
  const built = TREASURY_HOARD_UNIT_TYPES.reduce((sum, type) => sum + counts[type], 0);
  const capTotal = TREASURY_HOARD_UNIT_TYPES.reduce((sum, type) => sum + caps[type], 0);
  logTrace('treasuryForecast formatTreasuryHoardAttention', { ownSeat: args.ownSeat, credits: forecast.credits, built, capTotal });
  const held = forecast.upkeepPerTurn > 0
    ? `${forecast.credits} credits, ${Math.floor(forecast.credits / forecast.upkeepPerTurn)} turns of mercenary upkeep`
    : `${forecast.credits} credits and no mercenary upkeep`;
  const lead = `Treasury: ${held}, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. `;
  if (built < capTotal * TREASURY_HOARD_BUILT_CAP_SHARE) {
    return `${lead}Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.`;
  }
  return `${lead}Mercenaries do not count toward those caps: raise them where Raise Options under Mercenaries lists a cell.`;
}

/**
 * Both treasury bullets from one forecast.
 *
 * Purpose: The status injection builds the forecast once and takes at most one bullet.
 * When to use: Strategic status injection when production is on.
 * Expected outcome: `runOut` and `hoard`, never both non-null: a deep treasury covers at least 20 turns of upkeep, so the run-out bullet is already off. Both null without an economy.
 * Exceptions: None.
 */
export function treasuryAttention(
  state: GameStateSnapshot,
  seatId: string
): { readonly runOut: string | null; readonly hoard: string | null } {
  const forecast = buildTreasuryForecast(state, seatId);
  const runOut = formatTreasuryRunOutAttention(forecast);
  const hoard = formatTreasuryHoardAttention({ state, ownSeat: seatId, forecast });
  logDebug('treasuryForecast treasuryAttention', {
    seatId,
    credits: forecast?.credits ?? null,
    upkeepPerTurn: forecast?.upkeepPerTurn ?? null,
    queuedCredits: forecast?.queuedCredits ?? null,
    coverTurns: forecast?.coverTurns ?? null,
    runOut: runOut !== null,
    hoard: hoard !== null,
  });
  return { runOut, hoard };
}
