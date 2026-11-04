/**
 * Parses `airDrops` rows from a commander's JSON envelope.
 *
 * Purpose: A drop is not a ferry and not a strike. Its row shape matches `ferryOrders`, and the capacity checks stay in the engine.
 * When to use: `parseOrdersResponse`, after grouped `unitIds` rows are expanded.
 * Expected outcome: One drop per accepted row, plus a logged reason for every row that lacks a unit or a destination.
 * Exceptions: `codeToH3` failures are logged and the row is dropped.
 */

import type { AirDropOrder } from '../../shared/ipc/airDropTypes';
import { HEX_CODE_PATTERN, type CoordinateContext } from '../briefing/map/coordinateContext';
import { codeToH3 } from '../briefing/map/hexCodeTranslator';
import { logDebug } from '../logger';
import { normalizeOrderEntries } from './orderEntryNormalization';

/**
 * Drop reason for an `airDrops` entry that is not an object.
 *
 * Purpose: The repair note names the field, the same way a ferry row does.
 * When to use: `normalizeAirDropOrders` when an entry is null or not an object.
 * Expected outcome: The fixed sentence.
 * Exceptions: None.
 */
export const AIR_DROP_ENTRY_NOT_OBJECT_REASON = 'airDrops entry dropped: expected object.';

/**
 * Drop reason for an `airDrops` entry missing a unit or a hex code that maps.
 *
 * Purpose: A drop needs a unit and a briefing hex code. Anything else is dropped before validation.
 * When to use: `normalizeAirDropOrders` when the row cannot be read.
 * Expected outcome: The fixed sentence.
 * Exceptions: None.
 */
export const AIR_DROP_ENTRY_INVALID_REASON =
  'airDrops entry dropped: requires unitId and valid destination hex code.';

/**
 * Turns envelope drop rows into orders with H3 targets.
 *
 * Purpose: Grouped `unitIds` are already expanded. This step checks the hex code and drops the rest.
 * When to use: Inside `parseOrdersResponse` after `expandGroupedActorEntries`.
 * Expected outcome: Drops with `unitId` and `targetH3Index`, plus one reason per rejected row.
 * Exceptions: Logs and drops a row when `codeToH3` throws.
 */
export function normalizeAirDropOrders(
  entries: unknown,
  context: CoordinateContext
): { airDropOrders: AirDropOrder[]; dropReasons: string[] } {
  const normalized = normalizeOrderEntries<AirDropOrder>(entries, {
    expectedObjectDropReason: AIR_DROP_ENTRY_NOT_OBJECT_REASON,
    missingFieldsDropReason: AIR_DROP_ENTRY_INVALID_REASON,
    normalizeOne: (raw) => airDropFromRaw(raw, context),
  });
  logDebug('airDropOrderRows normalizeAirDropOrders', {
    kept: normalized.items.length,
    dropped: normalized.dropReasons.length,
  });
  return { airDropOrders: normalized.items, dropReasons: normalized.dropReasons };
}

/**
 * Reads one expanded drop row.
 *
 * Purpose: The envelope uses a briefing hex code in `destination`. Resolution uses an H3 index.
 * When to use: `normalizeAirDropOrders` for one row.
 * Expected outcome: A drop, or null when the unit id or hex code is missing or unmapped.
 * Exceptions: Logs `codeToH3` failures and returns null.
 */
function airDropFromRaw(raw: Record<string, unknown>, context: CoordinateContext): AirDropOrder | null {
  const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
  const dest = raw.destination;
  if (typeof dest !== 'string' || !HEX_CODE_PATTERN.test(dest) || !unitId) return null;
  try {
    return { unitId, targetH3Index: codeToH3(dest, context) };
  } catch (err) {
    logDebug('airDropOrderRows airDropFromRaw: destination could not be mapped', { unitId, dest, err });
    return null;
  }
}
