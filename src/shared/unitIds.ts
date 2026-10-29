/**
 * Compact unit-identifier grammar used in prompts, logs, and the `units.id` primary key.
 *
 * Purpose: Keep identifiers short for LLM token cost while still encoding owner and type.
 * When to use: Seeding, production, tactical snapshot construction, and any parser that
 * must understand compact ids without assuming they are the only on-disk format.
 * Expected outcome: Formatters emit `h1-i1` / `a1-t3` / `a4-i2` shapes; parsers return `null`
 * for legacy ids so existing saves keep working as opaque strings.
 * Exceptions: None. **Logging:** this module does not import `src/main/logger`; do not
 * add `logTrace` here (shared layer). Callers that introduce new behavior may log at
 * their boundary.
 */

import { type BuildUnitType } from './ipc/productionTypes';
import { type SeatId, aiIndexForSeatId, aiSeatIdForIndex, isHumanSeatId, AI_SEAT_IDS, HUMAN_SEAT_ID } from './seatIds';

/**
 * Parsed compact strategic identifier.
 *
 * Purpose: Structured form of `h1-t3` so callers do not re-split the string.
 * When to use: After `parseStrategicUnitId` succeeds.
 * Expected outcome: `ordinal` is a positive integer with no leading zeros in the source.
 * Exceptions: None.
 */
export type StrategicUnitIdParts = {
  readonly player: SeatId;
  readonly unitType: BuildUnitType;
  readonly ordinal: number;
};

/**
 * Parsed compact tactical sub-unit identifier.
 *
 * Purpose: Recover the parent strategic id and 1-based slot from `h1-t3-s2`.
 * When to use: After `parseTacticalSubUnitId` succeeds.
 * Expected outcome: `slot` is a positive integer; `parentUnitId` is the prefix before `-s`.
 * Exceptions: None.
 */
export type TacticalSubUnitIdParts = {
  readonly parentUnitId: string;
  readonly slot: number;
};

/**
 * Single-letter type codes used in compact identifiers.
 *
 * Purpose: Central table so seeding, production, and parsers cannot drift.
 * When to use: Formatting and reverse lookup. `s` is reserved for the sub-unit segment
 * and must never appear here.
 * Expected outcome: infantry `i`, armor `t` (tank), naval `n`, air `a`, missile `m`.
 * Exceptions: None.
 */
export const UNIT_TYPE_ID_CODES: Readonly<Record<BuildUnitType, string>> = {
  infantry: 'i',
  armor: 't',
  naval: 'n',
  air: 'a',
  missile: 'm',
};

/**
 * Matches compact strategic ids such as `h1-i1` and `a1-a44`.
 *
 * Purpose: Single source for the strategic grammar so call sites do not inline regexes.
 * When to use: `parseStrategicUnitId` only.
 * Expected outcome: Captures player letter, player index, type code, and ordinal digits.
 * Exceptions: Leading zeros are rejected after the match. Human indexes other than 1,
 * and AI indexes outside 1 to 4, are rejected by the parser.
 */
const STRATEGIC_UNIT_ID_PATTERN = /^([ha])(\d+)-([itnam])(\d+)$/;

/**
 * Matches compact tactical sub-unit ids such as `h1-t3-s2`.
 *
 * Purpose: Single source for the `-s<slot>` segment so parent extraction stays consistent.
 * When to use: `parseTacticalSubUnitId` only.
 * Expected outcome: Captures the parent prefix and slot digits; does not match a strategic id
 * because no type code is `s`.
 * Exceptions: Leading zeros in the slot are rejected after the match.
 */
const TACTICAL_SUB_UNIT_ID_PATTERN = /^(.+)-s(\d+)$/;

/**
 * Reverse of `UNIT_TYPE_ID_CODES` for parse-time type recovery.
 *
 * Purpose: Avoid a switch that can drift from the forward table.
 * When to use: Inside `parseStrategicUnitId`.
 * Expected outcome: `'i'|'t'|'n'|'a'` map to the four `BuildUnitType` values.
 * Exceptions: None.
 */
const UNIT_TYPE_FROM_ID_CODE: Readonly<Record<string, BuildUnitType>> = Object.fromEntries(
  Object.entries(UNIT_TYPE_ID_CODES).map(([unitType, code]) => [code, unitType])
) as Readonly<Record<string, BuildUnitType>>;

