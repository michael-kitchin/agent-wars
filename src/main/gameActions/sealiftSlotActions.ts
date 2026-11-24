/**
 * Human sealift reads and slot edits, strategic and in a battle.
 *
 * Purpose: Wraps the stack popup's sealift state and slot edits with battle guards and march-order cleanup.
 * When to use: Renderer IPC for the stack callout.
 * Expected outcome: A refreshed state after each accepted edit, or a reason.
 * Exceptions: None.
 */
import type { SealiftSlotEdit, SealiftSlotEditResult, SealiftStackState } from '../../shared/ipcTypes';
import type { TacticalSealiftSlotEditResult } from '../../shared/ipc/sealiftGameApiTypes';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import { dbRun } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { readSealiftStackState, executeSealiftSlotUpdate } from './sealift';
import { getTacticalSealiftStackStateForHex } from '../tacticalBattle/tacticalSealiftStackState';
import { applyTacticalSealiftSlotChangeInSession } from '../tacticalBattle/tacticalSealiftSlotUpdate';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { HUMAN_PLAYER_ID } from './strategicOrderValidation';

/**
 * Clears human march standing orders and pending orders for one strategic parent `units.id`.
 *
 * Purpose: Shared implementation for strategic sealift embark and tactical immediate sealift embark so movement drafts do not survive boarding.
 * When to use: `updateSealiftSlot` after a successful embark, and `updateTacticalSealiftSlot` after a successful tactical embark with a non-null land sub-unit id.
 * Expected outcome: No `standing_orders` march row and no `pending_orders` rows remain for that unit id for the human player.
 * Exceptions: None; SQLite failures surface via `dbRun` behavior.
 */
function cancelHumanStrategicMarchOrdersForParentUnit(unitId: string): void {
  logDebug('gameActions cancelHumanStrategicMarchOrdersForParentUnit', { unitId });
  dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?', [
    HUMAN_PLAYER_ID,
    unitId,
    'march',
  ]);
  dbRun('DELETE FROM pending_orders WHERE unit_id = ?', [unitId]);
}

/**
 * Defines the `cancelHumanMovementOrdersForUnit` function shape (function cancelHumanMovementOrdersForUnit(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `cancelHumanMovementOrdersForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cancelHumanMovementOrdersForUnit(unitId: string): void {
  cancelHumanStrategicMarchOrdersForParentUnit(unitId);
}

/**
 * Defines the `getSealiftStackState` function shape (export function getSealiftStackState(h3Index: string): SealiftStackState).

 * Purpose: Supports maintainability by documenting why `getSealiftStackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSealiftStackState(h3Index: string): SealiftStackState {
  logTrace('gameActions getSealiftStackState');
  return readSealiftStackState(h3Index);
}

/**
 * Returns sealift stack UI state for a tactical hex using sub-unit ids from the active tactical snapshot.
 *
 * Purpose: Supports stack-callout sealift controls during tactical battles when strategic `getSealiftStackState` does not describe tactical sub-units.
 * When to use: Renderer invokes `game:getTacticalSealiftStackState` while `isTacticalBattleActive()` is true.
 * Expected outcome: Same `SealiftStackState` shape as strategic sealift with tactical sub-unit ids, or an empty section when inactive or outside the footprint.
 * Exceptions: None; delegates to `getTacticalSealiftStackStateForHex` without throwing.
 */
export function getTacticalSealiftStackState(h3Index: string): SealiftStackState {
  logTrace('gameActions getTacticalSealiftStackState', { h3Index });
  if (!isTacticalBattleActive()) {
    return emptySealiftStackState(h3Index);
  }
  return getTacticalSealiftStackStateForHex(h3Index);
}

/**
 * Applies one strategic sealift slot edit.
 *
 * Purpose: Wraps `executeSealiftSlotUpdate` with the tactical-battle guard and march-order cleanup.
 * When to use: Stack popup IPC outside a tactical battle.
 * Expected outcome: The new stack state on success, or a refusal reason. A unit that boards loses its movement orders.
 * Exceptions: Unexpected errors are caught, logged, and returned as `success: false`.
 */
export function updateSealiftSlot(edit: SealiftSlotEdit): SealiftSlotEditResult {
  const { landUnitId } = edit;
  logDebug('gameActions updateSealiftSlot', { ...edit });
  try {
    if (isTacticalBattleActive()) {
      return { success: false, reason: 'Sealift cannot be changed during a tactical battle.' };
    }
    const result = executeSealiftSlotUpdate(edit);
    if (result.success && landUnitId) {
      cancelHumanMovementOrdersForUnit(landUnitId);
      logDebug('gameActions updateSealiftSlot: cancelled land-unit movement orders after embark', {
        landUnitId,
      });
    }
    return result;
  } catch (err) {
    logError('updateSealiftSlot: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Applies one tactical sealift slot change immediately (snapshot + optional parent-level SQLite), mirroring strategic `updateSealiftSlot` with sub-unit ids.
 *
 * Purpose: Lets the human debark, embark, or reassign sealift during an active tactical battle without waiting for Ready.
 * When to use: Renderer stack callout when `tacticalBattleSnapshot` covers the stack hex and `updateSealiftSlot` is blocked.
 * Expected outcome: `success: true` with refreshed `tacticalBattle` and `state` for the stack hex, or `success: false` with a human-readable `reason`.
 * Exceptions: Unexpected errors are caught, logged at error, and returned as `success: false`.
 */
export function updateTacticalSealiftSlot(edit: SealiftSlotEdit): TacticalSealiftSlotEditResult {
  const { landUnitId } = edit;
  logDebug('gameActions updateTacticalSealiftSlot', { ...edit });
  try {
    if (!isTacticalBattleActive()) {
      return { success: false, reason: 'No tactical battle is active.' };
    }
    const landKey = landUnitId?.trim() ?? '';
    const result = applyTacticalSealiftSlotChangeInSession({
      ...edit,
      landUnitId: landKey.length > 0 ? landKey : null,
    });
    if (!result.success) return result;
    if (landKey.length > 0) {
      const sub = result.tacticalBattle.subUnits.find((u) => u.id === landKey);
      if (sub?.parentUnitId) {
        cancelHumanStrategicMarchOrdersForParentUnit(sub.parentUnitId);
        logDebug('gameActions updateTacticalSealiftSlot: cancelled land parent march orders after embark', {
          landSubUnitId: landKey,
          parentUnitId: sub.parentUnitId,
        });
      }
    }
    return {
      success: true,
      state: result.state,
      tacticalBattle: result.tacticalBattle,
    };
  } catch (err) {
    logError('updateTacticalSealiftSlot: exception', err);
    return { success: false, reason: String(err) };
  }
}
