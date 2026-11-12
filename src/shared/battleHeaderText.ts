/**
 * The text of the battle header, which replaces the top bar's match status while a battle is open.
 */
import { formatAiOnlyBeatsLeftLabel } from './aiOnlyBeatLimit';

/**
 * Names the battle by its world hex.
 *
 * Purpose: The header's first words say where the player is fighting, with the same code the map and the order rows
 *   use.
 * When to use: For the header's title, with the world hex's code from `orderTargetHexCode`.
 * Expected outcome: "Battle at (E8)", or "Battle" when the code is unknown.
 * Exceptions: None.
 */
export function formatBattleHeaderTitle(hexCode: string | null): string {
  return hexCode ? `Battle at (${hexCode})` : 'Battle';
}

/**
 * The pieces of the header's status line, so the beats-left suffix can take its own color.
 *
 * Purpose: The beat number, the countdown, and the rest of the line are one sentence, and only the countdown changes color.
 * When to use: `renderBattleHeader` paints `beatsLeftLabel` on its own. `formatBattleHeaderStatus` joins the three pieces.
 * Expected outcome: `beforeBeatsLeft` is "Beat N". `beatsLeftLabel` is " (M left)" or null. `afterBeatsLeft` starts with the phase.
 * Exceptions: None.
 */
export function formatBattleHeaderStatusParts(input: {
  readonly beat: number;
  readonly beatPlaybackActive: boolean;
  readonly dateLabel: string;
  /**
   * Whether the enemy is a neutral garrison.
   *
   * Contract: True only for a Neutral opposing party.
   * When to use: The status line of that battle.
   * Expected outcome: The line ends with "The garrison defends in place".
   * Exceptions: None.
   */
  readonly garrisonDefendsInPlace?: boolean;
  /**
   * Beats still ahead of the beat named on this line.
   *
   * Contract: A number from `aiOnlyBeatsLeft`, including 0. Omit it, or pass null, when the battle is not AI-only or the limit is unlimited.
   * When to use: The header of an AI-only battle that has a beat limit.
   * Expected outcome: " (N left)" sits between the beat number and the phase. 0 is the last beat.
   * Exceptions: None.
   */
  readonly beatsLeft?: number | null;
}): {
  readonly beforeBeatsLeft: string;
  readonly beatsLeftLabel: string | null;
  readonly afterBeatsLeft: string;
} {
  const phase = input.beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning';
  const beatsLeftLabel = input.beatsLeft == null ? null : formatAiOnlyBeatsLeftLabel(input.beatsLeft);
  let afterBeatsLeft = ` · ${phase}`;
  if (input.dateLabel.length > 0) afterBeatsLeft += ` · ${input.dateLabel}`;
  if (input.garrisonDefendsInPlace) afterBeatsLeft += ' · The garrison defends in place';
  return { beforeBeatsLeft: `Beat ${input.beat}`, beatsLeftLabel, afterBeatsLeft };
}

/**
 * Builds the header's second line: the beat, its phase, and the match date.
 *
 * Purpose: The player reads which beat this is, whether it is being planned or resolved, and when, in one line.
 * When to use: For the header's status line, and for tests of that wording. The renderer paints the same pieces from
 *   `formatBattleHeaderStatusParts` so the countdown can be crimson.
 * Expected outcome: "Beat 2 · Tactical planning · April, Year 1". An empty date leaves the date out. A beats-left count
 *   inserts " (N left)" after the beat number.
 * Exceptions: None.
 */
export function formatBattleHeaderStatus(input: {
  readonly beat: number;
  readonly beatPlaybackActive: boolean;
  readonly dateLabel: string;
  /**
   * Whether the enemy is a neutral garrison.
   *
   * Contract: The same flag as `formatBattleHeaderStatusParts`.
   * When to use: The status line of a Neutral battle.
   * Expected outcome: The line ends with "The garrison defends in place".
   * Exceptions: None.
   */
  readonly garrisonDefendsInPlace?: boolean;
  /**
   * Beats still ahead of the beat named on this line.
   *
   * Contract: The same count as `formatBattleHeaderStatusParts`.
   * When to use: The header of an AI-only battle that has a beat limit.
   * Expected outcome: " (N left)" sits immediately to the right of "Beat N".
   * Exceptions: None.
   */
  readonly beatsLeft?: number | null;
}): string {
  const parts = formatBattleHeaderStatusParts(input);
  return `${parts.beforeBeatsLeft}${parts.beatsLeftLabel ?? ''}${parts.afterBeatsLeft}`;
}
