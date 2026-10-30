/**
 * Treasury and hire tools for a commander.
 *
 * Purpose: The model reads the same hire view the panel uses, and places the same orders.
 * When to use: The tool loop and the production envelope, while production tools are enabled.
 * Expected outcome: `{ status: 'ok' }` or `{ status: 'error', error }`. A successful place takes the fee. A successful cancel returns it.
 * Exceptions: A thrown error is logged and returned. It does not escape the tool loop.
 */

import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import {
  HIRE_COUNT_MAX,
  HIRE_COUNT_MIN,
  HIRE_REASON_COUNT,
  HIRE_REASON_NOTHING_HERE,
  HIRE_REASON_ORDER_MISSING,
  RAISE_REASON_TYPE,
  REHIRE_REASON_NOT_ELIGIBLE,
  isHireableUnitType,
} from '../../shared/mercenaryRules';
import type { AiSeatId } from '../../shared/seatIds';
import { executePlaceHireOrder, executeRemoveHireOrder, readHexHireView } from '../gameActions/hireOrders';
import { gameDbOps } from '../gameDb/dbConnection';
import { hireOrderFee, readMercenaryFunds } from '../gameDb/mercenaryEconomyRead';
import { listHireOrdersForSeat } from '../gameDb/mercenaryStateAccess';
import { logDebug, logError, logTrace } from '../logger';
import { resolveHexArgument } from './toolHexArgument';
import type { LatLng } from './pathfinding';

/** Tool names the production group adds for hiring. */
export const MERCENARY_TOOL_NAMES = ['query_mercenaries', 'hire_mercenaries'] as const;

/**
 * Whether a tool name is one of the mercenary tools.
 *
 * Purpose: The tool loop must send these names here. `hire_mercenaries` does not contain the word `order`.
 * When to use: Before the standing-order and production arms.
 * Expected outcome: True for the two names above.
 * Exceptions: None.
 */
export function isMercenaryToolName(toolName: string): boolean {
  const match = (MERCENARY_TOOL_NAMES as readonly string[]).includes(toolName);
  logTrace('mercenaryTools isMercenaryToolName', { toolName, match });
  return match;
}

/**
 * Runs one mercenary tool.
 *
 * Purpose: Query reads the live treasury. Hire places or removes one order.
 * When to use: From the tool loop and from the envelope applier.
 * Expected outcome: An ok payload the result encoder can redact, or an error sentence.
 * Exceptions: Caught, logged, and returned as `{ status: 'error', error }`.
 */
export function executeMercenaryTools(
  seatId: AiSeatId,
  toolName: string,
  args: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  logDebug('mercenaryTools executeMercenaryTools', { seatId, toolName, stateTurn: state.turnNumber });
  try {
    const request = (args ?? {}) as Record<string, unknown>;
    if (toolName === 'query_mercenaries') return queryMercenaries(seatId, request, latLngByH3, resolveToH3);
    if (toolName === 'hire_mercenaries') return hireMercenaries(seatId, request, resolveToH3);
    return { status: 'error', error: `Unknown tool: ${toolName}` };
  } catch (err) {
    logError('mercenaryTools executeMercenaryTools: exception', toolName, err);
    return { status: 'error', error: String(err) };
  }
}

/**
 * Treasury and orders, or one hex's hire view.
 *
 * Purpose: The model reads funds from the database, not from the snapshot taken when the consult started.
 * When to use: `query_mercenaries`.
 * Expected outcome: Funds and orders, or the hex view plus `position`. A missing hex is an error.
 * Exceptions: Propagates a database error to the caller, which catches it.
 */
