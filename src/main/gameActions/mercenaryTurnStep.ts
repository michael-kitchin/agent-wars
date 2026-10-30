/**
 * Pays mercenaries, deserts the ones a seat cannot pay, and fills hire orders.
 *
 * Purpose: This is the only end-of-turn write for the treasury and for hiring.
 * When to use: Immediately after production and before the snapshot used for victory and the turn report.
 * Expected outcome: Empty maps when the match has no mercenary and no hire order. Otherwise orders are deleted.
 * Exceptions: On failure, logs, rolls the transaction back, and rethrows.
 */

import { hashStringToUint32 } from '../../shared/stableHash';
import { unitCostFor } from '../../shared/gameRules';
import type { SeatId } from '../../shared/seatIds';
import { isHexExploredForPlayer } from '../gameDb/fogState';
import { gameDbOps } from '../gameDb/dbConnection';
import {
  deleteAllHireOrders,
  getTreasuryCredits,
  listAllHireOrders,
  listMercenaryUnitsForSeat,
  setTreasuryCredits,
  type HireOrderRow,
  type MercenaryUnitRow,
} from '../gameDb/mercenaryState';
import { mercenaryUpkeepForUnit } from '../gameDb/mercenaryEconomyRead';
import { getGameSeed, getGameState, getSeatRoster } from '../gameDb';
import { logDebug, logError } from '../logger';
import { buildHireContext, evaluateHexHire, type HireContext } from '../mercenaryHireRules';
import { settleMercenaryPayroll, shuffleWithSeed, type PayrollMercenary } from '../mercenaryPayroll';
import { createStrategicUnit } from './strategicUnitSpawn';
import { convertUnitsToNeutral, transferNeutralUnitToSeat, type KnockoutCoordinates } from './unitOwnershipTransfer';

/**
 * How many units each seat hired, lost to desertion, or left unfilled.
 *
 * Purpose: The human turn report reads the human seat's counts. A seat with nothing to report is absent.
 * When to use: The ready result after this step.
 * Expected outcome: Counts above 0 only. Inactive seats are in none of the maps.
 * Exceptions: None.
 */
export interface MercenaryTurnSummary {
  /**
   * Units hired, including each unit of a partial raise.
   *
   * Contract: A raise that fills at least one unit contributes that count and is not also unfilled.
   * When to use: `humanMercenariesHired`.
   * Expected outcome: The seat maps to the number of units that changed hands or were created.
   * Exceptions: None.
   */
  readonly hiredBySeat: ReadonlyMap<SeatId, number>;
  /**
   * Units that became Neutral for lack of pay, cargo included.
   *
   * Contract: A deserting ship's cargo counts even when that cargo was not a mercenary.
   * When to use: `humanUnitsDeserted`.
   * Expected outcome: The number of units converted for that seat.
   * Exceptions: None.
   */
  readonly desertedBySeat: ReadonlyMap<SeatId, number>;
  /**
   * Orders that hired nobody.
   *
   * Contract: A partial raise is not included. An inactive seat's orders are not included.
   * When to use: `humanHireOrdersUnfilled`.
   * Expected outcome: One per blocked order, zero-count raise, or unfilled rehire.
   * Exceptions: None.
   */
  readonly unfilledOrdersBySeat: ReadonlyMap<SeatId, number>;
}

/**
 * Runs payroll and then every active seat's hire orders.
 *
 * Purpose: Production has already added credits. Knockout has not yet removed the seat.
 * When to use: From turn finalization, with the same coordinates Neutral defend orders use.
 * Expected outcome: The summary. No transaction and no random draw when there is nothing to pay or hire.
 * Exceptions: Logs and rethrows after rolling back. A missile raise throws from unit creation and rolls back.
 */
export function resolveMercenariesAtEndOfTurn(args: {
  readonly turnNumber: number;
  readonly coordinates: KnockoutCoordinates;
}): MercenaryTurnSummary {
  logDebug('gameActions resolveMercenariesAtEndOfTurn', { turnNumber: args.turnNumber });
  const hasMercenary = gameDbOps.getOne<{ one: number }>(
    'SELECT 1 AS one FROM units WHERE is_mercenary = 1 LIMIT 1'
  );
  const hasOrder = gameDbOps.getOne<{ one: number }>('SELECT 1 AS one FROM res_s_hire_orders LIMIT 1');
  if (!hasMercenary && !hasOrder) return emptySummary();
  gameDbOps.run('BEGIN');
  try {
    const summary = settleAndHire(args);
    deleteAllHireOrders(gameDbOps);
    gameDbOps.run('COMMIT');
    return summary;
  } catch (err) {
    logError('gameActions resolveMercenariesAtEndOfTurn failed', { turnNumber: args.turnNumber, error: err });
    gameDbOps.run('ROLLBACK');
    throw err;
  }
}

/**
 * Pays each active seat, then fills the shuffled orders.
 *
 * Purpose: Desertion uses the board from before hiring, and later orders see units hired earlier.
 * When to use: Inside the transaction.
 * Expected outcome: The three maps. Credits are written after payroll and again after hires.
 * Exceptions: Propagates a database or conversion error to the caller, which rolls back.
 */
