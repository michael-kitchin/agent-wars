/**
 * Strength levels for the optional country, terrain, and weather bonuses.
 *
 * Purpose: One vocabulary for the new-game dropdowns, `game_config`, snapshots, and the rule tables that scale by level.
 * When to use: Parsing a level from the dialog, IPC, a saved row, or a snapshot, and turning an on/off flag plus a level into one value.
 * Expected outcome: Deterministic results with no logging and no I/O.
 * Exceptions: None.
 */

/**
 * How strong one optional bonus is in a match.
 *
 * Purpose: Off disables the bonus. Low is the original rule. High makes the same rule stronger.
 * When to use: New-game choices and any rule lookup that scales by level.
 * Expected outcome: One of `off`, `low`, or `high`.
 * Exceptions: None; invalid values are coerced by `parseBonusLevel`.
 */
export type BonusLevel = 'off' | 'low' | 'high';

/**
 * The level of a bonus that is on.
 *
 * Purpose: Persisted rows and snapshot fields carry a level only next to an enabled flag, so Off is never stored there.
 * When to use: `OriginBonusSettings`, `GameStateSnapshot`, and `TacticalBattleSnapshot` level fields, and rule tables keyed by level.
 * Expected outcome: `low` or `high`.
 * Exceptions: None.
 */
export type ActiveBonusLevel = Exclude<BonusLevel, 'off'>;

/**
 * Canonical level order for the dialog and tests.
 *
 * Purpose: Single list of valid `BonusLevel` values without duplicating the union.
 * When to use: Iterating levels or asserting the supported set.
 * Expected outcome: Off, low, high.
 * Exceptions: None.
 */
export const BONUS_LEVELS: ReadonlyArray<BonusLevel> = Object.freeze(['off', 'low', 'high'] as const);

/**
 * The level every new-game dropdown starts at.
 *
 * Purpose: Low keeps the original rules, so a player who changes nothing gets the familiar match.
 * When to use: Resetting the new-game dropdowns.
 * Expected outcome: `low`.
 * Exceptions: None.
 */
export const DEFAULT_BONUS_LEVEL: BonusLevel = 'low';

/**
 * Coerces an unknown IPC or DOM value to a `BonusLevel`.
 *
 * Purpose: A bad or missing value must not crash a new match or silently pick a stronger rule.
 * When to use: Reading a new-game payload level or a dropdown value.
 * Expected outcome: Trimmed lower-case `off`, `low`, or `high`; anything else returns `fallback`.
 * Exceptions: None; never throws.
 */
export function parseBonusLevel(raw: unknown, fallback: BonusLevel): BonusLevel {
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  return BONUS_LEVELS.find((level) => level === normalized) ?? fallback;
}

/**
 * Coerces a persisted row or snapshot field to the level of an enabled bonus.
 *
 * Purpose: Matches saved before levels existed have no row, and they must keep playing at the original strength.
 * When to use: Reading a `*_bonus_level` row or a level field next to an enabled flag.
 * Expected outcome: `high` only for `high` after trim and lower-case; anything else, including `off` and missing, is `low`.
 * Exceptions: None; never throws.
 */
export function parseActiveBonusLevel(raw: unknown): ActiveBonusLevel {
  return parseBonusLevel(raw, 'low') === 'high' ? 'high' : 'low';
}

/**
 * Combines an on/off flag and an optional level into one `BonusLevel`.
 *
 * Purpose: Rule lookups take one level, while settings and snapshots store the flag and the level separately.
 * When to use: Before any rule that scales by level, with the matching flag and level field.
 * Expected outcome: `off` unless `enabled` is exactly true; otherwise `level`, or `low` when it is missing.
 * Exceptions: None.
 */
export function bonusLevelOf(enabled: boolean | undefined, level: ActiveBonusLevel | undefined): BonusLevel {
  return enabled === true ? (level ?? 'low') : 'off';
}
