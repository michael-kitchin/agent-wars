/**
 * IPC for the human hire panel.
 *
 * Purpose: The renderer reads one hex and places or removes one order without spending credits.
 * When to use: `registerIpcHandlers`, next to the missile handler.
 * Expected outcome: The three hire channels call the human seat's hire actions. A payload that cannot be read is rejected.
 * Exceptions: None. A rejected order returns a reason instead of throwing.
 */

import type { IpcMain } from 'electron';
import { HIRE_ORDER_INVALID_PAYLOAD } from '../../shared/mercenaryRules';
import { IPC_GAME } from '../../shared/ipc/channels';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { executePlaceHireOrder, executeRemoveHireOrder, readHexHireView } from '../gameActions/hireOrders';
import { parseHireOrderPayload, parseHireOrderRemovalPayload } from '../ipcPayloadGuards';
import { logDebug } from '../logger';

/**
 * Registers the three hire channels.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: Each channel returns the hire action's result, or the invalid-payload result.
 * Exceptions: None.
 */
export function registerMercenaryIpcHandler(ipcMain: IpcMain): void {
  logDebug('mercenaryIpcHandler register');
  ipcMain.handle(IPC_GAME.getHexHireView, (_event, payload: unknown) => {
    const h3Index = parseHexIndex(payload);
    if (!h3Index) return null;
    return readHexHireView(h3Index, HUMAN_SEAT_ID);
  });
  ipcMain.handle(IPC_GAME.placeHireOrder, (_event, payload: unknown) => {
    const request = parseHireOrderPayload(payload);
    if (!request) {
      logDebug('mercenaryIpcHandler rejected an unreadable hire order');
      return { success: false, reason: HIRE_ORDER_INVALID_PAYLOAD };
    }
    return executePlaceHireOrder(HUMAN_SEAT_ID, request);
  });
  ipcMain.handle(IPC_GAME.removeHireOrder, (_event, payload: unknown) => {
    const removal = parseHireOrderRemovalPayload(payload);
    if (!removal) {
      logDebug('mercenaryIpcHandler rejected an unreadable hire removal');
      return { success: false, reason: HIRE_ORDER_INVALID_PAYLOAD };
    }
    return executeRemoveHireOrder(HUMAN_SEAT_ID, removal.orderId);
  });
}

/**
 * Reads a hex index the way the build-queue handler does.
 *
 * Purpose: A missing or non-string hex is not a hire view.
 * When to use: `game:getHexHireView`.
 * Expected outcome: The hex index, or null.
 * Exceptions: None.
 */
function parseHexIndex(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const h3Index = (payload as { h3Index?: unknown }).h3Index;
  return typeof h3Index === 'string' ? h3Index : null;
}
