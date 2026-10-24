/**
 * The text of the battle header, which replaces the top bar's match status while a battle is open.
 */
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
 * Names a battle's beat and whether it is being planned or resolved.
 *
 * Purpose: Keeps the beat wording in one place for the header's status line.
 * When to use: Only by `formatBattleHeaderStatus`.
 * Expected outcome: "Beat N · Tactical planning", or "Beat N · Tactical resolution" while the beat resolves or plays
 *   back.
 * Exceptions: None.
 */
function formatBattleBeatLine(beat: number, beatPlaybackActive: boolean): string {
  return `Beat ${beat} · ${beatPlaybackActive ? 'Tactical resolution' : 'Tactical planning'}`;
}

/**
 * Builds the header's second line: the beat, its phase, and the match date.
 *
 * Purpose: The player reads which beat this is, whether it is being planned or resolved, and when, in one line.
 * When to use: For the header's status line. `beat` is the battle's beat number, `beatPlaybackActive` is true while
 *   the beat resolves or plays back, and `dateLabel` is the match date from the game state.
 * Expected outcome: "Beat 2 · Tactical planning · April, Year 1". An empty date leaves the date out.
 * Exceptions: None.
 */
export function formatBattleHeaderStatus(input: {
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
}): string {
  const beatLine = formatBattleBeatLine(input.beat, input.beatPlaybackActive);
  const dated = input.dateLabel.length > 0 ? `${beatLine} · ${input.dateLabel}` : beatLine;
  return input.garrisonDefendsInPlace ? `${dated} · The garrison defends in place` : dated;
}
