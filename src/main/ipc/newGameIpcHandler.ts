/**
 * IPC for starting a new match.
 *
 * Purpose: Resets the game from the New Game dialog's choices, then clears every per-match cache and starts the commander pool over.
 * When to use: `registerIpcHandlers` registers the channel once.
 * Expected outcome: Handles `IPC_GAME.newGame`. The reply is the fresh match snapshot, and the match is autosaved after it.
 * Exceptions: A handler error propagates to the renderer's invoke.
 */

import { app, type IpcMain } from 'electron';
import { readMatchSnapshot } from './matchViewSnapshot';
import { getGameState, resetGameForNewMatch, getSeatRoster } from '../gameDb';
import { clearStrategicPreviousHexMemory } from '../strategicUnitPreviousHex';
import { endTacticalBattleSession } from '../tacticalBattle/tacticalBattleSession';
import { exportFinishedMatchRecordingIfNeeded } from '../recorder/matchRecordingExport';
import { IPC_GAME } from '../../shared/ipc/channels';
import { forgetAutoSaveTurnKey, withAutoSaveAfter } from './saveLoadIpcHandler';
import { resetCommanderPool } from '../openRouter/commanderPool';
import { storeNewMatchCommanderKeys } from '../openRouter/commanderKeyMemory';
import { loadKey, applyAppWideCommanderToLegacySeat } from '../openRouter/openRouter';
import { logDebug } from '../logger';
import { getHumanNickname, setHumanNickname } from '../humanNickname';
import { HUMAN_NICKNAME_DEFAULT, normalizeSideNickname } from '../../shared/sideNicknames';
import { aiOnlyBeatLimitForRequest } from '../../shared/aiOnlyBeatLimit';
import { parseBonusLevel } from '../../shared/bonusLevel';
import { parseGameSize } from '../../shared/gameSize';
import { clearDeferredPlaybackConsultPending } from './deferredResolutionPlaybackConsult';
import { stopModelWork } from './modelWorkCancellation';
import type { NewGameIpcPayload } from '../../shared/ipcTypes';

/**
 * What the new-game handler needs from the main process.
 *
 * Purpose: The handler is moved out of `main.ts`, and these are the parts that stay tied to the open window.
 * When to use: The second argument of `registerNewGameIpcHandler`.
 * Expected outcome: A plain record of callbacks.
 * Exceptions: None.
 */
export interface NewGameIpcHandlerDeps {
  /**
   * Sends one line to the activity log in the open window.
   *
   * Contract: Safe to call with no window open; the line is dropped.
   * When to use: While model work is stopped for the new match.
   * Expected outcome: The line shows in the Commanders tab's log.
   * Exceptions: None.
   */
  readonly sendActivityLog: (line: string) => void;
}

/**
 * Registers the handler for `IPC_GAME.newGame`.
 *
 * Purpose: Keeps the long new-match setup out of `main.ts`.
 * When to use: Once, from `registerIpcHandlers`, at the same point the inline handler used to sit.
 * Expected outcome: The channel resets the match with the payload's options and returns the fresh snapshot.
 * Exceptions: None at registration.
 *
 * @param ipcMain The Electron main-process IPC object.
 * @param deps See `NewGameIpcHandlerDeps`.
 */
export function registerNewGameIpcHandler(ipcMain: Pick<IpcMain, 'handle'>, deps: NewGameIpcHandlerDeps): void {
  ipcMain.handle(IPC_GAME.newGame, (_event, payload: NewGameIpcPayload | undefined) => withAutoSaveAfter(() => {
    stopModelWork('new_game', deps.sendActivityLog);
    const fogOfWarEnabled = payload?.fogOfWarEnabled !== false;
    const gameSize = parseGameSize(payload?.gameSize);
    const originBonusLevel = parseBonusLevel(payload?.originBonusLevel, 'off');
    const terrainBonusLevel = parseBonusLevel(payload?.terrainBonusLevel, 'off');
    const weatherBonusLevel = parseBonusLevel(payload?.weatherBonusLevel, 'off');
    const techBonusLevel = parseBonusLevel(payload?.techBonusLevel, 'off');
    const startMonth = payload?.startMonth;
    const humanNickname = payload?.humanNickname === undefined
      ? getHumanNickname()
      : normalizeSideNickname(payload.humanNickname) || HUMAN_NICKNAME_DEFAULT;
    if (payload?.humanNickname !== undefined) setHumanNickname(humanNickname);
    const aiOnlyBeatLimit = aiOnlyBeatLimitForRequest(payload?.aiOnlyBeatLimit);
    if (getGameState().gameOver === true) {
      exportFinishedMatchRecordingIfNeeded({
        userDataDir: app.getPath('userData'),
        appVersion: app.getVersion(),
        now: () => new Date(),
        deferredConsultPending: false,
      });
    }
    logDebug('main game:newGame', {
      fogOfWarEnabled,
      gameSize,
      originBonusLevel,
      terrainBonusLevel,
      weatherBonusLevel,
      techBonusLevel,
      startMonth,
      gameMapId: payload?.gameMapId ?? null,
      seatCount: payload?.seats?.length ?? null,
      turnLimit: payload?.turnLimit ?? null,
      victoryRule: payload?.victoryRule ?? null,
      aiOnlyBattles: payload?.aiOnlyBattles ?? null,
      aiOnlyBeatLimit,
      sightCues: payload?.sightCues ?? null,
      humanNicknameLength: humanNickname.length,
    });
    resetGameForNewMatch({
      fogOfWarEnabled,
      gameSize,
      originBonusLevel,
      terrainBonusLevel,
      weatherBonusLevel,
      techBonusLevel,
      startMonth,
      gameMapId: payload?.gameMapId,
      seats: payload?.seats,
      turnLimit: payload?.turnLimit,
      victoryRule: payload?.victoryRule,
      aiOnlyBattles: payload?.aiOnlyBattles,
      aiOnlyBeatLimit,
      sightCues: payload?.sightCues,
      humanNickname,
    });
    forgetAutoSaveTurnKey();
    storeNewMatchCommanderKeys(
      payload?.seats,
      loadKey(),
      getSeatRoster().map((seat) => ({ seatId: seat.seatId, homeRegion: seat.homeRegion })),
    );
    if (!payload?.seats) applyAppWideCommanderToLegacySeat();
    resetCommanderPool(getSeatRoster());
    clearDeferredPlaybackConsultPending();
    clearStrategicPreviousHexMemory();
    endTacticalBattleSession();
    return readMatchSnapshot(undefined);
  }));
}