/**
 * Numeric-aware collator for prompt-facing unit-id lists.
 *
 * Purpose: Sort `h1-i2` before `h1-i10`. Kept separate from `NATURAL_ID_COLLATOR` in
 * `unitDisplayNames.ts`, which uses `sensitivity: 'base'` for formation-label grouping.
 * When to use: `compareUnitIdsNaturally` only.
 * Expected outcome: English numeric collation; case differences remain distinct.
 * Exceptions: None.
 */
const NATURAL_UNIT_ID_COLLATOR = new Intl.Collator('en', { numeric: true });

/**
 * Returns whether `value` is a finite integer greater than zero.
 *
 * Purpose: Shared guard so formatters never emit `NaN` or padded zeros into primary keys.
 * When to use: Before concatenating an ordinal or slot.
 * Expected outcome: `true` only for 1, 2, 3, …
 * Exceptions: None.
 */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Returns whether a captured digit run used a leading zero.
 *
 * Purpose: Reject `h01-i1` and `h1-i01` even though they match the digit regex.
 * When to use: After a successful regex match on an index, ordinal, or slot.
 * Expected outcome: `true` for `'0'` and `'01'`; `false` for `'1'` and `'10'`.
 * Exceptions: None.
 */
function hasForbiddenLeadingZero(digits: string): boolean {
  return digits.startsWith('0');
}

/**
 * Maps a DB `player` value to the compact player-code segment.
 *
 * Purpose: Keep `h1` / `a1` through `a4` construction in one place.
 * When to use: `formatStrategicUnitId` and any caller that needs the prefix alone.
 * Expected outcome: The human seat → `'h1'`. AI index 1 → `'a1'`. AI index 4 → `'a4'`.
 * Exceptions: Throws when an AI seat id has no index. A `SeatId` that passed `isHumanSeatId` does not take that path.
 */
export function playerIdCodeFor(player: SeatId): string {
  if (isHumanSeatId(player)) return 'h1';
  const aiIndex = aiIndexForSeatId(player);
  if (aiIndex === null) {
    throw new Error(`Cannot format a player code for ${player}`);
  }
  return `a${aiIndex}`;
}

/**
 * Builds a compact strategic identifier such as `a1-a44`.
 *
 * Purpose: Seeding and production must not concatenate player/type names into ids.
 * When to use: Immediately before inserting a `units` row.
 * Expected outcome: `` `${playerCode}-${typeCode}${ordinal}` `` with no padding.
 * Exceptions: Throws when `ordinal` is not a positive integer.
 */
export function formatStrategicUnitId(args: StrategicUnitIdParts): string {
  if (!isPositiveInteger(args.ordinal)) {
    throw new Error(`Cannot format a strategic unit id: ordinal must be a positive integer, got ${String(args.ordinal)}`);
  }
  return `${playerIdCodeFor(args.player)}-${UNIT_TYPE_ID_CODES[args.unitType]}${args.ordinal}`;
}

/**
 * Builds a compact tactical sub-unit identifier such as `h1-t3-s2`.
 *
 * Purpose: Tactical snapshots need a stable child id derived from the parent without padding.
 * When to use: When placing a sub-unit into a tactical battle snapshot.
 * Expected outcome: `` `${parentUnitId}-s${slot}` `` with no padding.
 * Exceptions: Throws when `slot` is not a positive integer.
 */
export function formatTacticalSubUnitId(parentUnitId: string, slot: number): string {
  if (!isPositiveInteger(slot)) {
    throw new Error(`Cannot format a tactical sub-unit id: slot must be a positive integer, got ${String(slot)}`);
  }
  return `${parentUnitId}-s${slot}`;
}

/**
 * Parses a compact strategic identifier into owner, type, and ordinal.
 *
 * Purpose: Display fallbacks and type inference for compact ids; returns `null` for
 * every legacy shape so old saves stay opaque.
 * When to use: When a caller has only the id string and needs structured parts.
 * Expected outcome: Parts for `h1-i1` / `a1-t14` / `a4-t2`; `null` for legacy ids, padding,
 * a human index other than 1, and an AI index outside 1 to 4.
 * Exceptions: None; never throws.
 */
