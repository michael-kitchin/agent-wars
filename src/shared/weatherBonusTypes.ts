/**
 * Shapes for the optional weather bonus: a fixed month on each res1 hex, and acclimation tags from a unit's birth hex.
 *
 * Purpose: Shared by dice, movement, AI tools, and the renderer so every surface uses the same four states.
 * When to use: Import with `import type`; the runtime rules live in `weatherBonusRules.ts`.
 * Expected outcome: Plain readonly data with no behavior.
 * Exceptions: None.
 */

/**
 * One month's weather on a res1 hex.
 *
 * Purpose: The only labels the calendar, tooltips, and penalties accept.
 * When to use: Display state and the weather a unit is standing in.
 * Expected outcome: `mild` is the baseline and never an acclimation tag.
 * Exceptions: None.
 */
export type WeatherState = 'mild' | 'rain' | 'snow' | 'heat';

/**
 * A classified month: the word shown to the player, plus whether it counts toward the heat tag.
 *
 * Purpose: A hot wet month displays as rain and still acclimates a unit to heat.
 * When to use: Elements of a hex's twelve-month record, and the input to `acclimationTags`.
 * Expected outcome: `countsAsHeat` is true for heat months and for rain months whose temperature also met the heat line.
 * Exceptions: None.
 */
export interface WeatherMonthRecord {
  /**
   * The weather word for this month.
   *
   * Contract: One of the four `WeatherState` values.
   * When to use: Tooltips, the turn line, and penalty checks.
   * Expected outcome: Snow wins over rain and heat; rain wins over heat.
   * Exceptions: None.
   */
  readonly display: WeatherState;
  /**
   * Whether this month counts toward heat acclimation.
   *
   * Contract: Independent of `display`, so a rain month can still count.
   * When to use: `acclimationTags` only.
   * Expected outcome: True when the monthly mean met the heat threshold and the month was not snow.
   * Exceptions: None.
   */
  readonly countsAsHeat: boolean;
}

/**
 * Why an attack penalty is being asked for.
 *
 * Purpose: Keeps melee, defense, and ferry out of the attack helper.
 * When to use: `weatherAttackPenalty`.
 * Expected outcome: `ranged` looks at the unit's own hex; `airStrike` looks at the base and the target.
 * Exceptions: None.
 */
export type WeatherAttackKind = 'ranged' | 'airStrike';
