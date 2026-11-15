/**
 * Totals for a parsed recording. This module does not open the match database.
 *
 * Purpose: The summary command and its test share the totals.
 * When to use: After `parseRecordingLines` or `readRecordingFile`.
 * Expected outcome: Frame and event counts, and one consult row per seat and stage.
 * Exceptions: None. A broken consult payload counts as zero for the fields it lacks.
 */

import type { ParsedRecording } from '../../shared/matchRecording';

/**
 * Consult cost for one seat and one stage.
 *
 * Contract: Counts and token fields are sums. A missing number counts as zero.
 * When to use: `RecordingSummary.consultTotals`.
 * Expected outcome: One row of the summary table.
 * Exceptions: None.
 */
export interface ConsultTotals {
  /**
   * The seat, or empty when the event had none.
   *
   * Contract: The summary's `seatId`, or `''`.
   * When to use: The table row.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The consult stage.
   *
   * Contract: The event's `stage`, or `''` when it was missing.
   * When to use: The table row.
   * Expected outcome: `orders`, or a later stage.
   * Exceptions: None.
   */
  readonly stage: string;
  /**
   * How many consults were added together.
   *
   * Contract: The number of consultation events in the group.
   * When to use: The table row.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly consults: number;
  /**
   * Sum of input tokens.
   *
   * Contract: Non-numeric values count as zero.
   * When to use: The table row.
   * Expected outcome: The sum.
   * Exceptions: None.
   */
  readonly inputTokens: number;
  /**
   * Sum of output tokens.
   *
   * Contract: Non-numeric values count as zero.
   * When to use: The table row.
   * Expected outcome: The sum.
   * Exceptions: None.
   */
  readonly outputTokens: number;
  /**
   * Sum of cached tokens.
   *
   * Contract: Non-numeric values count as zero.
   * When to use: The table row.
   * Expected outcome: The sum.
   * Exceptions: None.
   */
  readonly cachedTokens: number;
  /**
   * Sum of cost in dollars.
   *
   * Contract: Non-numeric values count as zero.
   * When to use: The table row. Printed with four decimals.
   * Expected outcome: The sum.
   * Exceptions: None.
   */
  readonly costUsd: number;
  /**
   * Sum of wall-clock milliseconds.
   *
   * Contract: Non-numeric values count as zero.
   * When to use: The table row.
   * Expected outcome: The sum.
   * Exceptions: None.
   */
  readonly wallClockMs: number;
}

/**
 * The totals of one recording.
 *
 * Contract: Consult rows are sorted by seat, then stage.
 * When to use: `formatRecordingSummary`.
 * Expected outcome: The numbers the command prints.
 * Exceptions: None.
 */
export interface RecordingSummary {
  /**
   * The match id from the header.
   *
   * Contract: The header's `matchId`.
   * When to use: The header block.
   * Expected outcome: The id.
   * Exceptions: None.
   */
  readonly matchId: string;
  /**
   * How many frames the recording contains.
   *
   * Contract: Rows whose `kind` is `frame`.
   * When to use: The header block.
   * Expected outcome: The count.
   * Exceptions: None.
   */
  readonly frames: number;
  /**
   * How many events the recording contains.
   *
   * Contract: Rows whose `kind` is `event`.
   * When to use: The header block.
   * Expected outcome: The count.
   * Exceptions: None.
   */
  readonly events: number;
  /**
   * The highest strategic turn in the recording.
   *
   * Contract: 0 when there are no records.
   * When to use: The header block.
   * Expected outcome: The max `turnNumber`.
   * Exceptions: None.
   */
  readonly lastTurnNumber: number;
  /**
   * The JSON size of every frame payload, in characters.
   *
   * Contract: The sum of `JSON.stringify(payload).length` over frames.
   * When to use: The header block.
   * Expected outcome: The character count. A payload that cannot be stringified adds nothing.
   * Exceptions: None.
   */
  readonly framePayloadJsonBytes: number;
  /**
   * Consult totals, one row per seat and stage.
   *
   * Contract: Sorted by seat, then stage.
   * When to use: The table.
   * Expected outcome: The rows. Empty when the recording has no consultation events.
   * Exceptions: None.
   */
  readonly consultTotals: readonly ConsultTotals[];
}

/**
 * Totals a parsed recording.
 *
 * Purpose: The command prints this, and the test checks it without a database.
 * When to use: After a recording has been parsed.
 * Expected outcome: The counts and the consult rows. A consultation event with a missing or non-numeric field counts as zero for that field.
 * Exceptions: None.
 */
