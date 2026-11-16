/**
 * The only door the rest of the game uses to write history.
 *
 * Purpose: A recording failure must not fail a turn. Every export here catches its own errors.
 * When to use: Step boundaries and typed events. Do not insert into `match_records` from anywhere else.
 * Expected outcome: One row, or nothing when the recorder is off or the database is closed. No throw.
 * Exceptions: None. Failures are logged and swallowed.
 */

import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { ensureMatchId } from '../gameDb/gameConfigKv';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { selectGameConfigValue } from '../gameDb/gameConfigRows';
import { isEnvFlagEnabled } from '../envFlag';
import { logDebug, logError, logTrace } from '../logger';
import {
  MATCH_EVENT_FORMAT_VERSIONS,
  MATCH_FRAME_FORMAT_VERSION,
  MATCH_FRAME_RECORD_TYPE,
  stepKeyText,
  type MatchEventType,
  type RecordVisibility,
  type StepKey,
} from '../../shared/matchRecording';
import { recordTurnStatistics } from '../matchStatistics/statisticsRecording';
import { buildFramePayload } from './matchFrameCapture';
import { currentStepKey } from './recorderStepKey';
import {
  insertMatchRecord,
  lastFrameStepKeyText,
  matchHasEventOfType,
  replaceLatestFramePayload,
} from './matchRecordStore';

/**
 * The clock stored on each row.
 *
 * Purpose: Tests pin the timestamp. The game uses the real clock.
 * When to use: `setRecorderClockForTests` replaces it, and passes null to restore it.
 * Expected outcome: An ISO timestamp.
 * Exceptions: None.
 */
let nowIso: () => string = () => new Date().toISOString();

/**
 * Reports whether history is being written.
 *
 * Purpose: `AGENT_WARS_DISABLE_RECORDER` turns recording off without a code change.
 * When to use: Before any insert. The flag is read on every call.
 * Expected outcome: False when the flag is on. True otherwise.
 * Exceptions: None.
 */
export function isRecorderEnabled(): boolean {
  const enabled = !isEnvFlagEnabled('AGENT_WARS_DISABLE_RECORDER');
  logTrace('matchRecorder isRecorderEnabled', { enabled });
  return enabled;
}

/**
 * Pins or restores the timestamp used on new rows.
 *
 * Purpose: Tests compare rows without depending on the clock.
 * When to use: A recorder test. Pass null when the test is finished.
 * Expected outcome: Later rows use `fn`, or the real clock when `fn` is null.
 * Exceptions: None.
 */
export function setRecorderClockForTests(fn: (() => string) | null): void {
  logDebug('matchRecorder setRecorderClockForTests', { pinned: fn !== null });
  nowIso = fn ?? (() => new Date().toISOString());
}

/**
 * One event the game asks to store.
 *
 * Contract: `type` selects the format version. `payload` must be JSON-safe or the insert is skipped.
 * When to use: `recordMatchEvent`.
 * Expected outcome: One event row.
 * Exceptions: None.
 */
export interface MatchEventRequest {
  /**
   * The event type.
   *
   * Contract: A `MatchEventType`.
   * When to use: The insert.
   * Expected outcome: The `record_type` and the format version.
   * Exceptions: None.
   */
  readonly type: MatchEventType;
  /**
   * The step the event belongs to.
   *
   * Contract: Captured before the state change when the change advances the step.
   * When to use: The insert.
   * Expected outcome: The step columns.
   * Exceptions: None.
   */
  readonly step: StepKey;
  /**
   * Who may be shown the event.
   *
   * Contract: A `RecordVisibility`.
   * When to use: The insert.
   * Expected outcome: The visibility text.
   * Exceptions: None.
   */
  readonly visibility: RecordVisibility;
  /**
   * The JSON payload.
   *
   * Contract: A value `JSON.stringify` can express.
   * When to use: The insert.
   * Expected outcome: The compressed payload. A value that cannot be encoded writes nothing.
   * Exceptions: None.
   */
  readonly payload: unknown;
  /**
   * Text shown to a player, when the main process has it.
   *
   * Contract: Omitted or null when there is no display text.
   * When to use: A strategy event.
   * Expected outcome: The `display_text` column.
   * Exceptions: None.
   */
  readonly displayText?: string | null;
}

/**
 * Writes one event.
 *
 * Purpose: Orders, resolutions, consultations, and strategies enter the history here.
 * When to use: In the same synchronous stretch as the state change, with no `await` between them.
 * Expected outcome: One row. Nothing when the recorder is off, the database is closed, or the payload cannot be encoded.
 * Exceptions: None. A failure is logged and swallowed.
 */
export function recordMatchEvent(event: MatchEventRequest): void {
  try {
    logDebug('matchRecorder recordMatchEvent', { type: event.type, step: stepKeyText(event.step) });
    if (!isRecorderEnabled() || !hasDbHandle()) return;
    insertMatchRecord(gameDbOps, {
      kind: 'event',
      recordType: event.type,
      formatVersion: MATCH_EVENT_FORMAT_VERSIONS[event.type],
      step: event.step,
      visibility: event.visibility,
      displayText: event.displayText ?? null,
      recordedAt: nowIso(),
      payload: event.payload,
    });
  } catch (err) {
    logError('matchRecorder recordMatchEvent failed', { type: event.type, err });
  }
}

