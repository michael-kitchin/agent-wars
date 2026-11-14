/**
 * An AI side keeps its sea operations between turns and across a save and load.
 *
 * Purpose: The next planning phase continues the same operation instead of starting over.
 * When to use: Read once per turn advance. Replace one seat's list when that advance finishes. A new match deletes the row.
 * Expected outcome: Seat id to operations. A missing row is an empty map.
 * Exceptions: A parse error is logged and treated as an empty memory. A database error from the write propagates.
 */

import {
  OPERATION_METHODS,
  OPERATION_PHASES,
  OPERATION_SOURCES,
  type Operation,
  type OperationMethod,
  type OperationPhase,
  type OperationSource,
} from '../../shared/operationTypes';
import { EMPTY_OPERATION_OFFER, type OperationOfferState } from '../operations/operationOffer';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { deleteGameConfigRow, selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key for sea operations.
 *
 * Purpose: One row holds every AI seat's current operations.
 * When to use: Reading, writing, and deleting that row.
 * Expected outcome: The string `operations`.
 * Exceptions: None.
 */
export const OPERATIONS_CONFIG_KEY = 'operations';

/**
 * The `game_config` key for each seat's menu clocks.
 *
 * Purpose: The window survives until the next turn, including across a save and load.
 * When to use: Reading and writing `announcedTurn` and `clearOfferTurn`.
 * Expected outcome: The string `operation_offers`.
 * Exceptions: None.
 */
export const OPERATION_OFFERS_CONFIG_KEY = 'operation_offers';

/**
 * The `game_config` key for the turn a seat should be consulted about operations.
 *
 * Purpose: Event-driven consultation reads this after the operation tick.
 * When to use: Reading and writing that turn number.
 * Expected outcome: The string `operation_events`.
 * Exceptions: None.
 */
export const OPERATION_EVENTS_CONFIG_KEY = 'operation_events';

/**
 * The `game_config` key for the refusal shown on the following turn.
 *
 * Purpose: A dropped operation command has to survive until the next briefing, and only that briefing.
 * When to use: Reading and writing one seat's note.
 * Expected outcome: The string `operation_notes`.
 * Exceptions: None.
 */
export const OPERATION_NOTES_CONFIG_KEY = 'operation_notes';

/**
 * The refusal a seat sees on the turn after it was dropped.
 *
 * Purpose: The briefing prints one sentence, and the turn number decides whether that sentence is still due.
 * When to use: The value stored under `OPERATION_NOTES_CONFIG_KEY`.
 * Expected outcome: `turn` is the consult that produced `text`.
 * Exceptions: None.
 */
export interface OperationNote {
  /**
   * The turn whose reply produced the note.
   *
   * Contract: The following turn is `turn + 1`.
   * When to use: Comparing with the briefing's turn number.
   * Expected outcome: An integer.
   * Exceptions: None.
   */
  readonly turn: number;
  /**
   * The joined refusal text.
   *
   * Contract: Non-empty. A stored empty string reads as no note.
   * When to use: The Active Operations line.
   * Expected outcome: One or more drop reasons that start with `operations `.
   * Exceptions: None.
   */
  readonly text: string;
}

/**
 * True when the value is a member of the allowed list.
 *
 * Purpose: The parser shares one membership test for method, phase, and source.
 * When to use: While reading one stored operation.
 * Expected outcome: True only for a string in the list.
 * Exceptions: None.
 */
function isListed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * True when every entry is a non-empty string.
 *
 * Purpose: Unit and ship ids that are empty or not strings must not enter the advance.
 * When to use: While reading `unitIds` and `carrierIds`.
 * Expected outcome: True for an array of non-empty strings, including an empty array.
 * Exceptions: None.
 */
function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

/**
 * Parses one stored operation.
 *
 * Purpose: A bad operation is dropped without dropping the seat's other operations.
 * When to use: While reading the operations row.
 * Expected outcome: The operation, or null when a field is missing or the wrong type.
 * Exceptions: None.
 */
function parseOperation(value: unknown): Operation | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const { id, objectiveH3, musterH3, landingH3, unitIds, carrierIds, method, phase, source, launchedTurn, phaseTurn } = row;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof objectiveH3 !== 'string' || objectiveH3.length === 0) return null;
  if (typeof musterH3 !== 'string' || musterH3.length === 0) return null;
  if (landingH3 !== null && (typeof landingH3 !== 'string' || landingH3.length === 0)) return null;
  if (!isIdList(unitIds) || !isIdList(carrierIds)) return null;
  if (!isListed<OperationMethod>(method, OPERATION_METHODS)) return null;
  if (!isListed<OperationPhase>(phase, OPERATION_PHASES)) return null;
  if (!isListed<OperationSource>(source, OPERATION_SOURCES)) return null;
  if (typeof launchedTurn !== 'number' || !Number.isInteger(launchedTurn)) return null;
  if (typeof phaseTurn !== 'number' || !Number.isInteger(phaseTurn)) return null;
  return {
    id,
    method,
    objectiveH3,
    musterH3,
    landingH3,
    unitIds,
    carrierIds,
    phase,
    source,
    launchedTurn,
    phaseTurn,
  };
}

