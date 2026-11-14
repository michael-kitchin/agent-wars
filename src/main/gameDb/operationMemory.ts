/**
 * An AI side keeps its sea operations between turns and across a save and load.
 *
 * Purpose: The next planning phase continues the same landing instead of starting over.
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
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
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
