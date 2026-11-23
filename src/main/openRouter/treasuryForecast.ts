/**
 * How long a seat's treasury pays its mercenary upkeep, and the prompt text built from that.
 *
 * Purpose: A commander sees the runway before mercenaries desert, and sees an idle treasury while its forces sit far below their caps.
 * When to use: The Mercenaries briefing section and the strategic Attention Flags.
 * Expected outcome: One forecast per seat per briefing, from `buildTreasuryForecast`. The sentence and both bullets are built from it.
 * Exceptions: The forecast is an estimate. It ignores hire orders that have not filled, Keep building on an empty queue, and a credits entry that runs out of count.
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
 * Turns of mercenary upkeep a treasury must hold before it counts as idle.
 *
 * Purpose: A deep treasury relative to upkeep is credits that could pay for more mercenaries.
 * When to use: `formatTreasuryHoardAttention`.
 * Expected outcome: Twenty.
 * Exceptions: None.
 */
export const TREASURY_HOARD_UPKEEP_TURNS = 20;

/**
 * Credits per game-size step the treasury must hold before it counts as idle.
 *
 * Purpose: A seat with no upkeep still has an idle treasury once it holds this much.
 * When to use: `formatTreasuryHoardAttention`, multiplied by `GAME_SIZE_MULTIPLIER`.
 * Expected outcome: 500, 1,000, or 1,500 credits on Small, Default, or Large.
 * Exceptions: None.
 */
export const TREASURY_HOARD_FLOOR_PER_SIZE = 500;

/**
 * Share of the combined unit caps below which the side's forces count as small.
 *
 * Purpose: Idle credits matter only while the side still has room to build or hire.
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
   * Estimated credits the seat's credits queues add each turn.
   *
   * Contract: The value from `estimateCreditsIncomePerTurn`.
   * When to use: The bullets and the sentence.
   * Expected outcome: A whole number, zero when no city produces credits.
   * Exceptions: None.
   */
  readonly incomePerTurn: number;
  /**
   * Payrolls the treasury and income cover, starting with this turn's.
   *
   * Contract: The value from `treasuryCoverTurns`. Null means income covers upkeep.
   * When to use: Deciding which sentence and bullets apply.
   * Expected outcome: Null, or a whole number of zero or more.
   * Exceptions: None.
   */
  readonly coverTurns: number | null;
}

/**
 * Payrolls that credits and income cover.
 *
 * Purpose: The one place cover turns are computed. Credits produced in a turn arrive before that turn's upkeep is paid.
 * When to use: Building a forecast.
 * Expected outcome: Null when income covers upkeep. Otherwise the whole number of payrolls, zero when credits plus income fall short of this turn's upkeep.
 * Exceptions: None.
 */
export function treasuryCoverTurns(args: {
  /** Contract: Credits now. Negative values count as zero. */
  readonly credits: number;
  /** Contract: Upkeep due each turn. */
  readonly upkeepPerTurn: number;
  /** Contract: Estimated credits income each turn. */
  readonly incomePerTurn: number;
}): number | null {
  const drain = args.upkeepPerTurn - args.incomePerTurn;
  const turns = drain <= 0 ? null : Math.floor(Math.max(0, args.credits) / drain);
  logTrace('treasuryForecast treasuryCoverTurns', { ...args, drain, turns });
  return turns;
}

/**
 * Estimated credits a seat's credits queues add each turn.
 *
 * Purpose: Counts the urban cells of cities that are controlled, unpaused, outside neutral borders, and queued on credits next.
 * When to use: Building a forecast.
 * Expected outcome: A whole number of credits. Zero when the snapshot carries no queue totals.
 * Exceptions: None.
 */
export function estimateCreditsIncomePerTurn(state: GameStateSnapshot, seatId: string): number {
  const controlled = new Set((state.strategicControl ?? []).filter((row) => row.controllerPlayerId === seatId).map((row) => row.h3Index));
  const paused = listOccupationPausedHexes(state, seatId);
  const urbanByHex = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.urbanHexCount]));
  let points = 0;
  for (const row of state.strategicBuildQueueTotals ?? []) {
    if (!controlled.has(row.h3Index) || row.nextUnitType !== CREDITS_QUEUE_ITEM) continue;
    if (row.buildPaused === true || paused.has(row.h3Index) || isNeutralBorderHex(row.h3Index)) continue;
    points += Math.max(0, Math.trunc(urbanByHex.get(row.h3Index) ?? 0));
  }
  const income = Math.floor((points * CREDITS_PER_ITEM) / creditsItemCost());
  logTrace('treasuryForecast estimateCreditsIncomePerTurn', { seatId, points, income });
  return income;
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
  const incomePerTurn = estimateCreditsIncomePerTurn(state, seatId);
  const coverTurns = treasuryCoverTurns({ credits: economy.credits, upkeepPerTurn: economy.upkeepPerTurn, incomePerTurn });
  logTrace('treasuryForecast buildTreasuryForecast', { seatId, credits: economy.credits, upkeepPerTurn: economy.upkeepPerTurn, incomePerTurn, coverTurns });
  return { credits: economy.credits, upkeepPerTurn: economy.upkeepPerTurn, incomePerTurn, coverTurns };
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
 * Purpose: Tells the commander how many turns the treasury and credits queues pay upkeep.
 * When to use: Right after the treasury line when upkeep is above 0.
 * Expected outcome: One sentence, or an empty string when upkeep is 0.
 * Exceptions: None.
 */