/**
 * Reads every seat's stored operations.
 *
 * Purpose: The turn advance and the briefing share the row written last time.
 * When to use: Once per turn, and when a consult builds the Active Operations section.
 * Expected outcome: Seat id to operations. Invalid operations are dropped. A missing row, which is what a save from before this row existed has, is an empty map.
 * Exceptions: None. A parse error is logged and returns an empty map.
 */
export function readOperations(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, Operation[]> {
  logTrace('operationMemory readOperations');
  const operations = new Map<string, Operation[]>();
  const raw = selectGameConfigValue(ops, OPERATIONS_CONFIG_KEY);
  if (raw == null) return operations;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('operationMemory readOperations: stored value is not an object', { rawLength: raw.length });
      return operations;
    }
    for (const [seatId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) {
        logDebug('operationMemory readOperations: dropped invalid entry', { seatId });
        continue;
      }
      const kept: Operation[] = [];
      for (const entry of value) {
        const operation = parseOperation(entry);
        if (operation) kept.push(operation);
        else logDebug('operationMemory readOperations: dropped invalid entry', { seatId });
      }
      if (kept.length > 0) operations.set(seatId, kept);
    }
    return operations;
  } catch (err) {
    logError('operationMemory readOperations: could not parse stored value', { rawLength: raw.length }, err);
    return operations;
  }
}

/**
 * Replaces one seat's stored operations.
 *
 * Purpose: The list survives until the next turn, including across a save and load.
 * When to use: At the end of a seat's turn advance, and when that seat is knocked out.
 * Expected outcome: The row with this seat's entry replaced, or removed when `operations` is empty. Other seats are kept. Each seat's operations are sorted by id.
 * Exceptions: Propagates a database error.
 */
export function writeOperationsForSeat(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  operations: readonly Operation[]
): void {
  const all = readOperations(ops);
  if (operations.length === 0 && !all.has(seatId)) {
    logDebug('operationMemory writeOperationsForSeat', { seatId, cleared: true, absent: true });
    return;
  }
  if (operations.length === 0) all.delete(seatId);
  else {
    const sorted = [...operations].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    all.set(seatId, sorted);
  }
  const record: Record<string, Operation[]> = {};
  for (const key of [...all.keys()].sort()) record[key] = all.get(key)!;
  logDebug('operationMemory writeOperationsForSeat', { seatId, cleared: operations.length === 0, seatCount: all.size });
  upsertGameConfigValue(ops, OPERATIONS_CONFIG_KEY, JSON.stringify(record));
}

