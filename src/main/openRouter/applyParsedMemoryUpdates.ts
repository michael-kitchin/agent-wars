/**
 * Applies parsed `memoryUpdates` from an order envelope.
 *
 * Purpose: The parser keeps these rows, and this is the writer that turns a strategic row into a stored note.
 * When to use: Once, after order validation and before `markSuccessfulConsultation`.
 * Expected outcome: `appliedCount` counts rows `executeMemory` accepted. Each rejected row is one drop reason.
 * A battle consult writes nothing. A list sent while memory tools are off is one drop reason and is not stored.
 * An empty list adds no reason. The consultation is not failed from here.
 * Exceptions: None. `executeMemory` returns an error status instead of throwing, and this function maps that
 * status onto a drop reason.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { logDebug, logTrace } from '../logger';
import { executeMemory } from '../tools/memory';
import type { MemoryUpdateItem } from './orderResponseParsing';

/**
 * Map argument `executeMemory` requires and does not read.
 *
 * Purpose: Memory rows carry no coordinates, so every call shares one empty map.
 * When to use: Each `executeMemory` call in this file.
 * Expected outcome: An empty map.
 * Exceptions: None.
 */
const emptyMap = new Map<string, [number, number]>();

/**
 * Resolver argument `executeMemory` requires and does not read.
 *
 * Purpose: Memory rows carry no coordinates.
 * When to use: Each `executeMemory` call in this file.
 * Expected outcome: `undefined` for any lat/lng.
 * Exceptions: None.
 */
const noopResolve = (): undefined => undefined;

/**
 * Text of a failed memory tool result.
 *
 * Purpose: Drop reasons name the tool's error and never the note content.
 * When to use: When `executeMemory` returns a status other than `ok`.
 * Expected outcome: The result's `error` string, or `memory update failed` when that string is missing.
 * Exceptions: None.
 */
function memoryErrorText(result: Record<string, unknown>): string {
  const error = typeof result.error === 'string' && result.error.length > 0 ? result.error : undefined;
  logTrace('openRouter memoryErrorText', { hasError: error !== undefined });
  return error ?? 'memory update failed';
}

/**
 * Applies one envelope's memory rows for one seat.
 *
 * Purpose: Strategic writes and deletes go through `executeMemory` when memory tools are on. A missing tier is dropped
 * here so the tool's default of `stored` is never used. Battle rows, and rows sent while the group is off, are not applied.
 * When to use: From `applyParsedRequestOrders` on the success path.
 * Expected outcome: Counts and drop reasons described on the module comment. Content is passed through unchanged,
 * including an empty string, so `write` still returns `Content cannot be empty`. Rows are not stored when memory
 * tools are off or the consult is a battle.
 * Exceptions: None.
 */
export function applyParsedMemoryUpdates(args: {
  seatId: AiSeatId;
  turnNumber: number;
  updates: readonly MemoryUpdateItem[] | undefined;
  tactical: boolean;
  memoryEnabled: boolean;
}): { appliedCount: number; dropReasons: string[] } {
  const updates = args.updates ?? [];
  logDebug('openRouter applyParsedMemoryUpdates', {
    seatId: args.seatId,
    turnNumber: args.turnNumber,
    tactical: args.tactical,
    memoryEnabled: args.memoryEnabled,
    updateCount: updates.length,
  });
  if (updates.length === 0) return { appliedCount: 0, dropReasons: [] };
  if (args.tactical) {
    return { appliedCount: 0, dropReasons: ['memoryUpdates dropped: not accepted in battle'] };
  }
  if (!args.memoryEnabled) {
    return { appliedCount: 0, dropReasons: ['memoryUpdates dropped: memory tool group is disabled.'] };
  }

  const dropReasons: string[] = [];
  let appliedCount = 0;
  for (const update of updates) {
    const action: string = update.action;
    if (action === 'delete') {
      const result = executeMemory(
        args.seatId,
        'memory_delete',
        { key: update.key },
        { turnNumber: args.turnNumber },
        emptyMap,
        noopResolve
      );
      if (result.status === 'ok') appliedCount += 1;
      else dropReasons.push(`Memory ${update.key}: ${memoryErrorText(result)}`);
      continue;
    }
    if (action === 'write') {
      if (update.tier !== 'persistent' && update.tier !== 'stored') {
        dropReasons.push(`Memory ${update.key}: write requires tier`);
        continue;
      }
      const content = typeof update.content === 'string' ? update.content : '';
      const result = executeMemory(
        args.seatId,
        'memory_write',
        { key: update.key, content, tier: update.tier },
        { turnNumber: args.turnNumber },
        emptyMap,
        noopResolve
      );
      if (result.status === 'ok') appliedCount += 1;
      else dropReasons.push(`Memory ${update.key}: ${memoryErrorText(result)}`);
      continue;
    }
    dropReasons.push(`Memory ${update.key}: unsupported action`);
  }
  return { appliedCount, dropReasons };
}
