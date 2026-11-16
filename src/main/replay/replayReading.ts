/**
 * Reads the replay timeline and one step's view from the match history.
 *
 * Purpose: Replay hands back the pictures and results that were recorded, and recomputes nothing.
 * When to use: The replay IPC channels, and tests.
 * Expected outcome: A timeline of strategic turns for the current view, and one step's snapshot with its hexes put back and what its two dialogs showed.
 * Exceptions: None. A failed read is logged and returns an empty timeline or null.
 */

import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { selectGameConfigValue } from '../gameDb/gameConfigRows';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { getGameState } from '../gameDb';
import { withEveryHexVisible } from '../ipc/matchViewSnapshot';
import { logDebug, logError, logTrace } from '../logger';
import { modelLabel } from '../openRouter/commanderPoolSettle';
import {
  listMatchEventsAtStep,
  listMatchRecordHeadersOfType,
  readMatchRecord,
  type MatchRecordHeader,
} from '../recorder/matchRecordStore';
import type { CommanderDispatch, CommanderDispatchMessage } from '../../shared/commanderStatus';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { stepKeyText, strategicStep } from '../../shared/matchRecording';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import { replayViewFor } from '../../shared/replayNavigation';
import type { ReplayStepRef, ReplayStepView, ReplayTimeline, ReplayView } from '../../shared/replayTypes';
import { isAiSeatId } from '../../shared/seatIds';

/**
 * The view replay shows for the open match.
 *
 * Purpose: A player sees what they could see then. An observer, and anyone after the match, sees everything.
 * When to use: Building the timeline and checking a step.
 * Expected outcome: `player` while a human seat is active and the match is not over, otherwise `all`.
 * Exceptions: None.
 */
export function currentReplayView(): ReplayView {
  logTrace('replayReading currentReplayView');
  return replayViewFor({
    humanSeatActive: activeHumanSeatId(readSeatRoster(gameDbOps)) !== null,
    gameOver: selectGameConfigValue(gameDbOps, 'game_over') === '1',
  });
}

/**
 * Whether a snapshot header belongs to a view.
 *
 * Purpose: The `all` view is stored with `engine` visibility and the player view with a seat list.
 * When to use: Filtering headers and checking a requested record.
 * Expected outcome: True when the header's visibility matches the view.
 * Exceptions: None.
 */
function headerIsInView(header: Pick<MatchRecordHeader, 'visibility'>, view: ReplayView): boolean {
  return view === 'all' ? header.visibility === 'engine' : header.visibility.startsWith('seats:');
}

/**
 * Lists the step refs of one view.
 *
 * Purpose: A turn with a battle has two strategic snapshots. The first is the picture when the turn began, and the last turn keeps its latest so replay opens on the screen as it is now.
 * When to use: From `readReplayTimeline` and `readReplayStep`.
 * Expected outcome: One ref per turn in turn order.
 * Exceptions: Propagates a SQLite error.
 */
function stepRefsForView(view: ReplayView): ReplayStepRef[] {
  const headers = listMatchRecordHeadersOfType(gameDbOps, 'view_snapshot').filter(
    (header) => header.scope === 'strategic' && headerIsInView(header, view)
  );
  const lastTurn = headers.reduce((max, header) => Math.max(max, header.turnNumber), 0);
  const byTurn = new Map<number, MatchRecordHeader>();
  for (const header of headers) {
    const kept = byTurn.get(header.turnNumber);
    if (kept === undefined || header.turnNumber === lastTurn) byTurn.set(header.turnNumber, header);
  }
  return [...byTurn.values()]
    .sort((left, right) => left.turnNumber - right.turnNumber)
    .map((header) => ({
      recordId: header.recordId,
      scope: 'strategic',
      turnNumber: header.turnNumber,
      beatNumber: header.beatNumber,
    }));
}

/**
 * Lists the steps replay can show.
 *
 * Purpose: The panel knows how far it can step before loading any snapshot.
 * When to use: When replay is entered.
 * Expected outcome: Strategic steps of the current view, oldest first. Empty with the recorder off or no recorded turns.
 * Exceptions: None. A failed read is logged and returns an empty list.
 */
export function readReplayTimeline(): ReplayTimeline {
  const view = hasDbHandle() ? currentReplayView() : 'all';
  try {
    const steps = hasDbHandle() ? stepRefsForView(view) : [];
    logDebug('replayReading readReplayTimeline', { view, stepCount: steps.length });
    return { view, scope: 'strategic', steps };
  } catch (err) {
    logError('replayReading readReplayTimeline failed', { view, err });
    return { view, scope: 'strategic', steps: [] };
  }
}

/**
 * Puts the open match's hexes back into a stored snapshot.
 *
 * Purpose: A stored snapshot has no hex list and has `hexWeather` in its place.
 * When to use: From `readReplayStep`.
 * Expected outcome: A full snapshot. A hex with no stored weather has none. The all-sides view also gets its fog lists rebuilt.
 * Exceptions: Propagates a database error from `getGameState`.
 */
function restoreSnapshot(stored: Record<string, unknown>, view: ReplayView): GameStateSnapshot {
  const { hexWeather, ...rest } = stored;
  const weatherByHex = new Map<string, unknown>(Array.isArray(hexWeather) ? (hexWeather as [string, unknown][]) : []);
  const hexes = getGameState().hexes.map((hex) => {
    const { weather: liveWeather, ...fixed } = hex;
    void liveWeather;
    const weather = weatherByHex.get(hex.h3Index);
    return weather === undefined ? fixed : { ...fixed, weather };
  });
  const snapshot = { ...rest, hexes } as unknown as GameStateSnapshot;
  return view === 'all' ? withEveryHexVisible(snapshot, hexes.map((hex) => hex.h3Index)) : snapshot;
}

