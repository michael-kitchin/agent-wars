import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from './ipc/productionTypes';
import { MAX_UNITS_PER_TYPE } from './productionConfig';

/**
 * Match size that scales only per-side unit caps.
 *
 * Purpose: Shared identifier for new-game selection, `game_config`, and snapshot readers.
 * When to use: Persist and parse match size; pass into `getMaxUnitsPerType`.
 * Expected outcome: One of `small`, `medium`, or `large`.
 * Exceptions: None; invalid stored values are coerced by `parseGameSize`.
 */
export type GameSize = 'small' | 'medium' | 'large';

/**
 * Canonical size order for UI and tests (small → medium → large).
 *
 * Purpose: Single list of valid `GameSize` values without duplicating the union.
 * When to use: Iterating sizes or asserting the supported set.
 * Expected outcome: Matches the `GameSize` union.
 * Exceptions: None.
 */
export const GAME_SIZES: readonly GameSize[] = ['small', 'medium', 'large'];

/**
 * Integer multipliers applied to the Small unit-cap table.
 *
 * Purpose: Medium is 2× Small and Large is 3× Small without copying cap tables.
 * When to use: Only via `getMaxUnitsPerType`; do not scale costs or starting armies.
 * Expected outcome: `small: 1`, `medium: 2`, `large: 3`.
 * Exceptions: None.
 */
export const GAME_SIZE_MULTIPLIER: Readonly<Record<GameSize, number>> = {
  small: 1,
  medium: 2,
  large: 3,
};

/**
 * Capitalized type labels for the new-game cap preview.
 *
 * Purpose: Keeps preview names aligned with `ALL_BUILD_UNIT_TYPES` without hardcoding order in the renderer.
 * When to use: `gameSizeCapPreviewRows` only.
 * Expected outcome: Infantry, Armor, Naval, Air.
 * Exceptions: None.
 */
const UNIT_TYPE_DISPLAY_NAME: Readonly<Record<BuildUnitType, string>> = {
  infantry: 'Infantry',
  armor: 'Armor',
  naval: 'Naval',
  air: 'Air',
};

/**
 * Coerces unknown IPC, DOM, or `game_config` values to a `GameSize`.
 *
 * Purpose: Invalid or missing size must not crash a match or inherit a previous Medium/Large cap by accident.
 * When to use: Reading new-game payload, select value, snapshot field, or stored config.
 * Expected outcome: Trimmed lower-case `small`/`medium`/`large`, otherwise `'small'`.
 * Exceptions: None; never throws.
 */
export function parseGameSize(raw: unknown): GameSize {
  if (typeof raw !== 'string') return 'small';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'small' || normalized === 'medium' || normalized === 'large') return normalized;
  return 'small';
}

/**
 * Returns per-type unit caps for a match size.
 *
 * Purpose: Live deployment ceiling for production, seeding, briefings, and overlay labels.
 * When to use: Anywhere that previously read `MAX_UNITS_PER_TYPE` as the current match cap.
 * Expected outcome: Small table multiplied by `GAME_SIZE_MULTIPLIER` for the parsed size.
 * Exceptions: None; untrusted or invalid `size` is coerced with `parseGameSize` so caps never become `NaN`.
 */
export function getMaxUnitsPerType(size: GameSize): Readonly<Record<BuildUnitType, number>> {
  const multiplier = GAME_SIZE_MULTIPLIER[parseGameSize(size)];
  return {
    infantry: MAX_UNITS_PER_TYPE.infantry * multiplier,
    armor: MAX_UNITS_PER_TYPE.armor * multiplier,
    naval: MAX_UNITS_PER_TYPE.naval * multiplier,
    air: MAX_UNITS_PER_TYPE.air * multiplier,
  };
}

/**
 * Preview rows for the new-game unit-token cap display.
 *
 * Purpose: Lets the start screen's unit row show each cap without duplicating type order in HTML/JS.
 * When to use: Rendering or refreshing the four caps in the unit row under the Game size dropdown.
 * Expected outcome: Infantry → armor → naval → air with capitalized names and `getMaxUnitsPerType` caps.
 * Exceptions: None.
 */
export function gameSizeCapPreviewRows(size: GameSize): ReadonlyArray<{
  unitType: BuildUnitType;
  displayName: string;
  cap: number;
}> {
  const caps = getMaxUnitsPerType(size);
  return ALL_BUILD_UNIT_TYPES.map((unitType) => ({
    unitType,
    displayName: UNIT_TYPE_DISPLAY_NAME[unitType],
    cap: caps[unitType],
  }));
}
