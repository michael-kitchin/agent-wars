/**
 * IPC for committing a human tactical draft.
 *
 * Purpose: Resolves one tactical beat from the player's draft orders, records it, and defers the AI's post-beat consult until playback ends.
 * When to use: `registerIpcHandlers` registers the channel once.
 * Expected outcome: Handles `IPC_GAME.commitHumanTacticalDraftOrders`. The reply is the commit result, and the match is autosaved after it.
 * Exceptions: A handler error propagates to the renderer's invoke.
 */

import type { IpcMain } from 'electron';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import { fallbackConsultModelId, type TacticalBeatConsultArgs } from './readyIpcResolutionMapping';
import { commitHumanTacticalDraftOrders } from '../gameActions';
import { getActiveTacticalBattleSnapshot } from '../tacticalBattle/tacticalBattleSession';
import { recordTacticalBeat } from '../recorder/matchRecordingEvents';
import { recordResolutionView } from '../replay/replayRecording';
import { gameDbOps } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { sendStagedHumanSideMessages } from '../sideMessages/humanSideMessages';
import { battleHasPartySeat } from '../tacticalBattle/opposingParty';
import { currentStepKey } from '../recorder/recorderStepKey';
import { parseHumanTacticalCommitPayload } from '../ipcPayloadGuards';
import { IPC_GAME } from '../../shared/ipc/channels';
import { withAutoSaveAfter } from './saveLoadIpcHandler';
import { hasKey, getSelectedModel, getToolNamesForEnabledGroups, TOOL_GROUP_REGISTRY } from '../openRouter/openRouter';
import { logDebug } from '../logger';
import { POST_RESOLUTION_CONSULT_TIMEOUT_MS } from '../gameIpcHandlers';
import { hasDeferredPlaybackConsultPending, setPendingTacticalBeatConsult } from './deferredResolutionPlaybackConsult';

/**
 * What the tactical-commit handler needs from the main process.
 *
 * Purpose: The handler is moved out of `main.ts`, and the order-request function stays bound to the open window there.
 * When to use: The second argument of `registerTacticalCommitIpcHandler`.
 * Expected outcome: A plain record of callbacks.
 * Exceptions: None.
 */
export interface TacticalCommitIpcHandlerDeps {
  /**
   * Requests AI orders and streams each log line to the open window.
   *
   * Contract: The same function the Ready handler uses (`requestOrdersWithLog` in `main.ts`).
   * When to use: Stored in the deferred tactical consult so it runs after playback ends.
   * Expected outcome: The model's orders, with log lines sent to the window.
   * Exceptions: Rejects when the model call rejects.
   */
  readonly requestOrders: TacticalBeatConsultArgs['requestOrders'];
}

/**
 * Registers the handler for `IPC_GAME.commitHumanTacticalDraftOrders`.
 *
 * Purpose: Keeps the long commit flow out of `main.ts`.
 * When to use: Once, from `registerIpcHandlers`, at the same point the inline handler used to sit.
 * Expected outcome: The channel commits the draft, records the beat, and defers the AI consult when event-driven consultation is on.
 * Exceptions: None at registration.
 *
 * @param ipcMain The Electron main-process IPC object.
 * @param deps See `TacticalCommitIpcHandlerDeps`.
 */
export function registerTacticalCommitIpcHandler(ipcMain: Pick<IpcMain, 'handle'>, deps: TacticalCommitIpcHandlerDeps): void {
  ipcMain.handle(IPC_GAME.commitHumanTacticalDraftOrders, async (_event, payload: unknown) => withAutoSaveAfter(async () => {
    if (hasDeferredPlaybackConsultPending()) {
      return { success: false, reason: 'Resolution playback consultation is still in progress.' };
    }
    const parsed = parseHumanTacticalCommitPayload(payload);
    if (!parsed.ok) return { success: false, reason: parsed.reason };
    const v = parsed.value;
    const preBattle = getActiveTacticalBattleSnapshot();
    const beatStep = currentStepKey();
    const orders = {
      movementOrders: v.movementOrders,
      rangedAttacks: v.rangedAttacks,
      airStrikes: v.airStrikes,
      airDropOrders: v.airDropOrders,
      ferryOrders: v.ferryOrders,
      embarkOrders: v.embarkOrders,
      opponentTacticalDraft: v.opponentTacticalDraft,
    };
    const result = commitHumanTacticalDraftOrders(orders);
    if (result.success && beatStep && result.tacticalResolutionPlayback) {
      recordTacticalBeat({
        step: beatStep,
        orders,
        playback: result.tacticalResolutionPlayback,
      });
      recordResolutionView(beatStep, 'tactical', result);
      const humanSeatId = activeHumanSeatId(readSeatRoster(gameDbOps));
      // An AI-only beat commits through this channel too. The player's drafts wait for their own commit.
      if (preBattle && humanSeatId && battleHasPartySeat(preBattle, humanSeatId)) {
        sendStagedHumanSideMessages(beatStep);
      }
    }
    if (
      !result.success ||
      !result.tacticalBattle ||
      !result.tacticalResolutionPlayback ||
      !v.useEventDrivenConsultation ||
      !v.aiPlanningRunEnabled
    ) {
      return result;
    }
    if (result.tacticalBattle.aiOnlyEndReason != null) {
      logDebug('main commitHumanTacticalDraftOrders: no deferred consult after an ended AI-only beat', {
        battleId: result.tacticalBattle.battleId,
        aiOnlyEndReason: result.tacticalBattle.aiOnlyEndReason,
      });
      return result;
    }
    const modelId = fallbackConsultModelId(getSelectedModel);
    const enabledToolNames = getToolNamesForEnabledGroups(TOOL_GROUP_REGISTRY.map((g) => g.id));
    const battleId = result.tacticalBattle.battleId;
    const consultArgs: TacticalBeatConsultArgs = {
      useEventDrivenConsultation: v.useEventDrivenConsultation,
      aiPlanningRunEnabled: v.aiPlanningRunEnabled,
      tacticalBattle: result.tacticalBattle,
      tacticalResolutionPlayback: result.tacticalResolutionPlayback,
      modelId,
      enabledToolNames,
      hasKey,
      requestOrders: deps.requestOrders,
      timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
      errorLogMessage: 'commitHumanTacticalDraftOrders: tactical after-beat consultation failed or timed out',
    };
    setPendingTacticalBeatConsult(battleId, consultArgs);
    logDebug('main commitHumanTacticalDraftOrders: deferred tactical post-beat consult until playback notify', {
      battleId,
    });
    return { ...result, tacticalPostBeatConsultDeferred: true };
  }));
}
