/**
 * Parses and validates `missileLaunches` rows from a commander's JSON envelope.
 *
 * Purpose: Launch rows are not movement orders. They stay out of the orders parser so that parser does not import launch validation.
 * When to use: `parseOrdersResponse` normalizes the rows. `applyParsedRequestOrders` validates and de-duplicates them.
 * Expected outcome: One launch per missile, last row wins, invalid rows become drop reasons.
 * Exceptions: `codeToH3` failures are logged and dropped. Validation reads the open game database.
 */

import type { MissileLaunchOrder } from '../../shared/ipc/missileTypes';
import type { AiSeatId } from '../../shared/seatIds';
import { HEX_CODE_PATTERN, type CoordinateContext } from '../briefing/map/coordinateContext';
import { codeToH3 } from '../briefing/map/hexCodeTranslator';
import { validateMissileLaunchOrder } from '../gameActions/missileValidation';
import { logDebug, logError } from '../logger';
import { normalizeOrderEntries } from './orderEntryNormalization';
import { dedupeByUnitKeepLast, unitIdsWhoseEarlierRowsWereDiscarded } from './requestOrdersFlowSupport';

/**
 * Drop reason for a launch row that is not an object.
 *
 * Purpose: The parser names the field so a repair prompt can point at the bad row.
 * When to use: `normalizeMissileLaunchOrders` when an entry is null or not an object.
 * Expected outcome: The fixed sentence.
 * Exceptions: None.
 */
export const MISSILE_LAUNCH_ENTRY_NOT_OBJECT_REASON = 'missileLaunches entry dropped: expected object.';

/**
 * Drop reason for a launch row missing an actor or a hex code that maps.
 *
 * Purpose: A launch needs a unit and a briefing hex code. Anything else is dropped before validation.
 * When to use: `normalizeMissileLaunchOrders` when `normalizeOne` returns null.
 * Expected outcome: The fixed sentence.
 * Exceptions: None.
 */
export const MISSILE_LAUNCH_ENTRY_INVALID_REASON =
  'missileLaunches entry dropped: requires unitId and a valid targetHexCode.';

/**
 * Drop reason for any launch submitted during a battle.
 *
 * Purpose: Missiles do not fire in a battle. One reason covers the whole list.
 * When to use: When the coordinate mode is tactical and the list is non-empty.
 * Expected outcome: The fixed sentence. The launches are discarded.
 * Exceptions: None.
 */
export const MISSILE_LAUNCH_IN_BATTLE_DROP_REASON = 'missileLaunches dropped: missiles cannot launch during a battle.';

/**
 * Turns envelope launch rows into orders with H3 targets.
 *
 * Purpose: Grouped `unitIds` are already expanded. This step checks the hex code and drops the rest.
 * When to use: Inside `parseOrdersResponse` after `expandGroupedActorEntries`.
 * Expected outcome: Launches with `unitId` and `targetH3Index`, plus one drop reason per rejected row. A tactical list becomes one battle drop reason and no launches.
 * Exceptions: Logs and drops a row when `codeToH3` throws.
 */
export function normalizeMissileLaunchOrders(
  entries: unknown,
  context: CoordinateContext
): { missileLaunches: MissileLaunchOrder[]; dropReasons: string[] } {
  if (context.mode === 'tactical') {
    const present = Array.isArray(entries) && entries.length > 0;
    return {
      missileLaunches: [],
      dropReasons: present ? [MISSILE_LAUNCH_IN_BATTLE_DROP_REASON] : [],
    };
  }
  const normalized = normalizeOrderEntries<MissileLaunchOrder>(entries, {
    expectedObjectDropReason: MISSILE_LAUNCH_ENTRY_NOT_OBJECT_REASON,
    missingFieldsDropReason: MISSILE_LAUNCH_ENTRY_INVALID_REASON,
    normalizeOne: (raw) => missileLaunchFromRaw(raw, context),
  });
  return { missileLaunches: normalized.items, dropReasons: normalized.dropReasons };
}

