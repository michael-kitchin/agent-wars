/**
 * Step keys, visibility text, and the recording's format versions.
 *
 * Purpose: The main process and a recording file share one description of a step and an event.
 * When to use: Building a record, naming an automatic-save turn, and parsing a recording.
 * Expected outcome: Pure values. This module does not read the database or log.
 * Exceptions: None.
 */

/**
 * One strategic turn or one tactical beat.
 *
 * Contract: `battleId` is empty and `beatNumber` is 0 when `scope` is `strategic`.
 * When to use: The step stored on a frame or an event.
 * Expected outcome: The parts that `stepKeyText` joins.
 * Exceptions: None.
 */
export interface StepKey {
  /**
   * Whether the step is the world map or a battle.
   *
   * Contract: `strategic` or `tactical`.
   * When to use: Choosing the key text.
   * Expected outcome: The scope stored on the record.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The strategic turn number.
   *
   * Contract: The turn in `turn_state`, including during a battle.
   * When to use: The key and the `turn_number` column.
   * Expected outcome: A positive turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle id, or empty on the world map.
   *
   * Contract: Empty when `scope` is `strategic`.
   * When to use: The key and the `battle_id` column.
   * Expected outcome: The battle's id, or `''`.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * The tactical turn, or 0 on the world map.
   *
   * Contract: 0 when `scope` is `strategic`.
   * When to use: The key and the `beat_number` column.
   * Expected outcome: The beat number, or 0.
   * Exceptions: None.
   */
  readonly beatNumber: number;
}

/**
 * A step on the world map.
 *
 * Purpose: Callers do not repeat the empty battle fields.
 * When to use: A strategic turn boundary or a strategic event.
 * Expected outcome: A strategic `StepKey` for `turnNumber`.
 * Exceptions: None.
 */
export function strategicStep(turnNumber: number): StepKey {
  return { scope: 'strategic', turnNumber, battleId: '', beatNumber: 0 };
}

/**
 * A step inside a battle.
 *
 * Purpose: Callers pass the battle id and the tactical turn together.
 * When to use: A beat boundary or a tactical event.
 * Expected outcome: A tactical `StepKey`.
 * Exceptions: None.
 */
export function tacticalStep(turnNumber: number, battleId: string, beatNumber: number): StepKey {
  return { scope: 'tactical', turnNumber, battleId, beatNumber };
}

/**
 * The text form of a step.
 *
 * Purpose: Automatic saves and history rows share one key.
 * When to use: Comparing the current step with the last frame, and storing `step_key`.
 * Expected outcome: `s12` on the world map, or `s12-bB7-t3` in a battle. The battle id is not parsed back out of this text.
 * Exceptions: None.
 */
export function stepKeyText(step: StepKey): string {
  if (step.scope === 'strategic') return `s${step.turnNumber}`;
  return `s${step.turnNumber}-b${step.battleId}-t${step.beatNumber}`;
}

/**
 * Who may be shown a record.
 *
 * Contract: `everyone` and `engine` are the two closed values. A seat list names the seats that were shown the text.
 * When to use: The visibility stored on a record.
 * Expected outcome: One of the three forms.
 * Exceptions: None.
 */
export type RecordVisibility = 'everyone' | 'engine' | { readonly seats: readonly string[] };

/**
 * The stored text of a visibility value.
 *
 * Purpose: The column is text. Callers keep the typed form until the insert.
 * When to use: Writing `visibility`.
 * Expected outcome: `everyone`, `engine`, or `seats:` plus the seat ids in the order given.
 * Exceptions: None.
 */
export function visibilityText(visibility: RecordVisibility): string {
  if (visibility === 'everyone' || visibility === 'engine') return visibility;
  return `seats:${visibility.seats.join(',')}`;
}

/**
 * Reads a visibility column back into the typed form.
 *
 * Purpose: An unknown value must not be treated as something a player was shown.
 * When to use: Reading a record.
 * Expected outcome: The three known forms round-trip. Any other text, including an empty seat list, is `engine`.
 * Exceptions: None.
 */