function settleAndHire(args: {
  readonly turnNumber: number;
  readonly coordinates: KnockoutCoordinates;
}): MercenaryTurnSummary {
  const roster = getSeatRoster();
  const active = new Set(roster.filter((seat) => seat.outTurn === null).map((seat) => seat.seatId));
  const hiredBySeat = new Map<SeatId, number>();
  const desertedBySeat = new Map<SeatId, number>();
  const unfilledOrdersBySeat = new Map<SeatId, number>();
  const assignments = gameDbOps.getAll<{ navalUnitId: string; landUnitId: string } & Record<string, unknown>>(
    'SELECT naval_unit_id AS navalUnitId, land_unit_id AS landUnitId FROM unit_transport_assignments'
  );
  for (const seat of roster) {
    if (seat.outTurn !== null) continue;
    const units = listMercenaryUnitsForSeat(gameDbOps, seat.seatId);
    if (units.length === 0) continue;
    const payroll = settleMercenaryPayroll({
      mercenaries: payrollRows(units, assignments),
      credits: getTreasuryCredits(gameDbOps, seat.seatId),
      seed: hashStringToUint32(`${getGameSeed()}|${args.turnNumber}|desert|${seat.seatId}`),
    });
    convertUnitsToNeutral(payroll.deserterIds, args.coordinates);
    setTreasuryCredits(gameDbOps, seat.seatId, payroll.creditsAfter);
    addCount(desertedBySeat, seat.seatId, payroll.deserterIds.length);
  }
  const orders = listAllHireOrders(gameDbOps).filter((order) => {
    if (active.has(order.playerId)) return true;
    logDebug('gameActions resolveMercenariesAtEndOfTurn skipped inactive hire order', {
      orderId: order.id,
      playerId: order.playerId,
    });
    return false;
  });
  const shuffled = shuffleOrders(orders, args.turnNumber);
  let state = getGameState();
  const contexts = new Map<SeatId, HireContext>();
  const raiseCostUsedByHex = new Map<string, number>();
  const creditsBySeat = new Map<SeatId, number>();
  for (const order of shuffled) {
    const hired = order.kind === 'raise'
      ? fillRaise(order, state, contexts, raiseCostUsedByHex, creditsBySeat, args.turnNumber)
      : fillRehire(order, state, contexts, creditsBySeat);
    if (hired > 0) {
      addCount(hiredBySeat, order.playerId, hired);
      state = getGameState();
      contexts.clear();
      continue;
    }
    addCount(unfilledOrdersBySeat, order.playerId, 1);
  }
  for (const [seatId, credits] of creditsBySeat) setTreasuryCredits(gameDbOps, seatId, credits);
  return { hiredBySeat, desertedBySeat, unfilledOrdersBySeat };
}

/**
 * Builds payroll rows from one transport read.
 *
 * Purpose: A mercenary aboard a mercenary ship stays in that ship's cargo and is not also a rider.
 * When to use: Once per seat that has mercenaries.
 * Expected outcome: One row per mercenary. `cargoIds` includes cargo that is not a mercenary.
 * Exceptions: None.
 */
function payrollRows(
  units: readonly MercenaryUnitRow[],
  assignments: readonly { navalUnitId: string; landUnitId: string }[]
): PayrollMercenary[] {
  const cargoByShip = new Map<string, string[]>();
  const shipByLand = new Map<string, string>();
  for (const row of assignments) {
    const cargo = cargoByShip.get(row.navalUnitId) ?? [];
    cargo.push(row.landUnitId);
    cargoByShip.set(row.navalUnitId, cargo);
    shipByLand.set(row.landUnitId, row.navalUnitId);
  }
  return units.map((unit) => ({
    id: unit.id,
    upkeep: mercenaryUpkeepForUnit(gameDbOps, unit),
    carriedByShipId: shipByLand.get(unit.id) ?? null,
    cargoIds: cargoByShip.get(unit.id) ?? [],
  }));
}

/**
 * Fills a raise up to capacity, count, and credits.
 *
 * Purpose: A hex the seat has not explored and does not call home is not filled, even on the full board.
 * When to use: For one raise order. The context cache is rebuilt after a hire.
 * Expected outcome: How many units were created. 0 when the order cannot be filled.
 * Exceptions: Propagates a unit-creation error.
 */
