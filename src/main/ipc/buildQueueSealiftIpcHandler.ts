import type { IpcMain } from 'electron';
import type { BuildUnitType } from '../../shared/ipc/productionTypes';
import { IPC_GAME } from '../../shared/ipc/channels';
import { emptySealiftStackState } from '../../shared/sealiftStackState';
import { logDebug } from '../logger';
import {
  addHexBuildQueueEntry,
  applyBuildQueueTemplateToHexes,
  getHexBuildQueue,
  getSealiftStackState,
  getTacticalSealiftStackState,
  removeHexBuildQueueEntry,
  setHexesKeepBuilding,
  updateHexBuildQueueEntry,
  updateSealiftSlot,
  updateTacticalSealiftSlot,
} from '../gameActions';
import {
  parseBuildQueueTemplatePayload,
  parseBuildQueueUpdatePayload,
  parseSetHexesKeepBuildingPayload,
} from '../ipcPayloadGuards';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Raw sealift slot edit payload as it arrives from the renderer.
 *
 * Purpose: Shared shape for the strategic and tactical slot handlers, which validate it identically.
 * When to use: Argument of `parseSealiftSlotPayload`.
 * Expected outcome: Every field is optional until validated.
 * Exceptions: None.
 */
type SealiftSlotPayload = {
  readonly h3Index?: string;
  readonly navalUnitId?: string;
  readonly slotIndex?: number;
  readonly landUnitId?: string | null;
};

/**
 * Validates a sealift slot edit payload.
 *
 * Purpose: One check for both slot handlers, so strategic and tactical edits accept the same inputs.
 * When to use: First step of the `updateSealiftSlot` and `updateTacticalSealiftSlot` handlers.
 * Expected outcome: The typed edit, or `null` when the hex, naval unit, or slot index is invalid. A `landUnitId` that
 * is neither a string nor `null` becomes `null` (empty the slot).
 * Exceptions: None.
 */
function parseSealiftSlotPayload(
  payload: SealiftSlotPayload | undefined
): {
  readonly h3Index: string;
  readonly navalUnitId: string;
  readonly slotIndex: 1 | 2;
  readonly landUnitId: string | null;
} | null {
  if (
    typeof payload?.h3Index !== 'string' ||
    typeof payload?.navalUnitId !== 'string' ||
    (payload?.slotIndex !== 1 && payload?.slotIndex !== 2)
  ) {
    return null;
  }
  const landUnitId = payload.landUnitId === null || typeof payload.landUnitId === 'string' ? payload.landUnitId : null;
  return { h3Index: payload.h3Index, navalUnitId: payload.navalUnitId, slotIndex: payload.slotIndex, landUnitId };
}

/**
 * Registers the human build-queue and sealift stack handlers.
 *
 * Purpose: Groups the production-hex and transport-slot editors, which share the "validate, then call one game
 * action" pattern, apart from turn and order handlers in `main.ts`.
 * When to use: Once at startup, from `registerIpcHandlers`, before the window loads.
 * Expected outcome: Invalid payloads resolve to `{ success: false, reason }` (or an empty queue or stack state for
 * reads) instead of reaching the game actions. All build-queue edits act on the human player's hexes.
 * Exceptions: Electron throws if a channel already has a handler.
 */
export function registerBuildQueueSealiftIpcHandler(ipcMain: Pick<IpcMain, 'handle'>): void {
  logDebug('registerBuildQueueSealiftIpcHandler');
  ipcMain.handle(IPC_GAME.getHexBuildQueue, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return null;
    return getHexBuildQueue(payload.h3Index, HUMAN_SEAT_ID);
  });
  ipcMain.handle(IPC_GAME.addHexBuildQueueEntry, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return { success: false, reason: 'Invalid build-queue payload' };
    return addHexBuildQueueEntry(payload.h3Index, HUMAN_SEAT_ID);
  });
  ipcMain.handle(
    IPC_GAME.updateHexBuildQueueEntry,
    (_event, payload: { h3Index?: string; entryId?: number; unitType?: BuildUnitType; count?: number }) => {
      const parsed = parseBuildQueueUpdatePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid build-queue payload' };
      }
      return updateHexBuildQueueEntry(parsed.h3Index, parsed.entryId, parsed.unitType, parsed.count, HUMAN_SEAT_ID);
    }
  );
  ipcMain.handle(IPC_GAME.removeHexBuildQueueEntry, (_event, payload: { h3Index?: string; entryId?: number }) => {
    if (typeof payload?.h3Index !== 'string' || typeof payload?.entryId !== 'number') {
      return { success: false, reason: 'Invalid build-queue payload' };
    }
    return removeHexBuildQueueEntry(payload.h3Index, payload.entryId, HUMAN_SEAT_ID);
  });
  ipcMain.handle(IPC_GAME.applyBuildQueueTemplateToHexes, (_event, payload: unknown) => {
    const parsed = parseBuildQueueTemplatePayload(payload);
    if (!parsed) {
      return {
        success: false,
        applied: [],
        skipped: [],
        failed: [],
        reason: 'Invalid build-queue template payload',
      };
    }
    return applyBuildQueueTemplateToHexes(parsed.h3Indexes, parsed.entries, HUMAN_SEAT_ID);
  });
  ipcMain.handle(IPC_GAME.setHexesKeepBuilding, (_event, payload: unknown) => {
    const parsed = parseSetHexesKeepBuildingPayload(payload);
    if (!parsed) {
      return {
        success: false,
        applied: [],
        failed: [],
        reason: 'Invalid Keep building payload',
      };
    }
    return setHexesKeepBuilding(parsed.h3Indexes, parsed.keepBuilding, HUMAN_SEAT_ID);
  });
  ipcMain.handle(IPC_GAME.getSealiftStackState, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') {
      return emptySealiftStackState();
    }
    return getSealiftStackState(payload.h3Index);
  });
  ipcMain.handle(IPC_GAME.getTacticalSealiftStackState, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') {
      return emptySealiftStackState();
    }
    return getTacticalSealiftStackState(payload.h3Index);
  });
  ipcMain.handle(IPC_GAME.updateTacticalSealiftSlot, (_event, payload: SealiftSlotPayload | undefined) => {
    const parsed = parseSealiftSlotPayload(payload);
    if (!parsed) return { success: false, reason: 'Invalid tactical sealift payload' };
    return updateTacticalSealiftSlot(parsed.h3Index, parsed.navalUnitId, parsed.slotIndex, parsed.landUnitId);
  });
  ipcMain.handle(IPC_GAME.updateSealiftSlot, (_event, payload: SealiftSlotPayload | undefined) => {
    const parsed = parseSealiftSlotPayload(payload);
    if (!parsed) return { success: false, reason: 'Invalid sealift payload' };
    return updateSealiftSlot(parsed.h3Index, parsed.navalUnitId, parsed.slotIndex, parsed.landUnitId);
  });
}