export function formatTreasuryForecastSentence(forecast: TreasuryForecast): string {
  logTrace('treasuryForecast formatTreasuryForecastSentence', { ...forecast });
  if (forecast.upkeepPerTurn === 0) return '';
  const lead = forecast.incomePerTurn > 0 ? `At about ${forecast.incomePerTurn} credits a turn from your credits queues, ` : 'With no city producing credits, ';
  if (forecast.coverTurns === null) return `${lead}upkeep is covered.`;
  if (forecast.coverTurns === 0) return `${lead}the treasury cannot cover this turn's upkeep.`;
  return `${lead}the treasury covers upkeep for ${moreTurnsText(forecast.coverTurns)}.`;
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
  const { credits, incomePerTurn, upkeepPerTurn, coverTurns } = forecast;
  const tail = 'Queue credits in more cities or raise no more mercenaries, or random mercenaries desert to Neutral.';
  const head = `Treasury: your ${credits} credits and about ${incomePerTurn} credits a turn from credits queues`;
  logTrace('treasuryForecast formatTreasuryRunOutAttention', { ...forecast });
  if (coverTurns === 0) {
    return `${head} cannot pay this turn's ${upkeepPerTurn} credits of mercenary upkeep. ${tail}`;
  }
  return `${head} pay your ${upkeepPerTurn} credits of mercenary upkeep for only ${moreTurnsText(coverTurns)}. ${tail}`;
}

/**
 * The attention bullet for an idle treasury.
 *
 * Purpose: Points a rich seat with small forces at mercenaries and unit production.
 * When to use: Strategic Attention Flags when production is on.
 * Expected outcome: One line when credits reach 20 turns of upkeep and the size floor while fielded units are under half the combined caps. Otherwise null.
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
  if (forecast === null) return null;
  const size = parseGameSize(args.state.gameSize);
  const counts = getPlayerUnitCountsByType(args.state.units, args.ownSeat);
  const caps = getMaxUnitsPerType(size);
  const built = TREASURY_HOARD_UNIT_TYPES.reduce((sum, type) => sum + counts[type], 0);
  const capTotal = TREASURY_HOARD_UNIT_TYPES.reduce((sum, type) => sum + caps[type], 0);
  const creditsFloor = Math.max(TREASURY_HOARD_UPKEEP_TURNS * forecast.upkeepPerTurn, TREASURY_HOARD_FLOOR_PER_SIZE * GAME_SIZE_MULTIPLIER[size]);
  logTrace('treasuryForecast formatTreasuryHoardAttention', { ownSeat: args.ownSeat, credits: forecast.credits, creditsFloor, built, capTotal });
  if (forecast.credits < creditsFloor || built >= capTotal * TREASURY_HOARD_BUILT_CAP_SHARE) return null;
  const held = forecast.upkeepPerTurn > 0
    ? `${forecast.credits} credits, ${Math.floor(forecast.credits / forecast.upkeepPerTurn)} turns of mercenary upkeep`
    : `${forecast.credits} credits and no mercenary upkeep`;
  return (
    `Treasury: ${held}, while you field ${built} infantry, armor, naval, and air units against a combined cap of ${capTotal}. ` +
    'Raise mercenaries where Raise Options under Mercenaries lists a cell, and queue units instead of credits where a city can still build them.'
  );
}

/**
 * Both treasury bullets from one forecast.
 *
 * Purpose: The status injection builds the forecast once and takes at most one bullet.
 * When to use: Strategic status injection when production is on.
 * Expected outcome: `runOut` and `hoard`, never both non-null. Both null without an economy.
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
    incomePerTurn: forecast?.incomePerTurn ?? null,
    coverTurns: forecast?.coverTurns ?? null,
    runOut: runOut !== null,
    hoard: hoard !== null,
  });
  return { runOut, hoard };
}