/**
 * Reads one expanded launch row.
 *
 * Purpose: The envelope uses a briefing hex code. Resolution uses an H3 index.
 * When to use: `normalizeMissileLaunchOrders` for a strategic row.
 * Expected outcome: A launch, or null when the unit id or hex code is missing or unmapped.
 * Exceptions: Logs `codeToH3` failures and returns null.
 */
function missileLaunchFromRaw(raw: Record<string, unknown>, context: CoordinateContext): MissileLaunchOrder | null {
  const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
  const hexCode = typeof raw.targetHexCode === 'string' ? raw.targetHexCode.trim() : '';
  if (!unitId || !HEX_CODE_PATTERN.test(hexCode)) return null;
  try {
    return { unitId, targetH3Index: codeToH3(hexCode, context) };
  } catch (err) {
    logError('missileLaunchOrderParsing codeToH3 failed', err);
    return null;
  }
}

/**
 * Inputs for applying parsed launches.
 *
 * Purpose: Validation needs the seat and a label, and a battle must drop the list before the database is read.
 * When to use: `applyParsedRequestOrders` after the other order lists are collected.
 * Expected outcome: The same seat and label the movement rows used.
 * Exceptions: None.
 */
export interface ApplyParsedMissileLaunchesArgs {
  /**
   * Launches already normalized to H3.
   *
   * Contract: Output of `normalizeMissileLaunchOrders`, or an empty list.
   * When to use: `parsed.missileLaunches`.
   * Expected outcome: Rows still need ownership, range, and explored-hex checks.
   * Exceptions: None.
   */
  readonly parsed: readonly MissileLaunchOrder[];
  /**
   * Seat whose missiles may launch.
   *
   * Contract: The commander being consulted.
   * When to use: `validateMissileLaunchOrder` `allowedPlayer`.
   * Expected outcome: Another seat's missile is dropped.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * Whether this consultation is a battle.
   *
   * Contract: True when a tactical snapshot is present.
   * When to use: Before validation.
   * Expected outcome: A non-empty list becomes the battle drop reason and no launches.
   * Exceptions: None.
   */
  readonly tactical: boolean;
  /**
   * Label used in duplicate-launch drop reasons.
   *
   * Contract: Same function the movement rows use.
   * When to use: An earlier row for the same missile was discarded.
   * Expected outcome: The reason names the label, not a raw id, when the label differs.
   * Exceptions: None.
   */
  readonly aiOrderUnitLabel: (unitId: string) => string;
}

/**
 * Validates launches and keeps the last row for each missile.
 *
 * Purpose: A missile launches once. An earlier row for the same missile is a drop reason, as is any row validation rejects.
 * When to use: After parse, before the success result is returned.
 * Expected outcome: `missileLaunches` is the kept rows. `dropReasons` covers battle, duplicates, and validation failures.
 * Exceptions: None. Invalid rows are dropped rather than thrown. Validation reads the open game database when the list is strategic and non-empty.
 */
export function applyParsedMissileLaunches(args: ApplyParsedMissileLaunchesArgs): {
  missileLaunches: MissileLaunchOrder[];
  dropReasons: string[];
} {
  logDebug('missileLaunchOrderParsing applyParsedMissileLaunches', {
    seatId: args.seatId,
    tactical: args.tactical,
    count: args.parsed.length,
  });
  if (args.tactical) {
    return {
      missileLaunches: [],
      dropReasons: args.parsed.length > 0 ? [MISSILE_LAUNCH_IN_BATTLE_DROP_REASON] : [],
    };
  }
  const dropReasons: string[] = [];
  const accepted: MissileLaunchOrder[] = [];
  for (const launch of args.parsed) {
    const result = validateMissileLaunchOrder(launch.unitId, launch.targetH3Index, {
      allowedPlayer: args.seatId,
      displayLabelForUnit: args.aiOrderUnitLabel,
    });
    if (!result.valid) {
      dropReasons.push(result.reason);
      continue;
    }
    accepted.push(launch);
  }
  for (const unitId of unitIdsWhoseEarlierRowsWereDiscarded(accepted)) {
    dropReasons.push(`Duplicate missile launch for ${args.aiOrderUnitLabel(unitId)}`);
  }
  return { missileLaunches: dedupeByUnitKeepLast(accepted), dropReasons };
}
