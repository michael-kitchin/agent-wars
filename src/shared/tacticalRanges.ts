/**
 * Shared tactical range contracts used by main-process validation and renderer planning UX.
 * Keep these values and messages centralized so gameplay rules and UI wording stay in sync.
 */

/** Per-turn movement budget in hex edges by unit type. */
export const MOVEMENT_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 1,
  armor: 2,
  naval: 2,
  air: 0,
});

/** Standard ranged-combat range in hex edges by unit type. Air uses strike mode instead of ranged mode. */
export const RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 0,
  armor: 1,
  naval: 2,
  air: 0,
});

/** Air-strike maximum range in hex edges. */
export const AIR_STRIKE_RANGE_HEXES = 3;

/** Air-ferry maximum range in hex edges. */
export const AIR_FERRY_RANGE_HEXES = 4;

/**
 * Why this exists:
 *     Formats the canonical out-of-range reason shared by ranged and strike validation flows.
 * When to use:
 *     Returning human-readable range failures for tactical targeting checks.
 * What to expect:
 *     Text shape remains stable: "Target out of range (<unitType> range <N>)".
 */
export function formatTargetOutOfRangeReason(unitType: string, range: number): string {
  return `Target out of range (${unitType} range ${range})`;
}

/**
 * Why this exists:
 *     Formats the canonical ferry-range failure reason used by validation and planning preview.
 * When to use:
 *     Returning user-facing errors for ferry destination range checks.
 * What to expect:
 *     Text shape remains stable: "Destination out of ferry range (<N>)".
 */
export function formatFerryOutOfRangeReason(range: number): string {
  return `Destination out of ferry range (${range})`;
}