export function parseVisibilityText(text: string): RecordVisibility {
  if (text === 'everyone' || text === 'engine') return text;
  if (!text.startsWith('seats:')) return 'engine';
  const seats = text.slice('seats:'.length).split(',').filter((seat) => seat.length > 0);
  if (seats.length === 0) return 'engine';
  return { seats };
}

/**
 * `record_type` of a frame.
 *
 * Purpose: Frames and events share the table, and this value marks a frame.
 * When to use: Inserting a frame.
 * Expected outcome: The string `state`.
 * Exceptions: None.
 */
export const MATCH_FRAME_RECORD_TYPE = 'state';

/**
 * Format version of a frame payload.
 *
 * Purpose: A later change to the frame shape raises this number.
 * When to use: Inserting a frame.
 * Expected outcome: 1.
 * Exceptions: None.
 */
export const MATCH_FRAME_FORMAT_VERSION = 1;

/**
 * Event types this build writes.
 *
 * Purpose: The format-version map and the database share one list.
 * When to use: A new event type is added to this list and to `MATCH_EVENT_FORMAT_VERSIONS` together.
 * Expected outcome: The fourteen event names, in record order.
 * Exceptions: None.
 */
export const MATCH_EVENT_TYPES = [
  'match_started',
  'orders_committed',
  'strategic_resolution',
  'tactical_orders_committed',
  'tactical_resolution',
  'consultation',
  'commander_strategy',
  'match_ended',
  'message_sent',
  'stance_declared',
  'side_statistics',
  'losses_attributed',
  'view_snapshot',
  'resolution_view',
] as const;

/**
 * One event type from `MATCH_EVENT_TYPES`.
 *
 * Contract: A member of that list.
 * When to use: The `type` of a recorded event.
 * Expected outcome: One of the fourteen names.
 * Exceptions: None.
 */
export type MatchEventType = (typeof MATCH_EVENT_TYPES)[number];

/**
 * Format version of each event payload.
 *
 * Purpose: A later change to one payload raises that type's number only.
 * When to use: Inserting an event.
 * Expected outcome: Every event type maps to 1, except `stance_declared`, which maps to 2 because its payload gained `trust` and `threat`.
 * Exceptions: None.
 */
export const MATCH_EVENT_FORMAT_VERSIONS: Readonly<Record<MatchEventType, number>> = {
  match_started: 1,
  orders_committed: 1,
  strategic_resolution: 1,
  tactical_orders_committed: 1,
  tactical_resolution: 1,
  consultation: 1,
  commander_strategy: 1,
  match_ended: 1,
  message_sent: 1,
  stance_declared: 2,
  side_statistics: 1,
  losses_attributed: 1,
  view_snapshot: 1,
  resolution_view: 1,
};

/**
 * One history row with its payload already decoded.
 *
 * Contract: Fields match the table columns in camel case. `payload` is the JSON value, not the compressed bytes.
 * When to use: Listing records and parsing a recording file.
 * Expected outcome: The row a reader sorts by `recordId`.
 * Exceptions: None.
 */