/**
 * Reads one seat-keyed JSON object.
 *
 * Purpose: The offer row and the event row share one parse.
 * When to use: The offer and event readers.
 * Expected outcome: The object, or an empty object when the row is missing or not an object.
 * Exceptions: None. A parse error is logged and returns an empty object.
 */
function readConfigObject(ops: Pick<GameConfigKvDbOps, 'getOne'>, key: string): Record<string, unknown> {
  logTrace('operationMemory readConfigObject', { key });
  const raw = selectGameConfigValue(ops, key);
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('operationMemory readConfigObject: stored value is not an object', { key, rawLength: raw.length });
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    logError('operationMemory readConfigObject: could not parse stored value', { key, rawLength: raw.length }, err);
    return {};
  }
}

/**
 * Writes one seat-keyed JSON object.
 *
 * Purpose: The offer row and the event row share one write.
 * When to use: After a seat's entry is added or removed.
 * Expected outcome: The row replaced with the sorted keys, or deleted when no seat remains.
 * Exceptions: Propagates a database error.
 */
function writeConfigObject(
  ops: Pick<GameConfigKvDbOps, 'run'>,
  key: string,
  record: Record<string, unknown>
): void {
  const seatIds = Object.keys(record).sort();
  logDebug('operationMemory writeConfigObject', { key, seatCount: seatIds.length });
  if (seatIds.length === 0) {
    deleteGameConfigRow(ops, key);
    return;
  }
  const sorted: Record<string, unknown> = {};
  for (const seatId of seatIds) sorted[seatId] = record[seatId];
  upsertGameConfigValue(ops, key, JSON.stringify(sorted));
}

/**
 * A stored integer, or null when the value is not one.
 *
 * Purpose: A bad clock must not launch or consult.
 * When to use: While reading an offer turn or an event turn.
 * Expected outcome: The integer, or null.
 * Exceptions: None.
 */
function storedInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Reads one seat's menu clocks.
 *
 * Purpose: The turn advance continues the window that was stored last tick.
 * When to use: At the start of a seat's launch step. A missing or malformed row is an empty offer.
 * Expected outcome: Both turns, or nulls when the seat has no entry.
 * Exceptions: None. A parse error is logged by the shared reader and returns an empty offer.
 */
export function readOperationOffer(
  ops: Pick<GameConfigKvDbOps, 'getOne'>,
  seatId: string
): OperationOfferState {
  logTrace('operationMemory readOperationOffer', { seatId });
  const entry = readConfigObject(ops, OPERATION_OFFERS_CONFIG_KEY)[seatId];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return EMPTY_OPERATION_OFFER;
  const row = entry as Record<string, unknown>;
  return {
    announcedTurn: storedInteger(row.announcedTurn),
    clearOfferTurn: storedInteger(row.clearOfferTurn),
  };
}

/**
 * Replaces one seat's menu clocks.
 *
 * Purpose: The window has to be there on the next turn, and gone when the seat has nothing to show.
 * When to use: At the end of a seat's launch step, and when that seat is knocked out. Pass null, or an offer whose turns are both null, to remove the seat.
 * Expected outcome: The row with this seat's entry replaced or removed. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
export function writeOperationOffer(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  offer: OperationOfferState | null
): void {
  const record = readConfigObject(ops, OPERATION_OFFERS_CONFIG_KEY);
  const clear = offer === null || (offer.announcedTurn === null && offer.clearOfferTurn === null);
  if (clear) delete record[seatId];
  else record[seatId] = { announcedTurn: offer.announcedTurn, clearOfferTurn: offer.clearOfferTurn };
  logDebug('operationMemory writeOperationOffer', { seatId, cleared: clear });
  writeConfigObject(ops, OPERATION_OFFERS_CONFIG_KEY, record);
}

/**
 * Reads the turn on which this seat should be consulted about operations.
 *
 * Purpose: The consult trigger compares it with the planning turn.
 * When to use: After resolution, for one seat. A missing or malformed value is null.
 * Expected outcome: The stored turn, or null.
 * Exceptions: None. A parse error is logged by the shared reader and returns null.
 */