export function summarizeRecording(recording: ParsedRecording): RecordingSummary {
  const frames = recording.records.filter((record) => record.kind === 'frame');
  const events = recording.records.filter((record) => record.kind === 'event');
  const groups = new Map<string, ConsultTotals>();
  for (const record of recording.records) {
    if (record.recordType !== 'consultation' || !isRecord(record.payload)) continue;
    const seatId = typeof record.payload.seatId === 'string' ? record.payload.seatId : '';
    const stage = typeof record.payload.stage === 'string' ? record.payload.stage : '';
    const key = `${seatId}\u0000${stage}`;
    const previous = groups.get(key);
    groups.set(key, {
      seatId,
      stage,
      consults: (previous?.consults ?? 0) + 1,
      inputTokens: (previous?.inputTokens ?? 0) + numberField(record.payload.inputTokens),
      outputTokens: (previous?.outputTokens ?? 0) + numberField(record.payload.outputTokens),
      cachedTokens: (previous?.cachedTokens ?? 0) + numberField(record.payload.cachedTokens),
      costUsd: (previous?.costUsd ?? 0) + numberField(record.payload.costUsd),
      wallClockMs: (previous?.wallClockMs ?? 0) + numberField(record.payload.wallClockMs),
    });
  }
  const consultTotals = [...groups.values()].sort((left, right) =>
    left.seatId === right.seatId ? left.stage.localeCompare(right.stage) : left.seatId.localeCompare(right.seatId)
  );
  return {
    matchId: recording.header.matchId,
    frames: frames.length,
    events: events.length,
    lastTurnNumber: recording.records.reduce((max, record) => Math.max(max, record.turnNumber), 0),
    framePayloadJsonBytes: frames.reduce((sum, record) => sum + jsonLength(record.payload), 0),
    consultTotals,
  };
}

/**
 * Formats the totals as plain text.
 *
 * Purpose: The command prints this text and nothing else on success.
 * When to use: After `summarizeRecording`.
 * Expected outcome: A header block, then one row per seat and stage, then a Total row. Costs have four decimals.
 * Exceptions: None.
 */
export function formatRecordingSummary(summary: RecordingSummary): string {
  const header = [
    `Match ${summary.matchId}`,
    `Frames ${summary.frames}`,
    `Events ${summary.events}`,
    `Last turn ${summary.lastTurnNumber}`,
    `Frame JSON bytes ${summary.framePayloadJsonBytes}`,
    '',
    'Seat\tStage\tConsults\tInput\tOutput\tCached\tCost\tWall clock ms',
  ];
  const rows = summary.consultTotals.map((row) => formatConsultRow(row));
  const total = summary.consultTotals.reduce(
    (sum, row) => ({
      seatId: 'Total',
      stage: '',
      consults: sum.consults + row.consults,
      inputTokens: sum.inputTokens + row.inputTokens,
      outputTokens: sum.outputTokens + row.outputTokens,
      cachedTokens: sum.cachedTokens + row.cachedTokens,
      costUsd: sum.costUsd + row.costUsd,
      wallClockMs: sum.wallClockMs + row.wallClockMs,
    }),
    { seatId: 'Total', stage: '', consults: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, wallClockMs: 0 }
  );
  return [...header, ...rows, formatConsultRow(total), ''].join('\n');
}

/**
 * One table row.
 *
 * Purpose: Seat rows and the Total row share the column order.
 * When to use: `formatRecordingSummary`.
 * Expected outcome: Tab-separated fields, with cost to four decimals.
 * Exceptions: None.
 */
function formatConsultRow(row: ConsultTotals): string {
  return [
    row.seatId,
    row.stage,
    String(row.consults),
    String(row.inputTokens),
    String(row.outputTokens),
    String(row.cachedTokens),
    row.costUsd.toFixed(4),
    String(row.wallClockMs),
  ].join('\t');
}

/**
 * A finite number, or zero.
 *
 * Purpose: A broken consult payload must not become NaN in the total.
 * When to use: Each summed consult field.
 * Expected outcome: The number, or 0.
 * Exceptions: None.
 */
function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The JSON length of a payload, or zero when it cannot be stringified.
 *
 * Purpose: Frame size is reported as characters of JSON, not compressed bytes.
 * When to use: Each frame payload.
 * Expected outcome: The string length, or 0 for a value `JSON.stringify` cannot express.
 * Exceptions: None.
 */
function jsonLength(payload: unknown): number {
  const text = JSON.stringify(payload);
  return text === undefined ? 0 : text.length;
}

/**
 * Narrows a payload to an object.
 *
 * Purpose: A consultation event with a non-object payload is ignored.
 * When to use: Before reading consult fields.
 * Expected outcome: True for a non-null object.
 * Exceptions: None.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