export interface MatchRecord {
  /**
   * The row's order in the history.
   *
   * Contract: The SQLite `record_id`. Readers sort by this and by nothing else.
   * When to use: Keeping frames and events in write order.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly recordId: number;
  /**
   * Whether the row is a snapshot or an event.
   *
   * Contract: `frame` or `event`.
   * When to use: Choosing how to read `payload`.
   * Expected outcome: The stored `kind`.
   * Exceptions: None.
   */
  readonly kind: 'frame' | 'event';
  /**
   * The frame type or the event type.
   *
   * Contract: `state` for a frame, or a `MatchEventType` for an event.
   * When to use: Dispatching a reader.
   * Expected outcome: The stored `record_type`.
   * Exceptions: None.
   */
  readonly recordType: string;
  /**
   * The payload's format version.
   *
   * Contract: At least 1.
   * When to use: Deciding whether this build understands the payload.
   * Expected outcome: The stored `format_version`.
   * Exceptions: None.
   */
  readonly formatVersion: number;
  /**
   * The step text.
   *
   * Contract: The result of `stepKeyText`.
   * When to use: Grouping rows by step.
   * Expected outcome: The stored `step_key`.
   * Exceptions: None.
   */
  readonly stepKey: string;
  /**
   * The step's scope.
   *
   * Contract: `strategic` or `tactical`.
   * When to use: Reading the step without parsing `stepKey`.
   * Expected outcome: The stored `scope`.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The strategic turn.
   *
   * Contract: The turn number stored beside the key.
   * When to use: Filtering by turn.
   * Expected outcome: The stored `turn_number`.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle id, or empty.
   *
   * Contract: Empty on a strategic step.
   * When to use: Filtering by battle.
   * Expected outcome: The stored `battle_id`.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * The tactical turn, or 0.
   *
   * Contract: 0 on a strategic step.
   * When to use: Filtering by beat.
   * Expected outcome: The stored `beat_number`.
   * Exceptions: None.
   */
  readonly beatNumber: number;
  /**
   * The visibility text.
   *
   * Contract: The stored column, not the parsed form.
   * When to use: `parseVisibilityText`.
   * Expected outcome: `everyone`, `engine`, or a `seats:` list.
   * Exceptions: None.
   */
  readonly visibility: string;
  /**
   * Text shown to a player, when the main process had it.
   *
   * Contract: Null when the main process did not have display text.
   * When to use: Showing a strategy line later.
   * Expected outcome: The stored `display_text`.
   * Exceptions: None.
   */
  readonly displayText: string | null;
  /**
   * When the row was written, as ISO text.
   *
   * Contract: The clock the recorder used.
   * When to use: Ordering display, not history. History order is `recordId`.
   * Expected outcome: The stored `recorded_at`.
   * Exceptions: None.
   */
  readonly recordedAt: string;
  /**
   * The decoded JSON payload.
   *
   * Contract: Whatever was passed to the insert, after a JSON round trip.
   * When to use: Reading a frame or an event.
   * Expected outcome: The payload value.
   * Exceptions: None.
   */
  readonly payload: unknown;
}

/**
 * One table's columns and rows inside a frame or a recording.
 *
 * Contract: `columns` is the table order. Each row is values in that same order.
 * When to use: A frame payload and the static hex line of a recording.
 * Expected outcome: A JSON-safe copy of the table.
 * Exceptions: None.
 */
export interface MatchTableSnapshot {
  /**
   * Column names in table order.
   *
   * Contract: The order of `PRAGMA table_info`.
   * When to use: Reading a row array.
   * Expected outcome: One name per value.
   * Exceptions: None.
   */
  readonly columns: readonly string[];
  /**
   * Rows in `rowid` order.
   *
   * Contract: Each inner array lines up with `columns`.
   * When to use: Comparing two frames.
   * Expected outcome: The stored rows.
   * Exceptions: None.
   */
  readonly rows: readonly (readonly unknown[])[];
}

/**
 * File-format name of a recording.
 *
 * Purpose: A reader rejects a file that is not this format.
 * When to use: The header line.
 * Expected outcome: The string `agent-wars-recording`.
 * Exceptions: None.
 */
export const RECORDING_FILE_FORMAT = 'agent-wars-recording';

/**
 * File-format version of a recording.
 *
 * Purpose: A change to the line layout raises this number. A change to one payload does not.
 * When to use: The header line, and rejecting a newer file.
 * Expected outcome: 1.
 * Exceptions: None.
 */
export const RECORDING_FILE_FORMAT_VERSION = 1;

/**
 * File extension of a recording, without the dot.
 *
 * Purpose: The export name and the user's file dialog share it.
 * When to use: `recordingFileName`.
 * Expected outcome: The string `agentwars-recording`.
 * Exceptions: None.
 */
