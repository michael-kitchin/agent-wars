/**
 * IPC for the match charts.
 *
 * Purpose: The charts show the human player every side's numbers. The player sees every value whatever fog of war is set to, so this channel applies no fog filter.
 * When to use: `registerIpcHandlers`. Nothing under `src/main/openRouter/` may call this module, because a commander is told nothing about another side's statistics.
 * Expected outcome: A snapshot of the seats and the recorded series. An empty snapshot when no match is open.
 * Exceptions: A database error is logged and returned as the empty snapshot. It is not thrown to the renderer.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import type { MatchChartsSeat, MatchChartsSnapshot } from '../../shared/matchStatistics';
import { sideDisplayName } from '../../shared/sideNicknames';
import { getSeatRoster } from '../gameDb';
import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { readTurnNumberOrFirst } from '../gameDb/turnStateReads';
import { logDebug, logError, logTrace } from '../logger';
import { readStatisticsHistory } from '../matchStatistics/statisticsHistory';

/**
 * The snapshot for a closed database.
 *
 * Purpose: A chart view can render before a match is open.
 * When to use: `buildMatchChartsSnapshot` when there is no database or a read fails.
 * Expected outcome: No seats, no turns, and turn 1.
 * Exceptions: None.
 */
const EMPTY_MATCH_CHARTS_SNAPSHOT: MatchChartsSnapshot = { seats: [], turns: [], currentTurnNumber: 1 };

/**
 * Reads the seats the charts label.
 *
 * Purpose: Legends show the same names the rest of the screen shows.
 * When to use: `buildMatchChartsSnapshot`.
 * Expected outcome: One entry per seat in side order, named with `sideDisplayName`.
 * Exceptions: None.
 */
function readChartSeats(): MatchChartsSeat[] {
  return getSeatRoster().map((seat) => ({
    seatId: seat.seatId,
    seatOrder: seat.seatOrder,
    kind: seat.kind,
    name: sideDisplayName(seat),
  }));
}

/**
 * Builds the charts snapshot from the open match.
 *
 * Purpose: One read serves the whole chart view. No fog filter is applied: the player sees every value.
 * When to use: `game:readMatchCharts`, and tests.
 * Expected outcome: The seats, the recorded turns, and the current turn. With no database, empty lists and turn 1.
 * Exceptions: None. A read failure is logged and returns the empty snapshot.
 */
export function buildMatchChartsSnapshot(): MatchChartsSnapshot {
  if (!hasDbHandle()) {
    logTrace('matchChartsIpcHandler buildMatchChartsSnapshot', { open: false, turnCount: 0 });
    return EMPTY_MATCH_CHARTS_SNAPSHOT;
  }
  try {
    const turns = readStatisticsHistory(gameDbOps);
    logTrace('matchChartsIpcHandler buildMatchChartsSnapshot', { open: true, turnCount: turns.length });
    return { seats: readChartSeats(), turns, currentTurnNumber: readTurnNumberOrFirst(gameDbOps.getOne) };
  } catch (err) {
    logError('matchChartsIpcHandler buildMatchChartsSnapshot failed', err);
    return EMPTY_MATCH_CHARTS_SNAPSHOT;
  }
}

/**
 * Registers the charts channel.
 *
 * Purpose: Keeps the handler out of the main process entry file.
 * When to use: Once, from `registerIpcHandlers`, next to `registerSideMessageIpcHandler`.
 * Expected outcome: `ipcMain.handle` for `game:readMatchCharts`, which returns `buildMatchChartsSnapshot()`.
 * Exceptions: None.
 */
export function registerMatchChartsIpcHandler(ipcMain: IpcMain): void {
  logDebug('matchChartsIpcHandler register');
  ipcMain.handle(IPC_GAME.readMatchCharts, () => buildMatchChartsSnapshot());
}
