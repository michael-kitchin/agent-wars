import { ipcRenderer } from 'electron';
import { IPC_GAME } from '../shared/ipc/channels';
import type { SealiftGameApi } from '../shared/ipc/sealiftGameApiTypes';
import type { SealiftSlotEdit } from '../shared/ipc/sealiftTypes';

/**
 * The sealift calls of the renderer bridge.
 *
 * Purpose: Forwards the stack popup's sealift reads and slot edits to the main process.
 * When to use: Spread into the preload's `gameApi` object.
 * Expected outcome: Each call resolves to the main process's reply.
 * Exceptions: IPC errors propagate as promise rejections.
 */
export const sealiftPreloadApi = {
    /**
   * Documents the object literal property `getSealiftStackState` (getSealiftStackState: (payload: { h3Index: string }) => ipcRenderer.invoke('game:getSealiftStackState', payload)).

   * Purpose: Supports maintainability by documenting why `getSealiftStackState` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSealiftStackState: (payload: { h3Index: string }) =>
    ipcRenderer.invoke(IPC_GAME.getSealiftStackState, payload),
    /**
   * Documents the object literal property `getTacticalSealiftStackState` (getTacticalSealiftStackState: (payload: { h3Index: string }) => ipcRenderer.invoke('game:getTacticalSealiftStackState', payload)).

   * Purpose: Exposes tactical sealift stack rows keyed by tactical sub-unit ids while a tactical battle is active.
   * When to use: Stack callout sealift section during tactical planning when strategic sealift IPC is unavailable.
   * Expected outcome: Same `SealiftStackState` envelope as `getSealiftStackState`, with sub-unit ids in slot fields.
   * Exceptions: IPC errors propagate as promise rejections.
   */
getTacticalSealiftStackState: (payload: { h3Index: string }) =>
    ipcRenderer.invoke(IPC_GAME.getTacticalSealiftStackState, payload),
    /**
   * Documents the object literal property `updateTacticalSealiftSlot` (updateTacticalSealiftSlot: (payload: SealiftSlotEdit) => ipcRenderer.invoke('game:updateTacticalSealiftSlot', payload)).

   * Purpose: Commits one tactical sealift slot edit to the main-process snapshot and strategic transport rows.
   * When to use: Stack callout sealift controls during tactical battles instead of `updateSealiftSlot`.
   * Expected outcome: Promise resolves to success flag, optional `tacticalBattle` snapshot, and optional stack `state`.
   * Exceptions: IPC errors propagate as promise rejections.
   */
updateTacticalSealiftSlot: (payload: SealiftSlotEdit) =>
    ipcRenderer.invoke(IPC_GAME.updateTacticalSealiftSlot, payload),
  /**
   * Edits one strategic cargo slot of a ship or air unit.
   *
   * Purpose: Sends a `SealiftSlotEdit` (hex, carrier, 1-based slot index, land unit or null) to the main process.
   * When to use: When the human picks a unit or (none) in a strategic sealift slot, or presses debark.
   * Expected outcome: Resolves to the result of `updateSealiftSlot` in the main process, with the refreshed stack state on success.
   * Exceptions: Rejects when the IPC call fails.
   */
  updateSealiftSlot: (payload: SealiftSlotEdit) =>
    ipcRenderer.invoke(IPC_GAME.updateSealiftSlot, payload),
} satisfies SealiftGameApi;
