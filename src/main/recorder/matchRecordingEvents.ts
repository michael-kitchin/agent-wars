/**
 * The typed events this build writes.
 *
 * Purpose: Handlers pass the values they already have. This file chooses the event type, the visibility, and the payload.
 * When to use: After orders are final, after a resolution, and after a consult.
 * Expected outcome: One or more events. Nothing is thrown into the caller.
 * Exceptions: None. `recordMatchEvent` swallows its own failures.
 */

import type { ConsultTelemetrySummary } from '../openRouter/consultTelemetrySummary';
import { logDebug, logTrace } from '../logger';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { stepKeyText, strategicStep, tacticalStep, type StepKey } from '../../shared/matchRecording';
import type { FramePayload } from './matchFrameCapture';
import { recordMatchEvent } from './matchRecorder';

/**
 * Records the orders that were committed for one strategic turn.
 *
 * Purpose: The human tables are read before resolution clears them. Each owner's orders are visible only to that owner.
 * When to use: After `ready` succeeds, including a turn that then waits on a melee decision. Not on the melee-resolve path.
 * Expected outcome: One event for the human seat when any human table has a row, plus one event per entry of `ordersByOwner`.
 * Exceptions: None.
 */
export function recordStrategicOrders(args: {
  readonly step: StepKey;
  readonly humanOrderTables: FramePayload['tables'];
  readonly ordersByOwner: ReadonlyMap<string, unknown>;
}): void {
  logDebug('matchRecordingEvents recordStrategicOrders', {
    step: stepKeyText(args.step),
    owners: args.ordersByOwner.size,
  });
  const humanHasRow = Object.values(args.humanOrderTables).some((table) => table.rows.length > 0);
  if (humanHasRow) {
    recordMatchEvent({
      type: 'orders_committed',
      step: args.step,
      visibility: { seats: [HUMAN_SEAT_ID] },
      payload: { owner: HUMAN_SEAT_ID, tables: args.humanOrderTables },
    });
  }
  for (const [owner, orders] of args.ordersByOwner) {
    recordMatchEvent({
      type: 'orders_committed',
      step: args.step,
      visibility: { seats: [owner] },
      payload: { owner, orders },
    });
  }
}

/**
 * Records the result of one strategic resolution.
 *
 * Purpose: The playback fields are what the renderer receives, and combat rolls cannot be replayed.
 * When to use: After a finished Ready or a finished melee resolve, before the post-resolution consult.
 * Expected outcome: One `strategic_resolution` event with engine visibility.
 * Exceptions: None.
 */
export function recordStrategicResolution(step: StepKey, resolution: unknown): void {
  logDebug('matchRecordingEvents recordStrategicResolution', { step: stepKeyText(step) });
  recordMatchEvent({
    type: 'strategic_resolution',
    step,
    visibility: 'engine',
    payload: resolution,
  });
}

/**
 * Records one tactical beat's orders and playback.
 *
 * Purpose: The beat's drafts and its result are not recoverable from the next frame.
 * When to use: Immediately after a successful tactical commit, before any later return.
 * Expected outcome: `tactical_orders_committed`, then `tactical_resolution`, both with engine visibility.
 * Exceptions: None.
 */
export function recordTacticalBeat(args: {
  readonly step: StepKey;
  readonly orders: unknown;
  readonly playback: unknown;
}): void {
  logDebug('matchRecordingEvents recordTacticalBeat', { step: stepKeyText(args.step) });
  recordMatchEvent({
    type: 'tactical_orders_committed',
    step: args.step,
    visibility: 'engine',
    payload: args.orders,
  });
  recordMatchEvent({
    type: 'tactical_resolution',
    step: args.step,
    visibility: 'engine',
    payload: args.playback,
  });
}

/**
 * Records one model consult's telemetry summary.
 *
 * Purpose: The summary is the persisted copy of the existing consult log line.
 * When to use: The `finally` of an orders consult, after the summary object already exists.
 * Expected outcome: One `consultation` event. Visibility is the seat, or `engine` when the summary has no seat.
 * Exceptions: None.
 */
export function recordConsultation(args: {
  readonly step: StepKey;
  readonly stage: 'orders';
  readonly summary: ConsultTelemetrySummary;
}): void {
  logDebug('matchRecordingEvents recordConsultation', {
    step: stepKeyText(args.step),
    stage: args.stage,
    seatId: args.summary.seatId,
  });
  recordMatchEvent({
    type: 'consultation',
    step: args.step,
    visibility: args.summary.seatId === null ? 'engine' : { seats: [args.summary.seatId] },
    payload: { stage: args.stage, ...args.summary },
  });
}

/**
 * Records one strategy line.
 *
 * Purpose: The line is shown to that seat and is not recoverable from a frame.
 * When to use: After a consult has stored its strategy note.
 * Expected outcome: One `commander_strategy` event whose display text is the strategy. A blank strategy writes nothing.
 * Exceptions: None.
 */
export function recordCommanderStrategy(args: {
  readonly step: StepKey;
  readonly seatId: string;
  readonly strategy: string;
}): void {
  logDebug('matchRecordingEvents recordCommanderStrategy', {
    step: stepKeyText(args.step),
    seatId: args.seatId,
    blank: args.strategy.trim() === '',
  });
  if (args.strategy.trim() === '') return;
  recordMatchEvent({
    type: 'commander_strategy',
    step: args.step,
    visibility: { seats: [args.seatId] },
    displayText: args.strategy,
    payload: { seatId: args.seatId, strategy: args.strategy },
  });
}

/**
 * The step a consult belongs to.
 *
 * Purpose: A battle consult and a world-map consult share one choice.
 * When to use: Recording a consult or a strategy from the consult's turn and battle.
 * Expected outcome: A tactical step when `battle` is given, otherwise a strategic step.
 * Exceptions: None.
 */
export function stepForConsult(
  turnNumber: number,
  battle: { readonly battleId: string; readonly tacticalTurnNumber: number } | null | undefined
): StepKey {
  logTrace('matchRecordingEvents stepForConsult', { turnNumber, tactical: battle != null });
  if (battle) return tacticalStep(turnNumber, battle.battleId, battle.tacticalTurnNumber);
  return strategicStep(turnNumber);
}