/**
 * Reads the hexes the viewer could see in an earlier step.
 *
 * Purpose: The update dialog describes only the moves the viewer could see.
 * When to use: For a step that has an earlier step in the timeline.
 * Expected outcome: The earlier snapshot's `visibleHexes`, or every hex for the all-sides view.
 * Exceptions: Propagates a database error.
 */
function readVisibleHexesBefore(previous: ReplayStepRef, view: ReplayView): readonly string[] {
  if (view === 'all') return getGameState().hexes.map((hex) => hex.h3Index);
  const record = readMatchRecord(gameDbOps, previous.recordId);
  const snapshot = (record?.payload as { snapshot?: { visibleHexes?: string[] } } | undefined)?.snapshot;
  return snapshot?.visibleHexes ?? [];
}

/**
 * Rebuilds what the message dialog showed when a turn began.
 *
 * Purpose: One dispatch per AI seat that stored a strategy or sent a message at the step. The messages are not filtered, as in the live dialog.
 * When to use: From `readReplayStep`.
 * Expected outcome: Dispatches in side order. A seat with neither a strategy nor a message has none.
 * Exceptions: Propagates a database error.
 */
function readDispatches(turnNumber: number): CommanderDispatch[] {
  const stepKey = stepKeyText(strategicStep(turnNumber));
  const strategies = listMatchEventsAtStep(gameDbOps, 'commander_strategy', stepKey);
  const messages = listMatchEventsAtStep(gameDbOps, 'message_sent', stepKey);
  const consultations = listMatchEventsAtStep(gameDbOps, 'consultation', stepKey);
  return readSeatRoster(gameDbOps).flatMap((seat) => {
    if (!isAiSeatId(seat.seatId)) return [];
    const seatId = seat.seatId;
    const strategy = strategies
      .map((row) => row.payload as { seatId?: string; strategy?: string })
      .filter((payload) => payload.seatId === seatId)
      .at(-1)?.strategy;
    const sent: CommanderDispatchMessage[] = messages
      .map((row) => row.payload as { fromSeatId?: string; toSeatId?: string; text?: string })
      .filter((payload) => payload.fromSeatId === seatId && typeof payload.toSeatId === 'string' && typeof payload.text === 'string')
      .map((payload) => ({ toSeatId: payload.toSeatId as string, text: payload.text as string }));
    if (strategy === undefined && sent.length === 0) return [];
    const consulted = consultations
      .map((row) => row.payload as { seatId?: string | null; modelId?: string })
      .filter((payload) => payload.seatId === seatId)
      .at(-1)?.modelId;
    return [
      {
        seatId,
        messages: sent,
        strategy: strategy ?? null,
        modelLabel: modelLabel(consulted ?? seat.commander?.modelId ?? null),
        turnNumber,
      },
    ];
  });
}

/**
 * Reads the last strategic result recorded at a step.
 *
 * Purpose: The update dialog reads the result that led into the step.
 * When to use: From `readReplayStep`, for the turn before the shown one.
 * Expected outcome: The `result` of the last strategic `resolution_view` at that turn, or null.
 * Exceptions: Propagates a database error.
 */
function readResolutionResult(turnNumber: number): unknown | null {
  const rows = listMatchEventsAtStep(gameDbOps, 'resolution_view', stepKeyText(strategicStep(turnNumber)));
  const last = rows
    .map((row) => row.payload as { kind?: string; result?: unknown })
    .filter((payload) => payload.kind === 'strategic')
    .at(-1);
  return last?.result ?? null;
}

/**
 * Reads one step for the screen.
 *
 * Purpose: Replay shows the recorded snapshot and the dialogs that were shown when the turn began.
 * When to use: When replay shows a step the timeline lists.
 * Expected outcome: The view, or null when the record is missing, is not a view snapshot, or belongs to the other view.
 * Exceptions: None. A failed read is logged and returns null.
 */
export function readReplayStep(recordId: number): ReplayStepView | null {
  try {
    logDebug('replayReading readReplayStep', { recordId });
    if (!hasDbHandle()) return null;
    const record = readMatchRecord(gameDbOps, recordId);
    if (!record || record.kind !== 'event' || record.recordType !== 'view_snapshot' || record.scope !== 'strategic') return null;
    const view = currentReplayView();
    if (!headerIsInView(record, view)) return null;
    const payload = record.payload as { view?: string; snapshot?: Record<string, unknown> };
    if (payload.view !== view || !payload.snapshot) return null;
    const steps = stepRefsForView(view);
    const previous = steps.filter((step) => step.turnNumber < record.turnNumber).at(-1) ?? null;
    return {
      ref: { recordId, scope: 'strategic', turnNumber: record.turnNumber, beatNumber: record.beatNumber },
      snapshot: restoreSnapshot(payload.snapshot, view),
      resolution: previous === null ? null : readResolutionResult(record.turnNumber - 1),
      visibleHexesBefore: previous === null ? null : readVisibleHexesBefore(previous, view),
      dispatches: readDispatches(record.turnNumber),
    };
  } catch (err) {
    logError('replayReading readReplayStep failed', { recordId, err });
    return null;
  }
}