export const RECORDING_FILE_EXTENSION = 'agentwars-recording';

/**
 * The first line of a recording.
 *
 * Contract: `line` is `header` and `format` is `RECORDING_FILE_FORMAT`.
 * When to use: Parsing and writing a recording.
 * Expected outcome: The match identity and the file version.
 * Exceptions: None.
 */
export interface RecordingHeader {
  /**
   * The line kind.
   *
   * Contract: The string `header`.
   * When to use: The parser's first check.
   * Expected outcome: `header`.
   * Exceptions: None.
   */
  readonly line: 'header';
  /**
   * The format name.
   *
   * Contract: `RECORDING_FILE_FORMAT`.
   * When to use: Rejecting a different file.
   * Expected outcome: `agent-wars-recording`.
   * Exceptions: None.
   */
  readonly format: typeof RECORDING_FILE_FORMAT;
  /**
   * The file layout version.
   *
   * Contract: A positive integer. This build reads only `RECORDING_FILE_FORMAT_VERSION`.
   * When to use: Rejecting a newer layout.
   * Expected outcome: The number in the file.
   * Exceptions: None.
   */
  readonly formatVersion: number;
  /**
   * The app version that wrote the file.
   *
   * Contract: The version string passed to the export.
   * When to use: The header.
   * Expected outcome: That version.
   * Exceptions: None.
   */
  readonly appVersion: string;
  /**
   * The match id.
   *
   * Contract: The `match_id` row at export time.
   * When to use: Naming and grouping recordings.
   * Expected outcome: The id.
   * Exceptions: None.
   */
  readonly matchId: string;
  /**
   * The playthrough id.
   *
   * Contract: The `playthrough_id` row at export time. Empty when the file was written before the field existed.
   * When to use: Telling two runs of one match apart.
   * Expected outcome: The id, or an empty string.
   * Exceptions: None.
   */
  readonly playthroughId: string;
  /**
   * When the file was written, as ISO text.
   *
   * Contract: The export clock.
   * When to use: The header.
   * Expected outcome: That timestamp.
   * Exceptions: None.
   */
  readonly exportedAt: string;
}

/**
 * The second line of a recording, holding the hex grid once.
 *
 * Contract: `line` is `static`. `hexes` is the whole `hexes` table.
 * When to use: Parsing and writing a recording.
 * Expected outcome: The terrain that frames leave out.
 * Exceptions: None.
 */
export interface RecordingStatic {
  /**
   * The line kind.
   *
   * Contract: The string `static`.
   * When to use: The parser.
   * Expected outcome: `static`.
   * Exceptions: None.
   */
  readonly line: 'static';
  /**
   * The hex grid.
   *
   * Contract: Columns and rows of the `hexes` table.
   * When to use: Rebuilding a map from a recording.
   * Expected outcome: One row per hex.
   * Exceptions: None.
   */
  readonly hexes: MatchTableSnapshot;
}

/**
 * A recording read from text or from a file.
 *
 * Contract: `records` follows the file order, which is `record_id` order.
 * When to use: The summary command and the export round trip.
 * Expected outcome: The header, the hex grid, and every history row.
 * Exceptions: None.
 */
export interface ParsedRecording {
  /**
   * The header line.
   *
   * Contract: A `RecordingHeader`.
   * When to use: The match id and the file version.
   * Expected outcome: The first line.
   * Exceptions: None.
   */
  readonly header: RecordingHeader;
  /**
   * The static hex line.
   *
   * Contract: A `RecordingStatic`.
   * When to use: The hex grid.
   * Expected outcome: The second line.
   * Exceptions: None.
   */
  readonly staticData: RecordingStatic;
  /**
   * The history rows.
   *
   * Contract: One entry per record line, in file order.
   * When to use: Summaries and round-trip checks.
   * Expected outcome: The decoded records.
   * Exceptions: None.
   */
  readonly records: readonly MatchRecord[];
}