export function readOperationEventTurn(ops: Pick<GameConfigKvDbOps, 'getOne'>, seatId: string): number | null {
  logTrace('operationMemory readOperationEventTurn', { seatId });
  return storedInteger(readConfigObject(ops, OPERATION_EVENTS_CONFIG_KEY)[seatId]);
}

/**
 * Seat ids stored on the operation, offer, or event rows.
 *
 * Purpose: A seat that has left must lose a menu even when it never stored an operation.
 * When to use: Before the active seats advance.
 * Expected outcome: Every seat id present on the operation, offer, event, or note row, in sorted order.
 * Exceptions: None. A malformed row is logged by the reader and contributes no ids.
 */
export function operationMemorySeatIds(ops: Pick<GameConfigKvDbOps, 'getOne'>): readonly string[] {
  const ids = new Set<string>([
    ...readOperations(ops).keys(),
    ...Object.keys(readConfigObject(ops, OPERATION_OFFERS_CONFIG_KEY)),
    ...Object.keys(readConfigObject(ops, OPERATION_EVENTS_CONFIG_KEY)),
    ...Object.keys(readConfigObject(ops, OPERATION_NOTES_CONFIG_KEY)),
  ]);
  const seatIds = [...ids].sort();
  logTrace('operationMemory operationMemorySeatIds', { seatCount: seatIds.length });
  return seatIds;
}

/**
 * Stores, or clears, the turn on which this seat should be consulted.
 *
 * Purpose: The operation tick records the moments the commander has to answer.
 * When to use: When a menu is first shown, an undefended row appears, a phase changes, or the engine launches. Pass null to remove the seat.
 * Expected outcome: The row with this seat's turn replaced or removed. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
/**
 * Reads one seat's refusal note.
 *
 * Purpose: The next briefing repeats why a launch or cancel was dropped.
 * When to use: While building Active Operations. A missing or malformed value is no note.
 * Expected outcome: The stored turn and text, or null.
 * Exceptions: None. A parse error is logged by the shared reader and returns null.
 */
export function readOperationNote(ops: Pick<GameConfigKvDbOps, 'getOne'>, seatId: string): OperationNote | null {
  logTrace('operationMemory readOperationNote', { seatId });
  const entry = readConfigObject(ops, OPERATION_NOTES_CONFIG_KEY)[seatId];
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const row = entry as Record<string, unknown>;
  const turn = storedInteger(row.turn);
  if (turn === null || typeof row.text !== 'string' || row.text.length === 0) return null;
  return { turn, text: row.text };
}

/**
 * The note text still due on this turn.
 *
 * Purpose: A refusal is shown once, on the turn after it was stored.
 * When to use: When the briefing decides whether to print the note.
 * Expected outcome: The text when `note.turn` is the previous turn. Otherwise an empty string.
 * Exceptions: None.
 */
export function operationNoteTextForTurn(note: OperationNote | null, turnNumber: number): string {
  const text = note !== null && note.turn === turnNumber - 1 ? note.text : '';
  logTrace('operationMemory operationNoteTextForTurn', { turnNumber, shown: text.length > 0 });
  return text;
}

/**
 * Replaces one seat's refusal note.
 *
 * Purpose: The sentence has to be there for the next briefing, and gone once that briefing has passed.
 * When to use: After a strategic apply, and when the seat is knocked out or leaves. Pass null to remove the seat.
 * Expected outcome: The row with this seat's entry replaced or removed. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
export function writeOperationNote(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  note: OperationNote | null
): void {
  const record = readConfigObject(ops, OPERATION_NOTES_CONFIG_KEY);
  if (note === null) delete record[seatId];
  else record[seatId] = { turn: note.turn, text: note.text };
  logDebug('operationMemory writeOperationNote', { seatId, cleared: note === null });
  writeConfigObject(ops, OPERATION_NOTES_CONFIG_KEY, record);
}

/**
 * Stores the operation refusals from one reply, or clears them.
 *
 * Purpose: The next briefing can say why, and a reply with no operation refusal must not repeat an old one.
 * When to use: Once, after a strategic apply with orders enabled, with the drop reasons collected so far.
 * Expected outcome: One note whose text joins every reason that starts with `operations `. No such reason removes the seat's note.
 * Exceptions: Propagates a database error.
 */
