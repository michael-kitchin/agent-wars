/**
 * Reads the replay timeline and one step's view from the match history.
 *
 * Purpose: Replay hands back the pictures and results that were recorded, and recomputes nothing.
 * When to use: The replay IPC channels, and tests.
 * Expected outcome: A timeline for the current view, strategic turns or, while a battle is open, that battle's beats, and one step's snapshot with its hexes put back and what its two dialogs showed.
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
  listMatchRecordHeadersOfType,
  listReadableMatchEventsAtStep,
  readMatchRecord,
  type MatchRecordHeader,
} from '../recorder/matchRecordStore';
import type { CommanderDispatch, CommanderDispatchMessage } from '../../shared/commanderStatus';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { stepKeyText, strategicStep, tacticalStep, type StepKey } from '../../shared/matchRecording';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import { replayViewFor } from '../../shared/replayNavigation';
import type { ReplayStepRef, ReplayStepView, ReplayTimeline, ReplayView } from '../../shared/replayTypes';
import { isAiSeatId } from '../../shared/seatIds';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { getActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';

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
 * The id of the battle replay is scoped to.
 *
 * Purpose: Replay covers one level. While a battle is open it steps through that battle's beats and nothing else.
 * When to use: Building the timeline and checking a requested step.
 * Expected outcome: The open battle's id, or null in the strategic game.
 * Exceptions: None.
 */
function openBattleId(): string | null {
  return getActiveTacticalBattleSnapshotRef()?.battleId ?? null;
}

/**
 * Lists the step refs of one view.
 *
 * Purpose: A strategic turn with a battle has two snapshots. The first is the picture when the turn began, and the last turn keeps its latest so replay opens on the screen as it is now. A battle's beat keeps its latest snapshot.
 * When to use: From `readReplayTimeline` and `readReplayStep`.
 * Expected outcome: One ref per turn in turn order, or with a battle id one ref per beat of that battle in beat order.
 * Exceptions: Propagates a SQLite error.
 */
function stepRefsForView(view: ReplayView, battleId: string | null): ReplayStepRef[] {
  const scope = battleId === null ? 'strategic' : 'tactical';
  const headers = listMatchRecordHeadersOfType(gameDbOps, 'view_snapshot').filter(
    (header) =>
      header.scope === scope && (battleId === null || header.battleId === battleId) && headerIsInView(header, view)
  );
  const lastTurn = headers.reduce((max, header) => Math.max(max, header.turnNumber), 0);
  const keyOf = (header: MatchRecordHeader): number => (battleId === null ? header.turnNumber : header.beatNumber);
  const byKey = new Map<number, MatchRecordHeader>();
  for (const header of headers) {
    const kept = byKey.get(keyOf(header));
    if (kept === undefined || battleId !== null || header.turnNumber === lastTurn) byKey.set(keyOf(header), header);
  }
  return [...byKey.values()]
    .sort((left, right) => keyOf(left) - keyOf(right))
    .map((header) => ({
      recordId: header.recordId,
      scope,
      turnNumber: header.turnNumber,
      beatNumber: header.beatNumber,
    }));
}

/**
 * Lists the steps replay can show.
 *
 * Purpose: The panel knows how far it can step before loading any snapshot.
 * When to use: When replay is entered.
 * Expected outcome: Strategic steps of the current view, oldest first, or the open battle's beats when a battle is open. Empty with the recorder off or nothing recorded.
 * Exceptions: None. A failed read is logged and returns an empty list.
 */