function queryMercenaries(
  seatId: AiSeatId,
  args: { hex?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  if (args.hex !== undefined) return queryOneHex(seatId, args, latLngByH3, resolveToH3);
  const funds = readMercenaryFunds(gameDbOps, seatId);
  const orders = listHireOrdersForSeat(seatId).map((order) => ({
    orderId: order.id,
    kind: order.kind,
    position: latLngByH3.get(order.h3Index) ?? null,
    unitType: order.unitType,
    count: order.unitCount,
    unitId: order.neutralUnitId,
    fee: hireOrderFee(gameDbOps, order),
  }));
  return {
    status: 'ok',
    credits: funds.credits,
    upkeepPerTurn: funds.upkeepPerTurn,
    pendingHireFees: funds.pendingHireFees,
    mercenaryCount: funds.mercenaryCount,
    orders,
  };
}

/**
 * One hex's hire view, with the cell named as a position the encoder can redact.
 *
 * Purpose: The model sees the same options the panel would show.
 * When to use: `query_mercenaries` when a hex was named.
 * Expected outcome: The view without `h3Index`, plus `position`. Null view is nothing here.
 * Exceptions: Propagates a database error.
 */
function queryOneHex(
  seatId: AiSeatId,
  args: { hex?: unknown },
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  const view = readHexHireView(resolved.h3Index, seatId);
  if (!view) return { status: 'error', error: HIRE_REASON_NOTHING_HERE };
  const rest: Record<string, unknown> = { ...view };
  delete rest.h3Index;
  return { status: 'ok', ...rest, position: latLngByH3.get(resolved.h3Index) ?? null };
}

/**
 * Places or removes one hire order.
 *
 * Purpose: The envelope and the tool share `executePlaceHireOrder` and `executeRemoveHireOrder`.
 * When to use: `hire_mercenaries`.
 * Expected outcome: The new order id on a raise or rehire, and the treasury figures either way.
 * Exceptions: Propagates a database error.
 */
function hireMercenaries(
  seatId: AiSeatId,
  args: Record<string, unknown>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  if (args.action === 'cancel') return cancelHire(seatId, args.orderId);
  if (args.action === 'rehire') return rehire(seatId, args.unitId);
  if (args.action === 'raise') return raise(seatId, args, resolveToH3);
  return { status: 'error', error: 'hire_mercenaries requires action raise, rehire, or cancel.' };
}

/**
 * Raises mercenaries on a resolved hex.
 *
 * Purpose: The type and count are checked before the order is stored.
 * When to use: `action` is `raise`.
 * Expected outcome: The stored order id and the current fees.
 * Exceptions: Propagates a database error.
 */
function raise(
  seatId: AiSeatId,
  args: Record<string, unknown>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): Record<string, unknown> {
  const resolved = resolveHexArgument(args, resolveToH3);
  if (!resolved.ok) return { status: 'error', error: resolved.error };
  if (!isHireableUnitType(args.unitType)) return { status: 'error', error: RAISE_REASON_TYPE };
  const count = args.count;
  if (!Number.isInteger(count) || (count as number) < HIRE_COUNT_MIN || (count as number) > HIRE_COUNT_MAX) {
    return { status: 'error', error: HIRE_REASON_COUNT };
  }
  const placed = executePlaceHireOrder(seatId, {
    kind: 'raise',
    h3Index: resolved.h3Index,
    unitType: args.unitType,
    count: count as number,
  });
  if (!placed.success) return { status: 'error', error: placed.reason ?? 'Failed to place hire order.' };
  return hired(seatId, placed.orderId);
}

/**
 * Rehires one Neutral unit.
 *
 * Purpose: The unit id is the only argument.
 * When to use: `action` is `rehire`.
 * Expected outcome: The stored order id and the current fees.
 * Exceptions: Propagates a database error.
 */
function rehire(seatId: AiSeatId, unitId: unknown): Record<string, unknown> {
  if (typeof unitId !== 'string' || unitId.trim() === '') return { status: 'error', error: REHIRE_REASON_NOT_ELIGIBLE };
  const placed = executePlaceHireOrder(seatId, { kind: 'rehire', unitId: unitId.trim() });
  if (!placed.success) return { status: 'error', error: placed.reason ?? 'Failed to place hire order.' };
  return hired(seatId, placed.orderId);
}

/**
 * Removes one of the seat's hire orders.
 *
 * Purpose: A cancel names the order id from a query.
 * When to use: `action` is `cancel`.
 * Expected outcome: The treasury figures after a reserved fee is returned. No order id.
 * Exceptions: Propagates a database error.
 */
function cancelHire(seatId: AiSeatId, orderId: unknown): Record<string, unknown> {
  if (!Number.isInteger(orderId) || (orderId as number) < 1) return { status: 'error', error: HIRE_REASON_ORDER_MISSING };
  const removed = executeRemoveHireOrder(seatId, orderId as number);
  if (!removed.success) return { status: 'error', error: removed.reason ?? 'Failed to remove hire order.' };
  return hired(seatId);
}

/**
 * The ok payload after a hire change, read again so the fees match the table.
 *
 * Purpose: The model sees the order id and the balance after the fee moved.
 * When to use: After a successful place or remove.
 * Expected outcome: Credits, pending fees, and the order id when one was created.
 * Exceptions: Propagates a database error.
 */
function hired(seatId: AiSeatId, orderId?: number): Record<string, unknown> {
  const funds = readMercenaryFunds(gameDbOps, seatId);
  return {
    status: 'ok',
    ...(orderId !== undefined ? { orderId } : {}),
    credits: funds.credits,
    pendingHireFees: funds.pendingHireFees,
  };
}
