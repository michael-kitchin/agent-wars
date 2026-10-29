/**
 * IPC that checks a group of missiles against one target hex.
 *
 * Purpose: The aiming reticle asks the main process before a launch is stored.
 * When to use: `registerIpcHandlers`, next to the match-end handler.
 * Expected outcome: `{ success: true }` or the first missile's reason. A payload that cannot be read returns the invalid-payload sentence.
 * Exceptions: None. Validation returns a reason instead of throwing.
 */

import type { IpcMain } from 'electron';
import { INVALID_MISSILE_LAUNCH_PAYLOAD_REASON } from '../../shared/missileRules';
import { IPC_GAME } from '../../shared/ipc/channels';
import { parseGroupedTargetPayload } from '../ipcPayloadGuards';
import { logDebug } from '../logger';
import { validateGroupMissileLaunchTarget } from '../gameActions/strategicOrderValidation';

/**
 * Registers `game:validateGroupMissileLaunchTarget`.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: The channel returns the group validation result.
 * Exceptions: None.
 */
export function registerMissileLaunchIpcHandler(ipcMain: IpcMain): void {
  logDebug('missileLaunchIpcHandler register');
  ipcMain.handle(IPC_GAME.validateGroupMissileLaunchTarget, (_event, payload: unknown) => {
    const parsed = parseGroupedTargetPayload(payload as { unitIds?: unknown; targetH3Index?: unknown });
    if (!parsed) {
      logDebug('missileLaunchIpcHandler rejected an unreadable payload');
      return { success: false, reason: INVALID_MISSILE_LAUNCH_PAYLOAD_REASON };
    }
    return validateGroupMissileLaunchTarget(parsed.unitIds, parsed.targetH3Index);
  });
}
