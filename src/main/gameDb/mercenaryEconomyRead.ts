/**
 * Treasury, upkeep, and hire fees for one seat's snapshot.
 *
 * Purpose: The top bar and later briefing read one balance, priced with the match's tech flag.
 * When to use: From `getGameStateForPlayer` after the human fog merge. Not on the observe-all snapshot.
 * Expected outcome: Credits, upkeep of current mercenaries, and fees of current hire orders.
 * Exceptions: A type that cannot be hired, or a missing rehire target, logs and counts as 0. SQLite errors propagate.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import type { MercenaryFunds } from '../../shared/ipc/mercenaryTypes';
import { isHireableUnitType, mercenaryHireFee, mercenaryUpkeepFor } from '../../shared/mercenaryRules';
import type { SeatId } from '../../shared/seatIds';
import { logError, logTrace } from '../logger';
import { buildHireContext, listHireEntryHexes } from '../mercenaryHireRules';
import { techLevelForBirthHex } from '../techBonus/techLevelForBirthHex';
import type { BasicDbOps, GuardedDbOps } from './dbOps';
import {
  getTreasuryCredits,
  listHireOrdersForSeat,
  listMercenaryUnitsForSeat,
  type HireOrderRow,
} from './mercenaryState';
import { readPersistedOriginBonusSettings } from './originBonusConfig';

/**
 * Upkeep of one mercenary, or 0 when the type cannot be hired.
 *
 * Purpose: Payroll and the treasury readout share the global upkeep table.
 * When to use: For each mercenary the seat already has. Pass the birth hex the unit row stored.
 * Expected outcome: The upkeep for that type. Advanced only when the match's tech bonus is on and the birth hex is advanced.
 * Exceptions: None. A type outside the four hireable types is logged and returns 0.
 */
export function mercenaryUpkeepForUnit(
  ops: BasicDbOps,
  unit: { readonly unitType: string; readonly birthH3Index: string | null }
): number {
  logTrace('gameDb mercenaryUpkeepForUnit', { unitType: unit.unitType, birthH3Index: unit.birthH3Index });
  if (!isHireableUnitType(unit.unitType)) {
    logError('gameDb mercenaryUpkeepForUnit: type is not hireable', { unitType: unit.unitType });
    return 0;
  }
  return mercenaryUpkeepFor(unit.unitType, tierForHex(ops, unit.birthH3Index));
}

/**
 * The fee one hire order will charge if it fills.
 *
 * Purpose: The hire queue and the per-order tool row price the order. The treasury tip uses `reservedCredits` instead.
 * When to use: For each of the seat's hire orders when a label or a tool row needs the priced fee.
 * Expected outcome: A raise is one turn of upkeep times the count. A rehire is two turns of the named unit's upkeep.
 * Exceptions: None. A missing rehire target is logged and returns 0.
 */
export function hireOrderFee(ops: BasicDbOps, order: HireOrderRow): number {
  logTrace('gameDb hireOrderFee', { id: order.id, kind: order.kind, unitType: order.unitType });
  if (order.kind === 'raise') {
    const upkeep = mercenaryUpkeepFor(order.unitType, tierForHex(ops, order.h3Index));
    return mercenaryHireFee('raise', upkeep) * order.unitCount;
  }
  const row = ops.getOne<{ unitType: string; birthH3Index: string | null } & Record<string, unknown>>(
    'SELECT unit_type AS unitType, birth_h3_index AS birthH3Index FROM units WHERE id = ?',
    [order.neutralUnitId]
  );
  if (!row) {
    logError('gameDb hireOrderFee: rehire target is missing', { id: order.id, neutralUnitId: order.neutralUnitId });
    return 0;
  }
  return mercenaryHireFee('rehire', mercenaryUpkeepForUnit(ops, row));
}

/**
 * The seat's credits, upkeep, pending fees, and mercenary count.
 *
 * Purpose: One read for the snapshot and any later caller that should not rebuild the figures.
 * When to use: When attaching `mercenaryEconomy`, and when a tool asks what the seat can spend.
 * Expected outcome: The live treasury, current mercenary upkeep, and the credits already reserved for current orders.
 * Exceptions: Propagates SQLite errors. A bad unit or order contributes 0, as the helpers log.
 */
export function readMercenaryFunds(ops: BasicDbOps, seatId: SeatId): MercenaryFunds {
  logTrace('gameDb readMercenaryFunds', { seatId });
  const units = listMercenaryUnitsForSeat(ops, seatId);
  const orders = listHireOrdersForSeat(ops, seatId);
  const upkeepPerTurn = units.reduce((sum, unit) => sum + mercenaryUpkeepForUnit(ops, unit), 0);
  const pendingHireFees = orders.reduce((sum, order) => sum + order.reservedCredits, 0);
  return {
    credits: getTreasuryCredits(ops, seatId),
    upkeepPerTurn,
    pendingHireFees,
    mercenaryCount: units.length,
  };
}

/**
 * Adds the hexes where the human can hire or already has an order.
 *
 * Purpose: Hire markers need one sorted list, and march previews must not scan every explored hex.
 * When to use: Only from the human match snapshot, after `mercenaryEconomy` is already set.
 * Expected outcome: The same snapshot when the economy is absent. Otherwise `hireHexes` is the sorted union.
 * Exceptions: Propagates SQLite errors from the hire-order read.
 */
export function withHireHexes(ops: GuardedDbOps, state: GameStateSnapshot, seatId: SeatId): GameStateSnapshot {
  logTrace('gameDb withHireHexes', { seatId, hasEconomy: state.mercenaryEconomy != null });
  if (!state.mercenaryEconomy) return state;
  const ordered = listHireOrdersForSeat(ops, seatId).map((order) => order.h3Index);
  const hireHexes = [...new Set([...listHireEntryHexes(buildHireContext(state, seatId)), ...ordered])].sort();
  return { ...state, mercenaryEconomy: { ...state.mercenaryEconomy, hireHexes } };
}

/**
 * Copies a snapshot and attaches the seat's economy.
 *
 * Purpose: Each seat sees only its own treasury.
 * When to use: On the per-seat snapshot, after fog merges and before the tactical-session merge.
 * Expected outcome: The same snapshot when the database is closed. Otherwise `mercenaryEconomy` is that seat's funds.
 * Exceptions: Propagates SQLite errors from the fund read.
 */
export function withMercenaryEconomy(
  ops: GuardedDbOps,
  state: GameStateSnapshot,
  seatId: SeatId
): GameStateSnapshot {
  logTrace('gameDb withMercenaryEconomy', { seatId, hasDb: ops.hasDb() });
  if (!ops.hasDb()) return state;
  return { ...state, mercenaryEconomy: readMercenaryFunds(ops, seatId) };
}

/**
 * Advanced tech for a hex, or no tier when the match's tech bonus is off.
 *
 * Purpose: Upkeep doubles only while the tech bonus is on and the hex is advanced.
 * When to use: Before pricing a unit or a raise.
 * Expected outcome: `'advanced'` or `undefined`. A basic hex is `undefined`, which keeps the multiplier at 1.
 * Exceptions: None.
 */
function tierForHex(ops: BasicDbOps, h3Index: string | null): 'advanced' | undefined {
  const settings = readPersistedOriginBonusSettings({ getOne: ops.getOne, hasDb: () => true });
  if (settings.techBonusEnabled !== true) return undefined;
  return techLevelForBirthHex(h3Index) === 'advanced' ? 'advanced' : undefined;
}
