/**
 * Records what the screen was given, so a past turn can be shown again exactly as it was.
 *
 * Purpose: Replay hands back stored pictures and stored results. Nothing is recomputed.
 * When to use: Directly after a step boundary, and inside the work of a resolution handler.
 * Expected outcome: `view_snapshot` rows after each frame and a `resolution_view` row per resolution. Nothing when the recorder is off.
 * Exceptions: None. Every export catches its own errors, because recording must never break a turn.
 */

import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { omniscientSnapshot, playerViewSnapshot } from '../ipc/matchViewSnapshot';
import type { ReadyResolutionIpcMirrorSource } from '../ipc/readyIpcResolutionMapping';
import { pickReadyResolutionIpcMirrorFields } from '../ipc/readyIpcResolutionMapping';
import { logDebug, logError } from '../logger';
import { isRecorderEnabled, recordMatchEvent } from '../recorder/matchRecorder';
import { lastFrameHeader, lastRecordIdOfType } from '../recorder/matchRecordStore';
import { stepKeyText, type RecordVisibility, type StepKey } from '../../shared/matchRecording';
import { activeHumanSeatId } from '../../shared/observeModeControls';
import type { GameStateSnapshot, ReadyResult } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Turns a snapshot into the smaller form that is stored.
 *
 * Purpose: The hex list is fixed for the match except for weather, so a snapshot keeps only the weather pairs. The all-sides view also drops the three hex lists, which the reader rebuilds.
 * When to use: Before writing a `view_snapshot` payload.
 * Expected outcome: A copy with no `hexes`, a `hexWeather` list of `[h3Index, weather]` pairs, and no fog lists when `dropFogLists` is true.
 * Exceptions: None.
 */
function storedSnapshot(snapshot: GameStateSnapshot, dropFogLists: boolean): Record<string, unknown> {
  const { hexes, ...rest } = snapshot;
  const hexWeather = hexes.flatMap((hex) => (hex.weather === undefined ? [] : [[hex.h3Index, hex.weather]]));
  const stored: Record<string, unknown> = { ...rest, hexWeather };
  if (dropFogLists) {
    delete stored.visibleHexes;
    delete stored.exploredHexes;
    delete stored.staleHexes;
  }
  return stored;
}

/**
 * Writes the view snapshots that follow the newest frame.
 *
 * Purpose: Each frame gets one all-sides snapshot and, while a human seat is in the match, one snapshot of what that player was shown.
 * When to use: Directly after each `recordStepBoundary` call.
 * Expected outcome: Two rows at the frame's step, or one without a human seat. Nothing when the frame already has them, when no frame exists, or when the recorder is off.
 * Exceptions: None. A failure is logged with the error and the frame id.
 */
export function recordReplayViewsIfNeeded(): void {
  let frameId: number | null = null;
  try {
    logDebug('replayRecording recordReplayViewsIfNeeded');
    if (!isRecorderEnabled() || !hasDbHandle()) return;
    const frame = lastFrameHeader(gameDbOps);
    if (!frame) return;
    frameId = frame.recordId;
    const lastView = lastRecordIdOfType(gameDbOps, 'view_snapshot');
    if (lastView !== null && lastView > frame.recordId) return;
    recordViewSnapshot(frame.step, 'all', null, storedSnapshot(omniscientSnapshot(), true), 'engine');
    const seatId = activeHumanSeatId(readSeatRoster(gameDbOps));
    if (seatId === null) return;
    recordViewSnapshot(
      frame.step,
      'player',
      HUMAN_SEAT_ID,
      storedSnapshot(playerViewSnapshot(HUMAN_SEAT_ID), false),
      { seats: [HUMAN_SEAT_ID] }
    );
  } catch (err) {
    logError('replayRecording recordReplayViewsIfNeeded failed', { frameId, err });
  }
}

/**
 * Writes one `view_snapshot` row.
 *
 * Purpose: Both views share the payload layout.
 * When to use: From `recordReplayViewsIfNeeded` only.
 * Expected outcome: One event row at `step`.
 * Exceptions: None. `recordMatchEvent` swallows its own failures.
 */
function recordViewSnapshot(
  step: StepKey,
  view: 'all' | 'player',
  seatId: string | null,
  snapshot: Record<string, unknown>,
  visibility: RecordVisibility
): void {
  recordMatchEvent({ type: 'view_snapshot', step, visibility, payload: { view, seatId, snapshot } });
}

/**
 * Writes the result the renderer received for one resolution.
 *
 * Purpose: The update dialog reads more than the stored strategic resolution holds, so the whole result is kept.
 * When to use: Inside the handler's work, directly after the resolution is recorded, so the automatic save includes the row.
 * Expected outcome: One `resolution_view` row. Nothing for a null step or when the recorder is off.
 * Exceptions: None. A failure is logged with the step.
 */
export function recordResolutionView(step: StepKey | null, kind: 'strategic' | 'tactical', result: unknown): void {
  try {
    logDebug('replayRecording recordResolutionView', { step: step ? stepKeyText(step) : null, kind });
    if (step === null) return;
    recordMatchEvent({ type: 'resolution_view', step, visibility: 'engine', payload: { kind, result } });
  } catch (err) {
    logError('replayRecording recordResolutionView failed', { step: step ? stepKeyText(step) : null, err });
  }
}

/**
 * Builds the result object a Ready handler returns, as it stands when the resolution is recorded.
 *
 * Purpose: The returned result adds the playback moves to the mirrored fields, and the update dialog reads both.
 * When to use: As the third argument of `recordResolutionView` for a strategic Ready or a melee-intercept resolve.
 * Expected outcome: A successful result with the mirrored fields, the move lists, and the automatic battle start hex.
 * Exceptions: None.
 */
export function readyResultForReplay(
  source: ReadyResolutionIpcMirrorSource & Pick<ReadyResult, 'tacticalAutoStartH3Index'>,
  playbackMoves: Pick<ReadyResult, 'aiMoves' | 'humanMoves'>
): ReadyResult {
  return {
    success: true,
    ...pickReadyResolutionIpcMirrorFields(source),
    aiMoves: playbackMoves.aiMoves && playbackMoves.aiMoves.length > 0 ? playbackMoves.aiMoves : undefined,
    humanMoves: playbackMoves.humanMoves && playbackMoves.humanMoves.length > 0 ? playbackMoves.humanMoves : undefined,
    tacticalAutoStartH3Index: source.tacticalAutoStartH3Index,
  };
}
