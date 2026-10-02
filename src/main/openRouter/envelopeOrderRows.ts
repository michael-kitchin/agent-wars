/**
 * Applies the order envelope's `orders[]` rows: movement, fire, sealift, and standing orders.
 *
 * Purpose: Keeps per-action row handling apart from envelope extraction in `orderResponseParsing`.
 * When to use: `parseOrdersResponse`, after grouped `unitIds` rows are expanded to one row per unit.
 * Expected outcome: Collected movement, ranged, and embark orders, plus a drop reason for every object row it rejects.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from '../briefing/map/coordinateContext';
import { codeToH3 } from '../briefing/map/hexCodeTranslator';
import { translateAssignOrderHexCodeParams } from './assignOrderHexParams';
import type { LatLng } from '../tools/pathfinding';
import { executeStandingOrders } from '../tools/standingOrders';
import type { EmbarkOrder } from '../../shared/ipcTypes';
import { clearEmbarkAssignmentForLandUnit, isEmbarkedLandUnit } from '../gameActions/sealift';

/**
 * Orders collected from the `orders[]` rows of one envelope.
 *
 * Purpose: Names the result shape `parseOrdersResponse` merges into its own result.
 * When to use: Return type of `processV3OrdersArray`.
 * Expected outcome: Every array is present, possibly empty.
 * Exceptions: None.
 */
export interface EnvelopeOrderRowsResult {
  /**
   * Unit moves to resolved H3 cells, including transport moves (keyed by the naval unit) and disembarks.
   *
   * Contract: One entry per accepted row; duplicates are left for the apply step to report.
   * When to use: Applied as movement orders after parsing.
   * Expected outcome: `toH3Index` is a valid cell id for the consultation's coordinate mode.
   * Exceptions: None.
   */
  movementOrders: { unitId: string; toH3Index: string }[];
  /**
   * Ranged attacks with a resolved target cell.
   *
   * Contract: One entry per accepted `ranged_attack` row.
   * When to use: Applied as ranged orders after parsing.
   * Expected outcome: `targetH3Index` is the target hex or the target unit's current cell.
   * Exceptions: None.
   */
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  /**
   * Land units to load onto a naval unit.
   *
   * Contract: One entry per accepted `embark` row; capacity is checked by the apply step.
   * When to use: Applied as embark orders after parsing.
   * Expected outcome: Both ids are non-empty.
   * Exceptions: None.
   */
  embarkOrders: EmbarkOrder[];
  /**
   * One readable note per rejected row, naming the action and unit.
   *
   * Contract: Rows that are not objects are skipped without a note.
   * When to use: Merged into the envelope's drop reasons so drop counts and logs show every rejected order.
   * Expected outcome: Empty when every row was accepted.
   * Exceptions: None.
   */
  dropReasons: string[];
}

/**
 * Translates a briefing hex code to an H3 cell id.
 *
 * Purpose: Move, transport, disembark, and ranged rows all address hexes by briefing code.
 * When to use: After the value passed `HEX_CODE_PATTERN`.
 * Expected outcome: The H3 id, or `undefined` when the code is not on the consultation's map.
 * Exceptions: None; a translation failure is logged and returns `undefined`.
 */
