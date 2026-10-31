/**
 * IPC for the human hire panel.
 *
 * Purpose: The renderer reads one hex, places or removes one hire order, and dismisses one mercenary.
 * When to use: `registerIpcHandlers`, next to the missile handler.
 * Expected outcome: The hire channels and the dismiss channel call the human seat's actions. A payload that cannot be read is rejected.
 * Exceptions: None. A rejected order returns a reason instead of throwing.
 */

import type { IpcMain } from 'electron';
import { DISMISS_REASON_INVALID } from '../../shared/mercenaryDismiss';
import { HIRE_ORDER_INVALID_PAYLOAD } from '../../shared/mercenaryRules';
import { IPC_GAME } from '../../shared/ipc/channels';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { executeDismissMercenary } from '../gameActions/dismissMercenary';
import { executePlaceHireOrder, executeRemoveHireOrder, readHexHireView } from '../gameActions/hireOrders';
import { parseDismissMercenaryPayload, parseHireOrderPayload, parseHireOrderRemovalPayload } from '../ipcPayloadGuards';
import { logDebug } from '../logger';

/**
 * Registers the hire channels and the dismiss channel.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: Each channel returns its action's result, or the invalid-payload result.
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
  ipcMain.handle(IPC_GAME.dismissMercenary, (_event, payload: unknown) => {
    const request = parseDismissMercenaryPayload(payload);
    if (!request) {
      logDebug('mercenaryIpcHandler rejected an unreadable dismiss');
      return { success: false, reason: DISMISS_REASON_INVALID };
    }
    return executeDismissMercenary(HUMAN_SEAT_ID, request.unitId);
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