export function writeOperationRefusal(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  turn: number,
  reasons: readonly string[]
): void {
  const kept = reasons.filter((reason) => reason.startsWith('operations '));
  logDebug('operationMemory writeOperationRefusal', { seatId, turn, kept: kept.length });
  writeOperationNote(ops, seatId, kept.length === 0 ? null : { turn, text: kept.join(' ') });
}

export function writeOperationEventTurn(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  turn: number | null
): void {
  const record = readConfigObject(ops, OPERATION_EVENTS_CONFIG_KEY);
  if (turn === null) delete record[seatId];
  else record[seatId] = turn;
  logDebug('operationMemory writeOperationEventTurn', { seatId, turn });
  writeConfigObject(ops, OPERATION_EVENTS_CONFIG_KEY, record);
}

/**
 * Ground-unit ids assigned to one seat's operations.
 *
 * Purpose: Campaign inputs skip these units so they are not given a second set of orders.
 * When to use: While building campaign inputs and the campaign-ready check.
 * Expected outcome: Every id in `unitIds` for that seat. An empty set when the seat has no operations or the row cannot be read.
 * Exceptions: None. A thrown read is logged and returns an empty set.
 */
export function operationUnitIdsForSeat(seatId: string): ReadonlySet<string> {
  logTrace('operationMemory operationUnitIdsForSeat', { seatId });
  try {
    const ids = new Set<string>();
    for (const operation of readOperations({ getOne: dbGetOneLazy() }).get(seatId) ?? []) {
      for (const unitId of operation.unitIds) ids.add(unitId);
    }
    return ids;
  } catch (err) {
    logError('operationMemory operationUnitIdsForSeat: could not read operations', { seatId }, err);
    return new Set();
  }
}

/**
 * The next unused operation id for a seat on this turn.
 *
 * Purpose: Two launches on the same turn must not share an id.
 * When to use: When the turn advance stores a new operation.
 * Expected outcome: `${seatId}-op${turnNumber}`, or that id plus `b` through `z` when earlier suffixes are taken.
 * Exceptions: None. When every suffix through `z` is taken, the `z` id is returned again.
 */
export function nextOperationId(seatId: string, existing: readonly Operation[], turnNumber: number): string {
  const taken = new Set(existing.map((operation) => operation.id));
  const base = `${seatId}-op${turnNumber}`;
  if (!taken.has(base)) {
    logTrace('operationMemory nextOperationId', { seatId, turnNumber, id: base });
    return base;
  }
  let id = base;
  for (let code = 'b'.charCodeAt(0); code <= 'z'.charCodeAt(0); code += 1) {
    id = `${base}${String.fromCharCode(code)}`;
    if (!taken.has(id)) break;
  }
  logTrace('operationMemory nextOperationId', { seatId, turnNumber, id });
  return id;
}

/**
 * Reads one config value without a static import cycle through the database barrel.
 *
 * Purpose: Campaign code calls this module, and this module must not import the barrel that campaign code also imports.
 * When to use: `operationUnitIdsForSeat` only.
 * Expected outcome: The same `dbGetOne` the rest of the main process uses.
 * Exceptions: Propagates a failure to load the database module.
 */
function dbGetOneLazy(): GameConfigKvDbOps['getOne'] {
  // Deferred so this file does not import the database barrel that imports reset, which imports this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would cycle through the database barrel
  const loaded = require('../gameDb') as { dbGetOne: GameConfigKvDbOps['getOne'] };
  return loaded.dbGetOne;
}