function hexCodeToH3OrUndefined(code: string, context: CoordinateContext): string | undefined {
  try {
    return codeToH3(code, context);
  } catch (err) {
    logError('openRouter hexCodeToH3OrUndefined: hex code could not be translated', {
      code,
      mode: context.mode,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * Reads a row's destination when it is a well-formed briefing hex code.
 *
 * Purpose: Shares the destination check across move, transport, and disembark rows.
 * When to use: Before translating a destination with `hexCodeToH3OrUndefined`.
 * Expected outcome: The code, or `undefined` when the value is missing, not a string, or malformed.
 * Exceptions: None.
 */
function destinationCode(raw: unknown): string | undefined {
  return typeof raw === 'string' && HEX_CODE_PATTERN.test(raw) ? raw : undefined;
}

/**
 * Resolves a ranged-attack target given as a briefing hex code or a unit id.
 *
 * Purpose: Ranged rows may target a hex or a unit; both become an H3 cell.
 * When to use: `ranged_attack` rows, after checking exactly one target selector is present.
 * Expected outcome: The target cell, or `undefined` when the code is off the map or the unit is unknown.
 * Exceptions: None.
 */
function resolveExplicitRangedTarget(target: string, state: GameStateSnapshot, context: CoordinateContext): string | undefined {
  if (HEX_CODE_PATTERN.test(target)) return hexCodeToH3OrUndefined(target, context);
  return state.units.find((unit) => unit.id === target)?.h3Index;
}

/**
 * Records a rejected row.
 *
 * Purpose: Every rejected row must reach the drop reasons, not only the debug log, so it shows in drop counts.
 * When to use: Each branch of `processV3OrdersArray` that discards a row.
 * Expected outcome: `reason` is appended to `dropReasons` and logged at debug level.
 * Exceptions: None.
 */
function dropRow(dropReasons: string[], reason: string): void {
  dropReasons.push(reason);
  logDebug('openRouter processV3OrdersArray: row dropped', { reason });
}

/**
 * Applies each `orders[]` row by action.
 *
 * Purpose: Turns the model's rows into engine orders and explains every row it cannot use.
 * When to use: `parseOrdersResponse`, after `expandGroupedActorEntries`.
 * Expected outcome: Standing-order rows run immediately (strategic only). Move, transport, disembark, ranged, and
 * embark rows are collected. A row with no unit, an unknown action, a missing or unresolvable destination or target,
 * or no naval unit where one is needed is dropped with a reason.
 * Exceptions: None.
 */
export function processV3OrdersArray(
  entries: unknown[],
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  context: CoordinateContext
): EnvelopeOrderRowsResult {
  logDebug('openRouter processV3OrdersArray', { rowCount: entries.length, mode: context.mode });
  const result: EnvelopeOrderRowsResult = { movementOrders: [], rangedAttacks: [], embarkOrders: [], dropReasons: [] };
  const { movementOrders, rangedAttacks, embarkOrders, dropReasons } = result;
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as {
      action?: unknown;
      unitId?: unknown;
      navalUnitId?: unknown;
      order?: unknown;
      destination?: unknown;
      targetHexCode?: unknown;
      targetUnitId?: unknown;
    };
    const action = o.action;
    const unitId = typeof o.unitId === 'string' ? o.unitId : '';
    if (!unitId) {
      dropRow(dropReasons, `${String(action)} entry dropped: requires unitId or unitIds`);
      continue;
    }

    if (action === 'assign_order') {
      if (context.mode === 'tactical') {
        dropReasons.push(
          `assign_order ${unitId}: standing orders cannot be assigned to tactical sub-unit ids; use explicit_move / ranged_attack / air strikes this beat`
        );
        logDebug('openRouter processV3OrdersArray: assign_order skipped in tactical mode', { unitId });
        continue;
      }
      logDebug('openRouter processV3OrdersArray: assign_order', { unitId });
      const orderPayload = translateAssignOrderHexCodeParams(o.order, context, unitId);
      const assignResult = executeStandingOrders('assign_order', { unitId, order: orderPayload }, state, latLngByH3, resolveToH3);
      if (assignResult.status === 'error' && typeof assignResult.error === 'string') {
        const orderType =
          orderPayload && typeof orderPayload === 'object' && !Array.isArray(orderPayload)
            ? (orderPayload as { type?: unknown }).type
            : undefined;
        logError('openRouter processV3OrdersArray: assign_order rejected', {
          unitId,
          orderType: typeof orderType === 'string' ? orderType : undefined,
          error: assignResult.error,
        });
        dropReasons.push(`assign_order ${unitId}: ${assignResult.error}`);
      }
      continue;
    }
    if (action === 'cancel_order') {
      if (context.mode === 'tactical') {
        dropReasons.push(
          `cancel_order ${unitId}: standing orders cannot be cancelled via tactical sub-unit ids this beat`
        );
        logDebug('openRouter processV3OrdersArray: cancel_order skipped in tactical mode', { unitId });
        continue;
      }
      logDebug('openRouter processV3OrdersArray: cancel_order', { unitId });
      executeStandingOrders('cancel_order', { unitId }, state, latLngByH3, resolveToH3);
      continue;
    }
    if (action === 'explicit_move') {
      const dest = destinationCode(o.destination);
      if (!dest) {
        dropRow(dropReasons, `explicit_move ${unitId}: requires a destination hex code`);
        continue;
      }
      const h3 = hexCodeToH3OrUndefined(dest, context);
      if (!h3) {
        dropRow(dropReasons, `explicit_move ${unitId}: destination ${dest} is not on this map`);
        continue;
      }
      if (isEmbarkedLandUnit(unitId)) {
        logDebug('openRouter processV3OrdersArray: explicit_move auto-debarks embarked unit', { unitId, dest });
        clearEmbarkAssignmentForLandUnit(unitId);
      }
      movementOrders.push({ unitId, toH3Index: h3 });
      continue;
    }
    if (action === 'ranged_attack') {
      const hexCode = o.targetHexCode;
      const unitTarget = o.targetUnitId;
      const hasHex = typeof hexCode === 'string' && HEX_CODE_PATTERN.test(hexCode);
      const hasUnit = typeof unitTarget === 'string' && unitTarget.trim().length > 0;
      if (hasHex === hasUnit) {
        dropRow(dropReasons, `ranged_attack ${unitId}: requires exactly one of targetHexCode or targetUnitId`);
        continue;
      }
      const target = hasHex ? (hexCode as string) : (unitTarget as string).trim();
      const targetH3 = resolveExplicitRangedTarget(target, state, context);
      if (targetH3) rangedAttacks.push({ unitId, targetH3Index: targetH3 });
      else dropRow(dropReasons, `ranged_attack ${unitId}: target ${target} could not be resolved`);
      continue;
    }
    if (action === 'transport_move') {
      const navalUnitId = typeof o.navalUnitId === 'string' ? o.navalUnitId : '';
      const dest = destinationCode(o.destination);
      if (!navalUnitId || !dest) {
        dropRow(dropReasons, `transport_move ${unitId}: requires navalUnitId and a destination hex code`);
        continue;
      }
      const h3 = hexCodeToH3OrUndefined(dest, context);
      if (h3) movementOrders.push({ unitId: navalUnitId, toH3Index: h3 });
      else dropRow(dropReasons, `transport_move ${unitId}: destination ${dest} is not on this map`);
      continue;
    }
    if (action === 'disembark') {
      const dest = destinationCode(o.destination);
      if (!dest) {
        dropRow(dropReasons, `disembark ${unitId}: requires a destination hex code`);
        continue;
      }
      if (!isEmbarkedLandUnit(unitId)) {
        dropRow(dropReasons, `disembark ${unitId}: unit is not embarked`);
        continue;
      }
      const h3 = hexCodeToH3OrUndefined(dest, context);
      if (!h3) {
        dropRow(dropReasons, `disembark ${unitId}: destination ${dest} is not on this map`);
        continue;
      }
      clearEmbarkAssignmentForLandUnit(unitId);
      movementOrders.push({ unitId, toH3Index: h3 });
      continue;
    }
    if (action === 'embark') {
      const navalUnitId = typeof o.navalUnitId === 'string' ? o.navalUnitId.trim() : '';
      if (navalUnitId) embarkOrders.push({ unitId, navalUnitId });
      else dropRow(dropReasons, `embark ${unitId}: requires navalUnitId`);
      continue;
    }
    dropRow(dropReasons, `${unitId}: unknown action ${String(action)}`);
  }
  return result;
}
