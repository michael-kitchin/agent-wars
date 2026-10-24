/**
 * IPC for the commander pool.
 *
 * Purpose: The match screen starts, stops, and reads commanders through these channels.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: Start returns the current snapshot. Stop aborts in-flight consults. Read peeks or drains dispatches.
 * Exceptions: A bad payload is ignored and the current snapshot is returned.
 */

import type { IpcMain, WebContents } from 'electron';
import type { CommanderPlanningMode, CommanderPoolSnapshot } from '../../shared/commanderStatus';
import { IPC_GAME, IPC_OPENROUTER } from '../../shared/ipc/channels';
import { parseModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import { stopModelWork } from './modelWorkCancellation';
import { logDebug } from '../logger';
import { readCommanderPoolSnapshot, startStrategicPlanning, startTacticalPlanning, stopAllPlanning } from '../openRouter/commanderPool';
import { setCommanderConsultLogSender } from '../openRouter/commanderConsultLog';
import { installCommanderConsultRunner } from '../openRouter/commanderPoolConsult';
import { getActiveTacticalBattleSnapshot } from '../tacticalBattle/tacticalBattleSession';

/**
 * Registers the commander pool channels and the production consult runner.
 *
 * Purpose: Keeps the handler body out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: The three channels invoke the pool. The production runner is installed.
 * Exceptions: None.
 */
export function registerCommanderPoolIpcHandler(ipcMain: IpcMain): void {
  logDebug('commanderPoolIpcHandler register');
  installCommanderConsultRunner();
  const rememberLogWindow = (sender: WebContents): void => {
    setCommanderConsultLogSender((payload) => {
      if (sender.isDestroyed()) return;
      sender.send(IPC_OPENROUTER.log, payload);
    });
  };
  ipcMain.handle(IPC_GAME.startCommanderPlanning, (event, payload: unknown): CommanderPoolSnapshot => {
    rememberLogWindow(event.sender);
    const mode = planningMode(payload);
    logDebug('commanderPoolIpcHandler start', { mode });
    if (mode === 'tactical') {
      const battle = getActiveTacticalBattleSnapshot();
      if (battle) startTacticalPlanning(battle);
    } else {
      startStrategicPlanning();
    }
    return readCommanderPoolSnapshot(false);
  });
  ipcMain.handle(IPC_GAME.stopCommanderPlanning, (event, payload: unknown): void => {
    rememberLogWindow(event.sender);
    const reason = parseModelCallCancelReason(reasonPayload(payload));
    logDebug('commanderPoolIpcHandler stop', { reason });
    stopModelWork(reason, (line) => {
      event.sender.send(IPC_OPENROUTER.log, { line, isError: false });
    });
    stopAllPlanning(reason);
  });
  ipcMain.handle(IPC_GAME.readCommanderPool, (event, payload: unknown): CommanderPoolSnapshot => {
    rememberLogWindow(event.sender);
    const drain = drainPayload(payload);
    logDebug('commanderPoolIpcHandler read', { drain });
    return readCommanderPoolSnapshot(drain);
  });
}

/**
 * The planning mode on a start payload.
 *
 * Purpose: A tactical start uses the active battle. Anything else is strategic.
 * When to use: `game:startCommanderPlanning`.
 * Expected outcome: `'tactical'` only when the payload asks for it. Otherwise `'strategic'`.
 * Exceptions: None.
 */
function planningMode(payload: unknown): CommanderPlanningMode {
  if (typeof payload === 'object' && payload !== null && (payload as { mode?: unknown }).mode === 'tactical') {
    return 'tactical';
  }
  return 'strategic';
}

/**
 * The cancel reason string on a stop payload.
 *
 * Purpose: `parseModelCallCancelReason` accepts the raw reason, not the wrapper.
 * When to use: `game:stopCommanderPlanning`.
 * Expected outcome: The reason string, or undefined when the payload has none.
 * Exceptions: None.
 */
function reasonPayload(payload: unknown): unknown {
  if (typeof payload === 'object' && payload !== null && 'reason' in payload) {
    return (payload as { reason?: unknown }).reason;
  }
  return undefined;
}

/**
 * Whether a read should remove the queued dispatches.
 *
 * Purpose: A peek leaves prose for a later drain.
 * When to use: `game:readCommanderPool`.
 * Expected outcome: True only when the payload sets `drain` to true.
 * Exceptions: None.
 */
function drainPayload(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && (payload as { drain?: unknown }).drain === true;
}