function fillRaise(
  order: HireOrderRow,
  state: ReturnType<typeof getGameState>,
  contexts: Map<SeatId, HireContext>,
  raiseCostUsedByHex: Map<string, number>,
  creditsBySeat: Map<SeatId, number>,
  turnNumber: number
): number {
  const home = state.homeRegionHexesBySeat?.[order.playerId] ?? [];
  if (!isHexExploredForPlayer(gameDbOps, order.playerId, order.h3Index) && !home.includes(order.h3Index)) return 0;
  const evaluation = evaluateHexHire(contextFor(contexts, state, order.playerId), order.h3Index);
  if (evaluation.blockedReason || evaluation.raiseBlockedReason) return 0;
  const option = evaluation.raiseOptions.find((row) => row.unitType === order.unitType);
  if (!option) return 0;
  const used = raiseCostUsedByHex.get(order.h3Index) ?? 0;
  const room = Math.floor((evaluation.raiseCapacityPerTurn - used) / option.unitCost);
  const credits = creditsOf(creditsBySeat, order.playerId);
  const affordable = option.fee > 0 ? Math.floor(credits / option.fee) : 0;
  const count = Math.min(order.unitCount, Math.max(0, room), Math.max(0, affordable));
  if (count <= 0) return 0;
  for (let i = 0; i < count; i += 1) {
    createStrategicUnit({
      owner: order.playerId,
      unitType: order.unitType,
      h3Index: order.h3Index,
      turnNumber,
      isMercenary: true,
    });
  }
  raiseCostUsedByHex.set(order.h3Index, used + count * unitCostFor(order.unitType));
  creditsBySeat.set(order.playerId, credits - count * option.fee);
  return count;
}

/**
 * Fills a rehire when the unit is still a candidate and the fee fits.
 *
 * Purpose: The second seat's order for the same unit fails once the first seat owns it.
 * When to use: For one rehire order.
 * Expected outcome: 1 when the unit changes owner. 0 when it does not.
 * Exceptions: Propagates a transfer error.
 */
function fillRehire(
  order: HireOrderRow,
  state: ReturnType<typeof getGameState>,
  contexts: Map<SeatId, HireContext>,
  creditsBySeat: Map<SeatId, number>
): number {
  const unitId = order.neutralUnitId;
  if (!unitId) return 0;
  const unit = state.units.find((row) => row.id === unitId);
  if (!unit) return 0;
  const evaluation = evaluateHexHire(contextFor(contexts, state, order.playerId), unit.h3Index);
  if (evaluation.blockedReason) return 0;
  const candidate = evaluation.rehireCandidates.find((row) => row.unitId === unitId);
  if (!candidate) return 0;
  const credits = creditsOf(creditsBySeat, order.playerId);
  if (candidate.fee > credits) return 0;
  transferNeutralUnitToSeat(unitId, order.playerId);
  creditsBySeat.set(order.playerId, credits - candidate.fee);
  return 1;
}

/**
 * Returns the cached hire context, building it from the current board.
 *
 * Purpose: Orders that hire nobody can share one snapshot.
 * When to use: Each order. Clear the cache after a hire.
 * Expected outcome: The context for that seat.
 * Exceptions: None.
 */
function contextFor(
  contexts: Map<SeatId, HireContext>,
  state: ReturnType<typeof getGameState>,
  seatId: SeatId
): HireContext {
  const cached = contexts.get(seatId);
  if (cached) return cached;
  const context = buildHireContext(state, seatId);
  contexts.set(seatId, context);
  return context;
}

/**
 * Reads a seat's credits once, after payroll.
 *
 * Purpose: Later orders of the same seat spend the reduced balance.
 * When to use: The first time an order needs the balance.
 * Expected outcome: The treasury balance, then the local remaining balance.
 * Exceptions: None.
 */
function creditsOf(creditsBySeat: Map<SeatId, number>, seatId: SeatId): number {
  const cached = creditsBySeat.get(seatId);
  if (cached != null) return cached;
  const credits = getTreasuryCredits(gameDbOps, seatId);
  creditsBySeat.set(seatId, credits);
  return credits;
}

/**
 * Shuffles hire orders with the turn's hire seed.
 *
 * Purpose: Two seats ordering the same unit do not get a fixed winner.
 * When to use: After inactive orders are dropped.
 * Expected outcome: A new array. The seed does not include a seat id.
 * Exceptions: None.
 */
function shuffleOrders(orders: readonly HireOrderRow[], turnNumber: number): HireOrderRow[] {
  return shuffleWithSeed(orders, hashStringToUint32(`${getGameSeed()}|${turnNumber}|hire`));
}

/**
 * Adds a positive count to a seat's map.
 *
 * Purpose: Zero is omitted so the ready result can treat a missing seat as zero.
 * When to use: After a hire, a desertion, or an unfilled order.
 * Expected outcome: The seat's total increases by `amount` when `amount` is positive.
 * Exceptions: None.
 */
function addCount(map: Map<SeatId, number>, seatId: SeatId, amount: number): void {
  if (amount <= 0) return;
  map.set(seatId, (map.get(seatId) ?? 0) + amount);
}

/**
 * A summary with nothing to report.
 *
 * Purpose: The early return must not open a transaction.
 * When to use: When the match has no mercenary and no hire order.
 * Expected outcome: Three empty maps.
 * Exceptions: None.
 */
function emptySummary(): MercenaryTurnSummary {
  return { hiredBySeat: new Map(), desertedBySeat: new Map(), unfilledOrdersBySeat: new Map() };
}