export function parseStrategicUnitId(unitId: string): StrategicUnitIdParts | null {
  const match = unitId.match(STRATEGIC_UNIT_ID_PATTERN);
  if (!match) return null;
  const playerLetter = match[1]!;
  const playerIndexDigits = match[2]!;
  const typeCode = match[3]!;
  const ordinalDigits = match[4]!;
  if (hasForbiddenLeadingZero(playerIndexDigits) || hasForbiddenLeadingZero(ordinalDigits)) return null;
  const playerIndex = Number.parseInt(playerIndexDigits, 10);
  const unitType = UNIT_TYPE_FROM_ID_CODE[typeCode];
  if (!unitType) return null;
  const ordinal = Number.parseInt(ordinalDigits, 10);
  if (!isPositiveInteger(ordinal)) return null;
  if (playerLetter === 'h') {
    if (playerIndex !== 1) return null;
    return { player: HUMAN_SEAT_ID, unitType, ordinal };
  }
  if (playerIndex < 1 || playerIndex > 4) return null;
  return { player: aiSeatIdForIndex(playerIndex), unitType, ordinal };
}

/**
 * Parses a compact tactical sub-unit identifier into parent id and slot.
 *
 * Purpose: Callback cleanup and briefing parent lookup without assuming a `:` delimiter.
 * When to use: When distinguishing sub-units from strategic units in compact form.
 * Expected outcome: `{ parentUnitId, slot }` for `h1-t3-s2`; `null` for strategic ids
 * and padded slots.
 * Exceptions: None; never throws.
 */
export function parseTacticalSubUnitId(unitId: string): TacticalSubUnitIdParts | null {
  const match = unitId.match(TACTICAL_SUB_UNIT_ID_PATTERN);
  if (!match) return null;
  const parentUnitId = match[1]!;
  const slotDigits = match[2]!;
  if (hasForbiddenLeadingZero(slotDigits)) return null;
  const slot = Number.parseInt(slotDigits, 10);
  if (!isPositiveInteger(slot)) return null;
  return { parentUnitId, slot };
}

/**
 * Infers `BuildUnitType` from a compact, legacy, or sub-unit identifier.
 *
 * Purpose: Stale-intel glyphs and any caller that must recover type when the roster
 * row is missing.
 * When to use: After a roster lookup miss; prefer the `unit_type` column when present.
 * Expected outcome: Compact `h1-t3`, legacy `human-armor-2`, and sub-unit `h1-t3-s2`
 * all yield `'armor'`; unknown strings yield `null`.
 * Exceptions: None; never throws.
 */
export function unitTypeFromUnitId(unitId: string): BuildUnitType | null {
  const compact = parseStrategicUnitId(unitId);
  if (compact) return compact.unitType;
  if (unitId.includes('-infantry-')) return 'infantry';
  if (unitId.includes('-armor-')) return 'armor';
  if (unitId.includes('-naval-')) return 'naval';
  if (unitId.includes('-air-')) return 'air';
  const sub = parseTacticalSubUnitId(unitId);
  if (sub) return unitTypeFromUnitId(sub.parentUnitId);
  return null;
}

/**
 * Infers owning side from a compact, legacy, or sub-unit identifier.
 *
 * Purpose: Kill attribution and display grouping still have prefix fallbacks when the
 * roster `player` column is missing; compact ids never start with `human-` / `opponent-`.
 * When to use: After a roster lookup miss; prefer the `player` column when present.
 * Expected outcome: Compact `h1-t3` and legacy `human-*` yield `HUMAN_SEAT_ID`. Compact `a2-i7`
 * yields `'opponent2'`. Legacy `opponent-*` yields `the first AI seat`. Unknown strings yield null.
 * Exceptions: None; never throws.
 */
export function unitIdOwnerFromId(unitId: string): SeatId | null {
  const compact = parseStrategicUnitId(unitId);
  if (compact) return compact.player;
  const sub = parseTacticalSubUnitId(unitId);
  if (sub) {
    const parentOwner = unitIdOwnerFromId(sub.parentUnitId);
    if (parentOwner) return parentOwner;
  }
  if (unitId.startsWith('opponent-')) return AI_SEAT_IDS[0];
  if (unitId.startsWith('human-')) return HUMAN_SEAT_ID;
  return null;
}

/**
 * Total-order comparator that sorts embedded numbers numerically.
 *
 * Purpose: Prompt-facing unit lists should show `h1-i2` before `h1-i10`. Combat
 * tie-breaks must keep raw `localeCompare` and must not call this.
 * When to use: Briefing roster order and Best Options table grouping.
 * Expected outcome: Numeric collation in `en`, then a byte-order tie-break so two
 * distinct strings never compare equal.
 * Exceptions: None.
 */
export function compareUnitIdsNaturally(a: string, b: string): number {
  const collated = NATURAL_UNIT_ID_COLLATOR.compare(a, b);
  if (collated !== 0) return collated;
  return a < b ? -1 : a > b ? 1 : 0;
}
