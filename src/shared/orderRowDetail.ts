/**
 * Text for queued-order rows: the line under a unit's name, and the Orders tab's subtitle.
 *
 * The Orders tab and the selection panel show the same line for an order, so both read it from here.
 */
import type { AirStrikeTargetType } from './ipcTypes';

/**
 * Words for each air-strike target type, as the target-type list shows them.
 *
 * Purpose: A strike row names its target type in the player's words, not the stored value.
 * When to use: The extra part of an air-strike row's line.
 * Expected outcome: Matches the option labels of `#air-strike-target-type` in `static/index.html`.
 * Exceptions: None.
 */
export const AIR_STRIKE_TARGET_TYPE_LABELS: Readonly<Record<AirStrikeTargetType, string>> = Object.freeze({
  units: 'Enemy Units',
  urban: 'Production',
  airport: 'Airports',
  seaport: 'Seaports',
});

/**
 * What one order row's line says.
 *
 * Purpose: Keeps the three parts of the line named, so callers cannot swap them.
 * When to use: The argument of `formatOrderRowDetail`.
 * Expected outcome: Null parts show as a question mark.
 * Exceptions: None.
 */
export interface OrderRowDetailParts {
  /**
   * The target hex's code, such as `E5`, or `E8.K3` inside a battle.
   *
   * Contract: Null when the code cannot be found.
   * When to use: Always.
   * Expected outcome: Shown after the arrow.
   * Exceptions: None.
   */
  readonly targetCode: string | null;
  /**
   * Hex steps from the unit to the target.
   *
   * Contract: A non-negative whole number, or null when it cannot be measured.
   * When to use: Always.
   * Expected outcome: Shown as `Nh`.
   * Exceptions: None.
   */
  readonly distanceHexes: number | null;
  /**
   * A last part, such as `Ferry` or a strike's target type.
   *
   * Contract: Null or empty adds nothing.
   * When to use: Ferry rows and air-strike rows.
   * Expected outcome: Shown after a separator.
   * Exceptions: None.
   */
  readonly note: string | null;
}

/**
 * Formats the line under a unit's name in an order row.
 *
 * Purpose: Every queued order names its target hex the same way in the Orders tab and the selection panel.
 * When to use: For movement, ferry, ranged, and air-strike rows on the world map and in battles.
 * Expected outcome: For example `→ E5 · 1h`, `→ GK · 2h · Airports`, or `→ ? · ?h` when nothing is known.
 * Exceptions: None.
 */
export function formatOrderRowDetail(parts: OrderRowDetailParts): string {
  const code = parts.targetCode && parts.targetCode.length > 0 ? parts.targetCode : '?';
  const distance = parts.distanceHexes == null ? '?' : String(parts.distanceHexes);
  const note = parts.note ? ` · ${parts.note}` : '';
  return `→ ${code} · ${distance}h${note}`;
}

/**
 * Formats the Orders tab's subtitle.
 *
 * Purpose: Says how many orders Ready will send, and for which turn or beat.
 * When to use: Whenever the queued orders or the turn change. Pass the battle's beat number during a battle.
 * Expected outcome: `6 queued for turn 7`, or `2 queued for beat 3` while `battleBeat` is a number.
 * Exceptions: None.
 */
export function formatQueuedOrdersSubtitle(queuedCount: number, turnNumber: number, battleBeat: number | null): string {
  const when = battleBeat == null ? `turn ${turnNumber}` : `beat ${battleBeat}`;
  return `${queuedCount} queued for ${when}`;
}