/**
 * Writes the rows a step boundary needs.
 *
 * Purpose: A match with no `match_started` row gets one, then a frame when the step changed, and `match_ended` once the match is over. An earlier row does not suppress the start event.
 * When to use: Before a handler that can change the step, after that handler, and after resolution before the model wait.
 * Expected outcome: The missing rows only. A second call for the same open step writes nothing, except the one final frame when the match has just ended.
 * Exceptions: None. A failure is logged and swallowed.
 */
export function recordStepBoundary(step: StepKey | null, appVersion: string): void {
  try {
    logDebug('matchRecorder recordStepBoundary', {
      step: step ? stepKeyText(step) : null,
      appVersion,
    });
    if (!isRecorderEnabled() || step === null || !hasDbHandle()) return;
    if (!matchHasEventOfType(gameDbOps, 'match_started')) {
      insertMatchRecord(gameDbOps, {
        kind: 'event',
        recordType: 'match_started',
        formatVersion: MATCH_EVENT_FORMAT_VERSIONS.match_started,
        step,
        visibility: 'everyone',
        displayText: null,
        recordedAt: nowIso(),
        payload: {
          appVersion,
          matchId: ensureMatchId(gameDbOps),
          firstRecordedTurn: step.turnNumber,
        },
      });
    }
    const insertedFrame = insertFrameIfStepChanged(step);
    if (selectGameConfigValue(gameDbOps, 'game_over') === '1' && !matchHasEventOfType(gameDbOps, 'match_ended')) {
      if (!insertedFrame) insertFrame(step);
      const winner = selectGameConfigValue(gameDbOps, 'winner');
      const reason = selectGameConfigValue(gameDbOps, 'game_end_reason');
      insertMatchRecord(gameDbOps, {
        kind: 'event',
        recordType: 'match_ended',
        formatVersion: MATCH_EVENT_FORMAT_VERSIONS.match_ended,
        step,
        visibility: 'everyone',
        displayText: null,
        recordedAt: nowIso(),
        payload: {
          winner: winner === undefined ? null : winner,
          reason: reason === undefined ? null : reason,
        },
      });
    }
  } catch (err) {
    logError('matchRecorder recordStepBoundary failed', { err });
  }
}

/**
 * Replaces the current step's latest frame with a fresh snapshot.
 *
 * Purpose: A finished match's file has to show the database after the last consult, and there is no later frame to compare.
 * When to use: Immediately before writing the recording file.
 * Expected outcome: The newest frame's payload matches the database when that frame is the current step. Otherwise nothing changes.
 * Exceptions: None. A failure is logged and swallowed.
 */
export function refreshCurrentFramePayload(): void {
  try {
    if (!isRecorderEnabled() || !hasDbHandle()) return;
    const step = currentStepKey();
    const stepText = step ? stepKeyText(step) : null;
    logDebug('matchRecorder refreshCurrentFramePayload', { step: stepText });
    if (stepText === null || lastFrameStepKeyText(gameDbOps) !== stepText) return;
    replaceLatestFramePayload(gameDbOps, buildFramePayload(gameDbOps));
  } catch (err) {
    logError('matchRecorder refreshCurrentFramePayload failed', { err });
  }
}

/**
 * Writes a frame when the step is not the latest frame's step.
 *
 * Purpose: The boundary needs to know whether it already wrote the frame before it considers the match end.
 * When to use: From `recordStepBoundary` only.
 * Expected outcome: True when a frame was inserted.
 * Exceptions: Propagates an insert failure.
 */
function insertFrameIfStepChanged(step: StepKey): boolean {
  if (stepKeyText(step) === lastFrameStepKeyText(gameDbOps)) return false;
  insertFrame(step);
  return true;
}

/**
 * Writes one frame for a step.
 *
 * Purpose: The step-change path and the match-end path share the frame row.
 * When to use: From `recordStepBoundary` only.
 * Expected outcome: One frame row, then the statistics event for a strategic step.
 * Exceptions: Propagates an insert failure.
 */
function insertFrame(step: StepKey): void {
  insertMatchRecord(gameDbOps, {
    kind: 'frame',
    recordType: MATCH_FRAME_RECORD_TYPE,
    formatVersion: MATCH_FRAME_FORMAT_VERSION,
    step,
    visibility: 'engine',
    displayText: null,
    recordedAt: nowIso(),
    payload: buildFramePayload(gameDbOps),
  });
  recordStatisticsAfterFrame(step);
}

/**
 * Records the turn's statistics event directly after its frame.
 *
 * Purpose: Every strategic frame, including the forced final frame at match end, is followed by one `side_statistics` event.
 * When to use: From `insertFrame` only.
 * Expected outcome: One statistics event for a strategic step, nothing for a tactical step.
 * Exceptions: None. A failure is logged and swallowed, so the match-end event is still written.
 */
function recordStatisticsAfterFrame(step: StepKey): void {
  try {
    recordTurnStatistics(step, readSeatRoster(gameDbOps), recordMatchEvent);
  } catch (err) {
    logError('matchRecorder recordStatisticsAfterFrame failed', { step: stepKeyText(step), err });
  }
}