export function readReplayTimeline(): ReplayTimeline {
  let view: ReplayView = 'all';
  let battleId: string | null = null;
  try {
    if (hasDbHandle()) view = currentReplayView();
    battleId = openBattleId();
    const scope = battleId === null ? 'strategic' : 'tactical';
    const steps = hasDbHandle() ? stepRefsForView(view, battleId) : [];
    logDebug('replayReading readReplayTimeline', { view, scope, battleId, stepCount: steps.length });
    return { view, scope, steps };
  } catch (err) {
    logError('replayReading readReplayTimeline failed', { view, battleId, err });
    return { view, scope: battleId === null ? 'strategic' : 'tactical', steps: [] };
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
 * What a step takes from the step before it.
 *
 * Purpose: The update dialog and the battle's kill labels describe the turn from where it started.
 * When to use: The return value of `readBeforeStep`.
 * Expected outcome: The hexes the viewer could see, and the sub-units of the battle, both before the step.
 * Exceptions: None.
 */
interface StepBefore {
  /**
   * The hexes the viewer could see before the step.
   *
   * Contract: The earlier snapshot's `visibleHexes`, or every hex for the all-sides view.
   * When to use: Deciding which moves the update dialog describes.
   * Expected outcome: A list of hex ids.
   * Exceptions: None.
   */
  readonly visibleHexes: readonly string[];
  /**
   * The battle's sub-units before the step.
   *
   * Contract: The earlier snapshot's battle session sub-units, or null when it holds no battle.
   * When to use: Kill labels and march playback for a battle beat.
   * Expected outcome: A list of sub-units, or null.
   * Exceptions: None.
   */
  readonly subUnits: readonly TacticalSubUnitSnapshot[] | null;
}

/**
 * The id of the newest snapshot of the step before.
 *
 * Purpose: The timeline keeps a turn's first snapshot, but a turn with a battle has a later one, the picture the live update dialog used when the turn resolved.
 * When to use: From `readBeforeStep`.
 * Expected outcome: For a strategic step, the highest record id among that turn's strategic snapshots of the view, or the ref's own id when none is found. A beat's ref is already its newest snapshot and is returned as it is.
 * Exceptions: Propagates a SQLite error.
 */
function newestSnapshotIdOf(previous: ReplayStepRef, view: ReplayView): number {
  if (previous.scope === 'tactical') return previous.recordId;
  const newest = listMatchRecordHeadersOfType(gameDbOps, 'view_snapshot')
    .filter((header) => header.scope === 'strategic' && header.turnNumber === previous.turnNumber && headerIsInView(header, view))
    .at(-1);
  return newest?.recordId ?? previous.recordId;
}

/**
 * Reads what the viewer had before an earlier step.
 *
 * Purpose: The update dialog describes only the moves the viewer could see, and a battle beat needs its sub-units from before the commit.
 * When to use: For a step that has an earlier step in the timeline.
 * Expected outcome: The `visibleHexes` of the earlier step's newest snapshot (every hex for the all-sides view), so a turn with a battle gives the picture after it, and for a beat its battle session's sub-units.
 * Exceptions: Propagates a database error.
 */
function readBeforeStep(previous: ReplayStepRef, view: ReplayView): StepBefore {
  const record = readMatchRecord(gameDbOps, newestSnapshotIdOf(previous, view));
  const snapshot = (
    record?.payload as
      | { snapshot?: { visibleHexes?: string[]; tacticalBattleSession?: { subUnits?: TacticalSubUnitSnapshot[] } } }
      | undefined
  )?.snapshot;
  return {
    visibleHexes: view === 'all' ? getGameState().hexes.map((hex) => hex.h3Index) : (snapshot?.visibleHexes ?? []),
    subUnits: previous.scope === 'tactical' ? (snapshot?.tacticalBattleSession?.subUnits ?? null) : null,
  };
}

/**
 * Rebuilds what the message dialog showed when a turn began.
 *
 * Purpose: One dispatch per AI seat that stored a strategy or sent a message at the step. The messages are not filtered, as in the live dialog.
 * When to use: From `readReplayStep`, with the step's key and the strategic turn it belongs to.
 * Expected outcome: Dispatches in side order. A seat with neither a strategy nor a message has none. A row that cannot be read is skipped and logged (`listReadableMatchEventsAtStep`).
 * Exceptions: Propagates a database error.
 */
function readDispatches(step: StepKey): CommanderDispatch[] {
  const { turnNumber } = step;
  const stepKey = stepKeyText(step);
  const strategies = listReadableMatchEventsAtStep(gameDbOps, 'commander_strategy', stepKey);
  const messages = listReadableMatchEventsAtStep(gameDbOps, 'message_sent', stepKey);
  const consultations = listReadableMatchEventsAtStep(gameDbOps, 'consultation', stepKey);
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
 * Reads the last result recorded at a step.
 *
 * Purpose: The update dialog reads the result that led into the step that follows it.
 * When to use: From `readReplayStep`, for the turn or the beat before the shown one.
 * Expected outcome: The `result` of the last readable `resolution_view` of that kind at the step, or null.
 * Exceptions: Propagates a database error.
 */
function readResolutionResult(step: StepKey): unknown | null {
  const rows = listReadableMatchEventsAtStep(gameDbOps, 'resolution_view', stepKeyText(step));
  const last = rows
    .map((row) => row.payload as { kind?: string; result?: unknown })
    .filter((payload) => payload.kind === step.scope)
    .at(-1);
  return last?.result ?? null;
}

/**
 * Reads one step for the screen.
 *
 * Purpose: Replay shows the recorded snapshot and the dialogs that were shown when the turn or beat began.
 * When to use: When replay shows a step the timeline lists.
 * Expected outcome: The view, or null when the record is missing, is not a view snapshot, belongs to the other view, or belongs to another level than the timeline's (a battle's beat while no battle is open, a strategic turn while one is, or another battle's beat).
 * Exceptions: None. A failed read is logged and returns null.
 */
export function readReplayStep(recordId: number): ReplayStepView | null {
  try {
    logDebug('replayReading readReplayStep', { recordId });
    if (!hasDbHandle()) return null;
    const record = readMatchRecord(gameDbOps, recordId);
    if (!record || record.kind !== 'event' || record.recordType !== 'view_snapshot') return null;
    const battleId = openBattleId();
    if (record.scope !== (battleId === null ? 'strategic' : 'tactical')) return null;
    if (battleId !== null && record.battleId !== battleId) return null;
    const view = currentReplayView();
    if (!headerIsInView(record, view)) return null;
    const payload = record.payload as { view?: string; snapshot?: Record<string, unknown> };
    if (payload.view !== view || !payload.snapshot) return null;
    const steps = stepRefsForView(view, battleId);
    const isBeat = battleId !== null;
    const previous = steps.filter((step) => (isBeat ? step.beatNumber < record.beatNumber : step.turnNumber < record.turnNumber)).at(-1) ?? null;
    const before = previous === null ? null : readBeforeStep(previous, view);
    const stepKey = isBeat ? tacticalStep(record.turnNumber, battleId, record.beatNumber) : strategicStep(record.turnNumber);
    const resolutionStep = isBeat
      ? tacticalStep(record.turnNumber, battleId, record.beatNumber - 1)
      : strategicStep(record.turnNumber - 1);
    return {
      ref: { recordId, scope: record.scope, turnNumber: record.turnNumber, beatNumber: record.beatNumber },
      snapshot: restoreSnapshot(payload.snapshot, view),
      resolution: previous === null ? null : readResolutionResult(resolutionStep),
      visibleHexesBefore: before === null ? null : before.visibleHexes,
      subUnitsBefore: before === null ? null : before.subUnits,
      dispatches: readDispatches(stepKey),
    };
  } catch (err) {
    logError('replayReading readReplayStep failed', { recordId, err });
    return null;
  }
}
